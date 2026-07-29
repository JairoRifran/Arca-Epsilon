import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';
import { mission18Tuning } from '../assets/mission18Definitions';

/** Lifecycle of one scout drone. */
export type DroneState = 'idle' | 'approach' | 'scan' | 'attack' | 'evade' | 'damaged' | 'retreat' | 'destroyed';

/** Deterministic per-drone flight parameters, assigned by slot index. */
type DroneSlot = {
  group: THREE.Group;
  hull: THREE.Mesh;
  ring: THREE.Mesh;
  eyeMaterial: THREE.MeshStandardMaterial;
  /** Damage smoke, shown from `damaged` onward. */
  smoke: THREE.Points;
  smokeMaterial: THREE.PointsMaterial;
  smokeVelocities: Float32Array;
  state: DroneState;
  health: number;
  /** Angle along the deterministic approach ring. */
  angle: number;
  /** Ring radius and altitude offsets, so drones stay separated. */
  radiusOffset: number;
  altitudeOffset: number;
  /** Seconds since this drone entered its current state. */
  stateAge: number;
  /** Attack passes flown so far. */
  passes: number;
  active: boolean;
};

const SMOKE_PER_DRONE = 8;
/** Deterministic hash: same slot always flies the same route. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * The Coalition's armed-reconnaissance scout drones.
 *
 * A fixed pool of `maxActiveDrones` units, allocated once and reused for every
 * wave — nothing is created or disposed mid-combat. Each is a dark, obviously
 * non-human machine: a faceted dark hull, a cold thruster ring, one dull red
 * sensor eye and a contained energy weapon. Damage shows as smoke and a dimming
 * eye before the unit is lost.
 *
 * The AI is deliberately simple and deterministic: each drone flies a fixed
 * approach ring at its own radius/altitude offset (so they never stack), makes
 * attack passes toward the settlement, and retreats. There is no pathfinding
 * and no `Math.random()` after construction, so a wave is reproducible in a
 * test and a reload always re-flies the same routes.
 *
 * Geometry and materials are shared across the pool; the per-drone eye material
 * is the only per-unit material, so damage can be shown individually. AI runs
 * on a fixed interval rather than every frame.
 */
export class CoalitionScoutDrone {
  readonly group = new THREE.Group();

  /** One WeaponTarget-compatible record per slot; the ship shoots these. */
  readonly targets: { object: THREE.Object3D; radius: number; health: number; hostile: boolean }[] = [];

  private readonly slots: DroneSlot[] = [];
  private hullMaterial?: THREE.MeshStandardMaterial;
  private trimMaterial?: THREE.MeshStandardMaterial;
  private ringMaterial?: THREE.MeshStandardMaterial;
  private smokeTexture?: THREE.Texture;
  /** The pool is built on first use, never at boot. */
  private built = false;
  /** Settlement centre the wave orbits and attacks. */
  private readonly origin = new THREE.Vector3();
  private aiAccumulator = 0;
  /** Set by the mission when the runner must break away. */
  private retreatSlot = -1;
  private readonly scratch = new THREE.Vector3();

  constructor() {
    this.group.name = 'Drones de Reconocimiento // Coalición';
    this.group.visible = false;
  }

  /**
   * Build the pool. Deliberately lazy: M01-M17 never pay for M18's geometry,
   * materials or textures, and a player who never reaches the engagement never
   * allocates a drone. Called on the first wave launch; safe to call again.
   */
  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;

    this.hullMaterial = new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.54, metalness: 0.74 });
    this.trimMaterial = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.46, metalness: 0.8 });
    // Cold, dim propulsion: never a bright engine glow.
    this.ringMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a2226,
      emissive: 0x3d6b78,
      emissiveIntensity: 0.22,
      roughness: 0.4,
      metalness: 0.6
    });
    this.smokeTexture = createSoftParticleTexture(32);

    // One shared geometry set for the whole pool.
    const hullGeometry = new THREE.OctahedronGeometry(2.1, 0);
    const spineGeometry = new THREE.BoxGeometry(5.4, 0.42, 0.9);
    const podGeometry = new THREE.CylinderGeometry(0.42, 0.55, 1.5, 7);
    const ringGeometry = new THREE.TorusGeometry(2.5, 0.22, 6, 18);
    const eyeGeometry = new THREE.SphereGeometry(0.42, 8, 6);
    const barrelGeometry = new THREE.CylinderGeometry(0.16, 0.22, 2.2, 6);

    for (let i = 0; i < mission18Tuning.maxActiveDrones; i += 1) {
      const drone = new THREE.Group();
      drone.name = `Dron Explorador Coalición ${i + 1}`;
      drone.visible = false;

      const hull = new THREE.Mesh(hullGeometry, this.hullMaterial!);
      hull.scale.set(1, 0.62, 1.25);
      drone.add(hull);

      const spine = new THREE.Mesh(spineGeometry, this.trimMaterial!);
      drone.add(spine);

      for (const side of [-1, 1]) {
        const pod = new THREE.Mesh(podGeometry, this.trimMaterial!);
        pod.position.set(side * 2.5, -0.1, 0.2);
        pod.rotation.z = Math.PI / 2;
        drone.add(pod);
      }

      // Cold thruster ring, canted so the silhouette never reads as a face.
      const ring = new THREE.Mesh(ringGeometry, this.ringMaterial!);
      ring.rotation.x = Math.PI / 2.2;
      ring.position.z = 1.1;
      drone.add(ring);

      // Contained energy weapon: a short recessed barrel, no muzzle light.
      const barrel = new THREE.Mesh(barrelGeometry, this.trimMaterial!);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, -0.45, -1.9);
      drone.add(barrel);

      const eyeMaterial = new THREE.MeshStandardMaterial({
        color: 0x140b0b,
        emissive: 0x8c2418,
        emissiveIntensity: 0.42,
        roughness: 0.3,
        metalness: 0.3
      });
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.set(0, 0.1, -2.1);
      drone.add(eye);

      // Damage smoke: a tiny pooled Points cloud, hidden until damaged.
      const positions = new Float32Array(SMOKE_PER_DRONE * 3);
      const velocities = new Float32Array(SMOKE_PER_DRONE * 3);
      for (let s = 0; s < SMOKE_PER_DRONE; s += 1) {
        velocities[s * 3] = (hash(i * 5.1 + s) - 0.5) * 2.2;
        velocities[s * 3 + 1] = 0.6 + hash(i * 7.7 + s) * 1.4;
        velocities[s * 3 + 2] = (hash(i * 9.3 + s) - 0.5) * 2.2;
      }
      const smokeGeometry = new THREE.BufferGeometry();
      smokeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      smokeGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 14);
      const smokeMaterial = new THREE.PointsMaterial({
        color: 0x2a2622,
        size: 1.5,
        map: this.smokeTexture!,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const smoke = new THREE.Points(smokeGeometry, smokeMaterial);
      smoke.frustumCulled = false;
      smoke.visible = false;
      drone.add(smoke);

      drone.traverse((child) => {
        if (child instanceof THREE.Mesh) child.frustumCulled = false;
      });

      this.slots.push({
        group: drone,
        hull,
        ring,
        eyeMaterial,
        smoke,
        smokeMaterial,
        smokeVelocities: velocities,
        state: 'idle',
        health: 0,
        angle: 0,
        radiusOffset: 0,
        altitudeOffset: 0,
        stateAge: 0,
        passes: 0,
        active: false
      });
      this.targets.push({ object: drone, radius: mission18Tuning.droneRadius, health: 0, hostile: true });
      this.group.add(drone);
    }
  }

  /** Centre the engagement on the settlement. Called on sync, never per frame. */
  setOrigin(x: number, y: number, z: number): void {
    this.origin.set(x, y, z);
  }

  get activeCount(): number {
    return this.slots.reduce((n, s) => n + (s.active ? 1 : 0), 0);
  }

  /** True while any drone is close enough to be pressing the colony. */
  get anyAttacking(): boolean {
    return this.slots.some((s) => s.active && s.state === 'attack');
  }

  /**
   * Launch a wave of `count` drones. Idempotent per wave: calling it again with
   * a wave already flying does nothing, so a re-sync never duplicates units.
   */
  launchWave(count: number, retreatRunner = false): void {
    if (this.activeCount > 0) return;
    this.ensureBuilt();
    const wanted = Math.min(count, this.slots.length);
    this.group.visible = true;
    for (let i = 0; i < wanted; i += 1) {
      const slot = this.slots[i];
      slot.active = true;
      slot.state = 'approach';
      slot.health = mission18Tuning.droneHealth;
      // Deterministic separation: evenly spread on the ring, then nudged by a
      // fixed per-slot hash so the formation is not a perfect polygon.
      slot.angle = (i / wanted) * Math.PI * 2 + hash(i * 3.3) * 0.35;
      slot.radiusOffset = (hash(i * 2.1) - 0.5) * 34;
      slot.altitudeOffset = (hash(i * 4.7) - 0.5) * 18;
      slot.stateAge = 0;
      slot.passes = 0;
      slot.group.visible = true;
      slot.eyeMaterial.emissiveIntensity = 0.42;
      slot.smoke.visible = false;
      slot.smokeMaterial.opacity = 0;
      this.targets[i].health = slot.health;
      this.targets[i].hostile = true;
    }
    for (let i = wanted; i < this.slots.length; i += 1) this.deactivate(i);
    this.retreatSlot = retreatRunner ? 0 : -1;
  }

  /** Clear the sky immediately (wave complete, mission reset, save load). */
  clearAll(): void {
    for (let i = 0; i < this.slots.length; i += 1) this.deactivate(i);
    this.group.visible = false;
    this.retreatSlot = -1;
  }

  private deactivate(index: number): void {
    const slot = this.slots[index];
    slot.active = false;
    slot.state = 'idle';
    slot.health = 0;
    slot.group.visible = false;
    slot.smoke.visible = false;
    slot.smokeMaterial.opacity = 0;
    this.targets[index].health = 0;
  }

  /**
   * Advance the fleet. `onDestroyed` fires once per drone lost, so the mission
   * can count kills; `onColonyHit` fires when an attacking drone completes a
   * pass, so the caller can damage the shield or the struck system.
   */
  update(
    delta: number,
    elapsed: number,
    onDestroyed: () => void,
    onColonyHit: (position: THREE.Vector3) => void
  ): void {
    if (!this.group.visible) return;

    // AI/target re-evaluation runs on a fixed interval, not every frame.
    this.aiAccumulator += delta;
    const runAi = this.aiAccumulator >= mission18Tuning.aiIntervalSeconds;
    if (runAi) this.aiAccumulator = 0;

    const t = mission18Tuning;
    for (let i = 0; i < this.slots.length; i += 1) {
      const slot = this.slots[i];
      if (!slot.active) continue;
      const target = this.targets[i];

      // Damage taken by the ship's WeaponSystem writes straight into
      // target.health; mirror it back into the slot.
      if (target.health < slot.health) {
        slot.health = target.health;
        if (slot.health > 0 && slot.state !== 'destroyed') {
          slot.state = slot.health <= t.droneHealth * 0.45 ? 'damaged' : 'evade';
          slot.stateAge = 0;
          slot.smoke.visible = slot.state === 'damaged';
        }
      }

      if (slot.health <= 0 && slot.state !== 'destroyed') {
        slot.state = 'destroyed';
        slot.stateAge = 0;
        this.deactivate(i);
        onDestroyed();
        if (this.activeCount === 0) this.group.visible = false;
        continue;
      }

      slot.stateAge += delta;

      // --- Deterministic flight: a ring around the settlement, dropping into
      // attack passes and pulling back out. No pathfinding, no randomness.
      slot.angle += delta * t.droneOrbitSpeed * (slot.state === 'retreat' ? 2.2 : 1);
      const radius =
        t.droneOrbitRadius +
        slot.radiusOffset +
        (slot.state === 'attack' ? -68 : slot.state === 'retreat' ? slot.stateAge * 42 : 0);
      const altitude =
        t.droneAltitude +
        slot.altitudeOffset +
        (slot.state === 'attack' ? -20 : slot.state === 'retreat' ? slot.stateAge * 9 : 0) +
        Math.sin(elapsed * 0.7 + i) * 2.4;

      this.scratch.set(
        this.origin.x + Math.cos(slot.angle) * radius,
        this.origin.y + altitude,
        this.origin.z + Math.sin(slot.angle) * radius
      );
      slot.group.position.lerp(this.scratch, Math.min(1, delta * 1.6));
      // Face the settlement while attacking, face out while retreating.
      slot.group.lookAt(
        slot.state === 'retreat'
          ? slot.group.position.clone().add(this.scratch.clone().sub(this.origin))
          : this.origin
      );
      slot.hull.rotation.z += delta * 0.4;
      slot.ring.rotation.z -= delta * 0.9;

      // --- State machine, evaluated on the AI interval only.
      if (runAi) {
        switch (slot.state) {
          case 'approach':
            if (slot.stateAge > 2.4) { slot.state = 'scan'; slot.stateAge = 0; }
            break;
          case 'scan':
            if (slot.stateAge > 1.8) { slot.state = 'attack'; slot.stateAge = 0; }
            break;
          case 'attack':
            if (slot.stateAge > 2.6) {
              slot.passes += 1;
              slot.state = 'evade';
              slot.stateAge = 0;
              // A completed pass is what actually presses the colony.
              onColonyHit(slot.group.position);
            }
            break;
          case 'evade':
            if (slot.stateAge > 2.2) {
              slot.state = i === this.retreatSlot && slot.passes >= 1 ? 'retreat' : 'attack';
              slot.stateAge = 0;
            }
            break;
          case 'damaged':
            // A hurt drone still fights, just slower and smokier.
            if (slot.stateAge > 3.2) { slot.state = 'attack'; slot.stateAge = 0; }
            break;
          case 'retreat':
            // The runner never despawns on its own: the mission decides.
            break;
          default:
            break;
        }
      }

      // --- Damage read-out: eye dims, smoke thickens.
      const hurt = 1 - Math.max(0, slot.health) / t.droneHealth;
      slot.eyeMaterial.emissiveIntensity = 0.42 * (1 - hurt * 0.7) + Math.sin(elapsed * 3 + i) * 0.05;
      if (slot.smoke.visible) {
        const positions = slot.smoke.geometry.getAttribute('position') as THREE.BufferAttribute;
        const array = positions.array as Float32Array;
        for (let s = 0; s < array.length; s += 3) {
          array[s] += slot.smokeVelocities[s] * delta;
          array[s + 1] += slot.smokeVelocities[s + 1] * delta;
          array[s + 2] += slot.smokeVelocities[s + 2] * delta;
          // Recycle a mote once it drifts too far: no allocation.
          if (array[s + 1] > 6) { array[s] = 0; array[s + 1] = 0; array[s + 2] = 0; }
        }
        positions.needsUpdate = true;
        slot.smokeMaterial.opacity = Math.min(0.5, hurt * 0.6);
      }
    }
  }

  /** Apply damage from Aurora's own batteries. Returns true if it killed. */
  damageNearest(from: THREE.Vector3, range: number, amount: number): boolean {
    let best = -1;
    let bestDistance = range;
    for (let i = 0; i < this.slots.length; i += 1) {
      if (!this.slots[i].active) continue;
      const d = this.slots[i].group.position.distanceTo(from);
      if (d < bestDistance) { bestDistance = d; best = i; }
    }
    if (best < 0) return false;
    this.targets[best].health -= amount;
    return this.targets[best].health <= 0;
  }

  /** World position of the drone a battery should track, or null. */
  nearestPosition(from: THREE.Vector3, range: number): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestDistance = range;
    for (const slot of this.slots) {
      if (!slot.active) continue;
      const d = slot.group.position.distanceTo(from);
      if (d < bestDistance) { bestDistance = d; best = slot.group.position; }
    }
    return best;
  }

  /** Position of the retreating runner, for the HUD marker. */
  get runnerPosition(): THREE.Vector3 | null {
    if (this.retreatSlot < 0) return null;
    const slot = this.slots[this.retreatSlot];
    return slot?.active ? slot.group.position : null;
  }

  dispose(): void {
    for (const slot of this.slots) {
      slot.eyeMaterial.dispose();
      slot.smoke.geometry.dispose();
      slot.smokeMaterial.dispose();
    }
    this.hullMaterial?.dispose();
    this.trimMaterial?.dispose();
    this.ringMaterial?.dispose();
    this.smokeTexture?.dispose();
  }
}
