import type { DescentState } from './DescentSystem';

/**
 * Stages of an atmospheric entry, in order.
 *
 * The descent state machine only knows `entry` and `cloudBreak`, which is why
 * the entry used to read as one long flat effect: a single intensity ramp
 * driving everything. Splitting the same progress into five aerodynamic stages
 * is what lets each system peak at a different moment — ionisation before
 * buffet, buffet before cloud, cloud after the plasma has died — which is what
 * actually reads as a real re-entry rather than a particle emitter.
 */
export type EntryStage = 'none' | 'exosphere' | 'contact' | 'peak' | 'descent' | 'approach';

/**
 * Normalised drivers for one frame of entry. Consumed by the plasma effect,
 * the post grade, the sky/fog blend and the camera.
 *
 * Every field is 0..1 unless noted. The object is written in place by
 * `updateEntryProfile` — never reallocated — so the whole entry costs no
 * garbage per frame.
 */
export type EntryProfile = {
  stage: EntryStage;
  active: boolean;
  /** Overall entry progression, 0..1. */
  progress: number;
  /** Thermal load on the leading edge. Peaks mid-entry, not at the end. */
  heat: number;
  /**
   * Ionisation of the shock layer. Lags heat slightly and is what shifts the
   * plasma from ember orange to the blue-white of a real peak-heating event.
   */
  ionization: number;
  /** Screen-space refraction through the shock layer. */
  haze: number;
  /** Airframe buffet: drives camera shake. Peaks where the air first bites. */
  buffet: number;
  /** Additive bloom on top of the base strength. Not clamped to 1. */
  bloomBoost: number;
  /** Blend from space colours to atmospheric ones. */
  skyMix: number;
  /** Absolute exponential fog density target. */
  fogDensity: number;
  /** Hull heating handed to `PlayerShip.hullHeat`. */
  hullGlow: number;
  /** How much air is streaming past: streak density and cloud rush. */
  airDensity: number;
};

export function createEntryProfile(): EntryProfile {
  return {
    stage: 'none',
    active: false,
    progress: 0,
    heat: 0,
    ionization: 0,
    haze: 0,
    buffet: 0,
    bloomBoost: 0,
    skyMix: 0,
    fogDensity: 0.0012,
    hullGlow: 0,
    airDensity: 0
  };
}

/** Stage boundaries as a fraction of entry progress. */
const CONTACT_AT = 0.12;
const PEAK_AT = 0.34;
const DESCENT_AT = 0.66;
const APPROACH_AT = 0.88;

const SPACE_FOG_DENSITY = 0.0012;
const DEEP_ATMO_FOG_DENSITY = 0.0052;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Rises to 1 at `mid`, falls back to 0 by `end`. A single-peak envelope. */
function bell(x: number, start: number, mid: number, end: number): number {
  if (x <= start || x >= end) return 0;
  return x < mid ? smoothstep(start, mid, x) : 1 - smoothstep(mid, end, x);
}

export function stageOf(progress: number): EntryStage {
  if (progress < CONTACT_AT) return 'exosphere';
  if (progress < PEAK_AT) return 'contact';
  if (progress < DESCENT_AT) return 'peak';
  if (progress < APPROACH_AT) return 'descent';
  return 'approach';
}

/**
 * Recomputes the profile in place from the descent state.
 *
 * Shape of the entry, and why each curve is what it is:
 *
 *  - **Heat** is a bell centred just past a third of the way in. A real entry
 *    is hottest while the vehicle is still fast and the air is already thick,
 *    then cools as it slows — it does not get hotter all the way down, which
 *    is what the old linear ramp implied.
 *  - **Ionisation** trails heat and is sharper, so the shock layer goes
 *    blue-white only at the true peak and spends the rest of the entry orange.
 *  - **Buffet** peaks earlier than heat: the airframe is shaken hardest where
 *    dynamic pressure bites, not where it glows brightest. Separating the two
 *    is most of what makes the sequence read as physics.
 *  - **Air density** climbs monotonically — it is the one thing that only ever
 *    increases — and drives streaks, cloud rush and fog.
 *  - Speed and stress modulate on top: flying it badly is hotter and rougher.
 */
export function updateEntryProfile(
  profile: EntryProfile,
  descent: DescentState,
  speed: number
): EntryProfile {
  const entering = descent.phase === 'entry';
  const breaking = descent.phase === 'cloudBreak';
  profile.active = entering || breaking;

  if (!profile.active) {
    profile.stage = 'none';
    profile.progress = 0;
    profile.heat = 0;
    profile.ionization = 0;
    profile.haze = 0;
    profile.buffet = 0;
    profile.bloomBoost = 0;
    profile.skyMix = descent.phase === 'landingApproach' || descent.phase === 'landed' ? 1 : 0;
    profile.fogDensity = profile.skyMix > 0 ? DEEP_ATMO_FOG_DENSITY : SPACE_FOG_DENSITY;
    profile.hullGlow = 0;
    profile.airDensity = profile.skyMix;
    return profile;
  }

  const progress = breaking ? 1 : Math.min(1, Math.max(0, descent.entryProgress / 100));
  profile.progress = progress;
  profile.stage = breaking ? 'approach' : stageOf(progress);

  // Flying fast and misaligned raises the thermal and mechanical load; the
  // state machine already folds alignment and braking into `stress`.
  const stress = Math.min(1, Math.max(0, descent.stress / 100));
  const speedLoad = Math.min(1, Math.max(0, (speed - 14) / 46));

  const heatBell = bell(progress, 0.02, 0.38, 0.94);
  profile.heat = breaking
    ? 0.12
    : Math.min(1, heatBell * (0.78 + stress * 0.3 + speedLoad * 0.16));

  // Ionisation needs real heat before it appears at all, then saturates fast.
  profile.ionization = breaking ? 0 : smoothstep(0.42, 0.86, profile.heat);

  // Refraction follows the shock layer, but never survives into the clouds:
  // there is no shock layer left to look through down there.
  profile.haze = breaking ? 0 : profile.heat * (0.55 + profile.ionization * 0.45);

  const buffetBell = bell(progress, 0.06, 0.3, 0.9);
  profile.buffet = breaking
    ? 0.12
    : Math.min(1, buffetBell * (0.6 + stress * 0.55) + stress * 0.18);

  // Bloom is additive on the base strength so the peak actually blooms; the
  // rest of the game never sees it move.
  profile.bloomBoost = profile.heat * 0.5 + profile.ionization * 0.34;

  // The one monotonic driver: air only ever gets thicker on the way down.
  profile.airDensity = breaking ? 1 : smoothstep(0.05, 0.98, progress);

  // Sky and fog follow air density rather than raw progress, so the horizon
  // thickens continuously instead of snapping at cloud break.
  profile.skyMix = breaking ? 1 : Math.pow(profile.airDensity, 0.82);
  profile.fogDensity = SPACE_FOG_DENSITY + (DEEP_ATMO_FOG_DENSITY - SPACE_FOG_DENSITY) * profile.skyMix;

  // The hull keeps glowing a little after the plasma fades: hot metal cools
  // slower than a shock layer does.
  profile.hullGlow = Math.max(profile.heat, breaking ? 0.1 : heatBell * 0.55);

  return profile;
}
