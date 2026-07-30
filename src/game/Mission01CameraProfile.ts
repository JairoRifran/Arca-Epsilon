import { mission01CameraTuning } from '../assets/mission01OnboardingDefinitions';

export type Mission01CameraInput = {
  speed: number;
  boosting: boolean;
  /** Metres to the active beacon, or Infinity when there is none. */
  markerDistance: number;
  /** Seconds since the clamps released. Drives the handover blend. */
  timeSinceUndock: number;
};

export type Mission01CameraFraming = {
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  fov: number;
  /** How much of the hull's bank the camera leans. */
  rollLean: number;
  /**
   * 0..1 blend out of the docking pose. Below 1 the caller damps toward the
   * framing instead of snapping to it.
   */
  handover: number;
};

/**
 * Camera framing for Mission 01's flight phases.
 *
 * The opening framed the scout from 25-38 m at FOV 64, dead centre. Three things
 * were wrong with that, and only the first is about distance:
 *
 *  1. **Too far, too wide.** The hull occupied a small fraction of frame, so the
 *     ship read as a token rather than a vehicle.
 *  2. **Dead centre.** `offsetX` was 0, so the hull sat exactly on the axis it
 *     was travelling down and hid the very lane the pilot was flying into.
 *  3. **Bank counted twice.** The camera basis was the ship's own quaternion,
 *     which already carries `bankRoll`, and then a further 30% of that bank was
 *     leaned on top. The horizon rolled with the ship, which is precisely why
 *     attitude was hard to read.
 *
 * This module owns (1) and (2) and the lean factor for (3). The basis change
 * that actually fixes (3) — using a yaw/pitch basis without roll, the way the
 * surface camera already does — belongs to the caller, because only it holds the
 * quaternions.
 *
 * Pure arithmetic, no Three.js, no allocation: it fills a caller-owned framing
 * object so the per-frame cost is a handful of multiplies.
 */
export class Mission01CameraProfile {
  private readonly framing: Mission01CameraFraming = {
    offsetX: mission01CameraTuning.shoulderOffset,
    offsetY: mission01CameraTuning.baseHeight,
    offsetZ: mission01CameraTuning.baseDistance,
    fov: mission01CameraTuning.fov,
    rollLean: mission01CameraTuning.rollLean,
    handover: 1
  };

  /**
   * Computes the framing for this frame.
   *
   * The returned object is reused between calls — never retained by the caller,
   * only read — so a camera update costs no allocation.
   */
  update(input: Mission01CameraInput): Mission01CameraFraming {
    const tuning = mission01CameraTuning;

    // Distance opens with speed and with boost, so a fast pass gets the field of
    // view it needs, and closes again as the pilot slows.
    let distance = tuning.baseDistance + Math.min(input.speed * tuning.speedDistanceGain, tuning.speedDistanceMax);
    if (input.boosting) distance += tuning.boostDistance;

    // Approaching a marker pulls in: the thing being approached should own the
    // frame, not sit in the middle distance.
    if (input.markerDistance < tuning.markerProximityRange) {
      const proximity = 1 - input.markerDistance / tuning.markerProximityRange;
      distance += tuning.markerProximityDistance * clamp(proximity, 0, 1);
    }

    this.framing.offsetZ = clamp(distance, tuning.minDistance, tuning.maxDistance);
    // Height rises a little with distance so the nose keeps clearing the frame
    // edge instead of the camera flattening into the hull at speed.
    this.framing.offsetY = tuning.baseHeight + (this.framing.offsetZ - tuning.baseDistance) * 0.18;
    this.framing.offsetX = tuning.shoulderOffset;
    this.framing.fov = input.boosting ? tuning.boostFov : tuning.fov;
    this.framing.rollLean = tuning.rollLean;
    this.framing.handover = clamp(input.timeSinceUndock / tuning.handoverSeconds, 0, 1);
    return this.framing;
  }

  /** Last computed framing, for diagnostics. */
  get current(): Mission01CameraFraming {
    return this.framing;
  }

  /**
   * Straight-line distance from hull to camera for the framing produced above.
   *
   * Exposed because it is what the probe asserts on: "the camera does not start
   * excessively far" is a claim about this number, and deriving it here keeps
   * the test measuring the profile rather than re-deriving the geometry.
   */
  get distance(): number {
    const { offsetX, offsetY, offsetZ } = this.framing;
    return Math.sqrt(offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ);
  }

  /**
   * Rough fraction of frame height the hull spans, from its length, the camera
   * distance and the vertical FOV.
   *
   * An estimate, not a render measurement — but it is a monotone function of the
   * things that actually made the ship look small, so it is a real regression
   * guard rather than a restatement of the constants.
   */
  screenFraction(hullLength: number): number {
    const fovRadians = (this.framing.fov * Math.PI) / 180;
    const visibleHeight = 2 * Math.tan(fovRadians / 2) * Math.max(this.distance, 0.001);
    return clamp(hullLength / visibleHeight, 0, 1);
  }

  reset(): void {
    const tuning = mission01CameraTuning;
    this.framing.offsetX = tuning.shoulderOffset;
    this.framing.offsetY = tuning.baseHeight;
    this.framing.offsetZ = tuning.baseDistance;
    this.framing.fov = tuning.fov;
    this.framing.rollLean = tuning.rollLean;
    this.framing.handover = 1;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
