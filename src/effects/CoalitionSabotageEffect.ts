import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';

/** Sparks pooled for the whole mission; never reallocated. */
const SPARK_COUNT = 60;
/** Pulses travelling along the colony's cable runs. */
const PULSE_COUNT = 12;
/** Sprite transforms only need ~25 Hz to read as continuous. */
const UPDATE_HZ = 25;

/**
 * The colony coming apart on someone else's schedule.
 *
 * Deliberately small and mechanical rather than spectacular: this is sabotage
 * inside a working settlement, not an explosion. Three layers, all sharing one
 * sprite texture:
 *
 *  - controlled sparks that spit from whichever panel is being worked, pooled
 *    into one `Points` object that is never reallocated;
 *  - dull amber pulses that crawl along the cable runs between the affected
 *    hardware, on a single shared additive material;
 *  - one reused light that swells with the core's overload — a single dynamic
 *    light for the whole effect, never one per pulse.
 *
 * Everything is driven by `setStress` and `setOverload`, so the same object
 * plays the first flicker and the core going critical. Nothing is allocated
 * after construction, nothing calls `Math.random` during update, and all
 * motion derives from elapsed time so it is deterministic and frame-rate
 * independent. `setStress(0)` with no overload parks every layer.
 */
export class CoalitionSabotageEffect {
  readonly group = new THREE.Group();

  private readonly sparks: THREE.Points;
  private readonly sparkMaterial: THREE.PointsMaterial;
  private readonly sparkSeeds: Float32Array;
  private readonly pulses: THREE.Sprite[] = [];
  private readonly pulseMaterial: THREE.SpriteMaterial;
  /** Per pulse: start xyz packed with the run it travels. */
  private readonly pulseSeeds: Float32Array;
  private readonly overloadLight: THREE.PointLight;
  private readonly sharedTexture: THREE.Texture;

  /** Endpoints of the cable runs the pulses crawl along. */
  private readonly runFrom = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private readonly runTo = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private readonly runActive = [false, false, false];
  private readonly sparkOrigin = new THREE.Vector3();
  private readonly corePosition = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();

  private stress = 0;
  private overload = 0;
  private accumulator = 0;
  private sparkAge = Number.POSITIVE_INFINITY;

  constructor() {
    this.group.name = 'Sabotaje de la Coalición';
    this.group.visible = false;
    this.sharedTexture = createSoftParticleTexture(32);

    // ----- Controlled sparks -----
    const sparkPositions = new Float32Array(SPARK_COUNT * 3);
    this.sparkSeeds = new Float32Array(SPARK_COUNT * 3);
    for (let i = 0; i < SPARK_COUNT; i += 1) {
      const angle = hash(i * 2.7 + 1.1) * Math.PI * 2;
      const radius = 0.08 + hash(i * 4.3 + 2.9) * 0.4;
      this.sparkSeeds[i * 3] = Math.cos(angle) * radius;
      this.sparkSeeds[i * 3 + 1] = 0.1 + hash(i * 6.1 + 5.3) * 0.6;
      this.sparkSeeds[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    // Fixed generous bounds: the burst follows whichever panel is worked, so
    // recomputing them every frame would be pure waste.
    sparkGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 4000);
    this.sparkMaterial = new THREE.PointsMaterial({
      color: 0xffb066,
      size: 0.075,
      map: this.sharedTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.sparks = new THREE.Points(sparkGeometry, this.sparkMaterial);
    this.sparks.frustumCulled = false;
    this.group.add(this.sparks);

    // ----- Pulses crawling the cable runs -----
    this.pulseMaterial = new THREE.SpriteMaterial({
      map: this.sharedTexture,
      color: 0xc2601f,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.pulseSeeds = new Float32Array(PULSE_COUNT * 2);
    for (let i = 0; i < PULSE_COUNT; i += 1) {
      // Which run it rides, and where in the crawl it starts.
      this.pulseSeeds[i * 2] = i % this.runFrom.length;
      this.pulseSeeds[i * 2 + 1] = hash(i * 5.1 + 3.3);
      const pulse = new THREE.Sprite(this.pulseMaterial);
      pulse.scale.setScalar(0.5);
      pulse.frustumCulled = false;
      this.pulses.push(pulse);
      this.group.add(pulse);
    }

    // One reused light for the whole effect, tied to the core's overload.
    this.overloadLight = new THREE.PointLight(0xc4551a, 0, 34, 2);
    this.overloadLight.castShadow = false;
    this.group.add(this.overloadLight);
  }

  /** Pin a cable run between two pieces of hardware. */
  setRun(index: number, from: THREE.Vector3, to: THREE.Vector3, active: boolean): void {
    if (index < 0 || index >= this.runFrom.length) return;
    this.runFrom[index].copy(from);
    this.runTo[index].copy(to);
    this.runActive[index] = active;
  }

  /** Where the spark burst plays; follows whatever panel is being worked. */
  setSparkOrigin(position: THREE.Vector3): void {
    this.sparkOrigin.copy(position);
  }

  setCorePosition(position: THREE.Vector3): void {
    this.corePosition.copy(position);
    this.overloadLight.position.copy(position);
  }

  /** Fire the spark burst. Called on interaction, never per frame. */
  triggerSparks(): void {
    this.sparkAge = 0;
  }

  /** 0 = the colony is fine, 1 = systems failing across the board. */
  setStress(stress: number): void {
    this.stress = THREE.MathUtils.clamp(stress, 0, 1);
    this.syncVisibility();
  }

  /** 0..1 of the central module's overload. Drives the light and the pulses. */
  setOverload(overload: number): void {
    this.overload = THREE.MathUtils.clamp(overload, 0, 1);
    this.syncVisibility();
  }

  private syncVisibility(): void {
    const active = this.stress > 0.01 || this.overload > 0.01;
    this.group.visible = active;
    if (!active) {
      this.overloadLight.intensity = 0;
      this.sparkMaterial.opacity = 0;
      this.pulseMaterial.opacity = 0;
      this.sparkAge = Number.POSITIVE_INFINITY;
    }
  }

  get stressLevel(): number {
    return this.stress;
  }

  /**
   * Subtle HUD glitch amount, 0..1. Rides the colony's stress on an exact
   * period — the tell that the fault is being driven, not decaying.
   */
  hudGlitch(elapsed: number): number {
    if (!this.group.visible) return 0;
    const cycle = elapsed % 3.1;
    return cycle < 0.1 ? this.stress * (1 - cycle / 0.1) : 0;
  }

  update(delta: number, elapsed: number): void {
    if (!this.group.visible) return;

    // The overload light decays every frame so it swells smoothly; the sprite
    // and point transforms below only need 25 Hz.
    const surge = this.overload > 0 ? 0.6 + Math.sin(elapsed * (2 + this.overload * 5)) * 0.4 : 0;
    this.overloadLight.intensity = this.overload * (1.2 + surge * 1.6);

    // Sparks: a short pooled burst, faded out rather than reallocated.
    if (this.sparkAge < 0.5) {
      this.sparkAge += delta;
      const t = Math.min(1, this.sparkAge / 0.5);
      const positions = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < SPARK_COUNT; i += 1) {
        const spread = 1 + t * 2.4;
        positions.setXYZ(
          i,
          this.sparkOrigin.x + this.sparkSeeds[i * 3] * spread,
          this.sparkOrigin.y + this.sparkSeeds[i * 3 + 1] * (1 + t * 0.7),
          this.sparkOrigin.z + this.sparkSeeds[i * 3 + 2] * spread
        );
      }
      positions.needsUpdate = true;
      this.sparkMaterial.opacity = (1 - t) * 0.85;
    } else if (this.sparkMaterial.opacity !== 0) {
      this.sparkMaterial.opacity = 0;
    }

    this.accumulator += delta;
    if (this.accumulator < 1 / UPDATE_HZ) return;
    this.accumulator = 0;

    // Pulses crawl their run and wrap. Speed rides the stress, so the colony
    // visibly quickens as more systems go down.
    const speed = 0.14 + this.stress * 0.3;
    let anyRun = false;
    for (let i = 0; i < this.pulses.length; i += 1) {
      const run = this.pulseSeeds[i * 2];
      const pulse = this.pulses[i];
      if (!this.runActive[run]) {
        pulse.visible = false;
        continue;
      }
      anyRun = true;
      pulse.visible = true;
      const phase = (elapsed * speed + this.pulseSeeds[i * 2 + 1]) % 1;
      this.scratch.copy(this.runFrom[run]).lerp(this.runTo[run], phase);
      pulse.position.copy(this.scratch);
      // Fade in and out at the ends so a pulse never pops into being.
      pulse.scale.setScalar(0.3 + Math.sin(phase * Math.PI) * 0.45);
    }
    this.pulseMaterial.opacity = anyRun ? 0.16 + this.stress * 0.4 : 0;
  }

  dispose(): void {
    this.sparks.geometry.dispose();
    this.sparkMaterial.dispose();
    this.pulseMaterial.dispose();
    // The soft sprite texture is shared application-wide; freeing it here
    // would pull it out from under every other effect using the same size.
  }
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
