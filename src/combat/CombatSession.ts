import type { CombatDifficulty, CombatGameType, CombatScenarioDefinition } from './CombatScenarioCatalog';

export type CombatSessionState = 'setup' | 'starting' | 'active' | 'victory' | 'defeat' | 'results' | 'ended';
export type CombatResult = 'none' | 'victory' | 'defeat';

export type CombatParticipant = {
  id: string;
  team: 'player' | 'enemy';
  kind: 'human' | 'bot';
  shipId: string;
};

export type CombatSessionSnapshot = {
  id: string;
  scenarioId: string;
  gameType: CombatGameType;
  difficulty: CombatDifficulty;
  state: CombatSessionState;
  participants: readonly CombatParticipant[];
  wave: number;
  totalWaves: number;
  enemiesRequired: number;
  enemiesSpawned: number;
  enemiesDestroyed: number;
  enemiesRemaining: number;
  kills: number;
  deaths: number;
  timeElapsed: number;
  countdownRemaining: number;
  result: CombatResult;
  timersActive: number;
};

/**
 * Offline match authority. It owns only deterministic match state; Three.js,
 * enemy presentation and input stay in the host. A server-authoritative
 * implementation can later publish the same snapshot contract.
 */
export class CombatSession {
  private state: CombatSessionState = 'setup';
  private result: CombatResult = 'none';
  private waveIndex = -1;
  private enemiesSpawned = 0;
  private enemiesDestroyed = 0;
  private kills = 0;
  private deaths = 0;
  private elapsed = 0;
  private countdown = 3;
  private intermission = 0;
  private pendingWaveSize = 0;
  private profileRecorded = false;
  private readonly snapshotState: CombatSessionSnapshot;

  readonly id: string;
  readonly participants: CombatParticipant[];

  constructor(
    readonly scenario: CombatScenarioDefinition,
    readonly gameType: CombatGameType,
    readonly difficulty: CombatDifficulty,
    playerId: string,
    shipId: string,
    alliedBotIds: readonly string[] = []
  ) {
    this.id = `offline-${scenario.id}-${Date.now().toString(36)}`;
    this.participants = [
      { id: playerId, team: 'player', kind: 'human', shipId },
      ...alliedBotIds.map((id) => ({ id, team: 'player' as const, kind: 'bot' as const, shipId }))
    ];
    this.snapshotState = {
      id: this.id,
      scenarioId: scenario.id,
      gameType,
      difficulty,
      state: this.state,
      participants: this.participants,
      wave: 0,
      totalWaves: scenario.waveSizes.length,
      enemiesRequired: 0,
      enemiesSpawned: 0,
      enemiesDestroyed: 0,
      enemiesRemaining: 0,
      kills: 0,
      deaths: 0,
      timeElapsed: 0,
      countdownRemaining: this.countdown,
      result: this.result,
      timersActive: 0
    };
  }

  start(): boolean {
    if (this.state !== 'setup') return false;
    this.state = 'starting';
    this.countdown = 3;
    return true;
  }

  update(delta: number, activeEnemies: number): void {
    if (this.state === 'ended' || this.state === 'results' || this.state === 'setup') return;
    // Match clocks may advance more slowly than wall time on low-FPS software
    // renderers. A 250 ms ceiling remains deterministic while preventing a
    // three-second countdown from stretching into a long apparent freeze.
    const dt = Math.max(0, Math.min(delta, 0.25));
    this.elapsed += dt;
    if (this.state === 'starting') {
      this.countdown = Math.max(0, this.countdown - dt);
      if (this.countdown === 0) this.queueNextWave();
      return;
    }
    if (this.state === 'victory' || this.state === 'defeat') {
      this.intermission = Math.max(0, this.intermission - dt);
      if (this.intermission === 0) this.state = 'results';
      return;
    }
    if (this.state !== 'active' || activeEnemies > 0 || this.pendingWaveSize > 0) return;
    const required = this.currentWaveSize;
    const destroyedInWave = this.enemiesDestroyed - (this.enemiesSpawned - required);
    if (destroyedInWave < required) return;
    this.intermission = Math.max(0, this.intermission - dt);
    if (this.intermission > 0) return;
    if (this.waveIndex + 1 >= this.scenario.waveSizes.length) this.finish('victory');
    else this.queueNextWave();
  }

  consumeWaveRequest(): number {
    const size = this.pendingWaveSize;
    this.pendingWaveSize = 0;
    return size;
  }

  reportEnemyDestroyed(): void {
    if (this.state !== 'active' || this.enemiesDestroyed >= this.enemiesSpawned) return;
    this.enemiesDestroyed += 1;
    this.kills += 1;
    if (this.enemiesDestroyed === this.enemiesSpawned) this.intermission = 1.6;
  }

  reportPlayerDestroyed(): void {
    if (this.state !== 'active') return;
    this.deaths += 1;
    this.finish('defeat');
  }

  showResultsImmediately(): void {
    if (this.state === 'victory' || this.state === 'defeat') this.state = 'results';
  }

  end(): void {
    this.pendingWaveSize = 0;
    this.countdown = 0;
    this.intermission = 0;
    this.state = 'ended';
  }

  markProfileRecorded(): boolean {
    if (this.profileRecorded) return false;
    this.profileRecorded = true;
    return true;
  }

  get snapshot(): CombatSessionSnapshot {
    const snapshot = this.snapshotState;
    snapshot.state = this.state;
    snapshot.wave = Math.max(0, this.waveIndex + 1);
    snapshot.enemiesRequired = this.currentWaveSize;
    snapshot.enemiesSpawned = this.enemiesSpawned;
    snapshot.enemiesDestroyed = this.enemiesDestroyed;
    snapshot.enemiesRemaining = Math.max(0, this.enemiesSpawned - this.enemiesDestroyed);
    snapshot.kills = this.kills;
    snapshot.deaths = this.deaths;
    snapshot.timeElapsed = this.elapsed;
    snapshot.countdownRemaining = this.countdown;
    snapshot.result = this.result;
    snapshot.timersActive = Number(this.countdown > 0) + Number(this.intermission > 0);
    return snapshot;
  }

  private get currentWaveSize(): number {
    return this.waveIndex >= 0 ? this.scenario.waveSizes[this.waveIndex] ?? 0 : 0;
  }

  private queueNextWave(): void {
    this.waveIndex += 1;
    this.pendingWaveSize = this.currentWaveSize;
    this.enemiesSpawned += this.currentWaveSize;
    this.state = 'active';
  }

  private finish(result: Exclude<CombatResult, 'none'>): void {
    if (this.state === 'victory' || this.state === 'defeat' || this.state === 'results' || this.state === 'ended') return;
    this.result = result;
    this.state = result;
    this.intermission = 1.4;
  }
}
