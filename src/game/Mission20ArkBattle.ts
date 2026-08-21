import {
  mission20Steps,
  mission20Tuning,
  ARK_SYSTEM_ORDER,
  CIVILIAN_MODULE_COUNT,
  ENGINE_COUNT,
  LINK_POINT_COUNT,
  type Mission20StepDefinition,
  type Mission20StepId
} from '../assets/mission20Definitions';
import type { Mission19Snapshot } from './Mission19NereidaUnderAttack';

export type Mission20Snapshot = {
  mission20Started: boolean;
  mission20Step: Mission20StepId;
  ascentComplete: boolean;
  arkReached: boolean;
  /** Per external link point, fore / mid / aft. */
  arkLinksRestored: boolean[];
  arkFirstWaveCleared: boolean;
  jammerLocated: boolean;
  jammerDisabled: boolean;
  enginesDefended: boolean;
  civilianModulesProtected: boolean;
  dataBreachStopped: boolean;
  arkCounterattackActive: boolean;
  finalWaveCleared: boolean;
  arkStabilized: boolean;
  capitalSignatureDetected: boolean;
  /** How much colonial data the Coalition managed to siphon, 0..100 (capped). */
  dataSiphoned: number;
  /** Enemies destroyed across the battle. */
  hostilesDestroyed: number;
  mission20Completed: boolean;
  mission21Unlocked: boolean;
};

/** Live battle readouts. Derived every frame, never persisted. */
export type ArkBattleReadout = {
  /** Ark hull integrity, 0..100. */
  arkIntegrity: number;
  /** Worst engine integrity, 0..100. */
  engineIntegrity: number;
  /** Comms quality, 0..100 (drops hard while the jammer is up). */
  commsQuality: number;
  /** Colonial data siphoned so far, 0..100. */
  dataSiphoned: number;
  /** Worst civilian module integrity, 0..100. */
  moduleIntegrity: number;
  /** Hostiles alive now. */
  hostilesActive: number;
  /** Hostiles still expected in the current wave. */
  hostilesRemaining: number;
  /** Jammer signal strength, 0..100. Zero outside the hunt. */
  jammerSignal: number;
  /** True while lock-on and part of the HUD are suppressed. */
  jammed: boolean;
  /** Progress of whatever interaction the current step is running, 0..100. */
  phaseProgress: number;
};

/** Canonical order — every transition is monotonic; nothing can rewind. */
const STEP_ORDER: readonly Mission20StepId[] = [
  'inactive',
  'emergencyAscent',
  'rendezvousWithArk',
  'restoreArkLink',
  'firstOrbitalWave',
  'locateJammer',
  'disableJammer',
  'defendEngines',
  'protectCivilianModules',
  'stopDataBreach',
  'activateArkCounterattack',
  'finalOrbitalWave',
  'stabilizeArk',
  'detectCapitalSignature',
  'completed'
];
function stepIndex(step: Mission20StepId): number {
  const i = STEP_ORDER.indexOf(step);
  return i < 0 ? 0 : i;
}

/** Wave size per combat step. */
const WAVE_SIZE: Partial<Record<Mission20StepId, number>> = {
  firstOrbitalWave: mission20Tuning.firstWaveCount,
  disableJammer: mission20Tuning.jammerEscortCount,
  defendEngines: mission20Tuning.engineWaveCount,
  protectCivilianModules: mission20Tuning.moduleWaveCount,
  stopDataBreach: mission20Tuning.breachWaveCount,
  finalOrbitalWave: mission20Tuning.finalWaveCount
};

/**
 * Mission 20 "Batalla por el Arca": the orbital defence of the Ark.
 *
 * Owns mission state, wave bookkeeping and the meters (hull, engines, comms,
 * civilian modules, the enemy siphon). All combat is resolved by the ship's
 * existing WeaponSystem plus the Ark's automatic turrets — this class never
 * owns geometry or per-frame physics.
 *
 * Nothing is lost irreversibly: every meter has a floor, the Ark is never
 * destroyed, damaged engines and modules can be recovered, the siphon is capped
 * at partial data, and each wave boundary is a stable checkpoint.
 */
export class Mission20ArkBattle {
  readonly missionId = 'mission-20-ark-battle';
  readonly missionName = 'Misión 20: Batalla por el Arca';

  readonly state: Mission20Snapshot = {
    mission20Started: false,
    mission20Step: 'inactive',
    ascentComplete: false,
    arkReached: false,
    arkLinksRestored: [false, false, false],
    arkFirstWaveCleared: false,
    jammerLocated: false,
    jammerDisabled: false,
    enginesDefended: false,
    civilianModulesProtected: false,
    dataBreachStopped: false,
    arkCounterattackActive: false,
    finalWaveCleared: false,
    arkStabilized: false,
    capitalSignatureDetected: false,
    dataSiphoned: 0,
    hostilesDestroyed: 0,
    mission20Completed: false,
    mission21Unlocked: false
  };

  // --- Volatile battle state. None persisted: a reload restarts the current
  // wave from its stable beginning rather than mid-dogfight.
  private stationProgress = 0;
  private ascentTimer = 0;

  /** 0..1 of the way to the ascent altitude. Drives the climb readout. */
  private ascentClimb = 0;
  private capitalTimer = 0;
  private arkIntegrity = 84;
  private engineIntegrity: number[] = [100, 100];
  private moduleIntegrity: number[] = [100, 100];
  private activeHostiles = 0;
  private waveKills = 0;
  private jammerDistance = Number.POSITIVE_INFINITY;
  private engineRepairProgress = 0;

  constructor() {
    this.resetVolatile();
  }

  get started(): boolean {
    return this.state.mission20Started;
  }
  get completed(): boolean {
    return this.state.mission20Completed;
  }
  get step(): Mission20StepId {
    return this.state.mission20Step;
  }
  get stepDefinition(): Mission20StepDefinition {
    return mission20Steps[this.step];
  }

  get linksRestoredCount(): number {
    return this.state.arkLinksRestored.filter(Boolean).length;
  }
  /** The link point currently being synced, or -1. */
  get activeLinkIndex(): number {
    if (this.step !== 'restoreArkLink') return -1;
    return this.state.arkLinksRestored.findIndex((l) => !l);
  }

  get arkIntegrityPercent(): number {
    return Number(this.arkIntegrity.toFixed(1));
  }
  get worstEngineIntegrity(): number {
    return Number(Math.min(...this.engineIntegrity).toFixed(1));
  }
  get worstModuleIntegrity(): number {
    return Number(Math.min(...this.moduleIntegrity).toFixed(1));
  }
  /** Index of the engine that needs repair, or -1. */
  get damagedEngineIndex(): number {
    let worst = -1;
    let value = 100;
    for (let i = 0; i < this.engineIntegrity.length; i += 1) {
      if (this.engineIntegrity[i] < value) { value = this.engineIntegrity[i]; worst = i; }
    }
    return value < 100 ? worst : -1;
  }

  /** True while the jammer suppresses lock-on and part of the HUD. */
  get jammed(): boolean {
    if (!this.started || this.completed) return false;
    const i = stepIndex(this.step);
    return i >= stepIndex('locateJammer') && !this.state.jammerDisabled;
  }
  get commsQuality(): number {
    if (this.jammed) return mission20Tuning.jammedCommsLevel;
    return this.linksRestoredCount >= LINK_POINT_COUNT ? 100 : (this.linksRestoredCount / LINK_POINT_COUNT) * 100;
  }

  /** Size of the wave the current step fights, or 0. */
  get activeWaveCount(): number {
    return WAVE_SIZE[this.step] ?? 0;
  }

  /**
   * Kills the current step still needs before its wave counts as cleared.
   *
   * A combat step only advances on `waveKills` reaching the wave size, so if
   * the launched drones ever leave the field without being reported destroyed
   * the step is left with no reachable exit. Publishing the shortfall lets the
   * launcher notice an empty sky and send the remainder instead of latching.
   */
  get waveKillsRemaining(): number {
    return Math.max(0, this.activeWaveCount - this.waveKills);
  }

  /** The jammer only joins the weapon target list after all four escorts die. */
  get jammerExposed(): boolean {
    return this.step === 'disableJammer' && this.activeWaveCount > 0 && this.waveKillsRemaining === 0;
  }

  get milestoneCount(): number {
    return (
      [
        this.state.ascentComplete,
        this.state.arkReached,
        this.state.arkFirstWaveCleared,
        this.state.jammerLocated,
        this.state.jammerDisabled,
        this.state.enginesDefended,
        this.state.civilianModulesProtected,
        this.state.dataBreachStopped,
        this.state.arkCounterattackActive,
        this.state.finalWaveCleared,
        this.state.arkStabilized,
        this.state.capitalSignatureDetected
      ].filter(Boolean).length + this.linksRestoredCount
    );
  }

  /** Fed by the enemy fleets each frame. Never persisted. */
  setActiveHostiles(count: number): void {
    this.activeHostiles = Math.max(0, count);
  }
  /** Fed while hunting the jammer. Never persisted. */
  setJammerDistance(distance: number): void {
    this.jammerDistance = distance;
  }

  get readout(): ArkBattleReadout {
    const waveCount = this.activeWaveCount;
    const hunting = this.step === 'locateJammer' || this.step === 'disableJammer';
    return {
      arkIntegrity: Number(this.arkIntegrity.toFixed(1)),
      engineIntegrity: this.worstEngineIntegrity,
      commsQuality: Number(this.commsQuality.toFixed(1)),
      dataSiphoned: Number(this.state.dataSiphoned.toFixed(1)),
      moduleIntegrity: this.worstModuleIntegrity,
      hostilesActive: this.activeHostiles,
      hostilesRemaining: waveCount ? Math.max(0, waveCount - this.waveKills) : 0,
      jammerSignal: hunting
        ? Math.round(Math.max(0, 1 - Math.min(1, this.jammerDistance / mission20Tuning.jammerSearchRange)) * 100)
        : 0,
      jammed: this.jammed,
      phaseProgress: Number(this.phaseProgress.toFixed(1))
    };
  }

  get phaseProgress(): number {
    const t = mission20Tuning;
    const waveCount = this.activeWaveCount;
    switch (this.step) {
      case 'emergencyAscent': {
        // Used to be the hold timer alone, which only starts once the ship is
        // already above the atmosphere — so the readout sat at 0% for the whole
        // climb, exactly when the pilot most needs to see it moving. The climb
        // itself now drives the bulk of the bar and the hold finishes it.
        const climb = this.ascentClimb * 85;
        const hold = Math.min(1, this.ascentTimer / t.ascentSeconds) * 15;
        return Math.min(100, climb + hold);
      }
      case 'rendezvousWithArk':
        return Math.min(100, (this.stationProgress / t.rendezvousSeconds) * 100);
      case 'restoreArkLink': {
        const per = 100 / LINK_POINT_COUNT;
        return Math.min(100, this.linksRestoredCount * per + (this.stationProgress / t.linkSeconds) * per);
      }
      case 'locateJammer':
        return this.state.jammerLocated ? 100 : Math.min(99, this.readoutJammerProgress());
      case 'firstOrbitalWave':
      case 'disableJammer':
      case 'defendEngines':
      case 'protectCivilianModules':
      case 'stopDataBreach':
      case 'finalOrbitalWave':
        return waveCount ? Math.min(100, (this.waveKills / waveCount) * 100) : 0;
      case 'activateArkCounterattack':
        return Math.min(100, (this.stationProgress / t.batterySeconds) * 100);
      case 'stabilizeArk':
        return Math.min(100, (this.stationProgress / t.stabilizeSeconds) * 100);
      case 'detectCapitalSignature':
        return Math.min(100, (this.capitalTimer / t.capitalSignatureSeconds) * 100);
      case 'completed':
        return 100;
      default:
        return 0;
    }
  }

  private readoutJammerProgress(): number {
    return Math.max(0, 1 - Math.min(1, this.jammerDistance / mission20Tuning.jammerSearchRange)) * 100;
  }

  canStart(mission19: Partial<Mission19Snapshot>): boolean {
    return Boolean(
      !this.started && !this.completed && mission19.mission19Completed && mission19.mission20Unlocked
    );
  }

  start(mission19: Partial<Mission19Snapshot>): boolean {
    if (!this.canStart(mission19)) return false;
    this.state.mission20Started = true;
    this.state.mission20Step = 'emergencyAscent';
    this.resetVolatile();
    return true;
  }

  // -------------------------------------------------------------------------
  // Phases 1-3: ascent, rendezvous, external link
  // -------------------------------------------------------------------------

  /**
   * @param climbFraction 0..1 of the way to the ascent altitude, fed every
   * frame so the readout tracks the actual climb.
   */
  advanceAscent(deltaSeconds: number, aboveAtmosphere: boolean, climbFraction = 0): boolean {
    if (this.step !== 'emergencyAscent') return false;
    // Recorded before the gate below, which is the whole point: the climb is
    // what the pilot is doing for most of this step, so it has to register even
    // though the hold timer has not started yet.
    this.ascentClimb = Math.max(0, Math.min(1, climbFraction));
    if (!aboveAtmosphere) return false;
    this.ascentTimer += deltaSeconds;
    if (this.ascentTimer < mission20Tuning.ascentSeconds) return false;
    this.state.ascentComplete = true;
    this.stationProgress = 0;
    return this.goToStep('rendezvousWithArk');
  }

  advanceRendezvous(deltaSeconds: number, nearArk: boolean): boolean {
    if (this.step !== 'rendezvousWithArk') return false;
    if (!this.hold(deltaSeconds, nearArk, mission20Tuning.rendezvousSeconds)) return false;
    this.state.arkReached = true;
    this.stationProgress = 0;
    return this.goToStep('restoreArkLink');
  }

  /** Sync the external link points, one at a time. Returns the index synced. */
  advanceLink(deltaSeconds: number, inRange: boolean): number {
    if (this.step !== 'restoreArkLink') return -1;
    const index = this.activeLinkIndex;
    if (index < 0) return -1;
    if (!this.hold(deltaSeconds, inRange, mission20Tuning.linkSeconds)) return -1;
    this.state.arkLinksRestored[index] = true;
    this.stationProgress = 0;
    if (this.linksRestoredCount >= LINK_POINT_COUNT) {
      this.waveKills = 0;
      this.goToStep('firstOrbitalWave');
    }
    return index;
  }

  // -------------------------------------------------------------------------
  // Combat bookkeeping
  // -------------------------------------------------------------------------

  /** Report one hostile destroyed. True on the frame the current wave clears. */
  reportHostileDestroyed(): boolean {
    if (!this.started || this.completed) return false;
    this.state.hostilesDestroyed += 1;
    const count = this.activeWaveCount;
    if (!count) return false;
    this.waveKills += 1;
    if (this.waveKills < count) return false;
    // Reaching the escort quota exposes the heavy unit. Its own death is the
    // next callback and remains the authority for leaving this step.
    if (this.step === 'disableJammer' && this.waveKills === count) return false;
    return this.completeWave();
  }

  private completeWave(): boolean {
    switch (this.step) {
      case 'firstOrbitalWave':
        this.state.arkFirstWaveCleared = true;
        this.jammerDistance = Number.POSITIVE_INFINITY;
        return this.goToStep('locateJammer');
      case 'disableJammer':
        // The callback beyond the escort quota belongs to the exposed jammer.
        this.state.jammerDisabled = true;
        this.waveKills = 0;
        return this.goToStep('defendEngines');
      case 'defendEngines':
        this.state.enginesDefended = true;
        this.waveKills = 0;
        return this.goToStep('protectCivilianModules');
      case 'protectCivilianModules':
        this.state.civilianModulesProtected = true;
        this.waveKills = 0;
        return this.goToStep('stopDataBreach');
      case 'stopDataBreach':
        // Killing the escorts is not enough: the coupling must still be cut.
        return false;
      case 'finalOrbitalWave':
        this.state.finalWaveCleared = true;
        this.stationProgress = 0;
        return this.goToStep('stabilizeArk');
      default:
        return false;
    }
  }

  /** The pilot closes on the jammer: locating it opens the kill phase. */
  locateJammer(distance: number): boolean {
    if (this.step !== 'locateJammer') return false;
    if (distance > mission20Tuning.jammerLockRange) return false;
    this.state.jammerLocated = true;
    this.waveKills = 0;
    return this.goToStep('disableJammer');
  }

  /** Hull damage from a hostile pass. Floored: the Ark is never destroyed. */
  damageArk(amount: number): void {
    if (!this.started || this.completed) return;
    this.arkIntegrity = Math.max(mission20Tuning.arkIntegrityFloor, this.arkIntegrity - Math.max(0, amount));
  }

  /** Engine damage during the propulsion phase. Repairable. */
  damageEngine(index: number, amount: number): void {
    if (index < 0 || index >= this.engineIntegrity.length) return;
    this.engineIntegrity[index] = Math.max(
      mission20Tuning.engineIntegrityFloor,
      this.engineIntegrity[index] - Math.max(0, amount)
    );
  }

  /** Civilian module damage. Floored: no principal characters are killed. */
  damageModule(index: number, amount: number): void {
    if (index < 0 || index >= this.moduleIntegrity.length) return;
    this.moduleIntegrity[index] = Math.max(
      mission20Tuning.moduleFloor,
      this.moduleIntegrity[index] - Math.max(0, amount)
    );
  }

  /**
   * Repair the worst engine by holding position near it. Never a game over:
   * a broken engine only costs time and narrative pressure.
   */
  advanceEngineRepair(deltaSeconds: number, inRange: boolean): boolean {
    const index = this.damagedEngineIndex;
    if (index < 0) return false;
    if (!inRange) {
      this.engineRepairProgress = Math.max(0, this.engineRepairProgress - deltaSeconds);
      return false;
    }
    this.engineRepairProgress += deltaSeconds;
    if (this.engineRepairProgress < mission20Tuning.engineRepairSeconds) return false;
    this.engineRepairProgress = 0;
    this.engineIntegrity[index] = 100;
    return true;
  }

  /**
   * The coupled unit siphons while the breach is live, capped so the Coalition
   * only ever gets partial colonial data.
   */
  advanceSiphon(deltaSeconds: number): void {
    if (this.step !== 'stopDataBreach' || this.state.dataBreachStopped) return;
    this.state.dataSiphoned = Math.min(
      mission20Tuning.maxSiphon,
      this.state.dataSiphoned + deltaSeconds * mission20Tuning.breachSiphonPerSecond
    );
  }

  /** Cut the enemy coupling from outside the hull. */
  advanceBreachCut(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'stopDataBreach') return false;
    if (this.waveKillsRemaining > 0) return false;
    if (!this.hold(deltaSeconds, inRange, mission20Tuning.breachCutSeconds)) return false;
    this.state.dataBreachStopped = true;
    this.stationProgress = 0;
    return this.goToStep('activateArkCounterattack');
  }

  // -------------------------------------------------------------------------
  // Phases 9-12: counterattack, final wave, stabilise, the far signature
  // -------------------------------------------------------------------------

  advanceCounterattack(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'activateArkCounterattack') return false;
    if (!this.hold(deltaSeconds, inRange, mission20Tuning.batterySeconds)) return false;
    this.state.arkCounterattackActive = true;
    this.waveKills = 0;
    return this.goToStep('finalOrbitalWave');
  }

  advanceStabilize(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'stabilizeArk') return false;
    if (!this.hold(deltaSeconds, inRange, mission20Tuning.stabilizeSeconds)) return false;
    this.state.arkStabilized = true;
    this.capitalTimer = 0;
    return this.goToStep('detectCapitalSignature');
  }

  advanceCapitalSignature(deltaSeconds: number): boolean {
    if (this.step !== 'detectCapitalSignature') return false;
    this.capitalTimer += deltaSeconds;
    if (this.capitalTimer < mission20Tuning.capitalSignatureSeconds) return false;
    this.completeBattle();
    return true;
  }

  private completeBattle(): void {
    this.state.ascentComplete = true;
    this.state.arkReached = true;
    this.state.arkLinksRestored = [true, true, true];
    this.state.arkFirstWaveCleared = true;
    this.state.jammerLocated = true;
    this.state.jammerDisabled = true;
    this.state.enginesDefended = true;
    this.state.civilianModulesProtected = true;
    this.state.dataBreachStopped = true;
    this.state.arkCounterattackActive = true;
    this.state.finalWaveCleared = true;
    this.state.arkStabilized = true;
    this.state.capitalSignatureDetected = true;
    this.state.mission20Completed = true;
    this.state.mission21Unlocked = true;
    this.state.mission20Step = 'completed';
  }

  // -------------------------------------------------------------------------

  /** Monotonic step move: never rewinds, whatever the caller does. */
  private goToStep(step: Mission20StepId): boolean {
    if (stepIndex(step) <= stepIndex(this.state.mission20Step)) return false;
    this.state.mission20Step = step;
    return true;
  }

  private hold(deltaSeconds: number, inRange: boolean, seconds: number): boolean {
    if (!inRange) {
      this.stationProgress = Math.max(0, this.stationProgress - deltaSeconds * 1.5);
      return false;
    }
    this.stationProgress += deltaSeconds;
    if (this.stationProgress < seconds) return false;
    this.stationProgress = seconds;
    return true;
  }

  // -------------------------------------------------------------------------
  // Debug fast-forwards. Monotonic by construction thanks to goToStep.
  // -------------------------------------------------------------------------

  forceAscent(): void {
    if (!this.started) return;
    this.state.ascentComplete = true;
    this.ascentTimer = mission20Tuning.ascentSeconds;
    this.goToStep('rendezvousWithArk');
  }
  forceRendezvous(): void {
    if (!this.started) return;
    this.forceAscent();
    this.state.arkReached = true;
    this.goToStep('restoreArkLink');
  }
  /** Restore link points up to and including `index`. */
  forceLinksRestored(index: number): void {
    if (!this.started || index < 0 || index >= LINK_POINT_COUNT) return;
    this.forceRendezvous();
    for (let i = 0; i <= index; i += 1) this.state.arkLinksRestored[i] = true;
    if (this.linksRestoredCount >= LINK_POINT_COUNT) {
      this.waveKills = 0;
      this.goToStep('firstOrbitalWave');
    }
  }
  forceFirstWave(): void {
    if (!this.started) return;
    this.forceLinksRestored(LINK_POINT_COUNT - 1);
    if (this.step === 'firstOrbitalWave') {
      this.state.hostilesDestroyed += Math.max(0, this.activeWaveCount - this.waveKills);
      this.state.arkFirstWaveCleared = true;
      this.goToStep('locateJammer');
    }
  }
  forceJammerLocated(): void {
    if (!this.started) return;
    this.forceFirstWave();
    this.state.jammerLocated = true;
    this.waveKills = 0;
    this.goToStep('disableJammer');
  }
  forceJammerDisabled(): void {
    if (!this.started) return;
    this.forceJammerLocated();
    if (this.step === 'disableJammer') {
      this.state.hostilesDestroyed += Math.max(0, this.activeWaveCount - this.waveKills);
    }
    this.state.jammerDisabled = true;
    this.waveKills = 0;
    this.goToStep('defendEngines');
  }
  forceEnginesDefended(): void {
    if (!this.started) return;
    this.forceJammerDisabled();
    if (this.step === 'defendEngines') {
      this.state.hostilesDestroyed += Math.max(0, this.activeWaveCount - this.waveKills);
    }
    this.state.enginesDefended = true;
    this.engineIntegrity = this.engineIntegrity.map((v) => Math.max(v, 100));
    this.waveKills = 0;
    this.goToStep('protectCivilianModules');
  }
  forceModulesProtected(): void {
    if (!this.started) return;
    this.forceEnginesDefended();
    if (this.step === 'protectCivilianModules') {
      this.state.hostilesDestroyed += Math.max(0, this.activeWaveCount - this.waveKills);
    }
    this.state.civilianModulesProtected = true;
    this.waveKills = 0;
    this.goToStep('stopDataBreach');
  }
  forceBreachStopped(): void {
    if (!this.started) return;
    this.forceModulesProtected();
    this.state.dataBreachStopped = true;
    // Even a fast-forward leaves the partial loss on the record.
    if (this.state.dataSiphoned <= 0) this.state.dataSiphoned = 21;
    this.stationProgress = 0;
    this.goToStep('activateArkCounterattack');
  }
  forceCounterattack(): void {
    if (!this.started) return;
    this.forceBreachStopped();
    this.state.arkCounterattackActive = true;
    this.waveKills = 0;
    this.goToStep('finalOrbitalWave');
  }
  forceFinalWave(): void {
    if (!this.started) return;
    this.forceCounterattack();
    if (this.step === 'finalOrbitalWave') {
      this.state.hostilesDestroyed += Math.max(0, this.activeWaveCount - this.waveKills);
    }
    this.state.finalWaveCleared = true;
    this.stationProgress = 0;
    this.goToStep('stabilizeArk');
  }
  forceStabilized(): void {
    if (!this.started) return;
    this.forceFinalWave();
    this.state.arkStabilized = true;
    this.capitalTimer = 0;
    this.goToStep('detectCapitalSignature');
  }
  forceComplete(): void {
    if (!this.started) return;
    this.completeBattle();
  }

  // -------------------------------------------------------------------------

  restore(savedState: Partial<Mission20Snapshot> | undefined): void {
    this.reset();
    if (!savedState?.mission20Started) return;
    Object.assign(this.state, savedState);
    if (!mission20Steps[this.state.mission20Step]) this.state.mission20Step = 'emergencyAscent';
    const links = this.state.arkLinksRestored;
    this.state.arkLinksRestored = Array.from({ length: LINK_POINT_COUNT }, (_, i) =>
      Array.isArray(links) ? Boolean(links[i]) : false
    );
    this.state.hostilesDestroyed = Math.max(0, Math.floor(this.state.hostilesDestroyed || 0));
    this.state.dataSiphoned = Math.max(0, Math.min(mission20Tuning.maxSiphon, this.state.dataSiphoned || 0));
    this.state.mission21Unlocked = this.state.mission21Unlocked || this.state.mission20Completed;

    // A reload never resumes mid-dogfight: the current wave restarts from its
    // stable beginning with no live enemies and no projectiles. Waves already
    // cleared are never re-flown because the step has moved past them.
    this.resetVolatile();
    // Steps entered under damage reproduce that pressure rather than a pristine
    // hull, so the situation still reads as a battle.
    if (this.state.arkReached) this.arkIntegrity = 72;
    if (this.state.mission20Step === 'defendEngines' && !this.state.enginesDefended) {
      this.engineIntegrity = [100, 58];
    }
  }

  snapshot(): Mission20Snapshot {
    return { ...this.state, arkLinksRestored: [...this.state.arkLinksRestored] };
  }

  reset(): void {
    Object.assign(this.state, {
      mission20Started: false,
      mission20Step: 'inactive' as Mission20StepId,
      ascentComplete: false,
      arkReached: false,
      arkLinksRestored: [false, false, false],
      arkFirstWaveCleared: false,
      jammerLocated: false,
      jammerDisabled: false,
      enginesDefended: false,
      civilianModulesProtected: false,
      dataBreachStopped: false,
      arkCounterattackActive: false,
      finalWaveCleared: false,
      arkStabilized: false,
      capitalSignatureDetected: false,
      dataSiphoned: 0,
      hostilesDestroyed: 0,
      mission20Completed: false,
      mission21Unlocked: false
    });
    this.resetVolatile();
  }

  private resetVolatile(): void {
    this.stationProgress = 0;
    this.ascentTimer = 0;
    this.ascentClimb = 0;
    this.capitalTimer = 0;
    this.arkIntegrity = 84;
    this.engineIntegrity = new Array(ENGINE_COUNT).fill(100);
    this.moduleIntegrity = new Array(CIVILIAN_MODULE_COUNT).fill(100);
    this.activeHostiles = 0;
    this.waveKills = 0;
    this.jammerDistance = Number.POSITIVE_INFINITY;
    this.engineRepairProgress = 0;
    void ARK_SYSTEM_ORDER;
  }
}
