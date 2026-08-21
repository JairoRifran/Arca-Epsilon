import * as THREE from 'three';

/**
 * Muzzle embers: the sparks thrown clear of the barrel when the cannon fires.
 *
 * The director already had spark particles, but they lived inside the muzzle
 * flash slot and died with it -- 75 ms, roughly a quarter of a metre of travel.
 * They existed and were never visible. Embers need to outlive the flash by an
 * order of magnitude, which means they cannot be owned by it.
 *
 * One `Points` object holds every ember in the scene, not one per shot. At
 * eleven shots a second a per-shot object would add a draw call per shot in
 * flight; a single shared buffer costs exactly one, whatever the rate. Slots
 * are handed out from a ring buffer, so a burst that outruns the capacity
 * overwrites its own oldest sparks rather than allocating.
 *
 * The physics is real but deliberately small: gravity, quadratic-ish drag and
 * inherited emitter velocity. What makes it read as fire is that vacuum and
 * atmosphere behave differently -- in vacuum an ember flies dead straight for
 * ever and only cools, in air it decelerates hard and falls. That contrast is
 * the whole point, and it is why the environment is an input rather than a
 * constant.
 */

/** Blackbody-ish cooling ramp: white-hot, yellow, orange, ember red, out. */
const COOLING: readonly (readonly [number, number, number])[] = [
  [1.0, 0.98, 0.92],
  [1.0, 0.86, 0.55],
  [1.0, 0.55, 0.18],
  [0.85, 0.22, 0.05],
  [0.28, 0.04, 0.0],
  [0.0, 0.0, 0.0]
];

/**
 * Atmospheric drag, per second. An ember keeps roughly 1% of its speed after a
 * second in air, which is what makes the spray collapse into a short bright
 * puff instead of a long streak.
 */
const AIR_DRAG = 4.6;
const AIR_GRAVITY = -9.81;

/**
 * Sparks are small and hot; the field is additive, so cooling is the fade.
 *
 * This was 0.115 m, chosen as a plausible physical size for a spark. Rendered,
 * it came to about four pixels with the whole ship in frame -- present in the
 * buffer, invisible on the screen. A muzzle spark is not read as a measured
 * object, it is read as a glint, and a glint has to survive being small on
 * screen. The size that reads is several times the size that is true -- and
 * with a soft radial map the energy is spread across the quad, so it needs
 * more of it again than a hard square of the same width would.
 */
const EMBER_SIZE = 0.68;

export type EmberEnvironment = 'vacuum' | 'atmosphere';

export type CombatEmberDiagnostics = {
  capacity: number;
  alive: number;
  spawned: number;
  overwritten: number;
};

export class CombatEmberField {
  readonly points: THREE.Points;

  private readonly capacity: number;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly velocities: Float32Array;
  private readonly ages: Float32Array;
  private readonly lives: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;
  private readonly scratch = new THREE.Vector3();
  private readonly basis = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly bitangent = new THREE.Vector3();

  private cursor = 0;
  private alive = 0;
  private spawnCount = 0;
  private overwritten = 0;
  private environment: EmberEnvironment = 'vacuum';

  /**
   * `texture` should be the same soft radial sprite the rest of the combat
   * effects use. Without a map, `PointsMaterial` draws flat squares -- which
   * is exactly what sparks must not look like.
   */
  constructor(capacity = 160, texture?: THREE.Texture) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.ages = new Float32Array(capacity);
    this.lives = new Float32Array(capacity);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.PointsMaterial({
      // Spread rather than `map: texture`: Three.js warns on a key that is
      // present but undefined, and the field is constructed without a texture
      // in the physics tests, which have no renderer to make one with.
      ...(texture ? { map: texture } : {}),
      size: EMBER_SIZE,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(this.geometry, this.material);
    // Embers are scattered around the muzzle, far from the object origin the
    // bounding sphere is computed from, so the default cull test is wrong here.
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  setEnvironment(environment: EmberEnvironment): void {
    this.environment = environment;
  }

  setVisible(visible: boolean): void {
    this.points.visible = visible;
  }

  /**
   * Throw `count` embers from a barrel.
   *
   * `direction` is the line of fire and `emitterVelocity` the shooter's own
   * motion. Inheriting that velocity is what stops the spray from hanging in
   * the air behind a moving ship like a decal: real sparks leave the gun with
   * the gun's momentum already in them.
   */
  emit(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    count: number,
    emitterVelocity?: THREE.Vector3,
    speed = 7.4,
    life = 0.62
  ): void {
    if (count <= 0) return;

    // An orthonormal basis around the barrel, so the cone is built in the
    // frame of the shot rather than in world axes.
    this.basis.copy(direction).normalize();
    this.tangent.set(0, 1, 0);
    if (Math.abs(this.basis.dot(this.tangent)) > 0.94) this.tangent.set(1, 0, 0);
    this.tangent.crossVectors(this.basis, this.tangent).normalize();
    this.bitangent.crossVectors(this.basis, this.tangent).normalize();

    for (let index = 0; index < count; index += 1) {
      const slot = this.cursor;
      if (this.ages[slot] < this.lives[slot]) this.overwritten += 1;
      else this.alive += 1;
      this.cursor = (this.cursor + 1) % this.capacity;
      this.spawnCount += 1;

      // Golden angle around the barrel, with the radius pushed out by the
      // square root so the spray fills the cone evenly instead of clumping at
      // the axis. Same deterministic dispersion the cannon itself uses -- no
      // random source, so a replayed burst throws the same sparks.
      const angle = this.spawnCount * 2.399963;
      const spread = Math.sqrt(((this.spawnCount * 0.618034) % 1)) * 0.62;
      const forward = 0.45 + ((this.spawnCount % 5) / 5) * 0.75;
      const kick = speed * (0.55 + ((this.spawnCount % 7) / 7) * 0.9);

      this.scratch
        .copy(this.basis).multiplyScalar(forward)
        .addScaledVector(this.tangent, Math.cos(angle) * spread)
        .addScaledVector(this.bitangent, Math.sin(angle) * spread)
        .normalize()
        .multiplyScalar(kick);
      if (emitterVelocity) this.scratch.add(emitterVelocity);

      const offset = slot * 3;
      this.positions[offset] = origin.x;
      this.positions[offset + 1] = origin.y;
      this.positions[offset + 2] = origin.z;
      this.velocities[offset] = this.scratch.x;
      this.velocities[offset + 1] = this.scratch.y;
      this.velocities[offset + 2] = this.scratch.z;
      this.ages[slot] = 0;
      // Staggered lives: a spray where every spark dies on the same frame
      // reads as a shape switching off rather than as sparks going out.
      this.lives[slot] = life * (0.65 + ((this.spawnCount % 4) / 4) * 0.7);
      this.writeColor(slot, 0);
    }

    this.geometry.setDrawRange(0, this.capacity);
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  update(delta: number): void {
    if (this.alive <= 0) return;

    const air = this.environment === 'atmosphere';
    // Exponential decay integrated over the step rather than `v -= v*k*dt`,
    // which goes unstable and flips the velocity once the step grows past 1/k.
    // Frames here can be long, so the closed form is not a nicety.
    const damping = air ? Math.exp(-AIR_DRAG * delta) : 1;
    const gravity = air ? AIR_GRAVITY * delta : 0;

    let live = 0;
    for (let slot = 0; slot < this.capacity; slot += 1) {
      const life = this.lives[slot];
      if (life <= 0 || this.ages[slot] >= life) continue;

      this.ages[slot] += delta;
      const t = Math.min(1, this.ages[slot] / life);
      const offset = slot * 3;

      if (air) {
        this.velocities[offset] *= damping;
        this.velocities[offset + 1] = this.velocities[offset + 1] * damping + gravity;
        this.velocities[offset + 2] *= damping;
      }

      this.positions[offset] += this.velocities[offset] * delta;
      this.positions[offset + 1] += this.velocities[offset + 1] * delta;
      this.positions[offset + 2] += this.velocities[offset + 2] * delta;

      this.writeColor(slot, t);
      if (t < 1) live += 1;
    }

    this.alive = live;
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    if (live === 0) this.geometry.setDrawRange(0, 0);
  }

  clear(): void {
    this.ages.fill(1);
    this.lives.fill(0);
    this.colors.fill(0);
    this.alive = 0;
    this.geometry.setDrawRange(0, 0);
    (this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  getDiagnostics(): CombatEmberDiagnostics {
    return {
      capacity: this.capacity,
      alive: this.alive,
      spawned: this.spawnCount,
      overwritten: this.overwritten
    };
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  /**
   * Cooling doubles as the fade. The field blends additively, so a colour
   * driven to black is already invisible -- an ember does not need an alpha
   * channel to go out, it needs to stop being hot.
   */
  private writeColor(slot: number, t: number): void {
    const span = COOLING.length - 1;
    const scaled = Math.min(span, Math.max(0, t)) * span;
    const low = Math.min(span - 1, Math.floor(scaled));
    const mix = scaled - low;
    const from = COOLING[low];
    const to = COOLING[low + 1];
    // A short flare on spawn, so the first instant of the spark is brighter
    // than the ramp alone would make it.
    // Additive over an ACES-tonemapped frame: highlights are compressed hard,
    // so a spark that peaks near 1.0 lands as grey. The birth flare has to
    // overshoot to come out white.
    const flare = 1 + Math.max(0, 1 - t * 9) * 1.6;
    const offset = slot * 3;
    this.colors[offset] = (from[0] + (to[0] - from[0]) * mix) * flare;
    this.colors[offset + 1] = (from[1] + (to[1] - from[1]) * mix) * flare;
    this.colors[offset + 2] = (from[2] + (to[2] - from[2]) * mix) * flare;
  }
}
