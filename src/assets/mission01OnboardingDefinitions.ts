/**
 * Onboarding of Mission 01: the first minutes of flight.
 *
 * M01 already worked, but it opened as "fly away, scan, wait for clearance,
 * descend". The pilot was handed a ship they had not been taught to fly and a
 * denial they could not act on. This module holds the data for the redesign:
 * four short manoeuvre steps, a recon beacon that turns the old wait into a
 * playable beat, and the text that explains a refused descent the moment it
 * happens.
 *
 * Nothing here replaces M01's own state machine. `MissionManager` keeps owning
 * the mission; these are the definitions its new steps read from, in the same
 * shape as `arkDepartureDefinitions.ts` — data only, no scene, no Three.js, so
 * the whole onboarding stays unit-testable through the debug surface.
 *
 * Register: voseo throughout, matching the prologue. See
 * `MISSION01_ONBOARDING_DIALOGUE` for how this squares with the commander lines
 * that already have generated audio.
 */

/** The four taught manoeuvres, in order, plus the scanner beat that follows. */
export type Mission01TutorialStepId =
  | 'flightOrientation'
  | 'propulsionTrial'
  | 'navigationTrial'
  | 'stabilizationTrial';

export type Mission01TutorialStepDefinition = {
  id: Mission01TutorialStepId;
  title: string;
  /** The single actionable instruction. Never more than one per step. */
  objective: string;
  nextAction: string;
  hint: string;
  /** Keys surfaced by the HUD for this step. Must match the real bindings. */
  keys: readonly string[];
};

/**
 * Tuning for the four manoeuvre trials.
 *
 * Every tolerance here is deliberately generous. This is the first time the
 * pilot touches the controls: the steps exist to teach a verb, not to test
 * precision. A step that has to be retried because the pilot was 3 degrees off
 * teaches frustration instead.
 */
export const mission01TutorialTuning = {
  /** Degrees of error still counted as "pointing at it". */
  orientationToleranceDegrees: 12,
  /** Seconds the pilot must hold that alignment. Short: this is a confirmation. */
  orientationHoldSeconds: 0.8,

  /** Metres to travel down the exit corridor under thrust. */
  propulsionDistance: 220,
  /** Minimum speed that counts as "under way", so drifting cannot complete it. */
  propulsionMinimumSpeed: 4,

  /**
   * Angle the navigation beacon is placed off the current heading. Wide enough
   * that the pilot must actually turn — a beacon placed ahead teaches nothing —
   * and narrow enough that it stays on screen during the turn.
   */
  navigationOffsetDegrees: 48,
  navigationToleranceDegrees: 14,
  navigationHoldSeconds: 0.8,

  /** Radius of the marked slow zone. */
  stabilizationRadius: 90,
  /** Speed under which the ship counts as stabilised. */
  stabilizationSpeed: 6,
  stabilizationHoldSeconds: 1.2,

  /** Seconds to blend between assist levels. Stepped changes read as a glitch. */
  assistBlendSeconds: 0.8
} as const;

export const mission01TutorialSteps: Record<Mission01TutorialStepId, Mission01TutorialStepDefinition> = {
  flightOrientation: {
    id: 'flightOrientation',
    title: 'Control de actitud',
    objective: 'Orientá la nave hacia la baliza de salida.',
    nextAction: 'Movés el mouse para apuntar. El marcador confirma cuando estás alineado.',
    hint: 'No hace falta precisión: alcanza con que la baliza quede en el centro.',
    keys: ['Mouse']
  },
  propulsionTrial: {
    id: 'propulsionTrial',
    title: 'Propulsión',
    objective: 'Avanzá por el corredor de salida.',
    nextAction: 'Mantené W para acelerar. Shift para impulso.',
    hint: 'La velocidad y la distancia a la baliza están en el HUD.',
    keys: ['W', 'Shift']
  },
  navigationTrial: {
    id: 'navigationTrial',
    title: 'Corrección de rumbo',
    objective: 'Alineate con la baliza de navegación.',
    nextAction: 'Girá hacia el nuevo marcador y sostené el rumbo.',
    hint: 'A y D desplazan lateralmente; el giro se hace apuntando.',
    keys: ['Mouse', 'A', 'D']
  },
  stabilizationTrial: {
    id: 'stabilizationTrial',
    title: 'Estabilización',
    objective: 'Reducí la velocidad dentro de la zona marcada.',
    nextAction: 'Soltá W y usá S para frenar hasta estabilizar.',
    hint: 'El escáner necesita la nave estable: sin eso no hay lectura.',
    keys: ['S']
  }
};

// --- Recon beacon ----------------------------------------------------------

/**
 * The orbital beat that replaces the empty wait.
 *
 * The Ark launched reconnaissance beacons ahead of the scout. One is still
 * transmitting from low orbit with an incomplete atmospheric read — which is
 * precisely why the descent is refused. Recovering it is the action the pilot
 * was previously asked to simply wait for.
 *
 * Deliberately small: approach, scan, hold steady while it transfers. No
 * enemies, no combat, no new subsystem. It reuses the range-hold progress
 * pattern already proven by `OrbitalMarkerSystem`.
 */
export const mission01BeaconTuning = {
  /** Metres within which the scanner can lock. */
  scanRadius: 180,
  /** Per-second scan progress while in range. ~3.3 s to lock. */
  scanRate: 30,
  /** Per-second decay when the pilot leaves range. Recoverable, not punishing. */
  scanDecay: 16,

  /** Per-second transfer progress while holding steady. ~4.5 s total. */
  transferRate: 22,
  /**
   * Transfer does not decay. Leaving range pauses it instead of unwinding it:
   * losing progress you already watched accumulate is the single most reliable
   * way to make a tutorial feel hostile.
   */
  transferDecay: 0,
  /** Speed over which the hull is too unsteady to hold a data link. */
  transferMaxSpeed: 24,
  /**
   * Progress is persisted at these intervals, so a reload resumes from a stable
   * checkpoint rather than a fractional percentage mid-stream.
   */
  transferCheckpoint: 25,

  /** Metres from the ship at which the beacon is placed when first revealed. */
  spawnDistance: 620
} as const;

// --- Camera ----------------------------------------------------------------

/**
 * Framing for M01's flight phases.
 *
 * The old opening put the camera 25-38 m behind the hull at FOV 64, dead centre,
 * on a basis that already carried the ship's bank — and then leaned a further
 * 30% of that bank on top. The ship read as small, and its attitude was
 * genuinely hard to parse because the horizon rolled with it.
 *
 * These numbers fix the framing; the roll decoupling is the part that fixes
 * readability, and it lives in `Mission01CameraProfile`.
 */
export const mission01CameraTuning = {
  /** Metres behind the hull at rest. Was 25. */
  baseDistance: 14,
  /** Metres above. Was 8.8. */
  baseHeight: 5.6,
  /** Lateral offset, so the hull sits off dead centre and the lane ahead opens up. */
  shoulderOffset: 2.2,

  /** Metres of pull-back per m/s of speed, and its ceiling. */
  speedDistanceGain: 0.42,
  speedDistanceMax: 12,
  /** Extra pull-back while boosting, for the wider field the pilot needs. */
  boostDistance: 6,
  /** Closer framing when a marker is near: the target owns the frame. */
  markerProximityDistance: -3.2,
  /** Metres under which a marker counts as "being approached". */
  markerProximityRange: 140,

  /** Hard limits. Never inside the hull, never far enough to lose it. */
  minDistance: 10,
  maxDistance: 34,

  fov: 58,
  boostFov: 66,

  /**
   * How much of the ship's bank the camera leans. The global value is 0.3;
   * during M01 the horizon stays nearly level so attitude stays readable.
   */
  rollLean: 0.12,

  /** Seconds of damped blend out of the docking pose. Was a hard snap. */
  handoverSeconds: 1.35,
  /** Follow response. Higher is tighter; this matches the global feel. */
  followResponse: 7.2
} as const;

// --- Flight assist ---------------------------------------------------------

export type Mission01AssistLevel = 'high' | 'medium' | 'low' | 'off';

/**
 * Every field scales a value that already exists in the orbital flight model
 * (`main.ts`, "Orbital flight model"); none of them replaces it. The ship the
 * pilot learns is the ship they keep flying — it just meets them halfway first.
 *
 * Measured baseline this is tuned against: thrust 35 m/s², drag 0.965 giving
 * 0.77/s axial and 2.59/s lateral damping, engine spool 2.6/s up but only 1.5/s
 * down, and no speed cap at all — cruise settles near 45 m/s, boost near 107.
 */
export type Mission01AssistProfile = {
  /**
   * Multiplier on the heading response that smooths mouse aim into hull
   * attitude. Higher means the nose follows more deliberately, which is what
   * makes early aiming legible instead of twitchy.
   */
  rotationDamping: number;
  /**
   * Per-second rate at which residual bank returns to neutral when the pilot is
   * not steering or strafing. It deliberately does NOT touch pitch: pitch is the
   * aim direction here, so levelling it would fight the pilot every time they
   * aimed at something above or below them.
   */
  levelAssist: number;
  /** Ceiling on bank angle. The global value is 0.55. */
  rollClamp: number;
  /**
   * Fraction of full acceleration. Because there is no speed cap in this model,
   * this also sets terminal velocity — at 0.55 the ship settles near 25 m/s
   * instead of 45, which is what makes the first manoeuvres readable. It lifts
   * as the assist decays, so the ship gets faster as the pilot gets better.
   */
  accelerationRamp: number;
  /** Multiplier on the S reverse-thrust, so slowing down reads as deliberate. */
  brakeGain: number;
  /**
   * Multiplier on how fast thrust bleeds off when W is released.
   *
   * This is the direct fix for "the ship keeps moving in ways I didn't ask
   * for": stock, engines spool up at 2.6/s but down at only 1.5/s, so releasing
   * W leaves the ship still accelerating for a moment. Under assist the bleed is
   * faster than the build, so letting go reads as letting go.
   */
  spoolDownGain: number;
  /**
   * Extra axial damping applied only while there is no thrust input. Stock axial
   * damping is 0.77/s — a 1.3 s time constant — which is correct for vacuum and
   * baffling for a first-time pilot. This shortens the coast during the tutorial
   * only, and returns to vacuum behaviour at `off`.
   */
  releaseDamping: number;
};

/**
 * Assist decays as manoeuvres are completed, never on a timer: the pilot earns
 * the full flight model by demonstrating each verb. It is scoped to M01 and is
 * forced back to `off` for any save restored past the tutorial.
 */
export const mission01AssistProfiles: Record<Mission01AssistLevel, Mission01AssistProfile> = {
  high: {
    rotationDamping: 1.75, levelAssist: 2.6, rollClamp: 0.18,
    accelerationRamp: 0.55, brakeGain: 1.6, spoolDownGain: 2.4, releaseDamping: 3.2
  },
  medium: {
    rotationDamping: 1.4, levelAssist: 1.5, rollClamp: 0.3,
    accelerationRamp: 0.75, brakeGain: 1.35, spoolDownGain: 1.8, releaseDamping: 2.1
  },
  low: {
    rotationDamping: 1.15, levelAssist: 0.7, rollClamp: 0.44,
    accelerationRamp: 0.9, brakeGain: 1.15, spoolDownGain: 1.35, releaseDamping: 1.4
  },
  // Identity. Every multiplier is 1 and every additive term 0, so `off` is
  // provably the stock flight model rather than an approximation of it.
  off: {
    rotationDamping: 1, levelAssist: 0, rollClamp: 0.55,
    accelerationRamp: 1, brakeGain: 1, spoolDownGain: 1, releaseDamping: 1
  }
};

/** Which assist level each tutorial step runs at. */
export const mission01AssistByStep: Record<Mission01TutorialStepId, Mission01AssistLevel> = {
  flightOrientation: 'high',
  propulsionTrial: 'medium',
  navigationTrial: 'medium',
  stabilizationTrial: 'low'
};

// --- Descent denial --------------------------------------------------------

/**
 * The refusal, rewritten.
 *
 * The old behaviour showed `DESCENSO DENEGADO // DATOS ORBITALES INSUFICIENTES`
 * every frame while the mission objective still read "set course for E-01", and
 * only surfaced the actual cause inside a 2.8 s throttle. The pilot was bounced
 * off an invisible boundary with nothing to act on.
 *
 * Now the banner names the cause, the objective becomes actionable in the same
 * frame, and the beacon is revealed at that moment rather than after the
 * habitability scan — removing the hidden prerequisite entirely.
 */
export const MISSION01_DENIAL = {
  bannerTitle: 'DESCENSO NO AUTORIZADO',
  bannerReason: 'Datos atmosféricos incompletos',
  objective: 'Recuperá los datos de la baliza de reconocimiento.',
  nextAction: 'Seguí el marcador hasta la baliza en órbita baja.',
  hint: 'Sin una lectura completa de la atmósfera, el Arca no calcula un corredor seguro.'
} as const;

/**
 * Compact analysis readout shown once the data lands. The point is not
 * scientific precision — it is that the pilot sees the data arrive, sees the Ark
 * work on it, and understands why the corridor now exists.
 */
export const MISSION01_ANALYSIS_SEQUENCE = [
  'DATOS RECIBIDOS',
  'CALCULANDO CORREDOR',
  'TRAYECTORIA CONFIRMADA',
  'DESCENSO AUTORIZADO'
] as const;

/** Seconds each analysis line holds before the next. Short: it is a beat, not a wait. */
export const MISSION01_ANALYSIS_LINE_SECONDS = 1.15;

// --- Dialogue --------------------------------------------------------------

/**
 * Commander lines for the onboarding.
 *
 * M01's nine existing commander lines all have generated MP3s under
 * `public/audio/voices/commander/`, so their text is frozen: rewriting it would
 * desync the audio, and regenerating is out of scope.
 *
 * Five of those nine are register-neutral and are kept exactly as they are.
 * `m01_start_commander` and `m01_e01_detected` are in `usted` but keep their
 * voice — the formality reads as Command protocol on the two lines with the most
 * dramatic weight. The two `usted` lines that sit inside the tutorial itself
 * (`m01_atlas_detected`, `m01_atmospheric_entry`) are replaced by the voseo ids
 * below, which have no voice file and therefore play as text — the same
 * documented degradation path the prologue already uses.
 *
 * No MP3 is deleted and none is generated.
 */
export const MISSION01_ONBOARDING_DIALOGUE = {
  /** Replaces `m01_atlas_detected`. */
  atlasDetected: 'm01_atlas_detected_vos',
  /** Replaces `m01_atmospheric_entry`. */
  atmosphericEntry: 'm01_atmospheric_entry_vos',
  tutorialStart: 'm01_tutorial_start',
  tutorialPropulsion: 'm01_tutorial_propulsion',
  tutorialComplete: 'm01_tutorial_complete',
  descentDeniedReason: 'm01_descent_denied_reason',
  beaconLocated: 'm01_beacon_located',
  transferComplete: 'm01_transfer_complete',
  corridorSent: 'm01_corridor_sent'
} as const;

/** Ids retired from the onboarding flow. Their MP3s stay on disk, unused. */
export const MISSION01_RETIRED_DIALOGUE = ['m01_atlas_detected', 'm01_atmospheric_entry'] as const;
