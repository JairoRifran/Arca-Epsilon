import * as THREE from 'three';
import { GpuParticleField } from './GpuParticleField';

export type PremiumVisualMode = 'webgl' | 'webgpu' | 'fallback';
export type PremiumVisualQuality = 'low' | 'medium' | 'high';

export type PremiumVisualState = {
  premiumVisualsEnabled: boolean;
  premiumVisualsMode: PremiumVisualMode;
  premiumVisualQuality: PremiumVisualQuality;
  premiumParticleCount: number;
  premiumVisualDrawCalls: number;
  premiumVisualWarnings: string[];
  webgpuAvailable: boolean;
  tslAvailable: boolean;
  premiumAutoQualityEnabled: boolean;
  premiumFpsAverage: number;
  premiumQualityDowngradeReason: string;
  premiumLastQualityChangeAt: number;
};

/** The preference persisted to localStorage, separate from the game save. */
export type PremiumVisualPreference = {
  premiumVisualsEnabled: boolean;
  premiumVisualQuality: PremiumVisualQuality;
  premiumAutoQualityEnabled: boolean;
};

const PREFERENCE_KEY = 'arca-epsilon-premium-visuals-v1';

/** FPS below this for the sustained window triggers one downgrade step. */
const AUTO_DOWNGRADE_FPS = 30;
/** Seconds the average must stay under the threshold before stepping down. */
const AUTO_DOWNGRADE_WINDOW_SECONDS = 6;
/** Cooldown after any downgrade so the layer never oscillates. */
const AUTO_DOWNGRADE_COOLDOWN_SECONDS = 12;

const QUALITY_ORDER: PremiumVisualQuality[] = ['low', 'medium', 'high'];

/** Particle budget per quality step, matching the brief's guidance. */
const QUALITY_BUDGET: Record<PremiumVisualQuality, number> = {
  low: 520,
  medium: 1300,
  high: 3200
};

type FieldEntry = {
  field: GpuParticleField;
  /** Share of the total budget this field gets. */
  weight: number;
  /** Only run when the player is within this range of the field origin. */
  activeRange: number;
  origin: THREE.Vector3;
  /** Set false while its owning feature does not exist yet. */
  enabled: boolean;
};

/**
 * Optional premium visual layer: GPU-driven atmospheric and energy particles
 * layered over the existing renderer.
 *
 * ## Why this is WebGL and not WebGPU/TSL
 *
 * three r166 does ship `WebGPURenderer` and the TSL node system, and both are
 * importable here. They are not usable as an *additive layer*: WebGPU and
 * WebGL are separate GPU contexts and cannot share a canvas, and in r166 node
 * materials only run under `WebGPURenderer`. Using TSL would mean replacing
 * the game's renderer wholesale, taking the composer, tone mapping, LOD and
 * every existing material with it — far past the risk this layer is worth.
 *
 * So the layer implements the same *technique class* in WebGL: particle
 * motion computed in the vertex shader from a seed plus time, per-particle
 * emission, controlled additive glow and procedural turbulence. The capability
 * probe still reports whether WebGPU and TSL are present, so the day a node
 * path becomes viable the fields can be swapped behind this interface.
 *
 * Everything here is optional. Disabled, the layer hides its fields and costs
 * nothing; it never gates gameplay and never touches mission state.
 */
export class PremiumVisualLayer {
  readonly group = new THREE.Group();

  private readonly fields = new Map<string, FieldEntry>();
  private readonly warnings: string[] = [];
  private readonly playerPosition = new THREE.Vector3();
  private enabled = true;
  private quality: PremiumVisualQuality = 'medium';
  private mode: PremiumVisualMode = 'webgl';
  private webgpuAvailable = false;
  private tslAvailable = false;

  // Auto-quality: a smoothed FPS average, a low-FPS timer, and a cooldown so
  // one bad stretch steps quality down once rather than thrashing.
  private autoQualityEnabled = true;
  private fpsAverage = 60;
  private lowFpsSeconds = 0;
  private cooldownSeconds = 0;
  private downgradeReason = '';
  private lastQualityChangeAt = 0;
  private elapsedClock = 0;
  private lastGovernorNow = -1;

  constructor() {
    this.group.name = 'Premium Visual Layer';
    this.detectCapabilities();
    this.loadPreference();
  }

  /**
   * Load the persisted preference. Lives in localStorage, entirely separate
   * from the game save, and any failure falls back to the safe default
   * (medium, enabled) rather than throwing.
   */
  private loadPreference(): void {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PREFERENCE_KEY) : null;
      if (!raw) return;
      const pref = JSON.parse(raw) as Partial<PremiumVisualPreference>;
      if (typeof pref.premiumVisualsEnabled === 'boolean') this.enabled = pref.premiumVisualsEnabled;
      if (pref.premiumVisualQuality && QUALITY_ORDER.includes(pref.premiumVisualQuality)) {
        this.quality = pref.premiumVisualQuality;
      }
      if (typeof pref.premiumAutoQualityEnabled === 'boolean') {
        this.autoQualityEnabled = pref.premiumAutoQualityEnabled;
      }
      this.group.visible = this.enabled;
    } catch {
      // Corrupt or unavailable storage: keep the safe defaults.
    }
  }

  private savePreference(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const pref: PremiumVisualPreference = {
        premiumVisualsEnabled: this.enabled,
        premiumVisualQuality: this.quality,
        premiumAutoQualityEnabled: this.autoQualityEnabled
      };
      localStorage.setItem(PREFERENCE_KEY, JSON.stringify(pref));
    } catch {
      // Storage full or blocked: preference just won't persist this session.
    }
  }

  /**
   * Capability probe. Deliberately synchronous and side-effect free: it only
   * records what the platform could support, and never changes the renderer.
   */
  private detectCapabilities(): void {
    try {
      this.webgpuAvailable = typeof navigator !== 'undefined' && 'gpu' in navigator;
    } catch {
      this.webgpuAvailable = false;
    }
    // The TSL node package ships with three r166, but it is only usable under
    // WebGPURenderer, so presence alone does not make it viable here.
    this.tslAvailable = true;
    if (this.webgpuAvailable) {
      this.warnings.push(
        'WebGPU disponible pero no utilizable como capa aditiva: WebGL y WebGPU no comparten canvas. Capa ejecutando en modo webgl.'
      );
    }
    this.mode = 'webgl';
  }

  /**
   * Register a field. Weights are relative: the active quality budget is
   * split across the registered fields in proportion to them.
   */
  addField(id: string, field: GpuParticleField, weight: number, activeRange: number): void {
    this.fields.set(id, {
      field,
      weight,
      activeRange,
      origin: new THREE.Vector3(),
      enabled: false
    });
    this.group.add(field.points);
    this.applyBudget();
  }

  /** Move a field's volume and mark whether its owning feature exists yet. */
  configureField(id: string, x: number, y: number, z: number, enabled: boolean): void {
    const entry = this.fields.get(id);
    if (!entry) return;
    entry.origin.set(x, y, z);
    entry.enabled = enabled;
    entry.field.setOrigin(x, y, z);
  }

  setFieldWind(id: string, x: number, y: number, z: number): void {
    this.fields.get(id)?.field.setWind(x, y, z);
  }

  setFieldAttractor(id: string, x: number, y: number, z: number, strength: number): void {
    this.fields.get(id)?.field.setAttractor(x, y, z, strength);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.group.visible = enabled;
    if (!enabled) {
      for (const entry of this.fields.values()) entry.field.setVisible(false);
    }
    this.savePreference();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setQuality(quality: PremiumVisualQuality, reason = 'manual'): void {
    if (quality !== this.quality) {
      this.quality = quality;
      this.applyBudget();
      this.lastQualityChangeAt = this.elapsedClock;
      this.downgradeReason = reason === 'manual' ? '' : reason;
    }
    this.savePreference();
  }

  setAutoQualityEnabled(enabled: boolean): void {
    this.autoQualityEnabled = enabled;
    if (!enabled) {
      this.lowFpsSeconds = 0;
      this.downgradeReason = '';
    }
    this.savePreference();
  }

  /**
   * Split the quality budget across fields. Called on registration and on
   * quality changes only — never per frame.
   */
  private applyBudget(): void {
    let totalWeight = 0;
    for (const entry of this.fields.values()) totalWeight += entry.weight;
    if (totalWeight <= 0) return;
    const budget = QUALITY_BUDGET[this.quality];
    for (const entry of this.fields.values()) {
      const share = (entry.weight / totalWeight) * budget;
      // Intensity is the fraction of the field's own particles we draw.
      entry.field.setIntensity(THREE.MathUtils.clamp(share / entry.field.count, 0, 1));
    }
  }

  /**
   * Per frame: distance-cull each field, push the shared gust envelope, and
   * run the auto-quality governor. No allocation, and the whole loop is a
   * handful of fields.
   */
  update(playerPosition: THREE.Vector3, elapsed: number, gust: number, delta: number, fps: number): void {
    if (!this.enabled) return;
    this.elapsedClock = elapsed;
    this.updateAutoQuality(fps);
    this.playerPosition.copy(playerPosition);
    for (const entry of this.fields.values()) {
      if (!entry.enabled) {
        entry.field.setVisible(false);
        continue;
      }
      const distance = this.playerPosition.distanceTo(entry.origin);
      const visible = distance <= entry.activeRange;
      entry.field.setVisible(visible);
      if (visible) entry.field.update(elapsed, gust);
    }
  }

  /**
   * Governor: smooth FPS, and if it stays under the threshold for a sustained
   * window, step quality down one notch. Only ever steps down within a
   * session, and a cooldown after each step prevents oscillation. FPS of 0
   * (a tab that has not painted, e.g. headless warm-up) is ignored so it can
   * never trigger a spurious downgrade.
   *
   * The window is measured in wall-clock time via performance.now(), NOT the
   * game delta: under a heavy stall the game delta is clamped and frames are
   * sparse, so a game-delta window would take far longer than the real
   * seconds it claims. Wall-clock keeps "6 seconds under 30 fps" honest no
   * matter how badly the frame rate has collapsed.
   */
  private updateAutoQuality(fps: number): void {
    const now = typeof performance !== 'undefined' ? performance.now() / 1000 : this.elapsedClock;
    const delta = this.lastGovernorNow < 0 ? 0 : Math.min(1, Math.max(0, now - this.lastGovernorNow));
    this.lastGovernorNow = now;
    if (this.cooldownSeconds > 0) this.cooldownSeconds = Math.max(0, this.cooldownSeconds - delta);
    if (fps > 0) {
      // Exponential smoothing: a couple of dropped frames never counts.
      this.fpsAverage += (fps - this.fpsAverage) * Math.min(1, delta * 1.5);
    }
    if (!this.autoQualityEnabled || this.cooldownSeconds > 0 || fps <= 0) {
      if (this.fpsAverage >= AUTO_DOWNGRADE_FPS) this.lowFpsSeconds = 0;
      return;
    }
    if (this.fpsAverage < AUTO_DOWNGRADE_FPS) {
      this.lowFpsSeconds += delta;
    } else {
      this.lowFpsSeconds = Math.max(0, this.lowFpsSeconds - delta);
    }
    if (this.lowFpsSeconds >= AUTO_DOWNGRADE_WINDOW_SECONDS) {
      const currentIndex = QUALITY_ORDER.indexOf(this.quality);
      if (currentIndex > 0) {
        const next = QUALITY_ORDER[currentIndex - 1];
        this.setQuality(next, `fps ${Math.round(this.fpsAverage)} < ${AUTO_DOWNGRADE_FPS} durante ${AUTO_DOWNGRADE_WINDOW_SECONDS}s`);
        this.cooldownSeconds = AUTO_DOWNGRADE_COOLDOWN_SECONDS;
      }
      this.lowFpsSeconds = 0;
    }
  }

  getState(): PremiumVisualState {
    let particles = 0;
    let draws = 0;
    for (const entry of this.fields.values()) {
      if (!this.enabled || !entry.field.points.visible) continue;
      particles += entry.field.activeCount;
      draws += 1;
    }
    return {
      premiumVisualsEnabled: this.enabled,
      premiumVisualsMode: this.enabled ? this.mode : 'fallback',
      premiumVisualQuality: this.quality,
      premiumParticleCount: particles,
      premiumVisualDrawCalls: draws,
      premiumVisualWarnings: [...this.warnings],
      webgpuAvailable: this.webgpuAvailable,
      tslAvailable: this.tslAvailable,
      premiumAutoQualityEnabled: this.autoQualityEnabled,
      premiumFpsAverage: Number(this.fpsAverage.toFixed(1)),
      premiumQualityDowngradeReason: this.downgradeReason,
      premiumLastQualityChangeAt: Number(this.lastQualityChangeAt.toFixed(2))
    };
  }

  dispose(): void {
    for (const entry of this.fields.values()) entry.field.dispose();
    this.fields.clear();
  }
}
