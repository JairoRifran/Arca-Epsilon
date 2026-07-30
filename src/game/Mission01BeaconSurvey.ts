import { mission01BeaconTuning } from '../assets/mission01OnboardingDefinitions';

export type Mission01BeaconPhase = 'hidden' | 'located' | 'scanning' | 'transferring' | 'complete';

export type Mission01BeaconSnapshot = {
  mission01BeaconPhase: Mission01BeaconPhase;
  mission01BeaconLocated: boolean;
  mission01BeaconScanned: boolean;
  /** Persisted at checkpoints only — see `restore`. */
  mission01TransferProgress: number;
};

/**
 * The recon beacon of Mission 01: the beat that replaces the empty wait.
 *
 * The original mission refused the descent and then asked the pilot to hold
 * position while a percentage counted up. Nothing they did mattered, and the
 * objective did not even acknowledge the refusal. This turns that dead time into
 * the thing that resolves it: one of the Ark's own reconnaissance beacons is
 * still transmitting from low orbit with an incomplete atmospheric read, and
 * recovering it is what earns the corridor.
 *
 * Progress is bought with presence and control, never with a clock:
 *
 *  - scanning needs the pilot inside `scanRadius`;
 *  - transferring additionally needs the hull steady, under `transferMaxSpeed`.
 *
 * The transfer does not decay. Leaving range pauses it. Watching progress you
 * earned unwind is the fastest way to make a tutorial feel hostile, and this is
 * a pilot's first ten minutes with the ship.
 *
 * Mirrors `OrbitalMarkerSystem`'s proven shape deliberately: same range-hold
 * idea, same tiny surface, no scene access, no timers of its own.
 */
export class Mission01BeaconSurvey {
  readonly state: Mission01BeaconSnapshot = {
    mission01BeaconPhase: 'hidden',
    mission01BeaconLocated: false,
    mission01BeaconScanned: false,
    mission01TransferProgress: 0
  };

  private scanProgress = 0;

  get phase(): Mission01BeaconPhase {
    return this.state.mission01BeaconPhase;
  }

  get located(): boolean {
    return this.state.mission01BeaconLocated;
  }

  get scanned(): boolean {
    return this.state.mission01BeaconScanned;
  }

  get complete(): boolean {
    return this.state.mission01BeaconPhase === 'complete';
  }

  /** 0..100. Drives the HUD ring while the scanner locks on. */
  get scanPercent(): number {
    return this.scanProgress;
  }

  /** 0..100. The number the pilot reads as "ANALIZANDO ATMÓSFERA — N %". */
  get transferPercent(): number {
    return this.state.mission01TransferProgress;
  }

  /**
   * Reveals the beacon.
   *
   * Called at the moment the descent is refused — not after the habitability
   * scan, which is what previously made it a hidden prerequisite. The pilot is
   * told what is missing and shown where to get it in the same frame.
   */
  locate(): boolean {
    if (this.state.mission01BeaconLocated) return false;
    this.state.mission01BeaconLocated = true;
    if (this.state.mission01BeaconPhase === 'hidden') this.state.mission01BeaconPhase = 'located';
    return true;
  }

  /** Player-initiated. Refused until the beacon has actually been revealed. */
  beginScan(): boolean {
    if (!this.state.mission01BeaconLocated) return false;
    if (this.state.mission01BeaconPhase !== 'located') return false;
    this.state.mission01BeaconPhase = 'scanning';
    return true;
  }

  /**
   * Ticks scan and transfer from live flight state.
   *
   * Returns the phase reached on the frame it changes, so the caller fires
   * dialogue, stingers and saves exactly once per transition instead of
   * comparing state every frame.
   */
  update(delta: number, inRange: boolean, speed: number): Mission01BeaconPhase | undefined {
    const step = Math.max(0, delta);
    const tuning = mission01BeaconTuning;

    if (this.state.mission01BeaconPhase === 'scanning') {
      this.scanProgress = inRange
        ? Math.min(100, this.scanProgress + step * tuning.scanRate)
        : Math.max(0, this.scanProgress - step * tuning.scanDecay);
      if (this.scanProgress >= 100) {
        this.scanProgress = 100;
        this.state.mission01BeaconScanned = true;
        this.state.mission01BeaconPhase = 'transferring';
        return 'transferring';
      }
      return undefined;
    }

    if (this.state.mission01BeaconPhase === 'transferring') {
      // Both conditions are things the pilot controls, and both are shown in the
      // HUD, so a stalled transfer always has a visible, fixable cause.
      const steady = inRange && speed <= tuning.transferMaxSpeed;
      if (steady) {
        this.state.mission01TransferProgress = Math.min(
          100,
          this.state.mission01TransferProgress + step * tuning.transferRate
        );
      } else if (tuning.transferDecay > 0) {
        this.state.mission01TransferProgress = Math.max(
          0,
          this.state.mission01TransferProgress - step * tuning.transferDecay
        );
      }
      if (this.state.mission01TransferProgress >= 100) {
        this.state.mission01TransferProgress = 100;
        this.state.mission01BeaconPhase = 'complete';
        return 'complete';
      }
    }

    return undefined;
  }

  /** True while the transfer is stalled for a reason worth telling the pilot. */
  transferStalledReason(inRange: boolean, speed: number): string {
    if (this.state.mission01BeaconPhase !== 'transferring') return '';
    if (!inRange) return 'Fuera de rango: acercate a la baliza.';
    if (speed > mission01BeaconTuning.transferMaxSpeed) return 'Nave inestable: reducí la velocidad.';
    return '';
  }

  /** Debug/restore shortcut. */
  forceComplete(): void {
    this.state.mission01BeaconLocated = true;
    this.state.mission01BeaconScanned = true;
    this.state.mission01BeaconPhase = 'complete';
    this.state.mission01TransferProgress = 100;
    this.scanProgress = 100;
  }

  /**
   * Snapshots at a stable checkpoint.
   *
   * Transfer progress is rounded **down** to the nearest checkpoint so a reload
   * resumes from a boundary the pilot can recognise rather than from 61.4%. The
   * scan is stored as a boolean rather than a percentage for the same reason:
   * there is no such thing as a half-scanned beacon after a reload.
   */
  snapshot(): Mission01BeaconSnapshot {
    const checkpoint = mission01BeaconTuning.transferCheckpoint;
    const progress = this.state.mission01BeaconPhase === 'complete'
      ? 100
      : Math.floor(this.state.mission01TransferProgress / checkpoint) * checkpoint;
    return {
      mission01BeaconPhase: this.state.mission01BeaconPhase,
      mission01BeaconLocated: this.state.mission01BeaconLocated,
      mission01BeaconScanned: this.state.mission01BeaconScanned,
      mission01TransferProgress: progress
    };
  }

  /**
   * Restores from a save.
   *
   * A save taken mid-scan resumes at the start of the scan, not partway through
   * it: three seconds of re-scanning is a smaller cost than an inconsistent
   * lock. A save taken mid-transfer resumes at its checkpoint. Neither leaves a
   * timer running, because there are none to leave.
   */
  restore(snapshot: Partial<Mission01BeaconSnapshot> | undefined): void {
    if (!snapshot) return;
    this.state.mission01BeaconLocated = snapshot.mission01BeaconLocated ?? false;
    this.state.mission01BeaconScanned = snapshot.mission01BeaconScanned ?? false;
    this.state.mission01TransferProgress = clamp(snapshot.mission01TransferProgress ?? 0, 0, 100);

    const phase = snapshot.mission01BeaconPhase;
    const valid: Mission01BeaconPhase[] = ['hidden', 'located', 'scanning', 'transferring', 'complete'];
    this.state.mission01BeaconPhase = phase && valid.includes(phase) ? phase : 'hidden';

    // Normalise contradictions rather than trusting the file: a scanned beacon
    // is never rewound to 'located', and a completed transfer is never reopened.
    if (this.state.mission01TransferProgress >= 100) {
      this.forceComplete();
      return;
    }
    if (this.state.mission01BeaconPhase === 'scanning') {
      this.scanProgress = 0;
    } else if (this.state.mission01BeaconScanned) {
      this.scanProgress = 100;
      if (this.state.mission01BeaconPhase === 'located' || this.state.mission01BeaconPhase === 'hidden') {
        this.state.mission01BeaconPhase = 'transferring';
      }
    } else {
      this.scanProgress = 0;
    }
    if (this.state.mission01BeaconLocated && this.state.mission01BeaconPhase === 'hidden') {
      this.state.mission01BeaconPhase = 'located';
    }
  }

  reset(): void {
    this.state.mission01BeaconPhase = 'hidden';
    this.state.mission01BeaconLocated = false;
    this.state.mission01BeaconScanned = false;
    this.state.mission01TransferProgress = 0;
    this.scanProgress = 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
