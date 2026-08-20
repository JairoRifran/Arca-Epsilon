import type { ProfileResult } from './FrameProfiler';
import type { GroundPerformanceSnapshot } from './GroundPerformanceTelemetry';

export type GroundBenchmarkMode = 'baseline' | 'isolation' | 'optimized';
export type GroundCheckpoint = 'terrain-open' | 'nereida-base' | 'dense-ground' | 'walk-turn' | 'sprint';
export type GroundDiagnosticPreset =
  | 'normal'
  | 'original-ground'
  | 'pr-1'
  | 'optimized-normal'
  | 'optimized-pr-085'
  | 'optimized-pr-075'
  | 'bloom-half'
  | 'bloom-off'
  | 'post-off'
  | 'shadow-1024'
  | 'shadows-off'
  | 'character-off'
  | 'rocks-off'
  | 'base-off'
  | 'base-detail-off'
  | 'particles-off'
  | 'environment-minimal';

export type GroundSceneInventory = {
  visibleMeshes: number;
  skinnedMeshes: number;
  shadowCasters: number;
  lights: number;
  activeAnimations: number;
  characterMeshes: number;
  characterBones: number;
  characterMaterials: number;
  characterTriangles: number;
  rockClusters: number;
  rockInstances: number;
  baseMidDetailVisible: boolean;
  baseCloseDetailVisible: boolean;
  groundResolutionScale: number;
  rendererPixelRatio: number;
};

export type RealGpuGroundRun = {
  id: string;
  checkpoint: GroundCheckpoint;
  preset: GroundDiagnosticPreset;
  profile: ProfileResult;
  ground: GroundPerformanceSnapshot;
  inventory: GroundSceneInventory;
};

export type RealGpuGroundResult = {
  kind: 'REAL_GPU_GROUND_PERFORMANCE';
  mode: GroundBenchmarkMode;
  scenario: string;
  browser: string;
  visibilityState: DocumentVisibilityState;
  capturedAt: string;
  warmupSeconds: number;
  sampleSeconds: number;
  metadata: Record<string, unknown>;
  runs: RealGpuGroundRun[];
};

type RunnerOptions = {
  mode: GroundBenchmarkMode;
  warmupSeconds?: number;
  sampleSeconds?: number;
  prepareScene: () => Promise<void>;
  prepareCheckpoint: (checkpoint: GroundCheckpoint) => void;
  setMovement: (forward: -1 | 0 | 1, strafe: -1 | 0 | 1, sprint: boolean) => void;
  setCameraTurn: (speed: number) => void;
  setPreset: (preset: GroundDiagnosticPreset) => void;
  resetDiagnostics: () => void;
  beginGroundWindow: () => void;
  endGroundWindow: () => GroundPerformanceSnapshot;
  getInventory: () => GroundSceneInventory;
  getMetadata: () => Record<string, unknown>;
  profileFrames: (label: string, seconds: number) => Promise<ProfileResult>;
  captureStage?: (stage: string) => Promise<void> | void;
  isolationPresets?: readonly GroundDiagnosticPreset[];
};

const ROUTE: readonly GroundCheckpoint[] = [
  'terrain-open',
  'nereida-base',
  'dense-ground',
  'walk-turn',
  'sprint'
];

const ISOLATION: readonly GroundDiagnosticPreset[] = [
  'normal',
  'pr-1',
  'post-off',
  'shadows-off',
  'character-off',
  'rocks-off',
  'base-off',
  'base-detail-off',
  'particles-off',
  'environment-minimal'
];

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export class RealGpuGroundRunner {
  private readonly panel = document.createElement('section');
  private readonly title = document.createElement('strong');
  private readonly status = document.createElement('div');
  private readonly metrics = document.createElement('pre');
  private movementDirection: -1 | 1 = 1;
  private movementTimer = 0;

  constructor(private readonly options: RunnerOptions) {
    this.panel.id = 'real-gpu-ground-runner';
    this.panel.style.cssText = [
      'position:fixed', 'right:12px', 'bottom:44px', 'z-index:100001',
      'width:410px', 'box-sizing:border-box', 'padding:12px',
      'border:1px solid rgba(111,220,255,.38)', 'background:rgba(3,9,13,.94)',
      'color:#d9f7ff', 'font:600 12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace',
      'box-shadow:0 12px 40px rgba(0,0,0,.45)', 'pointer-events:none'
    ].join(';');
    this.title.style.cssText = 'display:block;color:#7fddf4;margin-bottom:5px;letter-spacing:0';
    this.metrics.style.cssText = 'margin:8px 0 0;white-space:pre-wrap;color:#b9dce5';
    this.panel.append(this.title, this.status, this.metrics);
    document.body.append(this.panel);
  }

  async run(): Promise<RealGpuGroundResult> {
    const warmupSeconds = this.options.warmupSeconds ?? 8;
    const sampleSeconds = this.options.sampleSeconds ?? 15;
    const result: RealGpuGroundResult = {
      kind: 'REAL_GPU_GROUND_PERFORMANCE',
      mode: this.options.mode,
      scenario: 'Cuenca Nereida // ruta reproducible a pie',
      browser: navigator.userAgent,
      visibilityState: document.visibilityState,
      capturedAt: new Date().toISOString(),
      warmupSeconds,
      sampleSeconds,
      metadata: {},
      runs: []
    };

    try {
      this.publish('PREPARING', 'Cargando superficie y Base Nereida');
      await this.options.prepareScene();
      result.metadata = this.options.getMetadata();
      this.requireVisible();

      if (this.options.mode === 'isolation') {
        const presets = this.options.isolationPresets ?? ISOLATION;
        for (let index = 0; index < presets.length; index += 1) {
          const preset = presets[index];
          await this.measure(result, 'walk-turn', preset, index, presets.length, warmupSeconds, sampleSeconds);
        }
      } else {
        for (let index = 0; index < ROUTE.length; index += 1) {
          await this.measure(result, ROUTE[index], 'normal', index, ROUTE.length, warmupSeconds, sampleSeconds);
        }
      }

      this.stopMotion();
      this.options.resetDiagnostics();
      this.panel.dataset.status = 'complete';
      this.title.textContent = `GROUND ${this.options.mode.toUpperCase()} // COMPLETE`;
      this.status.textContent = `${result.runs.length} muestras capturadas`;
      const payload = document.createElement('script');
      payload.id = 'real-gpu-ground-metrics';
      payload.type = 'application/json';
      payload.textContent = JSON.stringify(result);
      document.body.append(payload);
      return result;
    } catch (error) {
      this.stopMotion();
      this.options.resetDiagnostics();
      this.panel.dataset.status = 'failed';
      this.title.textContent = 'GROUND PERFORMANCE // FAILED';
      this.status.textContent = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private async measure(
    result: RealGpuGroundResult,
    checkpoint: GroundCheckpoint,
    preset: GroundDiagnosticPreset,
    index: number,
    total: number,
    warmupSeconds: number,
    sampleSeconds: number
  ): Promise<void> {
    this.requireVisible();
    this.stopMotion();
    this.options.resetDiagnostics();
    this.options.setPreset(preset);
    this.options.prepareCheckpoint(checkpoint);
    this.applyMotion(checkpoint);
    this.publish(`${index + 1}/${total}`, `${checkpoint} · ${preset} · warm-up ${warmupSeconds}s`);
    await wait(warmupSeconds * 1000);
    this.requireVisible();
    this.options.beginGroundWindow();
    this.publish(`${index + 1}/${total}`, `${checkpoint} · ${preset} · muestra ${sampleSeconds}s`);
    const id = `${checkpoint}-${preset}`;
    const profile = await this.options.profileFrames(`GROUND_${this.options.mode}_${id}`, sampleSeconds);
    const ground = this.options.endGroundWindow();
    const inventory = this.options.getInventory();
    const run = { id, checkpoint, preset, profile, ground, inventory } satisfies RealGpuGroundRun;
    result.runs.push(run);
    this.publishResult(run);
    await this.options.captureStage?.(`${this.options.mode}-${id}`);
    this.stopMotion();
    await wait(900);
  }

  private applyMotion(checkpoint: GroundCheckpoint): void {
    this.movementDirection = 1;
    const sprint = checkpoint === 'sprint';
    const applyDirection = () => this.options.setMovement(this.movementDirection, 0, sprint);
    applyDirection();
    // Keep every sample inside the same visual cell instead of walking out of
    // the checkpoint while the 23-second warm-up/sample window is running.
    this.movementTimer = window.setInterval(() => {
      this.movementDirection = this.movementDirection === 1 ? -1 : 1;
      applyDirection();
    }, 2000);
    if (checkpoint === 'walk-turn') this.options.setCameraTurn(0.34);
  }

  private stopMotion(): void {
    if (this.movementTimer !== 0) {
      window.clearInterval(this.movementTimer);
      this.movementTimer = 0;
    }
    this.options.setMovement(0, 0, false);
    this.options.setCameraTurn(0);
  }

  private publish(stage: string, message: string): void {
    this.panel.dataset.status = stage;
    this.title.textContent = `GROUND ${this.options.mode.toUpperCase()} // ${stage}`;
    this.status.textContent = message;
    this.metrics.textContent = '';
  }

  private publishResult(run: RealGpuGroundRun): void {
    const frames = run.profile.frames;
    this.metrics.textContent = [
      `${run.checkpoint.toUpperCase()} / ${run.preset.toUpperCase()}`,
      `FPS ${frames.fpsAverage}  1% ${frames.fpsOnePercentLow}`,
      `MEAN ${frames.frameMs.mean}  P95 ${frames.frameMs.p95}  P99 ${frames.frameMs.p99}`,
      `>33 ${frames.over33ms}  >50 ${frames.over50ms}`,
      `DRAWS ${run.profile.renderer.calls}  TRIS ${run.profile.renderer.triangles}`,
      `GROUND Q ${run.ground.surfaceHeightQueriesPerFrame}/f  ${run.ground.surfaceHeightTimeMsPerFrame}ms`,
      `COLL ${run.ground.collisionQueriesPerFrame}/f  ${run.ground.collisionTimeMsPerFrame}ms`
    ].join('\n');
  }

  private requireVisible(): void {
    if (document.visibilityState !== 'visible') {
      throw new Error(`Benchmark cancelado: pestana ${document.visibilityState}`);
    }
  }
}
