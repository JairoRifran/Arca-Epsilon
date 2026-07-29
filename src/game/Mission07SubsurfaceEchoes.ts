import {
  atlasEchoNodeDefinitions,
  mission07Steps,
  type Mission07StepDefinition,
  type Mission07StepId
} from '../assets/mission07Definitions';
import type { Mission06Snapshot } from './Mission06NereidaShield';

export type Mission07Snapshot = {
  mission07Started: boolean;
  mission07Step: Mission07StepId;
  subsurfaceSignalAnalyzed: boolean;
  atlasFractureRevealed: boolean;
  atlasEchoNodesScanned: boolean[];
  atlasSeedArchiveUnlocked: boolean;
  atlasSeedArchiveActivated: boolean;
  seedWorldRevealed: boolean;
  mission07Completed: boolean;
  mission08Unlocked: boolean;
};

export class Mission07SubsurfaceEchoes {
  readonly missionId = 'mission-07-subsurface-echoes';
  readonly missionName = 'Misión 07: Ecos bajo la corteza';

  readonly state: Mission07Snapshot = {
    mission07Started: false,
    mission07Step: 'inactive',
    subsurfaceSignalAnalyzed: false,
    atlasFractureRevealed: false,
    atlasEchoNodesScanned: [false, false, false],
    atlasSeedArchiveUnlocked: false,
    atlasSeedArchiveActivated: false,
    seedWorldRevealed: false,
    mission07Completed: false,
    mission08Unlocked: false
  };

  get started(): boolean {
    return this.state.mission07Started;
  }

  get completed(): boolean {
    return this.state.mission07Completed;
  }

  get step(): Mission07StepId {
    return this.state.mission07Step;
  }

  get stepDefinition(): Mission07StepDefinition {
    return mission07Steps[this.step];
  }

  get activeNodeIndex(): number {
    if (this.step === 'scanNorth') return 0;
    if (this.step === 'scanCentral') return 1;
    if (this.step === 'scanSouth') return 2;
    return -1;
  }

  canStart(mission06: Partial<Mission06Snapshot>): boolean {
    return Boolean(
      !this.started &&
        !this.completed &&
        mission06.mission06Completed &&
        mission06.cloakingFieldOnline &&
        mission06.nereidaSignatureReduced &&
        mission06.mission07Unlocked
    );
  }

  start(mission06: Partial<Mission06Snapshot>): boolean {
    if (!this.canStart(mission06)) return false;
    this.state.mission07Started = true;
    this.state.mission07Step = 'analyzeSignal';
    return true;
  }

  analyzeSubsurfaceSignal(): boolean {
    if (this.step !== 'analyzeSignal') return false;
    this.state.subsurfaceSignalAnalyzed = true;
    this.state.atlasFractureRevealed = true;
    this.state.mission07Step = 'travelToFracture';
    return true;
  }

  reachFracture(): boolean {
    if (this.step !== 'travelToFracture') return false;
    this.state.mission07Step = 'scanNorth';
    return true;
  }

  scanEchoNode(index: number): boolean {
    if (index !== this.activeNodeIndex || this.state.atlasEchoNodesScanned[index]) return false;
    this.state.atlasEchoNodesScanned[index] = true;
    if (this.state.atlasEchoNodesScanned.every(Boolean)) {
      this.state.atlasSeedArchiveUnlocked = true;
      this.state.mission07Step = 'activateArchive';
    } else {
      this.state.mission07Step = index === 0 ? 'scanCentral' : 'scanSouth';
    }
    return true;
  }

  forceAllEchoNodesScanned(): void {
    if (!this.started) return;
    this.state.subsurfaceSignalAnalyzed = true;
    this.state.atlasFractureRevealed = true;
    this.state.atlasEchoNodesScanned = atlasEchoNodeDefinitions.map(() => true);
    this.state.atlasSeedArchiveUnlocked = true;
    this.state.mission07Step = 'activateArchive';
  }

  activateSeedArchive(): boolean {
    if (this.step !== 'activateArchive' || !this.state.atlasSeedArchiveUnlocked) return false;
    this.state.atlasSeedArchiveActivated = true;
    this.state.seedWorldRevealed = true;
    this.state.mission07Completed = true;
    this.state.mission08Unlocked = true;
    this.state.mission07Step = 'completed';
    return true;
  }

  forceComplete(): void {
    if (!this.started) return;
    if (!this.state.atlasSeedArchiveUnlocked) this.forceAllEchoNodesScanned();
    this.activateSeedArchive();
  }

  restore(savedState: Partial<Mission07Snapshot> | undefined): void {
    this.reset();
    if (!savedState?.mission07Started) return;
    Object.assign(this.state, savedState);
    if (!mission07Steps[this.state.mission07Step]) this.state.mission07Step = 'analyzeSignal';
    if (!this.state.atlasEchoNodesScanned || this.state.atlasEchoNodesScanned.length < atlasEchoNodeDefinitions.length) {
      this.state.atlasEchoNodesScanned = atlasEchoNodeDefinitions.map((_, index) => Boolean(this.state.atlasEchoNodesScanned?.[index]));
    }
    this.state.atlasSeedArchiveUnlocked =
      this.state.atlasSeedArchiveUnlocked || this.state.atlasEchoNodesScanned.every(Boolean);
    this.state.mission08Unlocked = this.state.mission08Unlocked || this.state.mission07Completed;
  }

  snapshot(): Mission07Snapshot {
    return { ...this.state, atlasEchoNodesScanned: [...this.state.atlasEchoNodesScanned] };
  }

  reset(): void {
    Object.assign(this.state, {
      mission07Started: false,
      mission07Step: 'inactive' as Mission07StepId,
      subsurfaceSignalAnalyzed: false,
      atlasFractureRevealed: false,
      atlasEchoNodesScanned: [false, false, false],
      atlasSeedArchiveUnlocked: false,
      atlasSeedArchiveActivated: false,
      seedWorldRevealed: false,
      mission07Completed: false,
      mission08Unlocked: false
    });
  }
}
