/**
 * Single source of truth for the player ship's physical size.
 *
 * The scout is a crewed exploration and combat vessel: it has to read as
 * something that contains a cockpit, a seat, internal systems, a ventral pod,
 * torpedo tubes and a crew hatch. Measured against the pilot — whom
 * `SurfaceCharacter` normalises to exactly 1.78 m, making one world unit one
 * metre — the original hull was 10.61 m long and 3.55 m tall, so a standing
 * human reached **50.2 %** of the ship's total height. That is what made it
 * read as a go-kart with wings rather than a spacecraft.
 *
 * Everything about the ship's size now derives from the two constants below.
 * The important property is that the visible mesh and the physics colliders
 * scale from the *same* number: the collider spheres are authored against the
 * original hull and multiplied here, because they live in the ship group's
 * local space (that group is never scaled — only the GLB root inside it is),
 * so they are effectively world-unit values that would otherwise keep the old
 * size while the model grew.
 */

/** Max dimension the GLB was originally normalised to. Historical baseline. */
export const PLAYER_SHIP_BASE_MAX_DIMENSION = 9.2;

/**
 * How much bigger the hull reads than the original.
 *
 * 1.7 is the smallest factor that drops the pilot below a third of the ship's
 * height — the point at which a hull starts reading as something a person
 * boards rather than straddles. It is not a round number chosen for taste: it
 * comes from the measured 50.2 % ratio and the ~29.5 % target.
 */
export const PLAYER_SHIP_SCALE_FACTOR = 1.7;

/** What `PlayerShip.normalizeModel` normalises the GLB's longest axis to. */
export const PLAYER_SHIP_TARGET_MAX_DIMENSION =
  PLAYER_SHIP_BASE_MAX_DIMENSION * PLAYER_SHIP_SCALE_FACTOR;

/**
 * Hull extents measured from the live scene before the rescale, in metres.
 * Kept so the expected post-rescale size is derivable rather than guessed —
 * the real bounding box includes runtime accents (engine nozzles, antennae)
 * that extend past the normalised GLB, which is why the longest axis reads
 * 10.61 m rather than exactly the 9.2 m normalisation target.
 */
export const PLAYER_SHIP_REFERENCE_SIZE = {
  width: 7.16,
  height: 3.55,
  length: 10.61
} as const;

/** Expected extents after scaling. Used by the focused probe as a target. */
export const PLAYER_SHIP_EXPECTED_SIZE = {
  width: PLAYER_SHIP_REFERENCE_SIZE.width * PLAYER_SHIP_SCALE_FACTOR,
  height: PLAYER_SHIP_REFERENCE_SIZE.height * PLAYER_SHIP_SCALE_FACTOR,
  length: PLAYER_SHIP_REFERENCE_SIZE.length * PLAYER_SHIP_SCALE_FACTOR
} as const;

/** Pilot height, mirroring `SurfaceCharacter`'s own normalisation target. */
export const PILOT_HEIGHT_METRES = 1.78;

export type PlayerShipColliderDefinition = {
  /** Offset in ship-local space, in the ORIGINAL hull's units. */
  readonly offset: readonly [number, number, number];
  /** Radius in the ORIGINAL hull's units. */
  readonly radius: number;
  /** What part of the hull this sphere stands in for. */
  readonly part: 'bow' | 'forward' | 'aft' | 'stern' | 'leftWing' | 'rightWing';
};

/**
 * The six-sphere composite collider, authored against the original hull.
 *
 * Deliberately still six spheres covering bow, fuselage fore and aft, stern
 * and both wings: cheap, and shaped closely enough that it never blocks empty
 * space where there is visibly no hull. Scaled once by
 * `PLAYER_SHIP_SCALE_FACTOR` — never per frame, never twice.
 */
export const PLAYER_SHIP_BASE_COLLIDERS: readonly PlayerShipColliderDefinition[] = [
  { offset: [0, 0, -4.7], radius: 2.35, part: 'bow' },
  { offset: [0, 0, -1.6], radius: 2.85, part: 'forward' },
  { offset: [0, 0, 2.1], radius: 3.05, part: 'aft' },
  { offset: [0, 0, 5.0], radius: 2.35, part: 'stern' },
  { offset: [-3.55, -0.15, 0.65], radius: 1.45, part: 'leftWing' },
  { offset: [3.55, -0.15, 0.65], radius: 1.45, part: 'rightWing' }
] as const;

/** Scales a base collider value into current world units. */
export function scaleShipMetric(value: number): number {
  return value * PLAYER_SHIP_SCALE_FACTOR;
}

// ---------------------------------------------------------------------------
// Landing gear
// ---------------------------------------------------------------------------

/**
 * Why the ship needs gear at all.
 *
 * Parked, the hull used to rest 0.12 m off the ground. That is a belly landing:
 * there is no room under it for a ventral hatch, let alone a ladder, which is
 * exactly what the under-hull captures showed — the hatch frame ended up buried
 * 2.5 m inside the fuselage because the access was written for a hull that sat
 * high off the deck. Three legs lift the belly to a height where a crew hatch
 * is physically possible.
 */
export type LandingGearLegId = 'nose' | 'leftMain' | 'rightMain';

export type LandingGearLegConfig = {
  readonly id: LandingGearLegId;
  /**
   * Mount point as a fraction of the hull's own extents: x across the beam,
   * z along the length (negative is forward). Proportional so the gear
   * follows any future rescale instead of pinning world coordinates.
   */
  readonly lateralFraction: number;
  readonly longitudinalFraction: number;
  /** Mains carry the load and are visibly heavier than the nose leg. */
  readonly heavy: boolean;
};

/**
 * Three-point stance, placed against the hardpoints that are already there.
 *
 * The engines sit at ±0.18 beam / +0.48 length, the ventral pod on the
 * centreline near +0.06 length, and the access hatch to starboard at roughly
 * +3.65 m out / +1.05 m aft with the ladder deploying outboard from it. The
 * mains therefore sit wide and well aft of the hatch corridor, and the nose
 * leg goes forward of the pod on the centreline.
 */
export const PLAYER_SHIP_LANDING_GEAR: readonly LandingGearLegConfig[] = [
  { id: 'nose', lateralFraction: 0, longitudinalFraction: -0.3, heavy: false },
  { id: 'leftMain', lateralFraction: -0.28, longitudinalFraction: 0.24, heavy: true },
  { id: 'rightMain', lateralFraction: 0.28, longitudinalFraction: 0.24, heavy: true }
] as const;

export const LANDING_GEAR_TUNING = {
  /**
   * Belly height once settled. Chosen as the minimum that clears a 1.78 m
   * pilot standing under the hatch with a little headroom, rather than the
   * largest number that looks dramatic — the centre of mass stays low.
   */
  targetBellyClearance: 1.85,
  /** Acceptable settled band before the stance is called unsafe. */
  minBellyClearance: 1.7,
  maxBellyClearance: 2.1,
  /** Where each foot should rest relative to the ground beneath it. */
  footClearance: 0.03,
  /** Strut travel, measured from the retracted length. */
  minExtension: 0.35,
  maxExtension: 2.6,
  /** How far a strut compresses under load once the foot touches. */
  maxCompression: 0.18,
  /** Attitude the airframe will accept while parked, in radians. */
  maxParkedPitch: 0.11,
  maxParkedRoll: 0.11,
  /** Seconds per phase of the deployment. */
  bayDoorSeconds: 0.35,
  /** Suspension bleed-off before anything folds, at the start of a takeoff. */
  unloadSeconds: 0.3,
  /**
   * Retraction runs at this fraction of the deployment's phase durations.
   *
   * Deployment can take its time — the ship is settling onto ground it has to
   * feel out. Coming up there is nothing to search for, and the player is
   * waiting on it: 0.8 puts the whole post-access sequence at
   * 0.3 + 0.8*(0.8 + 0.8 + 0.35) = 1.86 s, inside the 1.2-2.2 s budget.
   */
  retractSpeedFactor: 0.8,
  swingSeconds: 0.8,
  extendSeconds: 0.8,
  contactSeconds: 0.5,
  stabiliseSeconds: 0.4
} as const;
