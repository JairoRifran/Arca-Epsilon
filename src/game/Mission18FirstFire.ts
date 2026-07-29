import {
  droneWaveDefinitions,
  mission18Steps,
  mission18Tuning,
  TURRET_COUNT,
  type DroneWaveId,
  type Mission18StepDefinition,
  type Mission18StepId
} from '../assets/mission18Definitions';
import type { Mission17Snapshot } from './Mission17DefensePreparations';

export type Mission18Snapshot = {
  mission18Started: boolean;
  mission18Step: Mission18StepId;
  emergencyProtocolActive: boolean;
  hostilesIdentified: boolean;
  defenseWeaponsAuthorized: boolean;
  firstWaveCleared: boolean;
  criticalSystemStabilized: boolean;
  interceptComplete: boolean;
  shieldDefended: boolean;
  /** The runner always gets its packet out: the story needs Nereida targeted. */
  enemyTransmissionSent: boolean;
  /** True when the runner was shot down after transmitting (flavour only). */
  finalDroneDestroyed: boolean;
  wreckageRecovered: boolean;
  nereidaTargetConfirmed: boolean;
  /** Total drones destroyed across the engagement, for the HUD and the log. */
  dronesDestroyed: number;
  mission18Completed: boolean;
  mission19Unlocked: boolean;
};

/** Live combat readouts. Derived every frame, never persisted. */
export type FirstFireReadout = {
  /** Drones currently alive. */
  dronesActive: number;
  /** Drones destroyed so far. */
  dronesDestroyed: number;
  /** Drones still expected in the current wave (alive + unspawned). */
  dronesRemaining: number;
  /** Shield dome integrity, 0..100. */
  shieldIntegrity: number;
  /** Defensive reserve energy driving the batteries, 0..100. */
  defenseEnergy: number;
  /** Integrity of the struck critical system, 0..100. */
  criticalIntegrity: number;
  /** Progress of the runner's transmission, 0..100. */
  transmissionProgress: number;
  /** Progress of whatever interaction the current step is running, 0..100. */
  phaseProgress: number;
};

const WAVE_BY_STEP: Partial<Record<Mission18StepId, DroneWaveId>> = {
  firstWave: 'first',
  interceptDrones: 'intercept',
  defendShield: 'shield',
  pursueFinalDrone: 'runner'
};

/**
 * Mission 18 "Primer Fuego": Aurora's first armed engagement.
 *
 * Strictly sequential. Combat is resolved through the ship's existing
 * WeaponSystem and Aurora's point-defence batteries — this class owns only the
 * mission state, the wave bookkeeping and the resource meters (shield, defence
 * energy, the struck system). It never owns geometry or per-frame physics.
 *
 * Nothing here can be lost irreversibly: the batteries whittle waves down on
 * their own, a collapsed shield can be restored, the critical system can always
 * be repaired, and each wave boundary is a stable save checkpoint.
 */
export class Mission18FirstFire {
  readonly missionId = 'mission-18-first-fire';
  readonly missionName = 'Misión 18: Primer Fuego';

  readonly state: Mission18Snapshot = {
    mission18Started: false,
    mission18Step: 'inactive',
    emergencyProtocolActive: false,
    hostilesIdentified: false,
    defenseWeaponsAuthorized: false,
    firstWaveCleared: false,
    criticalSystemStabilized: false,
    interceptComplete: false,
    shieldDefended: false,
    enemyTransmissionSent: false,
    finalDroneDestroyed: false,
    wreckageRecovered: false,
    nereidaTargetConfirmed: false,
    dronesDestroyed: 0,
    mission18Completed: false,
    mission19Unlocked: false
  };

  // --- Volatile combat state. None persisted: a reload restarts the current
  // wave from its stable beginning rather than mid-dogfight.
  private terminalProgress = 0;
  /** Drones alive right now, pushed in by the drone fleet each frame. */
  private activeDrones = 0;
  /** Drones of the current wave already destroyed. */
  private waveKills = 0;
  private shieldIntegrity = 100;
  private defenseEnergy = 100;
  private criticalIntegrity = 100;
  private transmissionTimer = 0;
  private shieldRestoreProgress = 0;

  constructor() {
    this.resetVolatile();
  }

  get started(): boolean {
    return this.state.mission18Started;
  }
  get completed(): boolean {
    return this.state.mission18Completed;
  }
  get step(): Mission18StepId {
    return this.state.mission18Step;
  }
  get stepDefinition(): Mission18StepDefinition {
    return mission18Steps[this.step];
  }

  /** The wave the current step is fighting, or undefined outside combat. */
  get activeWave(): DroneWaveId | undefined {
    return WAVE_BY_STEP[this.step];
  }

  get waveDefinition() {
    const id = this.activeWave;
    return id ? droneWaveDefinitions.find((w) => w.id === id) : undefined;
  }

  /** True while the batteries are allowed to engage. */
  get weaponsFree(): boolean {
    return this.state.defenseWeaponsAuthorized && !this.completed;
  }

  get shieldIntegrityPercent(): number {
    return Number(this.shieldIntegrity.toFixed(1));
  }
  get defenseEnergyPercent(): number {
    return Number(this.defenseEnergy.toFixed(1));
  }
  get criticalIntegrityPercent(): number {
    return Number(this.criticalIntegrity.toFixed(1));
  }
  get shieldCollapsed(): boolean {
    return this.shieldIntegrity <= mission18Tuning.shieldCollapseLevel;
  }
  /** True while the batteries have enough reserve to shoot. */
  get batteriesPowered(): boolean {
    return this.defenseEnergy > mission18Tuning.energyFloor;
  }

  get milestoneCount(): number {
    return (
      [
        this.state.emergencyProtocolActive,
        this.state.hostilesIdentified,
        this.state.defenseWeaponsAuthorized,
        this.state.firstWaveCleared,
        this.state.criticalSystemStabilized,
        this.state.interceptComplete,
        this.state.shieldDefended,
        this.state.enemyTransmissionSent,
        this.state.wreckageRecovered,
        this.state.nereidaTargetConfirmed
      ].filter(Boolean).length + Math.min(TURRET_COUNT, this.state.dronesDestroyed)
    );
  }

  /** Fed by the drone fleet each frame. Never persisted. */
  setActiveDrones(count: number): void {
    this.activeDrones = Math.max(0, count);
  }

  get readout(): FirstFireReadout {
    const wave = this.waveDefinition;
    const remaining = wave ? Math.max(0, wave.count - this.waveKills) : 0;
    return {
      dronesActive: this.activeDrones,
      dronesDestroyed: this.state.dronesDestroyed,
      dronesRemaining: remaining,
      shieldIntegrity: Number(this.shieldIntegrity.toFixed(1)),
      defenseEnergy: Number(this.defenseEnergy.toFixed(1)),
      criticalIntegrity: Number(this.criticalIntegrity.toFixed(1)),
      transmissionProgress: Number(
        Math.min(100, (this.transmissionTimer / mission18Tuning.runnerTransmitSeconds) * 100).toFixed(1)
      ),
      phaseProgress: Number(this.phaseProgress.toFixed(1))
    };
  }

  get phaseProgress(): number {
    const t = mission18Tuning;
    const wave = this.waveDefinition;
    switch (this.step) {
      case 'realAlert':
        return Math.min(100, (this.terminalProgress / t.alertSeconds) * 100);
      case 'identifyHostiles':
        return Math.min(100, (this.terminalProgress / t.identifySeconds) * 100);
      case 'authorizeDefenseWeapons':
        return Math.min(100, (this.terminalProgress / t.authorizeSeconds) * 100);
      case 'firstWave':
      case 'interceptDrones':
      case 'defendShield':
        return wave ? Math.min(100, (this.waveKills / wave.count) * 100) : 0;
      case 'defendCriticalSystem':
        return Math.min(100, (this.terminalProgress / t.repairSeconds) * 100);
      case 'boardShip':
        return 0;
      case 'pursueFinalDrone':
        return Math.min(100, (this.transmissionTimer / t.runnerTransmitSeconds) * 100);
      case 'recoverWreckage':
        return Math.min(100, (this.terminalProgress / t.wreckageScanSeconds) * 100);
      case 'confirmNereidaTarget':
        return Math.min(100, (this.terminalProgress / t.confirmSeconds) * 100);
      case 'completed':
        return 100;
      default:
        return 0;
    }
  }

  canStart(mission17: Partial<Mission17Snapshot>): boolean {
    return Boolean(
      !this.started && !this.completed && mission17.mission17Completed && mission17.mission18Unlocked
    );
  }

  start(mission17: Partial<Mission17Snapshot>): boolean {
    if (!this.canStart(mission17)) return false;
    this.state.mission18Started = true;
    this.state.mission18Step = 'realAlert';
    this.resetVolatile();
    return true;
  }

  // -------------------------------------------------------------------------
  // Phases 1-3: alert, identification, weapons authorisation
  // -------------------------------------------------------------------------

  advanceAlert(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'realAlert') return false;
    if (!this.hold(deltaSeconds, inRange, mission18Tuning.alertSeconds)) return false;
    this.state.emergencyProtocolActive = true;
    this.state.mission18Step = 'identifyHostiles';
    this.terminalProgress = 0;
    return true;
  }

  advanceIdentify(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'identifyHostiles') return false;
    if (!this.hold(deltaSeconds, inRange, mission18Tuning.identifySeconds)) return false;
    this.state.hostilesIdentified = true;
    this.state.mission18Step = 'authorizeDefenseWeapons';
    this.terminalProgress = 0;
    return true;
  }

  advanceAuthorize(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'authorizeDefenseWeapons') return false;
    if (!this.hold(deltaSeconds, inRange, mission18Tuning.authorizeSeconds)) return false;
    this.state.defenseWeaponsAuthorized = true;
    this.startWave('firstWave');
    return true;
  }

  private startWave(step: Mission18StepId): void {
    this.state.mission18Step = step;
    this.waveKills = 0;
    this.terminalProgress = 0;
  }

  // -------------------------------------------------------------------------
  // Combat bookkeeping — driven by the drone fleet and the batteries
  // -------------------------------------------------------------------------

  /**
   * Report one drone destroyed. Returns true on the frame the current wave is
   * cleared, so the caller can advance the mission and fire its dialogue.
   */
  reportDroneDestroyed(): boolean {
    if (!this.started || this.completed) return false;
    this.state.dronesDestroyed += 1;
    const wave = this.waveDefinition;
    if (!wave) return false;
    this.waveKills += 1;
    if (this.waveKills < wave.count) return false;
    return this.completeWave(wave.id);
  }

  private completeWave(id: DroneWaveId): boolean {
    switch (id) {
      case 'first':
        this.state.firstWaveCleared = true;
        // The breach happens as the wave breaks: one drone got through.
        this.state.mission18Step = 'defendCriticalSystem';
        this.criticalIntegrity = 34;
        this.terminalProgress = 0;
        return true;
      case 'intercept':
        this.state.interceptComplete = true;
        this.startWave('defendShield');
        return true;
      case 'shield':
        this.state.shieldDefended = true;
        this.startWave('pursueFinalDrone');
        this.transmissionTimer = 0;
        return true;
      case 'runner':
        // Shooting the runner down does not stop the packet: it always gets
        // out. This only records that Aurora killed it on the way.
        this.state.finalDroneDestroyed = true;
        this.state.enemyTransmissionSent = true;
        this.state.mission18Step = 'recoverWreckage';
        this.terminalProgress = 0;
        return true;
      default:
        return false;
    }
  }

  /** Damage the shield dome. Never a game over: it can be restored. */
  damageShield(amount: number): void {
    if (!this.started || this.completed) return;
    this.shieldIntegrity = Math.max(0, this.shieldIntegrity - Math.max(0, amount));
  }

  /** Damage the struck critical system while the breach phase is live. */
  damageCriticalSystem(amount: number): void {
    if (this.step !== 'defendCriticalSystem') return;
    this.criticalIntegrity = Math.max(0, this.criticalIntegrity - Math.max(0, amount));
  }

  /** Spend reserve energy for one battery shot. Returns false when too low. */
  spendDefenseEnergy(amount: number): boolean {
    if (this.defenseEnergy <= mission18Tuning.energyFloor) return false;
    this.defenseEnergy = Math.max(0, this.defenseEnergy - Math.max(0, amount));
    return true;
  }

  /** Meters recover on their own between pressure: the reserve is real. */
  advanceMeters(deltaSeconds: number): void {
    if (!this.started || this.completed) return;
    const t = mission18Tuning;
    this.defenseEnergy = Math.min(100, this.defenseEnergy + deltaSeconds * t.energyRecoveryPerSecond);
    // The dome only knits itself back while it is not being hit; the shield
    // wave drains it faster than this recovers.
    if (this.step !== 'defendShield' && this.shieldIntegrity > 0) {
      this.shieldIntegrity = Math.min(100, this.shieldIntegrity + deltaSeconds * t.shieldRecoveryPerSecond);
    }
  }

  /**
   * Bring a collapsed dome back up. Deliberately possible at any time — the
   * shield falling is a setback with narrative weight, never a failure state.
   */
  advanceShieldRestore(deltaSeconds: number, working: boolean): boolean {
    if (!this.shieldCollapsed) return false;
    if (!working) {
      this.shieldRestoreProgress = Math.max(0, this.shieldRestoreProgress - deltaSeconds);
      return false;
    }
    this.shieldRestoreProgress += deltaSeconds;
    if (this.shieldRestoreProgress < mission18Tuning.shieldRestoreSeconds) return false;
    this.shieldRestoreProgress = 0;
    this.shieldIntegrity = 45;
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 5: repairing the struck system under fire
  // -------------------------------------------------------------------------

  advanceRepair(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'defendCriticalSystem') return false;
    if (!this.hold(deltaSeconds, inRange, mission18Tuning.repairSeconds)) return false;
    this.state.criticalSystemStabilized = true;
    this.criticalIntegrity = 100;
    this.state.mission18Step = 'boardShip';
    this.terminalProgress = 0;
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 6: boarding, then the intercept
  // -------------------------------------------------------------------------

  /** Called once the pilot is actually inside the ship and airborne. */
  confirmBoarded(): boolean {
    if (this.step !== 'boardShip') return false;
    this.startWave('interceptDrones');
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 8: the runner's transmission
  // -------------------------------------------------------------------------

  /**
   * The runner transmits on a timer. When it completes, the packet is away and
   * the mission moves on whether or not the drone survived — the story needs
   * Nereida to be targeted either way.
   */
  advanceTransmission(deltaSeconds: number): boolean {
    if (this.step !== 'pursueFinalDrone') return false;
    this.transmissionTimer += deltaSeconds;
    if (this.transmissionTimer < mission18Tuning.runnerTransmitSeconds) return false;
    this.state.enemyTransmissionSent = true;
    this.state.mission18Step = 'recoverWreckage';
    this.terminalProgress = 0;
    return true;
  }

  // -------------------------------------------------------------------------
  // Phases 9-10: wreckage, then the Nereida reveal
  // -------------------------------------------------------------------------

  advanceWreckage(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'recoverWreckage') return false;
    if (!this.hold(deltaSeconds, inRange, mission18Tuning.wreckageScanSeconds)) return false;
    this.state.wreckageRecovered = true;
    this.state.mission18Step = 'confirmNereidaTarget';
    this.terminalProgress = 0;
    return true;
  }

  advanceNereidaConfirm(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'confirmNereidaTarget') return false;
    if (!this.hold(deltaSeconds, inRange, mission18Tuning.confirmSeconds)) return false;
    this.completeFirstFire();
    return true;
  }

  private completeFirstFire(): void {
    this.state.emergencyProtocolActive = true;
    this.state.hostilesIdentified = true;
    this.state.defenseWeaponsAuthorized = true;
    this.state.firstWaveCleared = true;
    this.state.criticalSystemStabilized = true;
    this.state.interceptComplete = true;
    this.state.shieldDefended = true;
    this.state.enemyTransmissionSent = true;
    this.state.wreckageRecovered = true;
    this.state.nereidaTargetConfirmed = true;
    this.state.mission18Completed = true;
    this.state.mission19Unlocked = true;
    this.state.mission18Step = 'completed';
    this.criticalIntegrity = 100;
  }

  // -------------------------------------------------------------------------

  private hold(deltaSeconds: number, inRange: boolean, seconds: number): boolean {
    if (!inRange) {
      this.terminalProgress = Math.max(0, this.terminalProgress - deltaSeconds * 1.5);
      return false;
    }
    this.terminalProgress += deltaSeconds;
    if (this.terminalProgress < seconds) return false;
    this.terminalProgress = seconds;
    return true;
  }

  // -------------------------------------------------------------------------
  // Debug fast-forwards. Each pulls every earlier phase forward with it.
  // -------------------------------------------------------------------------

  forceEmergencyProtocol(): void {
    if (!this.started) return;
    this.state.emergencyProtocolActive = true;
    if (this.step === 'realAlert') {
      this.state.mission18Step = 'identifyHostiles';
      this.terminalProgress = 0;
    }
  }
  forceHostilesIdentified(): void {
    if (!this.started) return;
    this.forceEmergencyProtocol();
    this.state.hostilesIdentified = true;
    if (this.step === 'identifyHostiles') {
      this.state.mission18Step = 'authorizeDefenseWeapons';
      this.terminalProgress = 0;
    }
  }
  forceWeaponsAuthorized(): void {
    if (!this.started) return;
    this.forceHostilesIdentified();
    this.state.defenseWeaponsAuthorized = true;
    if (this.step === 'authorizeDefenseWeapons') this.startWave('firstWave');
  }
  forceFirstWaveCleared(): void {
    if (!this.started) return;
    this.forceWeaponsAuthorized();
    if (this.step === 'firstWave') {
      const wave = this.waveDefinition;
      this.state.dronesDestroyed += Math.max(0, (wave?.count ?? 0) - this.waveKills);
      this.waveKills = wave?.count ?? 0;
      this.completeWave('first');
    }
  }
  forceCriticalStabilized(): void {
    if (!this.started) return;
    this.forceFirstWaveCleared();
    this.state.criticalSystemStabilized = true;
    this.criticalIntegrity = 100;
    if (this.step === 'defendCriticalSystem') {
      this.state.mission18Step = 'boardShip';
      this.terminalProgress = 0;
    }
  }
  forceBoarded(): void {
    if (!this.started) return;
    this.forceCriticalStabilized();
    if (this.step === 'boardShip') this.startWave('interceptDrones');
  }
  forceInterceptComplete(): void {
    if (!this.started) return;
    this.forceBoarded();
    if (this.step === 'interceptDrones') {
      const wave = this.waveDefinition;
      this.state.dronesDestroyed += Math.max(0, (wave?.count ?? 0) - this.waveKills);
      this.waveKills = wave?.count ?? 0;
      this.completeWave('intercept');
    }
  }
  forceShieldDefended(): void {
    if (!this.started) return;
    this.forceInterceptComplete();
    if (this.step === 'defendShield') {
      const wave = this.waveDefinition;
      this.state.dronesDestroyed += Math.max(0, (wave?.count ?? 0) - this.waveKills);
      this.waveKills = wave?.count ?? 0;
      this.completeWave('shield');
    }
    this.shieldIntegrity = Math.max(this.shieldIntegrity, 45);
  }
  forceTransmissionSent(): void {
    if (!this.started) return;
    this.forceShieldDefended();
    this.state.enemyTransmissionSent = true;
    if (this.step === 'pursueFinalDrone') {
      this.transmissionTimer = mission18Tuning.runnerTransmitSeconds;
      this.state.mission18Step = 'recoverWreckage';
      this.terminalProgress = 0;
    }
  }
  forceWreckageRecovered(): void {
    if (!this.started) return;
    this.forceTransmissionSent();
    this.state.wreckageRecovered = true;
    if (this.step === 'recoverWreckage') {
      this.state.mission18Step = 'confirmNereidaTarget';
      this.terminalProgress = 0;
    }
  }
  forceComplete(): void {
    if (!this.started) return;
    this.completeFirstFire();
  }

  // -------------------------------------------------------------------------

  restore(savedState: Partial<Mission18Snapshot> | undefined): void {
    this.reset();
    if (!savedState?.mission18Started) return;
    Object.assign(this.state, savedState);
    if (!mission18Steps[this.state.mission18Step]) this.state.mission18Step = 'realAlert';
    this.state.dronesDestroyed = Math.max(0, Math.floor(this.state.dronesDestroyed || 0));
    this.state.mission19Unlocked = this.state.mission19Unlocked || this.state.mission18Completed;

    // A reload never resumes mid-dogfight: the current wave restarts from its
    // stable beginning with a full drone count, no live projectiles and no
    // half-damaged meters. Waves already cleared are never re-flown, because
    // the step itself has moved past them.
    this.resetVolatile();
    // The breach step is entered with the mast already struck, so restoring
    // into it must reproduce that pressure rather than a pristine antenna.
    if (this.state.mission18Step === 'defendCriticalSystem' && !this.state.criticalSystemStabilized) {
      this.criticalIntegrity = 34;
    }
  }

  snapshot(): Mission18Snapshot {
    return { ...this.state };
  }

  reset(): void {
    Object.assign(this.state, {
      mission18Started: false,
      mission18Step: 'inactive' as Mission18StepId,
      emergencyProtocolActive: false,
      hostilesIdentified: false,
      defenseWeaponsAuthorized: false,
      firstWaveCleared: false,
      criticalSystemStabilized: false,
      interceptComplete: false,
      shieldDefended: false,
      enemyTransmissionSent: false,
      finalDroneDestroyed: false,
      wreckageRecovered: false,
      nereidaTargetConfirmed: false,
      dronesDestroyed: 0,
      mission18Completed: false,
      mission19Unlocked: false
    });
    this.resetVolatile();
  }

  private resetVolatile(): void {
    this.terminalProgress = 0;
    this.activeDrones = 0;
    this.waveKills = 0;
    this.shieldIntegrity = 100;
    this.defenseEnergy = 100;
    this.criticalIntegrity = 100;
    this.transmissionTimer = 0;
    this.shieldRestoreProgress = 0;
  }
}
