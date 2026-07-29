import {
  arkDepartureSteps,
  arkDepartureTuning,
  ARK_SYSTEM_CHECKS,
  type ArkDepartureStepDefinition,
  type ArkDepartureStepId
} from '../assets/arkDepartureDefinitions';

export type ArkDepartureSnapshot = {
  arkDepartureStep: ArkDepartureStepId;
  /** The prologue has been entered at least once this save. */
  arkDepartureStarted: boolean;
  commanderIntroPlayed: boolean;
  missionContextPlayed: boolean;
  preflightComplete: boolean;
  clampsReleased: boolean;
  undockingStarted: boolean;
  arkCleared: boolean;
  arkDepartureCompleted: boolean;
};

/** Canonical order. Every transition is monotonic: nothing can rewind. */
const STEP_ORDER: readonly ArkDepartureStepId[] = [
  'inactive',
  'dockedAtArk',
  'commanderIntroduction',
  'missionContext',
  'preflightCheck',
  'readyForRelease',
  'releaseDockingClamps',
  'undocking',
  'clearArk',
  'completed'
];

function stepIndex(step: ArkDepartureStepId): number {
  const index = STEP_ORDER.indexOf(step);
  return index < 0 ? 0 : index;
}

/**
 * The departure from Arca Epsilon: prologue state for Mission 01.
 *
 * Owns only state and progress. It never touches Three.js, the scene graph or
 * the ship transform — main.ts reads `docked`, `translationLocked`,
 * `thrustLimit` and the progress getters and applies them. Keeping it free of
 * the scene is what lets the whole prologue be unit-testable through the debug
 * hooks and restored from a save without replaying any physics.
 *
 * Two properties matter for save/load:
 *
 *  - transitions are monotonic, so a restore can never drop the player back
 *    into the hangar after they have left;
 *  - each dialogue beat is latched in the snapshot, so a reload never replays
 *    a line the pilot already heard.
 */
export class ArkDepartureSequence {
  readonly sequenceId = 'mission-01-ark-departure';

  readonly state: ArkDepartureSnapshot = {
    arkDepartureStep: 'inactive',
    arkDepartureStarted: false,
    commanderIntroPlayed: false,
    missionContextPlayed: false,
    preflightComplete: false,
    clampsReleased: false,
    undockingStarted: false,
    arkCleared: false,
    arkDepartureCompleted: false
  };

  // --- Volatile progress. Never persisted: a reload resumes from the stable
  // beginning of the current step rather than mid-animation.
  private preflightTimer = 0;
  private clampTimer = 0;
  private systemsChecked = 0;
  private distanceToAnchor = 0;
  /** The checklist runs itself once started, walking one system at a time. */
  private preflightRunning = false;

  get step(): ArkDepartureStepId {
    return this.state.arkDepartureStep;
  }

  get stepDefinition(): ArkDepartureStepDefinition {
    return arkDepartureSteps[this.step];
  }

  get started(): boolean {
    return this.state.arkDepartureStarted;
  }

  get completed(): boolean {
    return this.state.arkDepartureCompleted;
  }

  /** True while the hull is still parented to the Ark's launch cradle. */
  get docked(): boolean {
    return this.started && stepIndex(this.step) < stepIndex('undocking');
  }

  /** True while the clamps still hold the ship: no translation at all. */
  get translationLocked(): boolean {
    return this.docked;
  }

  /**
   * Weapons, lock-on and missiles stay cold from the cradle until the corridor
   * is behind us. Nothing out here is hostile, and a live weapon bay pointed
   * at the Ark's flank is not how a launch checklist ends.
   */
  get weaponsLocked(): boolean {
    return this.started && !this.state.arkCleared;
  }

  /** 0..1 of normal thrust: none while clamped, limited inside the corridor. */
  get thrustLimit(): number {
    if (!this.started || this.state.arkCleared) return 1;
    if (this.docked) return 0;
    return arkDepartureTuning.undockThrustLimit;
  }

  get preflightProgress(): number {
    return Math.min(100, (this.preflightTimer / arkDepartureTuning.preflightSeconds) * 100);
  }

  /** 0..1 clamp opening, drives `Mothership.setClampOpen`. */
  get clampProgress(): number {
    if (this.state.clampsReleased) return 1;
    if (this.step !== 'releaseDockingClamps') return 0;
    return Math.min(1, this.clampTimer / arkDepartureTuning.clampReleaseSeconds);
  }

  /** 0..1 pad power, drives `Mothership.setPlatformPower` guide-light chase. */
  get platformPower(): number {
    if (!this.started || this.state.arkCleared) return 0;
    if (stepIndex(this.step) >= stepIndex('preflightCheck')) return 1;
    return 0;
  }

  /** Systems confirmed so far, 0..5. Drives the compact HUD readout. */
  get systemsConfirmed(): number {
    return this.systemsChecked;
  }

  get nextSystemLabel(): string {
    return ARK_SYSTEM_CHECKS[Math.min(this.systemsChecked, ARK_SYSTEM_CHECKS.length - 1)];
  }

  /** Live distance from the launch cradle, fed by main.ts. */
  get anchorDistance(): number {
    return this.distanceToAnchor;
  }

  get insideCorridor(): boolean {
    return this.state.undockingStarted && this.distanceToAnchor < arkDepartureTuning.corridorLength;
  }

  /** Compact HUD status word for the docking readout. */
  get statusLabel(): string {
    switch (this.step) {
      case 'dockedAtArk':
      case 'commanderIntroduction':
      case 'missionContext':
        return 'ACOPLADO';
      case 'preflightCheck':
        return 'SISTEMAS EN ESPERA';
      case 'readyForRelease':
        return 'ANCLAJES BLOQUEADOS';
      case 'releaseDockingClamps':
        return 'LIBERANDO';
      case 'undocking':
        return 'DESACOPLADO';
      case 'clearArk':
        return 'CORREDOR DE SALIDA';
      case 'completed':
        return 'DISTANCIA SEGURA';
      default:
        return '';
    }
  }

  // --- Transitions ---------------------------------------------------------

  /** Entered only by a brand-new game. */
  start(): void {
    if (this.state.arkDepartureStarted) return;
    this.state.arkDepartureStarted = true;
    this.goTo('dockedAtArk');
  }

  /** The commander finished introducing herself. */
  advanceIntroduction(): boolean {
    if (this.step !== 'dockedAtArk' && this.step !== 'commanderIntroduction') return false;
    this.state.commanderIntroPlayed = true;
    this.goTo('missionContext');
    return true;
  }

  /** Context and first task delivered; the checklist opens. */
  advanceContext(): boolean {
    if (stepIndex(this.step) > stepIndex('missionContext')) return false;
    this.state.missionContextPlayed = true;
    this.goTo('preflightCheck');
    return true;
  }

  get preflightRunningNow(): boolean {
    return this.preflightRunning;
  }

  /**
   * One press on the interaction key opens the checklist, which then walks
   * the five systems on its own with sequential confirmations. A single
   * interaction, not five errands.
   */
  beginPreflight(): boolean {
    if (this.step !== 'preflightCheck' || this.preflightRunning) return false;
    this.preflightRunning = true;
    return true;
  }

  /**
   * Ticks the running checklist. Returns true while it is progressing; does
   * nothing until `beginPreflight` has been called by the player.
   */
  runPreflight(delta: number): boolean {
    if (this.step !== 'preflightCheck' || !this.preflightRunning) return false;
    this.preflightTimer += delta;
    const per = arkDepartureTuning.preflightSeconds / ARK_SYSTEM_CHECKS.length;
    this.systemsChecked = Math.min(ARK_SYSTEM_CHECKS.length, Math.floor(this.preflightTimer / per));
    if (this.preflightTimer >= arkDepartureTuning.preflightSeconds) {
      this.systemsChecked = ARK_SYSTEM_CHECKS.length;
      this.state.preflightComplete = true;
      this.goTo('readyForRelease');
    }
    return true;
  }

  /** Debug/restore shortcut: mark the checklist done without holding it. */
  forcePreflight(): void {
    if (stepIndex(this.step) > stepIndex('preflightCheck')) return;
    this.preflightRunning = true;
    this.preflightTimer = arkDepartureTuning.preflightSeconds;
    this.systemsChecked = ARK_SYSTEM_CHECKS.length;
    this.state.preflightComplete = true;
    this.goTo('readyForRelease');
  }

  /**
   * Player-initiated clamp release. Refused before the checklist is done, so
   * the clamps can never open early or on their own.
   */
  beginClampRelease(): boolean {
    if (this.step !== 'readyForRelease' || !this.state.preflightComplete) return false;
    this.clampTimer = 0;
    this.goTo('releaseDockingClamps');
    return true;
  }

  /** Drives the clamp animation; returns true on the frame it completes. */
  updateClampRelease(delta: number): boolean {
    if (this.step !== 'releaseDockingClamps') return false;
    this.clampTimer += delta;
    if (this.clampTimer < arkDepartureTuning.clampReleaseSeconds) return false;
    this.state.clampsReleased = true;
    this.state.undockingStarted = true;
    this.goTo('undocking');
    return true;
  }

  /**
   * Fed every frame once free, with the live distance to the launch cradle.
   * Returns true on the frame the corridor is cleared and normal flight is
   * handed back.
   */
  updateSeparation(distanceToAnchor: number): boolean {
    this.distanceToAnchor = distanceToAnchor;
    if (!this.state.undockingStarted || this.state.arkCleared) return false;
    if (this.step === 'undocking' && distanceToAnchor > arkDepartureTuning.corridorLength * 0.35) {
      this.goTo('clearArk');
    }
    if (distanceToAnchor < arkDepartureTuning.safeDistance) return false;
    this.state.arkCleared = true;
    this.state.arkDepartureCompleted = true;
    this.goTo('completed');
    return true;
  }

  // --- Persistence ---------------------------------------------------------

  snapshot(): ArkDepartureSnapshot {
    return { ...this.state };
  }

  /**
   * Restores from a save. Volatile progress is rebuilt from the latched flags
   * rather than persisted, so a reload lands on the stable start of the step
   * instead of halfway through a clamp animation.
   */
  restore(snapshot: Partial<ArkDepartureSnapshot> | undefined): void {
    if (!snapshot) return;
    this.state.arkDepartureStarted = snapshot.arkDepartureStarted ?? false;
    this.state.commanderIntroPlayed = snapshot.commanderIntroPlayed ?? false;
    this.state.missionContextPlayed = snapshot.missionContextPlayed ?? false;
    this.state.preflightComplete = snapshot.preflightComplete ?? false;
    this.state.clampsReleased = snapshot.clampsReleased ?? false;
    this.state.undockingStarted = snapshot.undockingStarted ?? false;
    this.state.arkCleared = snapshot.arkCleared ?? false;
    this.state.arkDepartureCompleted = snapshot.arkDepartureCompleted ?? false;

    const step = snapshot.arkDepartureStep;
    this.state.arkDepartureStep = step && STEP_ORDER.includes(step) ? step : 'inactive';

    this.preflightRunning = this.state.preflightComplete;
    this.preflightTimer = this.state.preflightComplete ? arkDepartureTuning.preflightSeconds : 0;
    this.systemsChecked = this.state.preflightComplete ? ARK_SYSTEM_CHECKS.length : 0;
    // A save taken mid-release resumes with the clamps already open: a stable
    // checkpoint, never a half-swung arm.
    this.clampTimer = this.state.clampsReleased ? arkDepartureTuning.clampReleaseSeconds : 0;
    if (this.state.arkDepartureStep === 'releaseDockingClamps' && !this.state.clampsReleased) {
      this.state.clampsReleased = true;
      this.state.undockingStarted = true;
      this.state.arkDepartureStep = 'undocking';
    }
    this.distanceToAnchor = 0;
  }

  /**
   * A save written before this prologue existed has no departure fields at
   * all. Those pilots already left the Ark — some are on the surface, some
   * mid-campaign — so the sequence is marked done and inert. They are never
   * sent back to the hangar and never hear the introduction again.
   */
  markLegacySaveAsCompleted(): void {
    this.state.arkDepartureStarted = true;
    this.state.commanderIntroPlayed = true;
    this.state.missionContextPlayed = true;
    this.state.preflightComplete = true;
    this.state.clampsReleased = true;
    this.state.undockingStarted = true;
    this.state.arkCleared = true;
    this.state.arkDepartureCompleted = true;
    this.state.arkDepartureStep = 'completed';
    this.preflightTimer = arkDepartureTuning.preflightSeconds;
    this.clampTimer = arkDepartureTuning.clampReleaseSeconds;
    this.systemsChecked = ARK_SYSTEM_CHECKS.length;
    this.preflightRunning = true;
  }

  reset(): void {
    this.state.arkDepartureStep = 'inactive';
    this.state.arkDepartureStarted = false;
    this.state.commanderIntroPlayed = false;
    this.state.missionContextPlayed = false;
    this.state.preflightComplete = false;
    this.state.clampsReleased = false;
    this.state.undockingStarted = false;
    this.state.arkCleared = false;
    this.state.arkDepartureCompleted = false;
    this.preflightTimer = 0;
    this.clampTimer = 0;
    this.systemsChecked = 0;
    this.distanceToAnchor = 0;
    this.preflightRunning = false;
  }

  /** Monotonic: a later step can never be replaced by an earlier one. */
  private goTo(step: ArkDepartureStepId): void {
    if (stepIndex(step) <= stepIndex(this.state.arkDepartureStep)) return;
    this.state.arkDepartureStep = step;
  }
}
