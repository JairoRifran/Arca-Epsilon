/**
 * Flight feel and chase-camera framing for the player ship.
 *
 * Only the values Stage 3A part C introduced or changed live here. The existing
 * `SURFACE_SHIP_TUNING` still owns speeds and accelerations — this is not a
 * second flight model, just the handful of knobs the navigation pass added.
 */
export const PLAYER_SHIP_FLIGHT_TUNING = {
  /**
   * Hover recovery rate, in "fraction closed per second" terms.
   *
   * The terrain push-up used a flat `* 0.35` per frame, so it closed the gap
   * more than three times faster at 60 FPS than at 20 — the one genuinely
   * frame-rate-dependent term in the surface flight path. Converted to
   * `1 - exp(-response * dt)`; 25 reproduces the old 60 FPS feel.
   */
  hoverRecoveryResponse: 25,

  /**
   * Braking.
   *
   * Holding reverse with no forward input now bleeds real velocity instead of
   * only pushing backwards, so the ship stops predictably rather than sliding
   * past the mark. 1.15 s^-1 of extra damping brings cruise (24 m/s) down to
   * walking pace in roughly 3 s, inside the 2.5-4 s target.
   */
  brakeExtraDamping: 1.15,
  /** Below this the ship counts as stopped, for the HUD and diagnostics. */
  brakeStopSpeed: 1.2,

  /**
   * Precision assist.
   *
   * Engages on its own when the pilot is already flying slowly and close to the
   * ground with no boost — manoeuvring around the base, a landing site or a
   * parked hull. It only damps drift and softens the throttle; it never moves
   * the ship and adds no key.
   */
  precisionSpeedThreshold: 9,
  precisionAltitudeThreshold: 26,
  precisionLateralDamping: 2.4,
  precisionAccelerationScale: 0.72,

  /**
   * Chase camera, surface flight.
   *
   * The hull filled the middle of the frame and hid the contacts ahead of it.
   * Distance is up ~21% (19 -> 23) with a matching lift, and the look target
   * now leads the nose so the space the ship is flying into is on screen.
   */
  cameraDistance: 23,
  cameraHeight: 7.1,
  cameraBoostDistance: 31,
  cameraBoostHeight: 8.4,
  /** Metres ahead of the nose the camera aims, scaled by speed. */
  cameraLookAhead: 7.5,
  /** Pulled in slightly when creeping, so close work stays readable. */
  cameraPrecisionDistance: 20,
  cameraPrecisionHeight: 6.6,
  /** How fast the framing eases between these poses. */
  cameraResponse: 3.2,
  /**
   * Bias toward a selected contact.
   *
   * Deliberately small: it opens a little space between hull and target without
   * turning the camera, so aiming stays entirely manual.
   */
  cameraTargetBias: 0.16,
  cameraTargetBiasMax: 6,

  /**
   * Orbital response. These values shape intent and presentation around the
   * existing `settings.thrust`; they do not introduce another flight model or
   * change the weapon/mission contracts.
   */
  space: {
    thrustSpoolUpResponse: 2.6,
    thrustSpoolDownResponse: 2.15,
    /** S must cancel residual positive burn before the brake can be felt. */
    brakeSpoolDownResponse: 12,
    /** Extra damping on positive prow speed while S is held. */
    brakeAxialDamping: 2.35,
    brakeStopSpeed: 0.45,
    thrustPitchRadians: 0.05,
    verticalPitchRadians: 0.1,
    lowSpeedFov: 61.5,
    cruiseFov: 64,
    boostFov: 70,
    cruiseReferenceSpeed: 34,
    cameraLookAhead: 14,
    cameraVelocityLead: 0.055,
    cameraLagMaximum: 2.8,
    cameraLagResponse: 3.4,
    cameraFovResponse: 3.9
  }
} as const;
