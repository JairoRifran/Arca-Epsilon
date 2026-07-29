import {
  mission15Steps,
  mission15Tuning,
  parasiteNodeDefinitions,
  type Mission15StepDefinition,
  type Mission15StepId,
  type ParasiteSystem
} from '../assets/mission15Definitions';
import type { Mission14Snapshot } from './Mission14CoalitionTrace';

/** Lifecycle of one clamped device. */
export type ParasiteState = 'hidden' | 'active' | 'isolated' | 'disabled';

export type CommsSequenceFeedback = 'idle' | 'matched' | 'error' | 'completed';

export type Mission15Snapshot = {
  mission15Started: boolean;
  mission15Step: Mission15StepId;
  auroraRoutineComplete: boolean;
  auroraModuleSealed: boolean;
  auroraModuleReleased: boolean;
  auroraCoordinatedFailureConfirmed: boolean;
  /** Per node, ordered energy / life support / comms. */
  auroraParasiteStates: ParasiteState[];
  /** Stable four-symbol comms puzzle, persisted so visuals and logic agree. */
  auroraCommsSequence: number[];
  auroraCommsSequenceStep: number;
  auroraCommsSequenceCompleted: boolean;
  auroraCentralOverloadResolved: boolean;
  auroraParasiteAnalyzed: boolean;
  mission15Completed: boolean;
  mission16Unlocked: boolean;
};

/** Live sabotage readouts. Derived every frame, never persisted. */
export type AuroraSabotageReadout = {
  /** Breathable pressure inside the sealed module, 0..100. */
  modulePressure: number;
  /** Colony systems currently down, 0..4. */
  compromisedSystems: number;
  /** Parasites found so far, 0..3. */
  parasitesFound: number;
  /** Parasites fully disabled, 0..3. */
  parasitesDisabled: number;
  /** Central module overload, 0..100. */
  centralOverload: number;
  /** Search readout for the active parasite, 0..100. Zero outside its range. */
  signalIntensity: number;
  /** Progress of whatever interaction the current step is running, 0..100. */
  phaseProgress: number;
};

const NODE_COUNT = parasiteNodeDefinitions.length;
const SYSTEM_ORDER: readonly ParasiteSystem[] = ['energy', 'lifeSupport', 'comms'];
const DEFAULT_COMMS_SEQUENCE = [2, 0, 3, 1] as const;

function isValidCommsSequence(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === mission15Tuning.sequenceLength &&
    value.every((symbol) => Number.isInteger(symbol) && symbol >= 0 && symbol < mission15Tuning.sequenceLength) &&
    new Set(value).size === mission15Tuning.sequenceLength
  );
}

function freshCommsSequence(): number[] {
  return [...DEFAULT_COMMS_SEQUENCE];
}

/**
 * Mission 15 "Sabotaje en Aurora": the Coalition stops watching and starts
 * breaking things.
 *
 * The packet that escaped in M14 told them how human infrastructure is wired,
 * and the devices they woke were already here — clamped onto salvage that came
 * up from Base Nereida months ago and sat inert until someone sent the word.
 * A habitation module seals with three people inside, four systems fail inside
 * the same minute, and the pilot has to find and kill three parasites before
 * the last one takes the core with it.
 *
 * Each parasite is disabled a different way — isolating lines and riding a
 * surge, closing valves against a drift, answering a corrupt burst — so no two
 * phases are the same puzzle. As in M14 there is no irreversible failure: the
 * module's pressure has a floor, a dropped valve or a missed symbol costs that
 * attempt rather than the mission, and the overload can always be vented.
 */
export class Mission15AuroraSabotage {
  readonly missionId = 'mission-15-aurora-sabotage';
  readonly missionName = 'Misión 15: Sabotaje en Aurora';

  readonly state: Mission15Snapshot = {
    mission15Started: false,
    mission15Step: 'inactive',
    auroraRoutineComplete: false,
    auroraModuleSealed: false,
    auroraModuleReleased: false,
    auroraCoordinatedFailureConfirmed: false,
    auroraParasiteStates: ['hidden', 'hidden', 'hidden'],
    auroraCommsSequence: freshCommsSequence(),
    auroraCommsSequenceStep: 0,
    auroraCommsSequenceCompleted: false,
    auroraCentralOverloadResolved: false,
    auroraParasiteAnalyzed: false,
    mission15Completed: false,
    mission16Unlocked: false
  };

  // --- Volatile interaction state. None of this is persisted: a reload drops
  // back to the start of the current phase rather than into a half-finished
  // interaction that might not be resumable.
  private routineProgress = 0;
  private doorProgress = 0;
  private diagnosticProgress = 0;
  private analysisProgress = 0;
  /** Sealed-module pressure. Restored from the step, not from a saved number. */
  private pressure = 100;
  /** Energy phase: lines pulled so far, and the surge being ridden. */
  private linesOpened = 0;
  private surgeLoad = 100;
  private surgeHeld = 0;
  /** Life-support phase: which valves are currently shut, and for how long. */
  private valvesClosed: boolean[] = [];
  private valveTimers: number[] = [];
  /** Comms input telemetry. Progress itself lives in the persisted snapshot. */
  private sequenceFeedback: CommsSequenceFeedback = 'idle';
  private lastInteractedSymbol = -1;
  private sequenceInputConsumed = false;
  private sequenceLockUntil = 0;
  /** Central overload, 0..100. */
  private overload = 0;
  /** Distance to the parasite currently being hunted. */
  private searchDistance = Number.POSITIVE_INFINITY;

  constructor() {
    this.resetVolatile();
  }

  get started(): boolean {
    return this.state.mission15Started;
  }

  get completed(): boolean {
    return this.state.mission15Completed;
  }

  get step(): Mission15StepId {
    return this.state.mission15Step;
  }

  get stepDefinition(): Mission15StepDefinition {
    return mission15Steps[this.step];
  }

  /** Index of the parasite the current step is about, or -1. */
  get activeParasiteIndex(): number {
    switch (this.step) {
      case 'findEnergyParasite':
      case 'disableEnergyParasite':
        return 0;
      case 'findLifeSupportParasite':
      case 'disableLifeSupportParasite':
        return 1;
      case 'findCommsParasite':
      case 'disableCommsParasite':
        return 2;
      default:
        return -1;
    }
  }

  parasiteState(index: number): ParasiteState {
    return this.state.auroraParasiteStates[index] ?? 'hidden';
  }

  get parasitesFound(): number {
    return this.state.auroraParasiteStates.filter((s) => s !== 'hidden').length;
  }

  get parasitesDisabled(): number {
    return this.state.auroraParasiteStates.filter((s) => s === 'disabled').length;
  }

  get milestoneCount(): number {
    return (
      [
        this.state.auroraRoutineComplete,
        this.state.auroraModuleReleased,
        this.state.auroraCoordinatedFailureConfirmed,
        this.state.auroraCentralOverloadResolved,
        this.state.auroraParasiteAnalyzed
      ].filter(Boolean).length +
      this.parasitesFound +
      this.parasitesDisabled
    );
  }

  /** Colony systems currently down: power, life support, comms, sensors. */
  get compromisedSystems(): number {
    if (!this.started || this.completed) return 0;
    if (!this.state.auroraCoordinatedFailureConfirmed) {
      return this.state.auroraModuleSealed && !this.state.auroraModuleReleased ? 2 : 0;
    }
    // One system comes back with each parasite killed; sensors clear last.
    return Math.max(0, 4 - this.parasitesDisabled - (this.state.auroraCentralOverloadResolved ? 1 : 0));
  }

  get modulePressurePercent(): number {
    return Number(this.pressure.toFixed(1));
  }

  get centralOverloadPercent(): number {
    return Number(this.overload.toFixed(1));
  }

  get linesOpenedCount(): number {
    return this.linesOpened;
  }

  get surgeLoadPercent(): number {
    return Number(this.surgeLoad.toFixed(1));
  }

  get valvesClosedCount(): number {
    return this.valvesClosed.filter(Boolean).length;
  }

  get sequenceMatchedCount(): number {
    return this.state.auroraCommsSequenceStep;
  }

  get sequenceSymbols(): readonly number[] {
    return this.state.auroraCommsSequence;
  }

  get sequenceExpectedSymbol(): number {
    return this.state.auroraCommsSequence[this.state.auroraCommsSequenceStep] ?? -1;
  }

  get sequenceHighlightedSymbol(): number {
    return this.step === 'disableCommsParasite' ? this.sequenceExpectedSymbol : -1;
  }

  get sequenceVisualStep(): number {
    return Math.min(mission15Tuning.sequenceLength, this.state.auroraCommsSequenceStep + 1);
  }

  get sequenceLastInteractedSymbol(): number {
    return this.lastInteractedSymbol;
  }

  get sequenceInputWasConsumed(): boolean {
    return this.sequenceInputConsumed;
  }

  get sequenceErrorActive(): boolean {
    return this.sequenceFeedback === 'error';
  }

  get sequenceFeedbackState(): CommsSequenceFeedback {
    return this.sequenceFeedback;
  }

  sequenceInputLockRemaining(elapsed: number): number {
    return Math.max(0, this.sequenceLockUntil - elapsed);
  }

  /** Fed each frame while a search phase is live. Never persisted. */
  setSearchDistance(distance: number): void {
    this.searchDistance = distance;
  }

  /** True only once the pilot is close enough for a marker to be honest. */
  isParasiteRevealed(): boolean {
    return this.searchDistance <= mission15Tuning.revealRange;
  }

  /**
   * The surge the energy parasite is driving. Two offset sine terms keep it
   * drifting deterministically, so the phase is reproducible in a test.
   */
  surgeTarget(elapsed: number): number {
    return 100 + Math.sin(elapsed * 0.31) * 22 + Math.sin(elapsed * 0.83) * 8;
  }

  isSurgeStable(elapsed: number): boolean {
    return Math.abs(this.surgeLoad - this.surgeTarget(elapsed)) <= mission15Tuning.surgeTolerance;
  }

  /** The highlighted symbol and the expected symbol always share one source. */
  sequenceSymbol(_elapsed = 0): number {
    return this.sequenceHighlightedSymbol;
  }

  /** Compatibility accessor for HUD callers. */
  get sequenceKeySymbol(): number {
    return this.sequenceExpectedSymbol;
  }

  get readout(): AuroraSabotageReadout {
    const searching =
      this.step === 'findEnergyParasite' ||
      this.step === 'findLifeSupportParasite' ||
      this.step === 'findCommsParasite';
    return {
      modulePressure: Number(this.pressure.toFixed(1)),
      compromisedSystems: this.compromisedSystems,
      parasitesFound: this.parasitesFound,
      parasitesDisabled: this.parasitesDisabled,
      centralOverload: Number(this.overload.toFixed(1)),
      signalIntensity: searching
        ? Math.round(
            Math.max(0, 1 - Math.min(1, this.searchDistance / mission15Tuning.searchRange)) * 100
          )
        : 0,
      phaseProgress: Number(this.phaseProgress.toFixed(1))
    };
  }

  /** Progress of the current interaction, 0..100. */
  get phaseProgress(): number {
    const t = mission15Tuning;
    switch (this.step) {
      case 'routineTask':
        return Math.min(100, (this.routineProgress / t.routineSeconds) * 100);
      case 'restoreDoorPower':
        return Math.min(100, (this.doorProgress / t.doorPowerSeconds) * 100);
      case 'detectCoordinatedFailure':
        return Math.min(100, (this.diagnosticProgress / t.diagnosticSeconds) * 100);
      case 'disableEnergyParasite':
        return this.linesOpened < t.energyLineCount
          ? (this.linesOpened / t.energyLineCount) * 60
          : 60 + Math.min(40, (this.surgeHeld / t.surgeStabilizeSeconds) * 40);
      case 'disableLifeSupportParasite':
        return (this.valvesClosedCount / t.valveCount) * 100;
      case 'disableCommsParasite':
        return (this.state.auroraCommsSequenceStep / t.sequenceLength) * 100;
      case 'centralOverload':
        return Math.max(0, 100 - this.overload);
      case 'analyzeParasite':
        return Math.min(100, (this.analysisProgress / t.analysisSeconds) * 100);
      case 'completed':
        return 100;
      default:
        return 0;
    }
  }

  canStart(mission14: Partial<Mission14Snapshot>): boolean {
    return Boolean(
      !this.started && !this.completed && mission14.mission14Completed && mission14.mission15Unlocked
    );
  }

  start(mission14: Partial<Mission14Snapshot>): boolean {
    if (!this.canStart(mission14)) return false;
    this.state.mission15Started = true;
    this.state.mission15Step = 'routineTask';
    this.resetVolatile();
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 1: the ordinary morning
  // -------------------------------------------------------------------------

  /** Supply check; returns true on the frame it completes. */
  advanceRoutine(deltaSeconds: number): boolean {
    if (this.step !== 'routineTask') return false;
    this.routineProgress += deltaSeconds;
    if (this.routineProgress < mission15Tuning.routineSeconds) return false;
    this.routineProgress = mission15Tuning.routineSeconds;
    this.state.auroraRoutineComplete = true;
    // The calm ends here: the module seals the moment the routine is signed off.
    this.state.auroraModuleSealed = true;
    this.pressure = 100;
    this.state.mission15Step = 'habitatEmergency';
    return true;
  }

  resetRoutineProgress(): void {
    this.routineProgress = 0;
  }

  // -------------------------------------------------------------------------
  // Phase 2: the sealed module
  // -------------------------------------------------------------------------

  /**
   * Pressure bleeds while the module stays shut and climbs back once it opens.
   * It never falls past the floor: the phase is meant to push, not to kill.
   */
  advancePressure(deltaSeconds: number): void {
    if (!this.started || this.completed) return;
    const t = mission15Tuning;
    if (this.state.auroraModuleSealed && !this.state.auroraModuleReleased) {
      this.pressure = Math.max(t.pressureFloor, this.pressure - deltaSeconds * t.pressureLossPerSecond);
    } else if (this.pressure < 100) {
      this.pressure = Math.min(100, this.pressure + deltaSeconds * t.pressureRecoveryPerSecond);
    }
  }

  /** Reaching the door panel is what opens the release phase. */
  reachSealedDoor(): boolean {
    if (this.step !== 'habitatEmergency') return false;
    this.state.mission15Step = 'restoreDoorPower';
    this.doorProgress = 0;
    return true;
  }

  /** Door work; returns true on the frame the module opens. */
  advanceDoorPower(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'restoreDoorPower') return false;
    if (!inRange) {
      // Walking off loses the banked seconds but never the phase.
      this.doorProgress = Math.max(0, this.doorProgress - deltaSeconds * 1.5);
      return false;
    }
    this.doorProgress += deltaSeconds;
    if (this.doorProgress < mission15Tuning.doorPowerSeconds) return false;
    this.state.auroraModuleReleased = true;
    this.state.auroraModuleSealed = false;
    this.state.mission15Step = 'detectCoordinatedFailure';
    this.diagnosticProgress = 0;
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 3: proving the failures are deliberate
  // -------------------------------------------------------------------------

  advanceDiagnostic(deltaSeconds: number): boolean {
    if (this.step !== 'detectCoordinatedFailure') return false;
    this.diagnosticProgress += deltaSeconds;
    if (this.diagnosticProgress < mission15Tuning.diagnosticSeconds) return false;
    this.diagnosticProgress = mission15Tuning.diagnosticSeconds;
    this.state.auroraCoordinatedFailureConfirmed = true;
    this.state.mission15Step = 'findEnergyParasite';
    return true;
  }

  resetDiagnosticProgress(): void {
    this.diagnosticProgress = 0;
  }

  // -------------------------------------------------------------------------
  // Phase 4/5: finding each device
  // -------------------------------------------------------------------------

  /** Confirm a find. Only works inside lock range and only in its own step. */
  lockParasite(distance: number): boolean {
    const index = this.activeParasiteIndex;
    if (index < 0 || distance > mission15Tuning.lockRange) return false;
    if (this.parasiteState(index) !== 'hidden') return false;
    if (
      this.step !== 'findEnergyParasite' &&
      this.step !== 'findLifeSupportParasite' &&
      this.step !== 'findCommsParasite'
    ) {
      return false;
    }
    this.state.auroraParasiteStates[index] = 'active';
    this.state.mission15Step =
      index === 0 ? 'disableEnergyParasite' : index === 1 ? 'disableLifeSupportParasite' : 'disableCommsParasite';
    this.prepareDisablePhase(index);
    return true;
  }

  private prepareDisablePhase(index: number, resetStableProgress = true): void {
    const t = mission15Tuning;
    if (index === 0) {
      this.linesOpened = 0;
      this.surgeLoad = 100;
      this.surgeHeld = 0;
    } else if (index === 1) {
      this.valvesClosed = new Array<boolean>(t.valveCount).fill(false);
      this.valveTimers = new Array<number>(t.valveCount).fill(0);
    } else {
      if (resetStableProgress) {
        this.state.auroraCommsSequence = freshCommsSequence();
        this.state.auroraCommsSequenceStep = 0;
        this.state.auroraCommsSequenceCompleted = false;
      }
      this.resetSequenceInputState();
    }
  }

  // -------------------------------------------------------------------------
  // Phase 6a: energy — pull the lines, then ride the surge
  // -------------------------------------------------------------------------

  /**
   * One press either opens the next line or nudges the draw. Returns what the
   * press did so the caller can report it.
   */
  workEnergyParasite(): 'line' | 'load' | 'ignored' {
    if (this.step !== 'disableEnergyParasite') return 'ignored';
    if (this.linesOpened < mission15Tuning.energyLineCount) {
      this.linesOpened += 1;
      return 'line';
    }
    this.surgeLoad += mission15Tuning.surgeStep;
    if (this.surgeLoad > 160) this.surgeLoad = 60;
    return 'load';
  }

  /**
   * Surge work. Only accumulates with every line open and the draw inside the
   * band; drifting off bleeds it back rather than resetting the phase.
   * Returns true on the frame the device comes off the line.
   */
  advanceEnergyParasite(deltaSeconds: number, inRange: boolean, elapsed: number): boolean {
    if (this.step !== 'disableEnergyParasite') return false;
    const t = mission15Tuning;
    if (this.linesOpened < t.energyLineCount) return false;
    if (inRange && this.isSurgeStable(elapsed)) {
      this.surgeHeld += deltaSeconds;
    } else {
      this.surgeHeld = Math.max(0, this.surgeHeld - deltaSeconds * 0.8);
      return false;
    }
    if (this.surgeHeld < t.surgeStabilizeSeconds) return false;
    this.disableParasite(0);
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 6b: life support — shut the valves before they drift open
  // -------------------------------------------------------------------------

  /** Shut whichever valve is currently open and nearest in the rotation. */
  closeNextValve(): boolean {
    if (this.step !== 'disableLifeSupportParasite') return false;
    const index = this.valvesClosed.findIndex((closed) => !closed);
    if (index < 0) return false;
    this.valvesClosed[index] = true;
    this.valveTimers[index] = 0;
    return true;
  }

  /**
   * Valves drift back open on their own, so the pilot has to work faster than
   * the drift. Returns true on the frame all four are shut at once.
   */
  advanceLifeSupportParasite(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'disableLifeSupportParasite') return false;
    const t = mission15Tuning;
    for (let i = 0; i < this.valvesClosed.length; i += 1) {
      if (!this.valvesClosed[i]) continue;
      this.valveTimers[i] += deltaSeconds;
      // Out of range the drift runs at double speed: standing there matters.
      const limit = inRange ? t.valveHoldSeconds : t.valveHoldSeconds * 0.5;
      if (this.valveTimers[i] >= limit) {
        this.valvesClosed[i] = false;
        this.valveTimers[i] = 0;
      }
    }
    if (!this.valvesClosed.every(Boolean)) return false;
    this.disableParasite(1);
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 6c: comms — answer the corrupt burst
  // -------------------------------------------------------------------------

  /**
   * Answer the single symbol highlighted for the current logical step.
   */
  answerSequence(
    interactedSymbolId: number,
    elapsed: number,
    inRange: boolean
  ): 'matched' | 'missed' | 'ignored' {
    if (this.step !== 'disableCommsParasite' || !inRange) return 'ignored';
    if (elapsed < this.sequenceLockUntil) return 'ignored';
    this.sequenceInputConsumed = true;
    this.lastInteractedSymbol = interactedSymbolId;
    this.sequenceLockUntil = elapsed + mission15Tuning.sequenceInputLockSeconds;

    if (interactedSymbolId !== this.sequenceExpectedSymbol) {
      this.state.auroraCommsSequenceStep = 0;
      // Rotate the complete sequence so error recovery cannot leave stale
      // visual symbols while still remaining deterministic and saveable.
      const [first, ...rest] = this.state.auroraCommsSequence;
      this.state.auroraCommsSequence = [...rest, first];
      this.sequenceFeedback = 'error';
      return 'missed';
    }

    this.state.auroraCommsSequenceStep += 1;
    this.sequenceFeedback = 'matched';
    if (this.state.auroraCommsSequenceStep >= mission15Tuning.sequenceLength) {
      this.state.auroraCommsSequenceCompleted = true;
      this.sequenceFeedback = 'completed';
      this.disableParasite(2);
    }
    return 'matched';
  }

  private resetSequenceInputState(): void {
    this.sequenceFeedback = 'idle';
    this.lastInteractedSymbol = -1;
    this.sequenceInputConsumed = false;
    this.sequenceLockUntil = 0;
  }

  // -------------------------------------------------------------------------

  private disableParasite(index: number): void {
    this.state.auroraParasiteStates[index] = 'disabled';
    if (index === 2) {
      this.state.auroraCommsSequenceStep = mission15Tuning.sequenceLength;
      this.state.auroraCommsSequenceCompleted = true;
    }
    if (index < 2) {
      // The next hunt begins immediately.
      this.state.mission15Step = index === 0 ? 'findLifeSupportParasite' : 'findCommsParasite';
      this.searchDistance = Number.POSITIVE_INFINITY;
      return;
    }
    // The last device takes the core with it on the way out.
    this.state.mission15Step = 'centralOverload';
    this.overload = 34;
  }

  // -------------------------------------------------------------------------
  // Phase 7: the core
  // -------------------------------------------------------------------------

  /**
   * The overload climbs on its own and is vented by working the core. Returns
   * true on the frame it is brought down to nothing.
   */
  advanceCentralOverload(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'centralOverload') return false;
    const t = mission15Tuning;
    if (inRange) {
      this.overload = Math.max(0, this.overload - deltaSeconds * t.overloadVentPerSecond);
    } else {
      this.overload = Math.min(100, this.overload + (deltaSeconds / t.overloadSeconds) * 100);
    }
    if (this.overload > 0) return false;
    this.state.auroraCentralOverloadResolved = true;
    this.state.mission15Step = 'analyzeParasite';
    this.analysisProgress = 0;
    return true;
  }

  /** True while the core is close enough to critical for the HUD to shout. */
  get overloadCritical(): boolean {
    return this.step === 'centralOverload' && this.overload >= mission15Tuning.overloadWarningLevel;
  }

  // -------------------------------------------------------------------------
  // Phase 8: where the device came from
  // -------------------------------------------------------------------------

  advanceAnalysis(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'analyzeParasite') return false;
    if (!inRange) {
      this.analysisProgress = Math.max(0, this.analysisProgress - deltaSeconds);
      return false;
    }
    this.analysisProgress += deltaSeconds;
    if (this.analysisProgress < mission15Tuning.analysisSeconds) return false;
    this.completeSabotage();
    return true;
  }

  private completeSabotage(): void {
    this.state.auroraRoutineComplete = true;
    this.state.auroraModuleSealed = false;
    this.state.auroraModuleReleased = true;
    this.state.auroraCoordinatedFailureConfirmed = true;
    this.state.auroraParasiteStates = ['disabled', 'disabled', 'disabled'];
    this.state.auroraCommsSequenceStep = mission15Tuning.sequenceLength;
    this.state.auroraCommsSequenceCompleted = true;
    this.state.auroraCentralOverloadResolved = true;
    this.state.auroraParasiteAnalyzed = true;
    this.state.mission15Completed = true;
    this.state.mission16Unlocked = true;
    this.state.mission15Step = 'completed';
    this.pressure = 100;
    this.overload = 0;
  }

  // -------------------------------------------------------------------------
  // Debug fast-forwards. Each pulls every earlier phase forward with it, so the
  // machine can never be left inconsistent.
  // -------------------------------------------------------------------------

  forceRoutineComplete(): void {
    if (!this.started) return;
    this.state.auroraRoutineComplete = true;
    this.routineProgress = mission15Tuning.routineSeconds;
    if (this.step === 'routineTask') {
      this.state.auroraModuleSealed = true;
      this.state.mission15Step = 'habitatEmergency';
    }
  }

  forceModuleReleased(): void {
    if (!this.started) return;
    this.forceRoutineComplete();
    this.state.auroraModuleReleased = true;
    this.state.auroraModuleSealed = false;
    this.pressure = 100;
    if (this.step === 'habitatEmergency' || this.step === 'restoreDoorPower') {
      this.state.mission15Step = 'detectCoordinatedFailure';
      this.diagnosticProgress = 0;
    }
  }

  forceFailureConfirmed(): void {
    if (!this.started) return;
    this.forceModuleReleased();
    this.state.auroraCoordinatedFailureConfirmed = true;
    this.diagnosticProgress = mission15Tuning.diagnosticSeconds;
    if (this.step === 'detectCoordinatedFailure') this.state.mission15Step = 'findEnergyParasite';
  }

  /** Force the given parasite to be found, pulling earlier phases with it. */
  forceParasiteLocated(index: number): void {
    if (!this.started || index < 0 || index >= NODE_COUNT) return;
    this.forceFailureConfirmed();
    for (let i = 0; i < index; i += 1) this.forceParasiteDisabled(i);
    if (this.parasiteState(index) === 'hidden') this.state.auroraParasiteStates[index] = 'active';
    this.state.mission15Step =
      index === 0 ? 'disableEnergyParasite' : index === 1 ? 'disableLifeSupportParasite' : 'disableCommsParasite';
    this.prepareDisablePhase(index);
  }

  /** Force the given parasite off the line, pulling earlier phases with it. */
  forceParasiteDisabled(index: number): void {
    if (!this.started || index < 0 || index >= NODE_COUNT) return;
    this.forceFailureConfirmed();
    for (let i = 0; i <= index; i += 1) {
      if (this.state.auroraParasiteStates[i] !== 'disabled') {
        this.state.auroraParasiteStates[i] = 'disabled';
      }
    }
    if (index < NODE_COUNT - 1) {
      this.state.mission15Step = index === 0 ? 'findLifeSupportParasite' : 'findCommsParasite';
      this.searchDistance = Number.POSITIVE_INFINITY;
    } else {
      this.state.auroraCommsSequenceStep = mission15Tuning.sequenceLength;
      this.state.auroraCommsSequenceCompleted = true;
      this.state.mission15Step = 'centralOverload';
      this.overload = 34;
    }
  }

  forceOverloadResolved(): void {
    if (!this.started) return;
    this.forceParasiteDisabled(NODE_COUNT - 1);
    this.state.auroraCentralOverloadResolved = true;
    this.overload = 0;
    if (this.step === 'centralOverload') {
      this.state.mission15Step = 'analyzeParasite';
      this.analysisProgress = 0;
    }
  }

  forceComplete(): void {
    if (!this.started) return;
    this.completeSabotage();
  }

  // -------------------------------------------------------------------------

  restore(savedState: Partial<Mission15Snapshot> | undefined): void {
    this.reset();
    if (!savedState?.mission15Started) return;
    Object.assign(this.state, savedState);
    if (!mission15Steps[this.state.mission15Step]) this.state.mission15Step = 'routineTask';
    // Node states must always be a three-slot array even if an old save is
    // short or the field is missing entirely.
    const states = this.state.auroraParasiteStates;
    this.state.auroraParasiteStates = Array.from({ length: NODE_COUNT }, (_, i) => {
      const value = Array.isArray(states) ? states[i] : undefined;
      return value === 'active' || value === 'isolated' || value === 'disabled' ? value : 'hidden';
    });
    this.state.mission16Unlocked = this.state.mission16Unlocked || this.state.mission15Completed;
    const savedSequence = savedState.auroraCommsSequence;
    this.state.auroraCommsSequence = isValidCommsSequence(savedSequence)
      ? [...savedSequence]
      : freshCommsSequence();
    const savedSequenceStep = savedState.auroraCommsSequenceStep;
    const stableSequenceStep = Number.isInteger(savedSequenceStep)
      ? Number(savedSequenceStep)
      : 0;
    const commsDisabled = this.state.auroraParasiteStates[2] === 'disabled';
    if (this.state.mission15Step === 'disableCommsParasite') {
      // Any impossible combination from an older save resumes at a clean
      // checkpoint for this node without touching completed earlier nodes.
      this.state.auroraCommsSequenceStep =
        stableSequenceStep >= 0 && stableSequenceStep < mission15Tuning.sequenceLength
          ? stableSequenceStep
          : 0;
      this.state.auroraCommsSequenceCompleted = false;
      this.state.auroraParasiteStates[2] = 'active';
    } else {
      this.state.auroraCommsSequenceStep = commsDisabled ? mission15Tuning.sequenceLength : 0;
      this.state.auroraCommsSequenceCompleted = commsDisabled;
    }
    // A module already opened must never re-seal on load.
    if (this.state.auroraModuleReleased) this.state.auroraModuleSealed = false;

    // Reloading always lands on the last stable step with its interaction
    // freshly armed: no banked seconds, no half-open valve set, no partial
    // sequence. Nothing here can restore a stuck interaction.
    this.resetVolatile();
    // Pressure and overload are derived from the restored step rather than
    // persisted, so neither can load into an unwinnable value.
    this.pressure = this.state.auroraModuleSealed && !this.state.auroraModuleReleased ? 100 : 100;
    if (this.state.mission15Step === 'centralOverload') this.overload = 34;
    const active = this.activeParasiteIndex;
    if (active >= 0) this.prepareDisablePhase(active, false);
  }

  snapshot(): Mission15Snapshot {
    return {
      ...this.state,
      auroraParasiteStates: [...this.state.auroraParasiteStates],
      auroraCommsSequence: [...this.state.auroraCommsSequence]
    };
  }

  reset(): void {
    Object.assign(this.state, {
      mission15Started: false,
      mission15Step: 'inactive' as Mission15StepId,
      auroraRoutineComplete: false,
      auroraModuleSealed: false,
      auroraModuleReleased: false,
      auroraCoordinatedFailureConfirmed: false,
      auroraParasiteStates: ['hidden', 'hidden', 'hidden'] as ParasiteState[],
      auroraCommsSequence: freshCommsSequence(),
      auroraCommsSequenceStep: 0,
      auroraCommsSequenceCompleted: false,
      auroraCentralOverloadResolved: false,
      auroraParasiteAnalyzed: false,
      mission15Completed: false,
      mission16Unlocked: false
    });
    this.resetVolatile();
  }

  private resetVolatile(): void {
    const t = mission15Tuning;
    this.routineProgress = 0;
    this.doorProgress = 0;
    this.diagnosticProgress = 0;
    this.analysisProgress = 0;
    this.pressure = 100;
    this.linesOpened = 0;
    this.surgeLoad = 100;
    this.surgeHeld = 0;
    this.valvesClosed = new Array<boolean>(t.valveCount).fill(false);
    this.valveTimers = new Array<number>(t.valveCount).fill(0);
    this.resetSequenceInputState();
    this.overload = 0;
    this.searchDistance = Number.POSITIVE_INFINITY;
  }

  /** Which colony system the active step is about, for HUD copy. */
  get activeSystem(): ParasiteSystem | 'none' {
    const index = this.activeParasiteIndex;
    return index >= 0 ? SYSTEM_ORDER[index] : 'none';
  }
}
