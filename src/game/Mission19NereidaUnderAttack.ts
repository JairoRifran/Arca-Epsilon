import {
  mission19Steps,
  mission19Tuning,
  NEREIDA_DEFENSE_ORDER,
  type Mission19StepDefinition,
  type Mission19StepId,
  type NereidaDefenseId,
  type OperationalPriority
} from '../assets/mission19Definitions';
import type { Mission18Snapshot } from './Mission18FirstFire';

export type Mission19Snapshot = {
  mission19Started: boolean;
  mission19Step: Mission19StepId;
  emergencyCallConfirmed: boolean;
  arrivedAtNereida: boolean;
  airspaceCleared: boolean;
  landedAtNereida: boolean;
  /** Per defence system, ordered beacon / emergency power / Atlas barrier. */
  defensesRestored: boolean[];
  groundIncursionRepelled: boolean;
  atlasProtected: boolean;
  /** The temporary priority. Flavour + damage only; never forks the story. */
  operationalPriority: OperationalPriority;
  counterattackActivated: boolean;
  /** The leak happens exactly once. */
  dataLeakConfirmed: boolean;
  nereidaWreckageRecovered: boolean;
  auroraLinkRepaired: boolean;
  arkTargetConfirmed: boolean;
  /** Enemies destroyed across the engagement, for the HUD and the log. */
  intrudersDestroyed: number;
  mission19Completed: boolean;
  mission20Unlocked: boolean;
};

/** Live readouts. Derived every frame, never persisted. */
export type NereidaDefenseReadout = {
  /** Structural integrity of the base, 0..100. */
  nereidaIntegrity: number;
  /** Atlas core stability, 0..100. */
  atlasStability: number;
  /** Defence systems back online, 0..3. */
  defensesActive: number;
  /** Ground intruders still alive. */
  intrudersActive: number;
  /** Intruders still expected in the current wave. */
  intrudersRemaining: number;
  /** Progress of the enemy data siphon, 0..100. */
  dataLeakProgress: number;
  /** Progress of whatever interaction the current step is running, 0..100. */
  phaseProgress: number;
};

const DEFENSE_INDEX: Record<NereidaDefenseId, number> = { beacon: 0, emergencyPower: 1, atlasBarrier: 2 };

/**
 * Canonical step order. Used to keep every transition monotonic: the mission
 * can only ever move forward. Without this the debug fast-forwards, which pull
 * every earlier phase along with them, could drag an already-advanced mission
 * backwards (e.g. re-entering the ground incursion after Atlas was sealed).
 */
const STEP_ORDER: readonly Mission19StepId[] = [
  'inactive',
  'emergencyTransmission',
  'travelToNereida',
  'clearAirspace',
  'landAtNereida',
  'restoreDefenses',
  'repelGroundIncursion',
  'protectAtlas',
  'chooseOperationalPriority',
  'activateCounterattack',
  'detectDataLeak',
  'recoverEnemyWreckage',
  'confirmArkTarget',
  'completed'
];
function stepIndex(step: Mission19StepId): number {
  const i = STEP_ORDER.indexOf(step);
  return i < 0 ? 0 : i;
}

/**
 * Mission 19 "Nereida bajo Ataque": the Coalition follows the coordinates it
 * stole from Aurora and pushes for the Atlas resonator.
 *
 * Strictly sequential. This class owns only mission state, wave bookkeeping and
 * the meters (base integrity, Atlas stability, the data siphon). Combat itself
 * is resolved by the ship's existing WeaponSystem in the air and by Nereida's
 * remote defences on the ground — the pilot never carries a weapon on foot.
 *
 * Nothing is lost irreversibly: both meters have floors, waves restart from
 * stable checkpoints and the Atlas core can always be re-stabilised.
 */
export class Mission19NereidaUnderAttack {
  readonly missionId = 'mission-19-nereida-under-attack';
  readonly missionName = 'Misión 19: Nereida bajo Ataque';

  readonly state: Mission19Snapshot = {
    mission19Started: false,
    mission19Step: 'inactive',
    emergencyCallConfirmed: false,
    arrivedAtNereida: false,
    airspaceCleared: false,
    landedAtNereida: false,
    defensesRestored: [false, false, false],
    groundIncursionRepelled: false,
    atlasProtected: false,
    operationalPriority: 'none',
    counterattackActivated: false,
    dataLeakConfirmed: false,
    nereidaWreckageRecovered: false,
    auroraLinkRepaired: false,
    arkTargetConfirmed: false,
    intrudersDestroyed: 0,
    mission19Completed: false,
    mission20Unlocked: false
  };

  // --- Volatile state. None persisted: a reload restarts the current wave from
  // its stable beginning rather than mid-fight.
  private stationProgress = 0;
  private travelTimer = 0;
  private nereidaIntegrity = 62;
  private atlasStability = 100;
  private dataLeakTimer = 0;
  private activeIntruders = 0;
  private waveKills = 0;

  constructor() {
    this.resetVolatile();
  }

  get started(): boolean {
    return this.state.mission19Started;
  }
  get completed(): boolean {
    return this.state.mission19Completed;
  }
  get step(): Mission19StepId {
    return this.state.mission19Step;
  }
  get stepDefinition(): Mission19StepDefinition {
    return mission19Steps[this.step];
  }

  get defensesRestoredCount(): number {
    return this.state.defensesRestored.filter(Boolean).length;
  }
  defenseRestored(id: NereidaDefenseId): boolean {
    return Boolean(this.state.defensesRestored[DEFENSE_INDEX[id]]);
  }
  /** The defence system currently being brought back, or -1. */
  get activeDefenseIndex(): number {
    if (this.step !== 'restoreDefenses') return -1;
    return this.state.defensesRestored.findIndex((d) => !d);
  }

  get nereidaIntegrityPercent(): number {
    return Number(this.nereidaIntegrity.toFixed(1));
  }
  get atlasStabilityPercent(): number {
    return Number(this.atlasStability.toFixed(1));
  }
  get atlasCritical(): boolean {
    return this.atlasStability <= mission19Tuning.atlasWarningLevel;
  }
  /** True while ground defences are allowed to engage. */
  get defensesOnline(): boolean {
    return this.defensesRestoredCount > 0 && !this.completed;
  }

  /** Which wave, if any, the current step is fighting. */
  get activeWaveCount(): number {
    if (this.step === 'clearAirspace') return mission19Tuning.airWaveCount;
    if (this.step === 'repelGroundIncursion') return mission19Tuning.groundWaveCount;
    return 0;
  }

  get milestoneCount(): number {
    return (
      [
        this.state.emergencyCallConfirmed,
        this.state.airspaceCleared,
        this.state.landedAtNereida,
        this.state.groundIncursionRepelled,
        this.state.atlasProtected,
        this.state.counterattackActivated,
        this.state.dataLeakConfirmed,
        this.state.nereidaWreckageRecovered,
        this.state.arkTargetConfirmed
      ].filter(Boolean).length + this.defensesRestoredCount
    );
  }

  /** Fed by the enemy fleets each frame. Never persisted. */
  setActiveIntruders(count: number): void {
    this.activeIntruders = Math.max(0, count);
  }

  get readout(): NereidaDefenseReadout {
    const waveCount = this.activeWaveCount;
    return {
      nereidaIntegrity: Number(this.nereidaIntegrity.toFixed(1)),
      atlasStability: Number(this.atlasStability.toFixed(1)),
      defensesActive: this.defensesRestoredCount,
      intrudersActive: this.activeIntruders,
      intrudersRemaining: waveCount ? Math.max(0, waveCount - this.waveKills) : 0,
      dataLeakProgress: Number(
        Math.min(100, (this.dataLeakTimer / mission19Tuning.dataLeakSeconds) * 100).toFixed(1)
      ),
      phaseProgress: Number(this.phaseProgress.toFixed(1))
    };
  }

  get phaseProgress(): number {
    const t = mission19Tuning;
    switch (this.step) {
      case 'emergencyTransmission':
        return Math.min(100, (this.stationProgress / t.transmissionSeconds) * 100);
      case 'travelToNereida':
        return Math.min(100, (this.travelTimer / t.travelSeconds) * 100);
      case 'clearAirspace':
      case 'repelGroundIncursion': {
        const count = this.activeWaveCount;
        return count ? Math.min(100, (this.waveKills / count) * 100) : 0;
      }
      case 'landAtNereida':
        return Math.min(100, (this.stationProgress / t.landingSeconds) * 100);
      case 'restoreDefenses': {
        const per = 100 / NEREIDA_DEFENSE_ORDER.length;
        return Math.min(100, this.defensesRestoredCount * per + (this.stationProgress / t.defenseSeconds) * per);
      }
      case 'protectAtlas':
        return Math.min(100, (this.stationProgress / t.gateSealSeconds) * 100);
      case 'chooseOperationalPriority':
        return this.state.operationalPriority === 'none' ? 0 : 100;
      case 'activateCounterattack':
        return Math.min(100, (this.stationProgress / t.batterySeconds) * 100);
      case 'detectDataLeak':
        return Math.min(100, (this.dataLeakTimer / t.dataLeakSeconds) * 100);
      case 'recoverEnemyWreckage':
        return Math.min(100, (this.stationProgress / t.wreckageScanSeconds) * 100);
      case 'confirmArkTarget':
        return Math.min(100, (this.stationProgress / t.confirmSeconds) * 100);
      case 'completed':
        return 100;
      default:
        return 0;
    }
  }

  canStart(mission18: Partial<Mission18Snapshot>): boolean {
    return Boolean(
      !this.started && !this.completed && mission18.mission18Completed && mission18.mission19Unlocked
    );
  }

  start(mission18: Partial<Mission18Snapshot>): boolean {
    if (!this.canStart(mission18)) return false;
    this.state.mission19Started = true;
    this.goToStep('emergencyTransmission');
    this.resetVolatile();
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 1-3: the call, the flight, the arrival
  // -------------------------------------------------------------------------

  advanceTransmission(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'emergencyTransmission') return false;
    if (!this.hold(deltaSeconds, inRange, mission19Tuning.transmissionSeconds)) return false;
    this.state.emergencyCallConfirmed = true;
    this.goToStep('travelToNereida');
    this.stationProgress = 0;
    this.travelTimer = 0;
    return true;
  }

  /** Flight time only accumulates while actually airborne and en route. */
  advanceTravel(deltaSeconds: number, airborne: boolean): boolean {
    if (this.step !== 'travelToNereida') return false;
    if (!airborne) return false;
    this.travelTimer += deltaSeconds;
    if (this.travelTimer < mission19Tuning.travelSeconds) return false;
    this.goToStep('clearAirspace');
    this.waveKills = 0;
    return true;
  }

  /** Landing near the apron, with the airspace already clear. */
  advanceLanding(deltaSeconds: number, atApron: boolean): boolean {
    if (this.step !== 'landAtNereida') return false;
    if (!this.hold(deltaSeconds, atApron, mission19Tuning.landingSeconds)) return false;
    this.state.landedAtNereida = true;
    this.state.arrivedAtNereida = true;
    this.goToStep('restoreDefenses');
    this.stationProgress = 0;
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 4: the three defence systems, restored in order
  // -------------------------------------------------------------------------

  advanceDefenseRestore(deltaSeconds: number, inRange: boolean): NereidaDefenseId | null {
    if (this.step !== 'restoreDefenses') return null;
    const index = this.activeDefenseIndex;
    if (index < 0) return null;
    if (!this.hold(deltaSeconds, inRange, mission19Tuning.defenseSeconds)) return null;
    this.state.defensesRestored[index] = true;
    this.stationProgress = 0;
    if (this.defensesRestoredCount >= NEREIDA_DEFENSE_ORDER.length) {
      this.goToStep('repelGroundIncursion');
      this.waveKills = 0;
    }
    return NEREIDA_DEFENSE_ORDER[index];
  }

  // -------------------------------------------------------------------------
  // Combat bookkeeping
  // -------------------------------------------------------------------------

  /** Report one enemy destroyed. True on the frame the current wave clears. */
  reportIntruderDestroyed(): boolean {
    if (!this.started || this.completed) return false;
    this.state.intrudersDestroyed += 1;
    const count = this.activeWaveCount;
    if (!count) return false;
    this.waveKills += 1;
    if (this.waveKills < count) return false;
    if (this.step === 'clearAirspace') {
      this.state.airspaceCleared = true;
      this.goToStep('landAtNereida');
      this.stationProgress = 0;
      return true;
    }
    if (this.step === 'repelGroundIncursion') {
      this.state.groundIncursionRepelled = true;
      // One unit still slips through to the gate: that is the breach.
      this.goToStep('protectAtlas');
      this.stationProgress = 0;
      this.atlasStability = 72;
      return true;
    }
    return false;
  }

  /** A breach drone reaching its target damages the base, never fatally. */
  damageNereida(amount: number): void {
    if (!this.started || this.completed) return;
    this.nereidaIntegrity = Math.max(
      mission19Tuning.nereidaIntegrityFloor,
      this.nereidaIntegrity - Math.max(0, amount)
    );
  }

  /** Atlas drains while under interference and recovers while held. */
  advanceMeters(deltaSeconds: number, underInterference: boolean): void {
    if (!this.started || this.completed) return;
    const t = mission19Tuning;
    if (underInterference) {
      this.atlasStability = Math.max(t.atlasStabilityFloor, this.atlasStability - deltaSeconds * t.atlasDrainPerSecond);
    } else if (this.atlasStability < 100) {
      this.atlasStability = Math.min(100, this.atlasStability + deltaSeconds * t.atlasRecoveryPerSecond);
    }
  }

  // -------------------------------------------------------------------------
  // Phase 6-7: the gate, then the priority call
  // -------------------------------------------------------------------------

  advanceGateSeal(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'protectAtlas') return false;
    if (!this.hold(deltaSeconds, inRange, mission19Tuning.gateSealSeconds)) return false;
    this.state.atlasProtected = true;
    this.goToStep('chooseOperationalPriority');
    this.stationProgress = 0;
    return true;
  }

  /**
   * Choose what to hold first. This changes dialogue and which system shows
   * damage, but the mission continues identically either way — there is no
   * permanent narrative fork here.
   */
  choosePriority(priority: Exclude<OperationalPriority, 'none'>): boolean {
    if (this.step !== 'chooseOperationalPriority') return false;
    this.state.operationalPriority = priority;
    // Whatever is not prioritised takes the visible hit.
    if (priority !== 'atlasCore') this.atlasStability = Math.max(mission19Tuning.atlasStabilityFloor, this.atlasStability - 12);
    if (priority !== 'defensePower') this.damageNereida(5);
    this.goToStep('activateCounterattack');
    this.stationProgress = 0;
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 8-9: the heavy battery, then the leak
  // -------------------------------------------------------------------------

  advanceCounterattack(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'activateCounterattack') return false;
    if (!this.hold(deltaSeconds, inRange, mission19Tuning.batterySeconds)) return false;
    this.state.counterattackActivated = true;
    this.goToStep('detectDataLeak');
    this.dataLeakTimer = 0;
    return true;
  }

  /**
   * The siphon runs on a timer and always completes: the Coalition leaves with
   * a fraction of the orbital map whatever the pilot does. It happens once.
   */
  advanceDataLeak(deltaSeconds: number): boolean {
    if (this.step !== 'detectDataLeak') return false;
    if (this.state.dataLeakConfirmed) return false;
    this.dataLeakTimer += deltaSeconds;
    if (this.dataLeakTimer < mission19Tuning.dataLeakSeconds) return false;
    this.state.dataLeakConfirmed = true;
    this.goToStep('recoverEnemyWreckage');
    this.stationProgress = 0;
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 10-11: wreckage, link, and the Ark reveal
  // -------------------------------------------------------------------------

  advanceWreckage(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'recoverEnemyWreckage') return false;
    if (!this.hold(deltaSeconds, inRange, mission19Tuning.wreckageScanSeconds)) return false;
    this.state.nereidaWreckageRecovered = true;
    this.state.auroraLinkRepaired = true;
    this.goToStep('confirmArkTarget');
    this.stationProgress = 0;
    return true;
  }

  advanceArkConfirm(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'confirmArkTarget') return false;
    if (!this.hold(deltaSeconds, inRange, mission19Tuning.confirmSeconds)) return false;
    this.completeDefense();
    return true;
  }

  private completeDefense(): void {
    this.state.emergencyCallConfirmed = true;
    this.state.arrivedAtNereida = true;
    this.state.airspaceCleared = true;
    this.state.landedAtNereida = true;
    this.state.defensesRestored = [true, true, true];
    this.state.groundIncursionRepelled = true;
    this.state.atlasProtected = true;
    if (this.state.operationalPriority === 'none') this.state.operationalPriority = 'atlasCore';
    this.state.counterattackActivated = true;
    this.state.dataLeakConfirmed = true;
    this.state.nereidaWreckageRecovered = true;
    this.state.auroraLinkRepaired = true;
    this.state.arkTargetConfirmed = true;
    this.state.mission19Completed = true;
    this.state.mission20Unlocked = true;
    this.goToStep('completed');
  }

  // -------------------------------------------------------------------------

  /**
   * Move to a step, never backwards. Every transition goes through this, so no
   * fast-forward or re-entrant call can rewind an already-advanced mission.
   */
  private goToStep(step: Mission19StepId): boolean {
    if (stepIndex(step) <= stepIndex(this.state.mission19Step)) return false;
    this.state.mission19Step = step;
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
  // Debug fast-forwards. Each pulls every earlier phase forward with it.
  // -------------------------------------------------------------------------

  forceEmergencyConfirmed(): void {
    if (!this.started) return;
    this.state.emergencyCallConfirmed = true;
    if (this.step === 'emergencyTransmission') {
      this.goToStep('travelToNereida');
      this.travelTimer = 0;
    }
  }
  forceAirspaceCleared(): void {
    if (!this.started) return;
    this.forceEmergencyConfirmed();
    if (this.step === 'travelToNereida') {
      this.travelTimer = mission19Tuning.travelSeconds;
      this.goToStep('clearAirspace');
      this.waveKills = 0;
    }
    if (this.step === 'clearAirspace') {
      this.state.intrudersDestroyed += Math.max(0, mission19Tuning.airWaveCount - this.waveKills);
      this.waveKills = mission19Tuning.airWaveCount;
      this.state.airspaceCleared = true;
      this.goToStep('landAtNereida');
      this.stationProgress = 0;
    }
  }
  forceLanded(): void {
    if (!this.started) return;
    this.forceAirspaceCleared();
    this.state.landedAtNereida = true;
    this.state.arrivedAtNereida = true;
    if (this.step === 'landAtNereida') {
      this.goToStep('restoreDefenses');
      this.stationProgress = 0;
    }
  }
  /** Restore defences up to and including `index`. */
  forceDefensesRestored(index: number): void {
    if (!this.started || index < 0 || index >= NEREIDA_DEFENSE_ORDER.length) return;
    this.forceLanded();
    for (let i = 0; i <= index; i += 1) this.state.defensesRestored[i] = true;
    if (this.defensesRestoredCount < NEREIDA_DEFENSE_ORDER.length) {
      this.goToStep('restoreDefenses');
      this.stationProgress = 0;
    } else {
      this.goToStep('repelGroundIncursion');
      this.waveKills = 0;
    }
  }
  forceIncursionRepelled(): void {
    if (!this.started) return;
    this.forceDefensesRestored(NEREIDA_DEFENSE_ORDER.length - 1);
    if (this.step === 'repelGroundIncursion') {
      this.state.intrudersDestroyed += Math.max(0, mission19Tuning.groundWaveCount - this.waveKills);
      this.waveKills = mission19Tuning.groundWaveCount;
      this.state.groundIncursionRepelled = true;
      this.goToStep('protectAtlas');
      this.stationProgress = 0;
      this.atlasStability = 72;
    }
  }
  forceAtlasProtected(): void {
    if (!this.started) return;
    this.forceIncursionRepelled();
    this.state.atlasProtected = true;
    if (this.step === 'protectAtlas') {
      this.goToStep('chooseOperationalPriority');
      this.stationProgress = 0;
    }
  }
  forcePriority(priority: Exclude<OperationalPriority, 'none'>): void {
    if (!this.started) return;
    this.forceAtlasProtected();
    if (this.step === 'chooseOperationalPriority') this.choosePriority(priority);
  }
  forceCounterattack(): void {
    if (!this.started) return;
    this.forcePriority('atlasCore');
    this.state.counterattackActivated = true;
    if (this.step === 'activateCounterattack') {
      this.goToStep('detectDataLeak');
      this.dataLeakTimer = 0;
    }
  }
  forceDataLeak(): void {
    if (!this.started) return;
    this.forceCounterattack();
    if (this.step === 'detectDataLeak' && !this.state.dataLeakConfirmed) {
      this.dataLeakTimer = mission19Tuning.dataLeakSeconds;
      this.state.dataLeakConfirmed = true;
      this.goToStep('recoverEnemyWreckage');
      this.stationProgress = 0;
    }
  }
  forceWreckageRecovered(): void {
    if (!this.started) return;
    this.forceDataLeak();
    this.state.nereidaWreckageRecovered = true;
    this.state.auroraLinkRepaired = true;
    if (this.step === 'recoverEnemyWreckage') {
      this.goToStep('confirmArkTarget');
      this.stationProgress = 0;
    }
  }
  forceComplete(): void {
    if (!this.started) return;
    this.completeDefense();
  }

  // -------------------------------------------------------------------------

  restore(savedState: Partial<Mission19Snapshot> | undefined): void {
    this.reset();
    if (!savedState?.mission19Started) return;
    Object.assign(this.state, savedState);
    if (!mission19Steps[this.state.mission19Step]) this.goToStep('emergencyTransmission');
    const defenses = this.state.defensesRestored;
    this.state.defensesRestored = Array.from({ length: NEREIDA_DEFENSE_ORDER.length }, (_, i) =>
      Array.isArray(defenses) ? Boolean(defenses[i]) : false
    );
    this.state.intrudersDestroyed = Math.max(0, Math.floor(this.state.intrudersDestroyed || 0));
    const priority = this.state.operationalPriority;
    if (priority !== 'atlasCore' && priority !== 'pleyadianRecords' && priority !== 'defensePower') {
      this.state.operationalPriority = 'none';
    }
    this.state.mission20Unlocked = this.state.mission20Unlocked || this.state.mission19Completed;

    // A reload never resumes mid-fight: the current wave restarts from its
    // stable beginning with no live enemies, no projectiles and no corrupt
    // physical state. Phases already completed are preserved because the step
    // itself has moved past them.
    this.resetVolatile();
    // Steps entered under pressure must reproduce that pressure, not a
    // pristine base, so the situation still reads as an attack.
    if (this.state.landedAtNereida) this.nereidaIntegrity = 52;
    if (this.state.mission19Step === 'protectAtlas' && !this.state.atlasProtected) this.atlasStability = 72;
    // The leak is one-shot: a reload past it must never replay or re-run it.
    if (this.state.dataLeakConfirmed) this.dataLeakTimer = mission19Tuning.dataLeakSeconds;
  }

  snapshot(): Mission19Snapshot {
    return { ...this.state, defensesRestored: [...this.state.defensesRestored] };
  }

  reset(): void {
    Object.assign(this.state, {
      mission19Started: false,
      mission19Step: 'inactive' as Mission19StepId,
      emergencyCallConfirmed: false,
      arrivedAtNereida: false,
      airspaceCleared: false,
      landedAtNereida: false,
      defensesRestored: [false, false, false],
      groundIncursionRepelled: false,
      atlasProtected: false,
      operationalPriority: 'none' as OperationalPriority,
      counterattackActivated: false,
      dataLeakConfirmed: false,
      nereidaWreckageRecovered: false,
      auroraLinkRepaired: false,
      arkTargetConfirmed: false,
      intrudersDestroyed: 0,
      mission19Completed: false,
      mission20Unlocked: false
    });
    this.resetVolatile();
  }

  private resetVolatile(): void {
    this.stationProgress = 0;
    this.travelTimer = 0;
    this.nereidaIntegrity = 62;
    this.atlasStability = 100;
    this.dataLeakTimer = 0;
    this.activeIntruders = 0;
    this.waveKills = 0;
  }
}
