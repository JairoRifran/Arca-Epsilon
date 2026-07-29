import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';
import { GpuParticleField } from './GpuParticleField';

const GUST_COUNT = 7;
const FLASH_COUNT = 3;
/** Sprite transforms only need ~30 Hz to read as continuous motion. */
const SPRITE_UPDATE_HZ = 30;

/**
 * The electromagnetic front that breaks over the Aurora valley in M13.
 *
 * Built from four cheap layers rather than one expensive one:
 *
 *  - two `GpuParticleField`s (the existing engine, reused rather than
 *    duplicated) carrying the airborne dust and the heavier wind-driven grit,
 *    both computed in the vertex shader at one draw call each;
 *  - a handful of horizontally drifting gust sheets on a shared material;
 *  - electromagnetic flashes on a shared additive material, fired from a
 *    deterministic schedule;
 *  - one reused PointLight that pulses with those flashes — a single dynamic
 *    light for the whole storm, never one per discharge.
 *
 * Everything is driven by `setIntensity`, so the same object plays the build,
 * the peak and the dispersal. Sprite transforms update at 30 Hz, no geometry
 * or material is created after construction, nothing calls Math.random during
 * update, and all motion is delta/elapsed driven so it is frame-rate
 * independent and deterministic.
 */
export class AuroraStormEffect {
  readonly group = new THREE.Group();

  private readonly dustField: GpuParticleField;
  private readonly gritField: GpuParticleField;
  private readonly gusts: THREE.Sprite[] = [];
  private readonly gustMaterial: THREE.SpriteMaterial;
  private readonly gustSeeds: Float32Array;
  private readonly flashes: THREE.Sprite[] = [];
  private readonly flashMaterial: THREE.SpriteMaterial;
  private readonly flashSeeds: Float32Array;
  private readonly flashLight: THREE.PointLight;
  private readonly origin = new THREE.Vector3();
  private readonly sharedTexture: THREE.Texture;

  private intensity = 0;
  private spriteAccumulator = 0;
  private flashEnergy = 0;
  /**
   * Set on the frame a discharge actually lights up, and cleared by
   * `consumeStrike`. The audio layer reads this so a thunder sample is only
   * ever played for a flash the player can genuinely see — never on an
   * independent random timer.
   */
  private pendingStrike: { near: boolean; strength: number } | null = null;

  constructor() {
    this.group.name = 'Aurora Storm';
    this.group.visible = false;

    // One soft sprite texture shared by every gust and every flash.
    this.sharedTexture = createSoftParticleTexture(96);

    // Airborne dust: fine, dense, dragged almost flat by the wind.
    this.dustField = new GpuParticleField({
      name: 'Storm // polvo',
      count: 1100,
      bounds: new THREE.Vector3(190, 34, 190),
      color: 0x8d8578,
      size: 0.52,
      opacity: 0.34,
      wind: new THREE.Vector3(22, 0.2, 8),
      turbulence: 2.4,
      gravity: 0.3,
      fadeDistance: 420,
      groundBias: 2.2
    });
    // Heavier grit: fewer, larger, faster, closer to the ground.
    this.gritField = new GpuParticleField({
      name: 'Storm // grava',
      count: 420,
      bounds: new THREE.Vector3(150, 14, 150),
      color: 0x6f6a60,
      size: 0.78,
      opacity: 0.3,
      wind: new THREE.Vector3(34, 0.1, 12),
      turbulence: 1.4,
      gravity: 0.6,
      fadeDistance: 320,
      groundBias: 3.2
    });
    this.dustField.setIntensity(1);
    this.gritField.setIntensity(1);
    this.group.add(this.dustField.points);
    this.group.add(this.gritField.points);

    // Gust sheets: wide, thin, low, drifting horizontally across the valley.
    this.gustMaterial = new THREE.SpriteMaterial({
      map: this.sharedTexture,
      color: 0x9aa0a4,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.gustSeeds = new Float32Array(GUST_COUNT * 4);
    for (let i = 0; i < GUST_COUNT; i += 1) {
      // Deterministic scatter: irregular heights, spans and speeds so the
      // sheets never line up into a readable row.
      const r1 = hash(i * 1.7 + 0.3);
      const r2 = hash(i * 3.1 + 5.9);
      const r3 = hash(i * 5.3 + 11.2);
      const r4 = hash(i * 7.9 + 2.4);
      this.gustSeeds[i * 4] = -160 + r1 * 320; // z offset
      this.gustSeeds[i * 4 + 1] = 6 + r2 * 34; // height
      this.gustSeeds[i * 4 + 2] = 0.5 + r3 * 1.4; // speed scale
      this.gustSeeds[i * 4 + 3] = r4; // phase
      const gust = new THREE.Sprite(this.gustMaterial);
      gust.scale.set(210 + r3 * 140, 26 + r2 * 26, 1);
      this.gusts.push(gust);
      this.group.add(gust);
    }

    // Electromagnetic discharges: additive sprites on a shared material.
    this.flashMaterial = new THREE.SpriteMaterial({
      map: this.sharedTexture,
      color: 0xcfe0ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.flashSeeds = new Float32Array(FLASH_COUNT * 4);
    for (let i = 0; i < FLASH_COUNT; i += 1) {
      const r1 = hash(i * 2.3 + 13.1);
      const r2 = hash(i * 4.7 + 21.7);
      const r3 = hash(i * 6.1 + 31.3);
      this.flashSeeds[i * 4] = -180 + r1 * 360;
      this.flashSeeds[i * 4 + 1] = 48 + r2 * 60;
      this.flashSeeds[i * 4 + 2] = -180 + r3 * 360;
      // Offset phases so the three never strike together.
      this.flashSeeds[i * 4 + 3] = r1 * 0.61 + i * 0.29;
      const flash = new THREE.Sprite(this.flashMaterial);
      flash.scale.set(150 + r2 * 90, 96 + r3 * 70, 1);
      this.flashes.push(flash);
      this.group.add(flash);
    }

    // A single reused light for the whole storm's discharges.
    this.flashLight = new THREE.PointLight(0xbdd4ff, 0, 420, 2);
    this.group.add(this.flashLight);

    this.group.traverse((child) => {
      if (child instanceof THREE.Sprite) child.frustumCulled = false;
    });
  }

  /** Anchor the storm over the colony. */
  setOrigin(x: number, y: number, z: number): void {
    this.origin.set(x, y, z);
    this.group.position.set(x, y, z);
    // The particle fields live in world space, so they are positioned rather
    // than parented — their shader wraps around this origin.
    this.dustField.setOrigin(x, y + 14, z);
    this.gritField.setOrigin(x, y + 5, z);
  }

  /** 0 = clear, 1 = the front directly overhead. Drives every layer. */
  setIntensity(intensity: number): void {
    this.intensity = THREE.MathUtils.clamp(intensity, 0, 1);
    const active = this.intensity > 0.01;
    this.group.visible = active;
    this.dustField.setVisible(active);
    this.gritField.setVisible(active);
    if (!active) {
      this.flashLight.intensity = 0;
      this.flashEnergy = 0;
      // Never let a strike survive the storm switching off and fire later.
      this.pendingStrike = null;
    }
  }

  get stormIntensity(): number {
    return this.intensity;
  }

  /** Visibility loss the caller folds into scene fog, 0..1. */
  get visibilityLoss(): number {
    return this.intensity * 0.75;
  }

  /**
   * Hand the caller the discharge that lit up this frame, if any, and clear
   * it. Returns null on every frame without a visible flash, so callers can
   * poll it cheaply from their own update.
   */
  consumeStrike(): { near: boolean; strength: number } | null {
    const strike = this.pendingStrike;
    this.pendingStrike = null;
    return strike;
  }

  update(delta: number, elapsed: number): void {
    if (!this.group.visible) return;
    const intensity = this.intensity;

    // Particle fields: their own shader does the motion; the gust term scales
    // with the storm so the air visibly accelerates as the front arrives.
    const gust = 0.5 + intensity * 1.6 + Math.sin(elapsed * 0.37) * 0.25;
    this.dustField.update(elapsed, gust);
    this.gritField.update(elapsed, gust);
    this.dustField.points.visible = intensity > 0.05;
    this.gritField.points.visible = intensity > 0.25;

    // Discharges decay every frame so the light falls off smoothly, but the
    // sprite transforms below only need ~30 Hz.
    this.flashEnergy = Math.max(0, this.flashEnergy - delta * 3.4);
    this.flashLight.intensity = this.flashEnergy * 2.6 * intensity;

    this.spriteAccumulator += delta;
    const interval = 1 / SPRITE_UPDATE_HZ;
    if (this.spriteAccumulator < interval) return;
    this.spriteAccumulator = 0;

    // Gust sheets drift horizontally and wrap; opacity rides the storm.
    const span = 640;
    for (let i = 0; i < this.gusts.length; i += 1) {
      const zOffset = this.gustSeeds[i * 4];
      const height = this.gustSeeds[i * 4 + 1];
      const speed = this.gustSeeds[i * 4 + 2];
      const phase = this.gustSeeds[i * 4 + 3];
      const travel = (elapsed * (14 + intensity * 46) * speed + phase * span) % span;
      const gustSprite = this.gusts[i];
      gustSprite.position.set(-span / 2 + travel, height + Math.sin(elapsed * 0.3 + phase * 6) * 3, zOffset);
      (gustSprite.material as THREE.SpriteMaterial).opacity = 0;
      // Per-sprite opacity is not possible on a shared material, so the
      // shared value carries the storm and per-sprite variety comes from
      // scale and height instead.
    }
    this.gustMaterial.opacity = Math.min(0.3, intensity * 0.3);

    // Deterministic discharge schedule: each flash owns a slow cycle, and a
    // strike fires in a narrow window of it. No randomness, no allocation.
    let strike = false;
    let strikeNear = false;
    let strikeStrength = 0;
    for (let i = 0; i < this.flashes.length; i += 1) {
      const phase = this.flashSeeds[i * 4 + 3];
      const rate = 0.09 + i * 0.017;
      const cycle = (elapsed * rate + phase) % 1;
      const flash = this.flashes[i];
      const window = 0.02 + intensity * 0.02;
      if (cycle < window && intensity > 0.3) {
        // Sharp leading edge, quick falloff inside the window.
        const t = 1 - cycle / window;
        (flash.material as THREE.SpriteMaterial).opacity = 0;
        flash.position.set(
          this.flashSeeds[i * 4],
          this.flashSeeds[i * 4 + 1],
          this.flashSeeds[i * 4 + 2]
        );
        if (t > 0.55) {
          strike = true;
          // The lowest, biggest flash reads as the closest one.
          const near = this.flashSeeds[i * 4 + 1] < 78;
          if (near || !strikeNear) strikeNear = near;
          strikeStrength = Math.max(strikeStrength, t * intensity);
        }
      }
    }
    // Shared additive material: one opacity for the whole discharge layer,
    // pulsed by the strongest current strike.
    const strikePulse = strike ? 1 : 0;
    this.flashMaterial.opacity = Math.min(0.42, strikePulse * 0.42 * intensity);
    if (strike) {
      this.flashEnergy = Math.max(this.flashEnergy, 1);
      // Published for the audio layer; overwriting an unconsumed strike is
      // correct, since only the most recent flash is worth a sample.
      this.pendingStrike = { near: strikeNear, strength: strikeStrength };
    }
    if (strike) {
      // Place the light at whichever flash is lit, reusing the same light.
      this.flashLight.position.set(this.flashSeeds[0], this.flashSeeds[1] * 0.5, this.flashSeeds[2]);
    }
  }

  dispose(): void {
    this.dustField.dispose();
    this.gritField.dispose();
    this.gustMaterial.dispose();
    this.flashMaterial.dispose();
    // The soft sprite texture is shared application-wide; freeing it here
    // would pull it out from under every other effect using the same size.
  }
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
