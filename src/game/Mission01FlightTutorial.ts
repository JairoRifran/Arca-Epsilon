import {
  mission01AssistByStep,
  mission01TutorialSteps,
  mission01TutorialTuning,
  type Mission01AssistLevel,
  type Mission01TutorialStepDefinition,
  type Mission01TutorialStepId
} from '../assets/mission01OnboardingDefinitions';

export type Mission01TutorialSnapshot = {
  mission01TutorialStarted: boolean;
  mission01TutorialStep: Mission01TutorialStepId | 'completed';
  /** Latched per step, so a reload never re-teaches a manoeuvre already shown. */
  mission01TutorialCompletedSteps: Mission01TutorialStepId[];
};

/** Live flight sample fed by main.ts each frame. No Three.js types here. */
export type Mission01FlightSample = {
  /** Degrees between the nose and the active beacon. */
  alignmentDegrees: number;
  /** Metres to the active beacon. */
  beaconDistance: number;
  /** Metres travelled since the current step began. */
  travelled: number;
  speed: number;
  /** True while the pilot holds forward thrust. */
  thrusting: boolean;
};

const STEP_ORDER: readonly Mission01TutorialStepId[] = [
  'flightOrientation',
  'propulsionTrial',
  'navigationTrial',
  'stabilizationTrial'
];

function stepIndex(step: Mission01TutorialStepId | 'completed'): number {
  if (step === 'completed') return STEP_ORDER.length;
  const index = STEP_ORDER.indexOf(step);
  return index < 0 ? -1 : index;
}

/**
 * The playable flight tutorial of Mission 01.
 *
 * Four short manoeuvres — point, accelerate, turn, slow down — each taught by
 * doing it once, on a generous tolerance, with a single instruction on screen.
 * The fifth beat, the scanner, reuses M01's real scanner control and so lives in
 * `MissionManager` rather than here.
 *
 * Design rules this encodes, all of them from the brief:
 *
 *  - **Monotonic.** A step can never be re-entered, so a mistake costs a retry
 *    of the current manoeuvre and never rewinds the ones already earned.
 *  - **No timers complete a step.** Every transition is caused by something the
 *    pilot did. `update` takes a flight sample, not a clock, and the only use of
 *    time is the short hold that confirms an alignment was deliberate.
 *  - **One objective at a time.** `currentDefinition` is the single source the
 *    HUD reads; nothing else writes objective text during the tutorial.
 *
 * Owns state only. `main.ts` feeds it a sample and applies the assist level it
 * reports — the same shape as `ArkDepartureSequence`, and for the same reason:
 * it makes the whole tutorial drivable from the debug surface without physics.
 */
export class Mission01FlightTutorial {
  readonly state: Mission01TutorialSnapshot = {
    mission01TutorialStarted: false,
    mission01TutorialStep: 'flightOrientation',
    mission01TutorialCompletedSteps: []
  };

  /** Volatile. Never persisted: a reload restarts the current hold, not the step. */
  private holdTimer = 0;

  private travelAtStepStart = 0;

  get started(): boolean {
    return this.state.mission01TutorialStarted;
  }

  get completed(): boolean {
    return this.state.mission01TutorialStep === 'completed';
  }

  get step(): Mission01TutorialStepId | 'completed' {
    return this.state.mission01TutorialStep;
  }

  get currentDefinition(): Mission01TutorialStepDefinition | undefined {
    const step = this.state.mission01TutorialStep;
    return step === 'completed' ? undefined : mission01TutorialSteps[step];
  }

  /** The assist level this step should run at. `off` once the tutorial is done. */
  get assistLevel(): Mission01AssistLevel {
    const step = this.state.mission01TutorialStep;
    return step === 'completed' ? 'off' : mission01AssistByStep[step];
  }

  get completedSteps(): readonly Mission01TutorialStepId[] {
    return this.state.mission01TutorialCompletedSteps;
  }

  /** 0..1 progress of the current confirmation hold. Drives the HUD ring. */
  get holdProgress(): number {
    const required = this.holdSecondsFor(this.state.mission01TutorialStep);
    if (required <= 0) return 0;
    return Math.min(1, this.holdTimer / required);
  }

  /**
   * Begins the tutorial. Called once the departure corridor is clear — the
   * prologue's own handover point — so the docked sequence is never touched.
   */
  start(travelled: number): boolean {
    if (this.state.mission01TutorialStarted) return false;
    this.state.mission01TutorialStarted = true;
    this.state.mission01TutorialStep = 'flightOrientation';
    this.travelAtStepStart = travelled;
    this.holdTimer = 0;
    return true;
  }

  /**
   * Advances the tutorial from a live flight sample.
   *
   * Returns the step that was just completed, or undefined. The caller uses that
   * to fire dialogue and reposition the beacon exactly once per transition,
   * rather than polling for equality every frame.
   */
  update(delta: number, sample: Mission01FlightSample): Mission01TutorialStepId | undefined {
    if (!this.state.mission01TutorialStarted || this.completed) return undefined;
    const step = this.state.mission01TutorialStep as Mission01TutorialStepId;
    const satisfied = this.isSatisfied(step, sample);

    const required = this.holdSecondsFor(step);
    if (!satisfied) {
      // Losing the condition rewinds only the confirmation hold, never the step.
      this.holdTimer = Math.max(0, this.holdTimer - Math.max(0, delta) * 1.6);
      return undefined;
    }

    this.holdTimer += Math.max(0, delta);
    if (this.holdTimer < required) return undefined;

    return this.completeStep(step, sample.travelled);
  }

  /**
   * Marks the current step done regardless of the flight sample.
   *
   * Used by the debug surface and by save restore. Deliberately still monotonic:
   * it advances one step, it cannot skip or rewind.
   */
  forceCompleteCurrentStep(travelled = this.travelAtStepStart): Mission01TutorialStepId | undefined {
    if (!this.state.mission01TutorialStarted || this.completed) return undefined;
    return this.completeStep(this.state.mission01TutorialStep as Mission01TutorialStepId, travelled);
  }

  /** Marks the whole tutorial done. Used by restore and by the debug surface. */
  forceComplete(): void {
    this.state.mission01TutorialStarted = true;
    for (const step of STEP_ORDER) {
      if (!this.state.mission01TutorialCompletedSteps.includes(step)) {
        this.state.mission01TutorialCompletedSteps.push(step);
      }
    }
    this.state.mission01TutorialStep = 'completed';
    this.holdTimer = 0;
  }

  snapshot(): Mission01TutorialSnapshot {
    return {
      mission01TutorialStarted: this.state.mission01TutorialStarted,
      mission01TutorialStep: this.state.mission01TutorialStep,
      mission01TutorialCompletedSteps: [...this.state.mission01TutorialCompletedSteps]
    };
  }

  /**
   * Restores from a save.
   *
   * The confirmation hold is rebuilt as zero rather than persisted, so a reload
   * lands on the stable start of the current manoeuvre instead of a fraction of
   * a second from completing it. An unknown step falls back to the first
   * uncompleted one, which is how a save written before this feature — or one
   * hand-edited — normalises to the nearest valid state instead of failing.
   */
  restore(snapshot: Partial<Mission01TutorialSnapshot> | undefined, travelled: number): void {
    this.holdTimer = 0;
    this.travelAtStepStart = travelled;
    if (!snapshot?.mission01TutorialStarted) {
      this.state.mission01TutorialStarted = false;
      this.state.mission01TutorialStep = 'flightOrientation';
      this.state.mission01TutorialCompletedSteps = [];
      return;
    }

    this.state.mission01TutorialStarted = true;
    this.state.mission01TutorialCompletedSteps = (snapshot.mission01TutorialCompletedSteps ?? []).filter(
      (step): step is Mission01TutorialStepId => STEP_ORDER.includes(step)
    );

    const saved = snapshot.mission01TutorialStep;
    if (saved === 'completed') {
      this.forceComplete();
      return;
    }
    if (saved && stepIndex(saved) >= 0) {
      this.state.mission01TutorialStep = saved;
      return;
    }
    const firstPending = STEP_ORDER.find((step) => !this.state.mission01TutorialCompletedSteps.includes(step));
    this.state.mission01TutorialStep = firstPending ?? 'completed';
  }

  reset(): void {
    this.state.mission01TutorialStarted = false;
    this.state.mission01TutorialStep = 'flightOrientation';
    this.state.mission01TutorialCompletedSteps = [];
    this.holdTimer = 0;
    this.travelAtStepStart = 0;
  }

  // --- Internals -----------------------------------------------------------

  private isSatisfied(step: Mission01TutorialStepId, sample: Mission01FlightSample): boolean {
    const tuning = mission01TutorialTuning;
    switch (step) {
      case 'flightOrientation':
        return sample.alignmentDegrees <= tuning.orientationToleranceDegrees;
      case 'propulsionTrial':
        // Distance under power. The speed floor stops a slow drift from
        // completing a step whose entire point is to teach the throttle.
        return (
          sample.travelled - this.travelAtStepStart >= tuning.propulsionDistance &&
          sample.speed >= tuning.propulsionMinimumSpeed
        );
      case 'navigationTrial':
        return sample.alignmentDegrees <= tuning.navigationToleranceDegrees;
      case 'stabilizationTrial':
        return (
          sample.beaconDistance <= tuning.stabilizationRadius &&
          sample.speed <= tuning.stabilizationSpeed &&
          !sample.thrusting
        );
      default:
        return false;
    }
  }

  private holdSecondsFor(step: Mission01TutorialStepId | 'completed'): number {
    const tuning = mission01TutorialTuning;
    switch (step) {
      case 'flightOrientation':
        return tuning.orientationHoldSeconds;
      case 'navigationTrial':
        return tuning.navigationHoldSeconds;
      case 'stabilizationTrial':
        return tuning.stabilizationHoldSeconds;
      // Propulsion is confirmed by distance covered, so it needs no hold.
      case 'propulsionTrial':
        return 0;
      default:
        return 0;
    }
  }

  private completeStep(step: Mission01TutorialStepId, travelled: number): Mission01TutorialStepId {
    if (!this.state.mission01TutorialCompletedSteps.includes(step)) {
      this.state.mission01TutorialCompletedSteps.push(step);
    }
    const next = STEP_ORDER[stepIndex(step) + 1];
    this.state.mission01TutorialStep = next ?? 'completed';
    this.holdTimer = 0;
    this.travelAtStepStart = travelled;
    return step;
  }
}
