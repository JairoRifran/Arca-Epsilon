import {
  mission16Steps,
  mission16Tuning,
  NODE_COUNT,
  PROTOCOL_ORDER,
  type Mission16StepDefinition,
  type Mission16StepId,
  type ProtocolId
} from '../assets/mission16Definitions';
import type { Mission15Snapshot } from './Mission15AuroraSabotage';

export type Mission16Snapshot = {
  mission16Started: boolean;
  mission16Step: Mission16StepId;
  alertReceived: boolean;
  /** Link frequencies calibrated so far, 0..3. */
  linkFrequenciesCalibrated: number;
  tripleLinkEstablished: boolean;
  atlasKeyRecovered: boolean;
  /** The seed-world revelation is consumed exactly once. */
  pleyadianSeedRevealed: boolean;
  /** Detection / shield / alert-network prototypes, unlocked in order. */
  protocolsUnlocked: boolean[];
  /** Per Pleyadian node, ordered Aurora / Nereida / Arca. */
  nodesSynchronized: boolean[];
  simulationComplete: boolean;
  defensePlansRecovered: boolean;
  mission16Completed: boolean;
  mission17Unlocked: boolean;
};

/** Live protocol readouts. Derived every frame, never persisted. */
export type PleyadianProtocolReadout = {
  /** Link frequencies bound, 0..3. */
  linkFrequencies: number;
  /** Protocol prototypes compiled, 0..3. */
  protocols: number;
  /** Nodes synchronised, 0..3. */
  nodesSynced: number;
  /** Alignment readout for the active node, 0..100. Zero outside its range. */
  nodeSignal: number;
  /** Emitter phase of the active node, 0..100. */
  nodePhase: number;
  /** Target harmonic phase the emitter must sit on, 0..100. */
  nodePhaseTarget: number;
  /** Progress of whatever interaction the current step is running, 0..100. */
  phaseProgress: number;
};

const PROTOCOL_INDEX: Record<ProtocolId, number> = { detection: 0, shield: 1, alertNetwork: 2 };

/**
 * Mission 16 "Protocolo Pleyadiano": the Pleyadians hand humanity an incomplete
 * defensive protocol and teach Aurora to build it. Strictly sequential — no
 * step can be reached out of order — and, like M14/M15, nothing is lost
 * irreversibly: walking off a station costs its banked seconds, never the run.
 */
export class Mission16PleyadianProtocol {
  readonly missionId = 'mission-16-pleyadian-protocol';
  readonly missionName = 'Misión 16: Protocolo Pleyadiano';

  readonly state: Mission16Snapshot = {
    mission16Started: false,
    mission16Step: 'inactive',
    alertReceived: false,
    linkFrequenciesCalibrated: 0,
    tripleLinkEstablished: false,
    atlasKeyRecovered: false,
    pleyadianSeedRevealed: false,
    protocolsUnlocked: [false, false, false],
    nodesSynchronized: [false, false, false],
    simulationComplete: false,
    defensePlansRecovered: false,
    mission16Completed: false,
    mission17Unlocked: false
  };

  // --- Volatile interaction state. None persisted: a reload drops to the start
  // of the current phase rather than into a half-finished interaction.
  /** Hold accumulator shared by every single-station terminal step. */
  private terminalProgress = 0;
  /** Seconds the seed-world revelation has been on air. */
  private revelationTimer = 0;
  /** Sync phase: emitter phase of the active node and the stable time held. */
  private nodePhaseValue = 50;

  /** True once a press has captured the harmonic; cleared by leaving range. */
  private nodePhaseLocked = false;
  private nodeSyncHeld = 0;
  /** Distance to the node currently being aligned. */
  private nodeSearchDistance = Number.POSITIVE_INFINITY;

  constructor() {
    this.resetVolatile();
  }

  get started(): boolean {
    return this.state.mission16Started;
  }

  get completed(): boolean {
    return this.state.mission16Completed;
  }

  get step(): Mission16StepId {
    return this.state.mission16Step;
  }

  get stepDefinition(): Mission16StepDefinition {
    return mission16Steps[this.step];
  }

  get linkFrequenciesCalibrated(): number {
    return this.state.linkFrequenciesCalibrated;
  }

  get protocolsUnlockedCount(): number {
    return this.state.protocolsUnlocked.filter(Boolean).length;
  }

  protocolUnlocked(id: ProtocolId): boolean {
    return Boolean(this.state.protocolsUnlocked[PROTOCOL_INDEX[id]]);
  }

  get nodesSynchronizedCount(): number {
    return this.state.nodesSynchronized.filter(Boolean).length;
  }

  nodeSynchronized(index: number): boolean {
    return Boolean(this.state.nodesSynchronized[index]);
  }

  /** Index of the node the sync step is currently aligning, or -1. */
  get activeNodeIndex(): number {
    if (this.step !== 'synchronizeNodes') return -1;
    const index = this.state.nodesSynchronized.findIndex((synced) => !synced);
    return index;
  }

  get milestoneCount(): number {
    return (
      [
        this.state.alertReceived,
        this.state.tripleLinkEstablished,
        this.state.atlasKeyRecovered,
        this.state.pleyadianSeedRevealed,
        this.state.simulationComplete,
        this.state.defensePlansRecovered
      ].filter(Boolean).length +
      this.protocolsUnlockedCount +
      this.nodesSynchronizedCount
    );
  }

  /** Fed each frame while the sync step is live. Never persisted. */
  setNodeSearchDistance(distance: number): void {
    this.nodeSearchDistance = distance;
  }

  isNodeRevealed(): boolean {
    return this.nodeSearchDistance <= mission16Tuning.nodeRange;
  }

  /**
   * The harmonic phase a node drifts through. Two offset sine terms keep it
   * deterministic, so the sync phase is reproducible in a test.
   */
  nodePhaseTarget(elapsed: number): number {
    return 50 + Math.sin(elapsed * 0.4) * 25 + Math.sin(elapsed * 0.9) * 10;
  }

  isPhaseStable(elapsed: number): boolean {
    return Math.abs(this.nodePhaseValue - this.nodePhaseTarget(elapsed)) <= mission16Tuning.phaseTolerance;
  }

  get readout(): PleyadianProtocolReadout {
    const elapsedSafe = 0;
    return {
      linkFrequencies: this.state.linkFrequenciesCalibrated,
      protocols: this.protocolsUnlockedCount,
      nodesSynced: this.nodesSynchronizedCount,
      nodeSignal:
        this.step === 'synchronizeNodes'
          ? Math.round(
              Math.max(0, 1 - Math.min(1, this.nodeSearchDistance / mission16Tuning.nodeSearchRange)) * 100
            )
          : 0,
      nodePhase: Number(this.nodePhaseValue.toFixed(1)),
      nodePhaseTarget: Number(this.nodePhaseTarget(elapsedSafe).toFixed(1)),
      phaseProgress: Number(this.phaseProgress.toFixed(1))
    };
  }

  /** Progress of the current interaction, 0..100. */
  get phaseProgress(): number {
    const t = mission16Tuning;
    switch (this.step) {
      case 'accessTerminal':
        return Math.min(100, (this.terminalProgress / t.accessSeconds) * 100);
      case 'establishTripleLink': {
        const per = 100 / NODE_COUNT;
        return Math.min(
          100,
          this.state.linkFrequenciesCalibrated * per +
            (this.terminalProgress / t.linkFrequencySeconds) * per
        );
      }
      case 'recoverAtlasKey':
        return Math.min(100, (this.terminalProgress / t.atlasKeySeconds) * 100);
      case 'revealSeedWorld':
        return Math.min(100, (this.revelationTimer / t.revelationSeconds) * 100);
      case 'unlockDetection':
      case 'unlockShield':
      case 'unlockAlertNetwork':
        return Math.min(100, (this.terminalProgress / t.protocolSeconds) * 100);
      case 'synchronizeNodes':
        return Math.min(100, (this.nodeSyncHeld / t.nodeSyncSeconds) * 100);
      case 'runSimulation':
        return Math.min(100, (this.terminalProgress / t.simulationSeconds) * 100);
      case 'confirmEnergyDeficit':
        return Math.min(100, (this.terminalProgress / t.deficitSeconds) * 100);
      case 'completed':
        return 100;
      default:
        return 0;
    }
  }

  canStart(mission15: Partial<Mission15Snapshot>): boolean {
    return Boolean(
      !this.started && !this.completed && mission15.mission15Completed && mission15.mission16Unlocked
    );
  }

  start(mission15: Partial<Mission15Snapshot>): boolean {
    if (!this.canStart(mission15)) return false;
    this.state.mission16Started = true;
    this.state.mission16Step = 'receiveAlert';
    this.resetVolatile();
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 1: alert -> terminal
  // -------------------------------------------------------------------------

  /** Reaching the terminal opens the confirmation phase. */
  reachTerminal(): boolean {
    if (this.step !== 'receiveAlert') return false;
    this.state.mission16Step = 'accessTerminal';
    this.terminalProgress = 0;
    return true;
  }

  /** Confirm the sabotage was a probe. Returns true on the frame it completes. */
  advanceAccess(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'accessTerminal') return false;
    if (!this.holdTerminal(deltaSeconds, inRange, mission16Tuning.accessSeconds)) return false;
    this.state.alertReceived = true;
    this.state.mission16Step = 'establishTripleLink';
    this.terminalProgress = 0;
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 2: triple link (three frequencies)
  // -------------------------------------------------------------------------

  /** Calibrate the three link frequencies. Returns true on the frame the last binds. */
  advanceTripleLink(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'establishTripleLink') return false;
    if (!inRange) {
      this.terminalProgress = Math.max(0, this.terminalProgress - deltaSeconds * 1.5);
      return false;
    }
    this.terminalProgress += deltaSeconds;
    if (this.terminalProgress < mission16Tuning.linkFrequencySeconds) return false;
    this.terminalProgress = 0;
    this.state.linkFrequenciesCalibrated = Math.min(NODE_COUNT, this.state.linkFrequenciesCalibrated + 1);
    if (this.state.linkFrequenciesCalibrated < NODE_COUNT) return false;
    this.state.tripleLinkEstablished = true;
    this.state.mission16Step = 'recoverAtlasKey';
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 3: Atlas key (remote link)
  // -------------------------------------------------------------------------

  advanceAtlasKey(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'recoverAtlasKey') return false;
    if (!this.holdTerminal(deltaSeconds, inRange, mission16Tuning.atlasKeySeconds)) return false;
    this.state.atlasKeyRecovered = true;
    this.state.mission16Step = 'revealSeedWorld';
    this.revelationTimer = 0;
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 4: the revelation (auto, consumed once)
  // -------------------------------------------------------------------------

  advanceRevelation(deltaSeconds: number): boolean {
    if (this.step !== 'revealSeedWorld') return false;
    this.revelationTimer += deltaSeconds;
    if (this.revelationTimer < mission16Tuning.revelationSeconds) return false;
    this.state.pleyadianSeedRevealed = true;
    this.state.mission16Step = 'unlockDetection';
    this.terminalProgress = 0;
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 5: three protocol prototypes, strictly in order
  // -------------------------------------------------------------------------

  /** Compile the current protocol. Returns the id compiled, or null. */
  advanceProtocol(deltaSeconds: number, inRange: boolean): ProtocolId | null {
    const index =
      this.step === 'unlockDetection' ? 0 : this.step === 'unlockShield' ? 1 : this.step === 'unlockAlertNetwork' ? 2 : -1;
    if (index < 0) return null;
    if (!this.holdTerminal(deltaSeconds, inRange, mission16Tuning.protocolSeconds)) return null;
    this.state.protocolsUnlocked[index] = true;
    this.terminalProgress = 0;
    if (index < NODE_COUNT - 1) {
      this.state.mission16Step = index === 0 ? 'unlockShield' : 'unlockAlertNetwork';
    } else {
      this.state.mission16Step = 'synchronizeNodes';
      this.prepareSync();
    }
    return PROTOCOL_ORDER[index];
  }

  // -------------------------------------------------------------------------
  // Phase 6: synchronise the three nodes (phase-align + hold)
  // -------------------------------------------------------------------------

  private prepareSync(): void {
    this.nodePhaseValue = 50;
    this.nodePhaseLocked = false;
    this.nodeSyncHeld = 0;
    this.nodeSearchDistance = Number.POSITIVE_INFINITY;
  }

  /**
   * One press locks the emitter onto the node's current harmonic phase.
   *
   * This used to add a blind +9 with wraparound, which meant chasing a moving
   * target by mashing E: the phase drifts continuously, so a static value fell
   * out of the band within a second or two and the pilot had to keep pressing
   * for the whole five-second hold, three times over. A press now means
   * "capture this phase", which is what the pilot was trying to express all
   * along, and one press per node is enough to open the hold.
   */
  nudgeNodePhase(elapsed = 0): boolean {
    if (this.step !== 'synchronizeNodes' || this.activeNodeIndex < 0) return false;
    this.nodePhaseValue = this.nodePhaseTarget(elapsed);
    this.nodePhaseLocked = true;
    return true;
  }

  /**
   * Sync work only accumulates inside range with the phase in band; drifting
   * off bleeds it back rather than resetting. Returns true on the frame the
   * last node locks and the mission moves to the simulation.
   */
  advanceSynchronize(deltaSeconds: number, inRange: boolean, elapsed: number): boolean {
    if (this.step !== 'synchronizeNodes') return false;
    const index = this.activeNodeIndex;
    if (index < 0) return false;
    // Once captured, the emitter tracks the drifting harmonic on its own while
    // the pilot stays in range. Holding position is the skill being asked for
    // here; re-pressing E every second was never part of it.
    if (inRange && this.nodePhaseLocked) {
      this.nodePhaseValue = this.nodePhaseTarget(elapsed);
    }
    if (inRange && this.isPhaseStable(elapsed)) {
      this.nodeSyncHeld += deltaSeconds;
    } else {
      // Leaving range breaks the capture: the pilot re-acquires with one press.
      if (!inRange) this.nodePhaseLocked = false;
      this.nodeSyncHeld = Math.max(0, this.nodeSyncHeld - deltaSeconds * 0.8);
      return false;
    }
    if (this.nodeSyncHeld < mission16Tuning.nodeSyncSeconds) return false;
    this.state.nodesSynchronized[index] = true;
    this.prepareSync();
    if (this.nodesSynchronizedCount < NODE_COUNT) return false;
    this.state.mission16Step = 'runSimulation';
    this.terminalProgress = 0;
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 7: defensive simulation (echoes, no enemies)
  // -------------------------------------------------------------------------

  advanceSimulation(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'runSimulation') return false;
    if (!this.holdTerminal(deltaSeconds, inRange, mission16Tuning.simulationSeconds)) return false;
    this.state.simulationComplete = true;
    this.state.mission16Step = 'confirmEnergyDeficit';
    this.terminalProgress = 0;
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 8: energy deficit -> close
  // -------------------------------------------------------------------------

  advanceEnergyDeficit(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'confirmEnergyDeficit') return false;
    if (!this.holdTerminal(deltaSeconds, inRange, mission16Tuning.deficitSeconds)) return false;
    this.completeProtocol();
    return true;
  }

  private completeProtocol(): void {
    this.state.alertReceived = true;
    this.state.linkFrequenciesCalibrated = NODE_COUNT;
    this.state.tripleLinkEstablished = true;
    this.state.atlasKeyRecovered = true;
    this.state.pleyadianSeedRevealed = true;
    this.state.protocolsUnlocked = [true, true, true];
    this.state.nodesSynchronized = [true, true, true];
    this.state.simulationComplete = true;
    this.state.defensePlansRecovered = true;
    this.state.mission16Completed = true;
    this.state.mission17Unlocked = true;
    this.state.mission16Step = 'completed';
  }

  // -------------------------------------------------------------------------

  /** Shared hold accumulator: banks seconds in range, bleeds them out of range. */
  private holdTerminal(deltaSeconds: number, inRange: boolean, seconds: number): boolean {
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
  // Debug fast-forwards. Each pulls every earlier phase forward with it, so the
  // machine can never be left inconsistent.
  // -------------------------------------------------------------------------

  forceAlertReceived(): void {
    if (!this.started) return;
    this.state.alertReceived = true;
    if (this.step === 'receiveAlert' || this.step === 'accessTerminal') {
      this.state.mission16Step = 'establishTripleLink';
      this.terminalProgress = 0;
    }
  }

  forceTripleLink(): void {
    if (!this.started) return;
    this.forceAlertReceived();
    this.state.linkFrequenciesCalibrated = NODE_COUNT;
    this.state.tripleLinkEstablished = true;
    if (this.step === 'establishTripleLink') {
      this.state.mission16Step = 'recoverAtlasKey';
      this.terminalProgress = 0;
    }
  }

  forceAtlasKey(): void {
    if (!this.started) return;
    this.forceTripleLink();
    this.state.atlasKeyRecovered = true;
    if (this.step === 'recoverAtlasKey') {
      this.state.mission16Step = 'revealSeedWorld';
      this.revelationTimer = 0;
    }
  }

  forceRevelation(): void {
    if (!this.started) return;
    this.forceAtlasKey();
    this.state.pleyadianSeedRevealed = true;
    if (this.step === 'revealSeedWorld') {
      this.state.mission16Step = 'unlockDetection';
      this.terminalProgress = 0;
    }
  }

  /** Unlock protocols up to and including `index`, pulling earlier phases with it. */
  forceProtocolUnlocked(index: number): void {
    if (!this.started || index < 0 || index >= NODE_COUNT) return;
    this.forceRevelation();
    for (let i = 0; i <= index; i += 1) this.state.protocolsUnlocked[i] = true;
    if (index < NODE_COUNT - 1) {
      this.state.mission16Step = index === 0 ? 'unlockShield' : 'unlockAlertNetwork';
      this.terminalProgress = 0;
    } else {
      this.state.mission16Step = 'synchronizeNodes';
      this.prepareSync();
    }
  }

  /** Synchronise nodes up to and including `index`, pulling earlier phases with it. */
  forceNodeSynchronized(index: number): void {
    if (!this.started || index < 0 || index >= NODE_COUNT) return;
    this.forceProtocolUnlocked(NODE_COUNT - 1);
    for (let i = 0; i <= index; i += 1) this.state.nodesSynchronized[i] = true;
    if (this.nodesSynchronizedCount < NODE_COUNT) {
      this.state.mission16Step = 'synchronizeNodes';
      this.prepareSync();
    } else {
      this.state.mission16Step = 'runSimulation';
      this.terminalProgress = 0;
    }
  }

  forceSimulationComplete(): void {
    if (!this.started) return;
    this.forceNodeSynchronized(NODE_COUNT - 1);
    this.state.simulationComplete = true;
    if (this.step === 'runSimulation') {
      this.state.mission16Step = 'confirmEnergyDeficit';
      this.terminalProgress = 0;
    }
  }

  forceComplete(): void {
    if (!this.started) return;
    this.completeProtocol();
  }

  // -------------------------------------------------------------------------

  restore(savedState: Partial<Mission16Snapshot> | undefined): void {
    this.reset();
    if (!savedState?.mission16Started) return;
    Object.assign(this.state, savedState);
    if (!mission16Steps[this.state.mission16Step]) this.state.mission16Step = 'receiveAlert';
    // Protocol and node arrays must always be three-slot booleans even if an
    // old save is short or a field is missing.
    const protocols = this.state.protocolsUnlocked;
    this.state.protocolsUnlocked = Array.from({ length: NODE_COUNT }, (_, i) =>
      Array.isArray(protocols) ? Boolean(protocols[i]) : false
    );
    const nodes = this.state.nodesSynchronized;
    this.state.nodesSynchronized = Array.from({ length: NODE_COUNT }, (_, i) =>
      Array.isArray(nodes) ? Boolean(nodes[i]) : false
    );
    this.state.linkFrequenciesCalibrated = Math.max(
      0,
      Math.min(NODE_COUNT, Math.floor(this.state.linkFrequenciesCalibrated || 0))
    );

    // Reconcile late M16 saves with incomplete prerequisite flags, or all
    // three nodes synchronized while the step still says synchronizeNodes.
    if (
      this.state.mission16Step === 'synchronizeNodes' ||
      this.state.mission16Step === 'runSimulation' ||
      this.state.mission16Step === 'confirmEnergyDeficit' ||
      this.state.mission16Step === 'completed'
    ) {
      this.state.alertReceived = true;
      this.state.linkFrequenciesCalibrated = NODE_COUNT;
      this.state.tripleLinkEstablished = true;
      this.state.atlasKeyRecovered = true;
      this.state.pleyadianSeedRevealed = true;
      this.state.protocolsUnlocked = [true, true, true];
    }
    if (this.state.mission16Step === 'synchronizeNodes' && this.nodesSynchronizedCount === NODE_COUNT) {
      this.state.mission16Step = 'runSimulation';
    }
    if (
      this.state.mission16Step === 'runSimulation' ||
      this.state.mission16Step === 'confirmEnergyDeficit' ||
      this.state.mission16Step === 'completed'
    ) {
      this.state.nodesSynchronized = [true, true, true];
    }
    if (this.state.mission16Step === 'confirmEnergyDeficit') {
      this.state.simulationComplete = true;
    }
    if (this.state.mission16Completed || this.state.mission16Step === 'completed') {
      this.completeProtocol();
    }
    this.state.mission17Unlocked = this.state.mission17Unlocked || this.state.mission16Completed;

    // Reloading always lands on the last stable step with its interaction
    // freshly armed: no banked seconds, no half-aligned node. Nothing here can
    // restore a stuck interaction, and no node is ever duplicated or lost.
    this.resetVolatile();
  }

  snapshot(): Mission16Snapshot {
    return {
      ...this.state,
      protocolsUnlocked: [...this.state.protocolsUnlocked],
      nodesSynchronized: [...this.state.nodesSynchronized]
    };
  }

  reset(): void {
    Object.assign(this.state, {
      mission16Started: false,
      mission16Step: 'inactive' as Mission16StepId,
      alertReceived: false,
      linkFrequenciesCalibrated: 0,
      tripleLinkEstablished: false,
      atlasKeyRecovered: false,
      pleyadianSeedRevealed: false,
      protocolsUnlocked: [false, false, false],
      nodesSynchronized: [false, false, false],
      simulationComplete: false,
      defensePlansRecovered: false,
      mission16Completed: false,
      mission17Unlocked: false
    });
    this.resetVolatile();
  }

  private resetVolatile(): void {
    this.terminalProgress = 0;
    this.revelationTimer = 0;
    this.nodePhaseValue = 50;
    this.nodePhaseLocked = false;
    this.nodeSyncHeld = 0;
    this.nodeSearchDistance = Number.POSITIVE_INFINITY;
  }
}
