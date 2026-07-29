import {
  mission14Steps,
  mission14Tuning,
  type Mission14StepDefinition,
  type Mission14StepId
} from '../assets/mission14Definitions';
import type { Mission13Snapshot } from './Mission13FirstStorm';

export type Mission14Snapshot = {
  mission14Started: boolean;
  mission14Step: Mission14StepId;
  /** Post-storm inspections: power, comms, habitat. */
  coalitionTraceInspections: boolean[];
  coalitionSignatureAnalyzed: boolean;
  coalitionPowerNodePurged: boolean;
  coalitionCommsNodePurged: boolean;
  coalitionHiddenNodeLocated: boolean;
  coalitionTraceSampleRecovered: boolean;
  coalitionReverseTriangulationComplete: boolean;
  mission14Completed: boolean;
  mission15Unlocked: boolean;
};

/** Live trace readouts. Derived every frame, never persisted. */
export type CoalitionTraceReadout = {
  /** Share of the human network still carrying the mark, 0..100. */
  contamination: number;
  /** How close the Coalition is to a usable fix on Aurora, 0..100. */
  hostileTriangulation: number;
  /** Search readout for the hidden node, 0..100. Zero outside its range. */
  signalIntensity: number;
  /** 0..3. */
  purgedNodes: number;
  /** HUD/light glitch amount, 0..1. */
  interference: number;
  /** Progress of whatever interaction the current step is running, 0..100. */
  phaseProgress: number;
};

const INSPECTION_COUNT = 3;
/**
 * Contamination left in the network once all three nodes are off the air. The
 * closing phase drains exactly this much, so the readout falls monotonically
 * from 100 to 0 across the whole mission instead of dipping and rebounding.
 */
const CLOSURE_RESIDUE = 16;

/**
 * Mission 14 "La Marca que Quedó": the storm did not bring anything new — it
 * woke something that had been sitting in the network since M05's silent probe
 * and M08's partial purge.
 *
 * The pilot walks the colony after the front passes, finds artificial periodic
 * pulses, confirms at the terminal that the signature matches the probe, and
 * then purges three contaminated nodes: the power node by chasing a drifting
 * carrier, the relay by catching three corrupt packets, and a human perimeter
 * sensor that has to be found by signal strength alone before its sample can
 * be pulled.
 *
 * There is no failure state. The extraction can be lost and retried, a missed
 * pulse costs a cycle rather than the phase, and every step degrades to a
 * clean retry rather than a dead end. The ending is fixed: most of the mark is
 * purged, one packet gets away, and the Coalition learns the colony is alive.
 */
export class Mission14CoalitionTrace {
  readonly missionId = 'mission-14-coalition-trace';
  readonly missionName = 'Misión 14: La Marca que Quedó';

  readonly state: Mission14Snapshot = {
    mission14Started: false,
    mission14Step: 'inactive',
    coalitionTraceInspections: [false, false, false],
    coalitionSignatureAnalyzed: false,
    coalitionPowerNodePurged: false,
    coalitionCommsNodePurged: false,
    coalitionHiddenNodeLocated: false,
    coalitionTraceSampleRecovered: false,
    coalitionReverseTriangulationComplete: false,
    mission14Completed: false,
    mission15Unlocked: false
  };

  // --- Volatile interaction state. None of this is persisted: reloading drops
  // back to the start of the current phase rather than into a half-finished
  // interaction that might not be resumable.
  private inspectionProgress = 0;
  private analysisProgress = 0;
  private powerPurgeProgress = 0;
  // Explicitly widened: the tuning table is `as const`, so an inferred type
  // would pin this to the literal 118 and reject every step.
  private tunerFrequency: number = mission14Tuning.carrierCenter;
  private blockedPulses = 0;
  private missedPulses = 0;
  private lastBlockedCycle = -1;
  private extractionProgress = 0;
  private transmissionProgress = 0;
  private triangulationProgress = 0;
  private closureElapsed = 0;
  /** Distance to the hidden node, fed in each frame while searching. */
  private searchDistance = Number.POSITIVE_INFINITY;

  get started(): boolean {
    return this.state.mission14Started;
  }

  get completed(): boolean {
    return this.state.mission14Completed;
  }

  get step(): Mission14StepId {
    return this.state.mission14Step;
  }

  get stepDefinition(): Mission14StepDefinition {
    return mission14Steps[this.step];
  }

  get inspectionsDone(): number {
    return this.state.coalitionTraceInspections.filter(Boolean).length;
  }

  /** Which inspection the current step is waiting on, or -1. */
  get activeInspectionIndex(): number {
    if (this.step === 'inspectPower') return 0;
    if (this.step === 'inspectComms') return 1;
    if (this.step === 'inspectHabitat') return 2;
    return -1;
  }

  get purgedNodeCount(): number {
    return [
      this.state.coalitionPowerNodePurged,
      this.state.coalitionCommsNodePurged,
      this.state.coalitionTraceSampleRecovered
    ].filter(Boolean).length;
  }

  get milestoneCount(): number {
    return (
      this.inspectionsDone +
      [
        this.state.coalitionSignatureAnalyzed,
        this.state.coalitionPowerNodePurged,
        this.state.coalitionCommsNodePurged,
        this.state.coalitionHiddenNodeLocated,
        this.state.coalitionTraceSampleRecovered,
        this.state.coalitionReverseTriangulationComplete
      ].filter(Boolean).length
    );
  }

  /** Blocked / total corrupt packets on the relay. */
  get pulsesBlocked(): number {
    return this.blockedPulses;
  }

  get pulsesMissed(): number {
    return this.missedPulses;
  }

  get tuner(): number {
    return this.tunerFrequency;
  }

  /**
   * The contaminated carrier the power node is broadcasting on. Two offset
   * sine terms, so it drifts continuously, never repeats obviously, and is
   * perfectly deterministic — the same elapsed time always gives the same
   * frequency, which is what makes the phase reproducible in a test.
   */
  carrierFrequency(elapsed: number): number {
    const t = mission14Tuning;
    return (
      t.carrierCenter +
      Math.sin(elapsed * t.carrierRateSlow) * t.carrierAmplitudeSlow +
      Math.sin(elapsed * t.carrierRateFast) * t.carrierAmplitudeFast
    );
  }

  /** Signed distance between the dial and the carrier. */
  tunerDeviation(elapsed: number): number {
    return this.tunerFrequency - this.carrierFrequency(elapsed);
  }

  isTuned(elapsed: number): boolean {
    return Math.abs(this.tunerDeviation(elapsed)) <= mission14Tuning.tunerTolerance;
  }

  /** True while a corrupt packet can be caught. Deterministic from elapsed. */
  isPulseWindowOpen(elapsed: number): boolean {
    const t = mission14Tuning;
    return elapsed % t.pulsePeriodSeconds < t.pulseWindowSeconds;
  }

  /** 0..1 across the current pulse cycle, for the HUD meter. */
  pulseCyclePhase(elapsed: number): number {
    return (elapsed % mission14Tuning.pulsePeriodSeconds) / mission14Tuning.pulsePeriodSeconds;
  }

  /** Fed each frame while the search phase is live. Never persisted. */
  setSearchDistance(distance: number): void {
    this.searchDistance = distance;
  }

  get readout(): CoalitionTraceReadout {
    const t = mission14Tuning;
    const purged = this.purgedNodeCount;

    let contamination: number;
    if (this.state.mission14Completed) {
      contamination = 0;
    } else if (!this.started || !this.state.coalitionSignatureAnalyzed) {
      // Before the analysis the mark is present but unmeasured.
      contamination = this.started ? 100 : 0;
    } else if (this.step === 'traceClosure') {
      // The residue drains away over the closing phase, picking up exactly
      // where the third purge left it so the readout never jumps.
      contamination = Math.max(0, CLOSURE_RESIDUE * (1 - this.closureElapsed / t.closureSeconds));
    } else {
      // Each purge takes a third of the mark off the air but leaves a residue
      // the network only sheds once the reverse triangulation has run.
      contamination = Math.max(CLOSURE_RESIDUE, 100 - purged * 28);
    }

    // The hostile fix decays with each node taken off the air, and the device
    // still transmitting during the extraction pushes it back up.
    const transmissionPush = this.step === 'extractSample' ? (this.transmissionProgress / 100) * 18 : 0;
    const hostileTriangulation = this.state.mission14Completed
      ? 0
      : Math.min(100, Math.max(0, contamination * 0.82 + transmissionPush));

    const signalIntensity =
      this.step === 'locateHiddenNode' || this.step === 'extractSample'
        ? Math.round(Math.max(0, 1 - Math.min(1, this.searchDistance / t.searchRange)) * 100)
        : 0;

    return {
      contamination: Number(contamination.toFixed(1)),
      hostileTriangulation: Number(hostileTriangulation.toFixed(1)),
      signalIntensity,
      purgedNodes: purged,
      interference: Number((contamination / 100).toFixed(3)),
      phaseProgress: Number(this.phaseProgress.toFixed(1))
    };
  }

  /** Progress of the current interaction, 0..100. */
  get phaseProgress(): number {
    const t = mission14Tuning;
    switch (this.step) {
      case 'inspectPower':
      case 'inspectComms':
      case 'inspectHabitat':
        return Math.min(100, (this.inspectionProgress / t.inspectionSeconds) * 100);
      case 'analyzeSignature':
        return Math.min(100, (this.analysisProgress / t.analysisSeconds) * 100);
      case 'purgePowerNode':
        return this.powerPurgeProgress;
      case 'purgeCommsNode':
        return (this.blockedPulses / t.pulseCount) * 100;
      case 'extractSample':
        return this.extractionProgress;
      case 'reverseTriangulate':
        return this.triangulationProgress;
      case 'traceClosure':
        return Math.min(100, (this.closureElapsed / t.closureSeconds) * 100);
      case 'completed':
        return 100;
      default:
        return 0;
    }
  }

  /** How far the device has got with its transmission, 0..100. */
  get transmissionPercent(): number {
    return Number(this.transmissionProgress.toFixed(1));
  }

  canStart(mission13: Partial<Mission13Snapshot>): boolean {
    return Boolean(
      !this.started && !this.completed && mission13.mission13Completed && mission13.mission14Unlocked
    );
  }

  start(mission13: Partial<Mission13Snapshot>): boolean {
    if (!this.canStart(mission13)) return false;
    this.state.mission14Started = true;
    this.state.mission14Step = 'inspectPower';
    this.resetVolatile();
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 1: post-storm inspection
  // -------------------------------------------------------------------------

  /** Hands-on inspection; returns true on the frame one completes. */
  advanceInspection(deltaSeconds: number): boolean {
    const index = this.activeInspectionIndex;
    if (index < 0) return false;
    this.inspectionProgress += deltaSeconds;
    if (this.inspectionProgress < mission14Tuning.inspectionSeconds) return false;
    this.inspectionProgress = 0;
    this.state.coalitionTraceInspections[index] = true;
    this.state.mission14Step =
      index === 0 ? 'inspectComms' : index === 1 ? 'inspectHabitat' : 'analyzeSignature';
    return true;
  }

  /** Walking away loses the banked seconds on the inspection in progress. */
  resetInspectionProgress(): void {
    this.inspectionProgress = 0;
  }

  // -------------------------------------------------------------------------
  // Phase 2: signature analysis at the terminal
  // -------------------------------------------------------------------------

  advanceAnalysis(deltaSeconds: number): boolean {
    if (this.step !== 'analyzeSignature') return false;
    this.analysisProgress += deltaSeconds;
    if (this.analysisProgress < mission14Tuning.analysisSeconds) return false;
    this.analysisProgress = mission14Tuning.analysisSeconds;
    this.state.coalitionSignatureAnalyzed = true;
    this.state.mission14Step = 'purgePowerNode';
    return true;
  }

  resetAnalysisProgress(): void {
    this.analysisProgress = 0;
  }

  // -------------------------------------------------------------------------
  // Phase 3: power node — chase the drifting carrier
  // -------------------------------------------------------------------------

  /**
   * Step the dial. Wraps at the top of the band so the pilot can always reach
   * the carrier again without a second key.
   */
  stepTuner(): number {
    if (this.step !== 'purgePowerNode') return this.tunerFrequency;
    const t = mission14Tuning;
    this.tunerFrequency += t.tunerStep;
    if (this.tunerFrequency > t.tunerMax) {
      this.tunerFrequency = t.tunerMin + (this.tunerFrequency - t.tunerMax);
    }
    return this.tunerFrequency;
  }

  /**
   * Purge work. Only accumulates while the dial is on the carrier and the
   * pilot is at the node; drifting off bleeds it back instead of resetting it.
   * Returns true on the frame the node comes clean.
   */
  advancePowerPurge(deltaSeconds: number, inRange: boolean, elapsed: number): boolean {
    if (this.step !== 'purgePowerNode') return false;
    const t = mission14Tuning;
    if (inRange && this.isTuned(elapsed)) {
      this.powerPurgeProgress = Math.min(
        100,
        this.powerPurgeProgress + (deltaSeconds / t.powerPurgeSeconds) * 100
      );
    } else {
      this.powerPurgeProgress = Math.max(
        0,
        this.powerPurgeProgress - deltaSeconds * t.powerPurgeDecayPerSecond
      );
      return false;
    }
    if (this.powerPurgeProgress < 100) return false;
    this.state.coalitionPowerNodePurged = true;
    this.state.mission14Step = 'purgeCommsNode';
    this.lastBlockedCycle = -1;
    return true;
  }

  get powerPurgePercent(): number {
    return Number(this.powerPurgeProgress.toFixed(1));
  }

  // -------------------------------------------------------------------------
  // Phase 4: comms node — block three corrupt packets in sequence
  // -------------------------------------------------------------------------

  /**
   * Attempt to block the packet currently leaving the relay. One block per
   * cycle at most. A miss costs that cycle and nothing else: previously
   * blocked packets stay blocked, so a mistake never restarts the phase.
   *
   * Returns 'blocked', 'missed', or 'ignored' when the attempt was outside the
   * phase or duplicated inside a cycle already resolved.
   */
  attemptPulseBlock(elapsed: number, inRange: boolean): 'blocked' | 'missed' | 'ignored' {
    if (this.step !== 'purgeCommsNode' || !inRange) return 'ignored';
    const cycle = Math.floor(elapsed / mission14Tuning.pulsePeriodSeconds);
    if (cycle === this.lastBlockedCycle) return 'ignored';
    this.lastBlockedCycle = cycle;
    if (!this.isPulseWindowOpen(elapsed)) {
      this.missedPulses += 1;
      return 'missed';
    }
    this.blockedPulses += 1;
    if (this.blockedPulses >= mission14Tuning.pulseCount) {
      this.state.coalitionCommsNodePurged = true;
      this.state.mission14Step = 'locateHiddenNode';
    }
    return 'blocked';
  }

  // -------------------------------------------------------------------------
  // Phase 5: locate the hidden node by signal alone
  // -------------------------------------------------------------------------

  /** True only once the pilot is close enough for the marker to be honest. */
  isHiddenNodeRevealed(): boolean {
    return this.searchDistance <= mission14Tuning.revealRange;
  }

  /** Confirm the find. Only works inside lock range. */
  lockHiddenNode(distance: number): boolean {
    if (this.step !== 'locateHiddenNode') return false;
    if (distance > mission14Tuning.lockRange) return false;
    this.state.coalitionHiddenNodeLocated = true;
    this.state.mission14Step = 'extractSample';
    this.extractionProgress = 0;
    this.transmissionProgress = 0;
    return true;
  }

  // -------------------------------------------------------------------------
  // Phase 6: extract the sample before the device finishes transmitting
  // -------------------------------------------------------------------------

  /**
   * Returns 'recovered' on the frame the sample lands, 'lost' on the frame the
   * device completes a transmission and the attempt has to restart, and
   * 'working' otherwise. Losing the race is a setback, never a dead end.
   */
  advanceExtraction(deltaSeconds: number, inRange: boolean): 'working' | 'recovered' | 'lost' {
    if (this.step !== 'extractSample') return 'working';
    const t = mission14Tuning;

    // The device keeps transmitting either way; isolating it only slows it.
    const transmissionRate = inRange ? t.transmissionWorkingFactor : 1;
    this.transmissionProgress = Math.min(
      100,
      this.transmissionProgress + (deltaSeconds / t.transmissionSeconds) * 100 * transmissionRate
    );

    if (inRange) {
      this.extractionProgress = Math.min(
        100,
        this.extractionProgress + (deltaSeconds / t.extractionSeconds) * 100
      );
    } else {
      this.extractionProgress = Math.max(0, this.extractionProgress - deltaSeconds * 6);
    }

    if (this.extractionProgress >= 100) {
      this.state.coalitionTraceSampleRecovered = true;
      this.state.mission14Step = 'reverseTriangulate';
      this.triangulationProgress = 0;
      return 'recovered';
    }
    if (this.transmissionProgress >= 100) {
      // The burst got out. The device re-locks and the pilot goes again.
      this.extractionProgress = 0;
      this.transmissionProgress = 0;
      return 'lost';
    }
    return 'working';
  }

  get extractionPercent(): number {
    return Number(this.extractionProgress.toFixed(1));
  }

  // -------------------------------------------------------------------------
  // Phase 7: reverse triangulation back at the relay
  // -------------------------------------------------------------------------

  advanceTriangulation(deltaSeconds: number, inRange: boolean): boolean {
    if (this.step !== 'reverseTriangulate') return false;
    if (!inRange) {
      this.triangulationProgress = Math.max(0, this.triangulationProgress - deltaSeconds * 4);
      return false;
    }
    this.triangulationProgress = Math.min(
      100,
      this.triangulationProgress + (deltaSeconds / mission14Tuning.triangulationSeconds) * 100
    );
    if (this.triangulationProgress < 100) return false;
    this.state.coalitionReverseTriangulationComplete = true;
    this.state.mission14Step = 'traceClosure';
    this.closureElapsed = 0;
    return true;
  }

  get triangulationPercent(): number {
    return Number(this.triangulationProgress.toFixed(1));
  }

  // -------------------------------------------------------------------------
  // Phase 8: closure
  // -------------------------------------------------------------------------

  /** Residual interference drains; returns true on the completing frame. */
  advanceClosure(deltaSeconds: number): boolean {
    if (this.step !== 'traceClosure') return false;
    this.closureElapsed += deltaSeconds;
    if (this.closureElapsed < mission14Tuning.closureSeconds) return false;
    this.completeTrace();
    return true;
  }

  private completeTrace(): void {
    this.state.coalitionTraceInspections = [true, true, true];
    this.state.coalitionSignatureAnalyzed = true;
    this.state.coalitionPowerNodePurged = true;
    this.state.coalitionCommsNodePurged = true;
    this.state.coalitionHiddenNodeLocated = true;
    this.state.coalitionTraceSampleRecovered = true;
    this.state.coalitionReverseTriangulationComplete = true;
    this.state.mission14Completed = true;
    this.state.mission15Unlocked = true;
    this.state.mission14Step = 'completed';
  }

  // -------------------------------------------------------------------------
  // Debug fast-forwards. Each one pulls every earlier phase forward with it so
  // the state machine can never be left inconsistent.
  // -------------------------------------------------------------------------

  forceInspectionsComplete(): void {
    if (!this.started) return;
    this.state.coalitionTraceInspections = [true, true, true];
    this.inspectionProgress = 0;
    if (this.activeInspectionIndex >= 0) this.state.mission14Step = 'analyzeSignature';
  }

  forceSignatureAnalyzed(): void {
    if (!this.started) return;
    this.forceInspectionsComplete();
    this.state.coalitionSignatureAnalyzed = true;
    this.analysisProgress = mission14Tuning.analysisSeconds;
    if (this.step === 'analyzeSignature') this.state.mission14Step = 'purgePowerNode';
  }

  forcePowerNodePurged(): void {
    if (!this.started) return;
    this.forceSignatureAnalyzed();
    this.state.coalitionPowerNodePurged = true;
    this.powerPurgeProgress = 100;
    if (this.step === 'purgePowerNode') this.state.mission14Step = 'purgeCommsNode';
  }

  forceCommsNodePurged(): void {
    if (!this.started) return;
    this.forcePowerNodePurged();
    this.state.coalitionCommsNodePurged = true;
    this.blockedPulses = mission14Tuning.pulseCount;
    if (this.step === 'purgeCommsNode') this.state.mission14Step = 'locateHiddenNode';
  }

  forceHiddenNodeLocated(): void {
    if (!this.started) return;
    this.forceCommsNodePurged();
    this.state.coalitionHiddenNodeLocated = true;
    if (this.step === 'locateHiddenNode') {
      this.state.mission14Step = 'extractSample';
      this.extractionProgress = 0;
      this.transmissionProgress = 0;
    }
  }

  forceSampleRecovered(): void {
    if (!this.started) return;
    this.forceHiddenNodeLocated();
    this.state.coalitionTraceSampleRecovered = true;
    this.extractionProgress = 100;
    if (this.step === 'extractSample') {
      this.state.mission14Step = 'reverseTriangulate';
      this.triangulationProgress = 0;
    }
  }

  forceTriangulationComplete(): void {
    if (!this.started) return;
    this.forceSampleRecovered();
    this.state.coalitionReverseTriangulationComplete = true;
    this.triangulationProgress = 100;
    if (this.step === 'reverseTriangulate') {
      this.state.mission14Step = 'traceClosure';
      this.closureElapsed = 0;
    }
  }

  forceComplete(): void {
    if (!this.started) return;
    this.completeTrace();
  }

  // -------------------------------------------------------------------------

  restore(savedState: Partial<Mission14Snapshot> | undefined): void {
    this.reset();
    if (!savedState?.mission14Started) return;
    Object.assign(this.state, savedState);
    if (!mission14Steps[this.state.mission14Step]) this.state.mission14Step = 'inspectPower';
    // Inspections must always be a three-slot array even if an old save is
    // short or the field is missing entirely.
    const inspections = this.state.coalitionTraceInspections;
    this.state.coalitionTraceInspections = Array.from({ length: INSPECTION_COUNT }, (_, i) =>
      Boolean(Array.isArray(inspections) ? inspections[i] : false)
    );
    this.state.mission15Unlocked = this.state.mission15Unlocked || this.state.mission14Completed;
    // Reloading always lands on the last stable step with its interaction
    // freshly armed: no banked seconds, no half-caught packet train, no
    // half-extracted sample. Nothing here can restore a stuck interaction.
    this.resetVolatile();
  }

  snapshot(): Mission14Snapshot {
    return { ...this.state, coalitionTraceInspections: [...this.state.coalitionTraceInspections] };
  }

  reset(): void {
    Object.assign(this.state, {
      mission14Started: false,
      mission14Step: 'inactive' as Mission14StepId,
      coalitionTraceInspections: [false, false, false],
      coalitionSignatureAnalyzed: false,
      coalitionPowerNodePurged: false,
      coalitionCommsNodePurged: false,
      coalitionHiddenNodeLocated: false,
      coalitionTraceSampleRecovered: false,
      coalitionReverseTriangulationComplete: false,
      mission14Completed: false,
      mission15Unlocked: false
    });
    this.resetVolatile();
  }

  private resetVolatile(): void {
    this.inspectionProgress = 0;
    this.analysisProgress = 0;
    this.powerPurgeProgress = 0;
    this.tunerFrequency = mission14Tuning.carrierCenter;
    this.blockedPulses = 0;
    this.missedPulses = 0;
    this.lastBlockedCycle = -1;
    this.extractionProgress = 0;
    this.transmissionProgress = 0;
    this.triangulationProgress = 0;
    this.closureElapsed = 0;
    this.searchDistance = Number.POSITIVE_INFINITY;
  }
}
