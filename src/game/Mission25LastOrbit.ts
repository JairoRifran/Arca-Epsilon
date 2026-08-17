import {
  MISSION25_STATE_ORDER,
  MISSION25_WAVE_COUNTS,
  mission25Steps,
  mission25Tuning,
  type Mission25StateId,
  type Mission25StepDefinition
} from '../assets/mission25Definitions';
import type { Mission22FrontChoice } from '../assets/mission22Definitions';
import type { Mission23TargetId } from '../assets/mission23Definitions';
import type { Mission22Snapshot } from './Mission22BrokenFronts';
import type { Mission23Snapshot } from './Mission23Counteroffensive';
import type { Mission24Snapshot } from './Mission24ReturnToOrigin';

export type Mission25Snapshot = {
  mission25Unlocked: boolean;
  mission25Started: boolean;
  mission25State: Mission25StateId;
  mission25BriefingPlayed: boolean;
  mission25DefensePhase: number;
  mission25Wave: number;
  mission25WaveKills: number;
  mission25SystemIntegrities: number[];
  mission25ArkIntegrity: number;
  mission25InheritedM22Priority: Mission22FrontChoice;
  mission25InheritedM23Support: boolean;
  mission25InheritedM23TargetOrder: Mission23TargetId[];
  mission25CommandNodesDestroyed: boolean[];
  mission25CommandTargetLocated: boolean;
  mission25CommandTargetExposed: boolean;
  mission25CommandCoreIntegrity: number;
  mission25FinalPhase: number;
  mission25ThreatNeutralized: boolean;
  mission25StabilizationComplete: boolean;
  mission25ChapterEndShown: boolean;
  mission25ChapterEndDismissed: boolean;
  mission25Completed: boolean;
  chapterCompleted: boolean;
  mission25EnemiesDestroyed: number;
  mission25EmergencyReinforcementUsed: boolean;
};

const stateIndex = new Map(MISSION25_STATE_ORDER.map((id, index) => [id, index]));

function clampIntegrity(value: unknown, fallback: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(mission25Tuning.minimumSystemIntegrity, Math.min(100, number));
}

function isPriority(value: unknown): value is Mission22FrontChoice {
  return value === 'none' || value === 'aurora' || value === 'nereida' || value === 'orbital';
}

export class Mission25LastOrbit {
  readonly missionId = 'mission-25-last-orbit';
  readonly missionName = 'Mision 25: La ultima orbita';
  readonly state: Mission25Snapshot = Mission25LastOrbit.emptyState();

  private collapseElapsed = 0;
  private stabilizationElapsed = 0;

  get unlocked(): boolean { return this.state.mission25Unlocked; }
  get started(): boolean { return this.state.mission25Started; }
  get completed(): boolean { return this.state.mission25Completed; }
  get step(): Mission25StateId { return this.state.mission25State; }
  get stepDefinition(): Mission25StepDefinition { return mission25Steps[this.step]; }
  get stepNumber(): number { return stateIndex.get(this.step) ?? 0; }
  get activeWaveTarget(): number {
    const index = Math.max(0, Math.min(MISSION25_WAVE_COUNTS.length - 1, this.state.mission25Wave - 1));
    return this.waveActive ? MISSION25_WAVE_COUNTS[index] : 0;
  }
  get waveActive(): boolean {
    return this.step === 'defensePerimeter' || this.step === 'arkSystemsUnderAttack' ||
      this.step === 'relayDefense' || this.step === 'arkUnderPressure';
  }
  get activeSystemIndex(): number {
    return Math.max(0, Math.min(this.state.mission25SystemIntegrities.length - 1, (this.state.mission25Wave + this.state.mission25WaveKills) % 3));
  }
  get destroyedNodeCount(): number {
    let count = 0;
    for (let index = 0; index < this.state.mission25CommandNodesDestroyed.length; index += 1) {
      if (this.state.mission25CommandNodesDestroyed[index]) count += 1;
    }
    return count;
  }
  get collapseProgress(): number { return Math.min(100, this.collapseElapsed / mission25Tuning.collapseSeconds * 100); }
  get stabilizationProgress(): number { return Math.min(100, this.stabilizationElapsed / mission25Tuning.stabilizationSeconds * 100); }
  get activeTimers(): number { return Number(this.step === 'threatCollapse') + Number(this.step === 'arkStabilization'); }

  unlockFrom(previous: Mission24Snapshot, m22: Mission22Snapshot, m23: Mission23Snapshot): boolean {
    if (!previous.mission24Completed || !previous.mission25Unlocked) return false;
    if (this.state.mission25Unlocked) return true;
    this.state.mission25Unlocked = true;
    this.state.mission25State = 'awaitingTrigger';
    this.captureInheritance(m22, m23);
    return true;
  }

  canStart(previous: Mission24Snapshot): boolean {
    return this.unlocked && !this.started && !this.completed && this.step === 'awaitingTrigger' &&
      previous.mission24Completed && previous.mission25Unlocked;
  }

  start(previous: Mission24Snapshot, m22: Mission22Snapshot, m23: Mission23Snapshot): boolean {
    if (!this.canStart(previous)) return false;
    this.captureInheritance(m22, m23);
    this.state.mission25Started = true;
    this.state.mission25BriefingPlayed = true;
    return this.goTo('finalBriefing');
  }

  completeBriefing(): boolean {
    if (this.step !== 'finalBriefing') return false;
    this.state.mission25BriefingPlayed = true;
    return this.goTo('threatDetected');
  }

  confirmThreat(): boolean {
    if (this.step !== 'threatDetected') return false;
    this.state.mission25DefensePhase = 1;
    this.state.mission25Wave = 1;
    this.state.mission25WaveKills = 0;
    return this.goTo('defensePerimeter');
  }

  reportEnemyDestroyed(): boolean {
    if (!this.waveActive) return false;
    this.state.mission25WaveKills += 1;
    this.state.mission25EnemiesDestroyed += 1;
    return this.state.mission25WaveKills >= this.activeWaveTarget;
  }

  completeCurrentWave(): boolean {
    if (!this.waveActive || this.state.mission25WaveKills < this.activeWaveTarget) return false;
    this.applyInterWaveRecovery();
    this.state.mission25WaveKills = 0;
    if (this.step === 'defensePerimeter') {
      this.state.mission25DefensePhase = 2;
      this.state.mission25Wave = 2;
      return this.goTo('arkSystemsUnderAttack');
    }
    if (this.step === 'arkSystemsUnderAttack') {
      this.state.mission25DefensePhase = 3;
      this.state.mission25Wave = 3;
      return this.goTo('relayDefense');
    }
    if (this.step === 'relayDefense') {
      this.state.mission25DefensePhase = 4;
      this.state.mission25Wave = 4;
      return this.goTo('arkUnderPressure');
    }
    this.state.mission25DefensePhase = 5;
    return this.goTo('counterattackPreparation');
  }

  damageSystem(index: number, amount: number): boolean {
    if (!this.waveActive || amount <= 0) return false;
    const safeIndex = Math.max(0, Math.min(this.state.mission25SystemIntegrities.length - 1, Math.floor(index)));
    const reduction = this.state.mission25InheritedM22Priority === 'aurora' ? 0.76 : 1;
    this.state.mission25SystemIntegrities[safeIndex] = clampIntegrity(
      this.state.mission25SystemIntegrities[safeIndex] - amount * reduction,
      100
    );
    this.recalculateArkIntegrity();
    if (
      this.state.mission25ArkIntegrity <= mission25Tuning.emergencyIntegrityThreshold &&
      !this.state.mission25EmergencyReinforcementUsed
    ) {
      this.state.mission25EmergencyReinforcementUsed = true;
      this.repairAllSystems(mission25Tuning.emergencyRepairAmount);
    }
    return true;
  }

  prepareCounterattack(): boolean {
    if (this.step !== 'counterattackPreparation') return false;
    return this.goTo('commandTargetLocated');
  }

  locateCommandTarget(): boolean {
    if (this.step !== 'commandTargetLocated') return false;
    this.state.mission25CommandTargetLocated = true;
    return this.goTo('commandTargetProtected');
  }

  destroyCommandNode(index: number): boolean {
    if (this.step !== 'commandTargetProtected') return false;
    const safeIndex = Math.max(0, Math.min(this.state.mission25CommandNodesDestroyed.length - 1, Math.floor(index)));
    if (this.state.mission25CommandNodesDestroyed[safeIndex]) return false;
    this.state.mission25CommandNodesDestroyed[safeIndex] = true;
    if (this.destroyedNodeCount === this.state.mission25CommandNodesDestroyed.length) {
      this.state.mission25CommandTargetExposed = true;
      this.goTo('commandTargetExposed');
    }
    return true;
  }

  beginFinalAssault(): boolean {
    if (this.step !== 'commandTargetExposed') return false;
    this.state.mission25FinalPhase = 1;
    return this.goTo('finalAssault');
  }

  setCoreIntegrity(value: number): boolean {
    if (this.step !== 'finalAssault') return false;
    this.state.mission25CommandCoreIntegrity = Math.max(0, Math.min(100, value));
    this.state.mission25FinalPhase = this.state.mission25CommandCoreIntegrity > 55 ? 1 : this.state.mission25CommandCoreIntegrity > 18 ? 2 : 3;
    if (this.state.mission25CommandCoreIntegrity > 0) return false;
    this.state.mission25ThreatNeutralized = true;
    this.state.mission25FinalPhase = 4;
    return this.goTo('threatCollapse');
  }

  updateThreatCollapse(delta: number): boolean {
    if (this.step !== 'threatCollapse') return false;
    this.collapseElapsed += Math.max(0, delta);
    if (this.collapseElapsed < mission25Tuning.collapseSeconds) return false;
    this.state.mission25FinalPhase = 5;
    return this.goTo('arkStabilization');
  }

  updateArkStabilization(delta: number, nearArk: boolean): boolean {
    if (this.step !== 'arkStabilization') return false;
    this.stabilizationElapsed = nearArk
      ? this.stabilizationElapsed + Math.max(0, delta)
      : Math.max(0, this.stabilizationElapsed - Math.max(0, delta) * 0.25);
    if (nearArk) this.repairAllSystems(delta * 2.4);
    if (this.stabilizationElapsed < mission25Tuning.stabilizationSeconds) return false;
    this.state.mission25StabilizationComplete = true;
    return this.goTo('chapterResolution');
  }

  completeChapterResolution(): boolean {
    if (this.step !== 'chapterResolution') return false;
    this.state.mission25Completed = true;
    this.state.chapterCompleted = true;
    return this.goTo('completed');
  }

  markChapterEndShown(): boolean {
    if (!this.completed || this.state.mission25ChapterEndShown) return false;
    this.state.mission25ChapterEndShown = true;
    return true;
  }

  dismissChapterEnd(): void {
    if (this.completed) this.state.mission25ChapterEndDismissed = true;
  }

  restore(snapshot: Partial<Mission25Snapshot> | undefined, previous: Mission24Snapshot, m22: Mission22Snapshot, m23: Mission23Snapshot): void {
    const empty = Mission25LastOrbit.emptyState();
    Object.assign(this.state, empty, snapshot ?? {});
    if (!snapshot?.mission25Unlocked && previous.mission24Completed && previous.mission25Unlocked) {
      this.state.mission25Unlocked = true;
      this.state.mission25State = 'awaitingTrigger';
    }
    let requested = MISSION25_STATE_ORDER.includes(this.state.mission25State) ? this.state.mission25State : 'inactive';
    if (
      previous.mission24Completed && previous.mission25Unlocked &&
      !this.state.mission25Started && requested === 'inactive'
    ) {
      this.state.mission25Unlocked = true;
      requested = 'awaitingTrigger';
    }
    this.state.mission25State = requested;
    this.state.mission25SystemIntegrities = this.normalizedIntegrities(snapshot?.mission25SystemIntegrities);
    this.state.mission25CommandNodesDestroyed = this.normalizedFlags(snapshot?.mission25CommandNodesDestroyed, 3);
    this.state.mission25InheritedM23TargetOrder = Array.isArray(snapshot?.mission25InheritedM23TargetOrder)
      ? [...snapshot.mission25InheritedM23TargetOrder].slice(0, 3)
      : [];
    this.state.mission25InheritedM22Priority = isPriority(snapshot?.mission25InheritedM22Priority)
      ? snapshot.mission25InheritedM22Priority
      : m22.mission22SupportPriority;
    this.state.mission25InheritedM23Support = snapshot?.mission25InheritedM23Support ?? m23.jointForcesSynchronized;
    if (this.state.mission25InheritedM23TargetOrder.length === 0) {
      this.state.mission25InheritedM23TargetOrder = [...m23.mission23TargetOrder];
    }
    this.state.mission25CommandCoreIntegrity = Math.max(0, Math.min(100, snapshot?.mission25CommandCoreIntegrity ?? 100));
    this.applyMilestonesThrough(stateIndex.get(requested) ?? 0);
    this.recalculateArkIntegrity();
    this.collapseElapsed = 0;
    this.stabilizationElapsed = 0;
  }

  reset(): void {
    Object.assign(this.state, Mission25LastOrbit.emptyState());
    this.collapseElapsed = 0;
    this.stabilizationElapsed = 0;
  }

  snapshot(): Mission25Snapshot {
    return {
      ...this.state,
      mission25SystemIntegrities: [...this.state.mission25SystemIntegrities],
      mission25InheritedM23TargetOrder: [...this.state.mission25InheritedM23TargetOrder],
      mission25CommandNodesDestroyed: [...this.state.mission25CommandNodesDestroyed]
    };
  }

  forceTo(step: Mission25StateId): void {
    const target = stateIndex.get(step) ?? 0;
    if (target <= this.stepNumber) return;
    this.applyMilestonesThrough(target);
    this.state.mission25State = step;
    this.resetVolatile();
  }

  forceWaveComplete(): void {
    if (!this.waveActive) return;
    const remaining = Math.max(0, this.activeWaveTarget - this.state.mission25WaveKills);
    this.state.mission25WaveKills += remaining;
    this.state.mission25EnemiesDestroyed += remaining;
    this.completeCurrentWave();
  }

  forceNodesDestroyed(): void {
    this.forceTo('commandTargetProtected');
    for (let index = 0; index < 3; index += 1) this.destroyCommandNode(index);
  }

  forceComplete(): void {
    this.forceTo('chapterResolution');
    this.state.mission25ThreatNeutralized = true;
    this.state.mission25StabilizationComplete = true;
    this.completeChapterResolution();
  }

  private captureInheritance(m22: Mission22Snapshot, m23: Mission23Snapshot): void {
    this.state.mission25InheritedM22Priority = m22.mission22SupportPriority;
    this.state.mission25InheritedM23Support = m23.jointForcesSynchronized;
    this.state.mission25InheritedM23TargetOrder = [...m23.mission23TargetOrder];
    if (m22.mission22SupportPriority === 'aurora') this.state.mission25SystemIntegrities.fill(100);
    if (m22.mission22SupportPriority === 'nereida') this.repairAllSystems(8);
  }

  private applyInterWaveRecovery(): void {
    if (this.state.mission25InheritedM22Priority === 'nereida') this.repairAllSystems(9);
    else if (this.state.mission25InheritedM22Priority === 'aurora') this.repairAllSystems(3);
    if (this.state.mission25InheritedM23Support) this.repairAllSystems(2);
  }

  private repairAllSystems(amount: number): void {
    for (let index = 0; index < this.state.mission25SystemIntegrities.length; index += 1) {
      this.state.mission25SystemIntegrities[index] = Math.min(100, this.state.mission25SystemIntegrities[index] + amount);
    }
    this.recalculateArkIntegrity();
  }

  private recalculateArkIntegrity(): void {
    let total = 0;
    for (let index = 0; index < this.state.mission25SystemIntegrities.length; index += 1) {
      total += this.state.mission25SystemIntegrities[index];
    }
    this.state.mission25ArkIntegrity = Number((total / this.state.mission25SystemIntegrities.length).toFixed(1));
  }

  private goTo(step: Mission25StateId): boolean {
    const target = stateIndex.get(step) ?? 0;
    if (target <= this.stepNumber) return false;
    this.state.mission25State = step;
    this.resetVolatile();
    return true;
  }

  private resetVolatile(): void {
    this.collapseElapsed = 0;
    this.stabilizationElapsed = 0;
  }

  private normalizedFlags(source: readonly boolean[] | undefined, length: number): boolean[] {
    const result = new Array<boolean>(length).fill(false);
    for (let index = 0; index < length; index += 1) result[index] = Boolean(source?.[index]);
    return result;
  }

  private normalizedIntegrities(source: readonly number[] | undefined): number[] {
    const result = [92, 92, 92];
    for (let index = 0; index < result.length; index += 1) result[index] = clampIntegrity(source?.[index], result[index]);
    return result;
  }

  private applyMilestonesThrough(index: number): void {
    const reached = (step: Mission25StateId): boolean => index >= (stateIndex.get(step) ?? Number.POSITIVE_INFINITY);
    this.state.mission25Unlocked ||= reached('awaitingTrigger');
    this.state.mission25Started ||= reached('finalBriefing');
    this.state.mission25BriefingPlayed ||= reached('threatDetected');
    this.state.mission25DefensePhase = Math.max(this.state.mission25DefensePhase, reached('counterattackPreparation') ? 5 : reached('arkUnderPressure') ? 4 : reached('relayDefense') ? 3 : reached('arkSystemsUnderAttack') ? 2 : reached('defensePerimeter') ? 1 : 0);
    this.state.mission25CommandTargetLocated ||= reached('commandTargetProtected');
    if (reached('commandTargetExposed')) this.state.mission25CommandNodesDestroyed.fill(true);
    this.state.mission25CommandTargetExposed ||= reached('commandTargetExposed');
    this.state.mission25ThreatNeutralized ||= reached('threatCollapse');
    this.state.mission25StabilizationComplete ||= reached('chapterResolution');
    this.state.mission25Completed ||= reached('completed');
    this.state.chapterCompleted ||= reached('completed');
    if (reached('threatCollapse')) this.state.mission25CommandCoreIntegrity = 0;
  }

  private static emptyState(): Mission25Snapshot {
    return {
      mission25Unlocked: false,
      mission25Started: false,
      mission25State: 'inactive',
      mission25BriefingPlayed: false,
      mission25DefensePhase: 0,
      mission25Wave: 0,
      mission25WaveKills: 0,
      mission25SystemIntegrities: [92, 92, 92],
      mission25ArkIntegrity: 92,
      mission25InheritedM22Priority: 'none',
      mission25InheritedM23Support: false,
      mission25InheritedM23TargetOrder: [],
      mission25CommandNodesDestroyed: [false, false, false],
      mission25CommandTargetLocated: false,
      mission25CommandTargetExposed: false,
      mission25CommandCoreIntegrity: 100,
      mission25FinalPhase: 0,
      mission25ThreatNeutralized: false,
      mission25StabilizationComplete: false,
      mission25ChapterEndShown: false,
      mission25ChapterEndDismissed: false,
      mission25Completed: false,
      chapterCompleted: false,
      mission25EnemiesDestroyed: 0,
      mission25EmergencyReinforcementUsed: false
    };
  }
}
