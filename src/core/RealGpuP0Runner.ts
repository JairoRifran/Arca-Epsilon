import type { ProfileResult } from './FrameProfiler';
import type { RenderDiagnosticPatch } from './PerformanceDebugOverlay';

export type RealGpuBenchmarkConfig = {
  id: string;
  label: string;
  patch?: RenderDiagnosticPatch;
};

export type RealGpuResultKind =
  | 'REAL_GPU_BASELINE'
  | 'REAL_GPU_POSTPROCESSING_P1'
  | 'REAL_GPU_POSTPROCESSING_P2';

export type RealGpuP0Result = {
  kind: RealGpuResultKind;
  scenario: string;
  browser: string;
  visibilityState: DocumentVisibilityState;
  capturedAt: string;
  warmupSeconds: number;
  sampleSeconds: number;
  metadata?: Record<string, unknown>;
  runs: Array<{
    config: string;
    label: string;
    profile: ProfileResult;
    programsBefore: number;
    programsAfter: number;
    programDelta: number;
  }>;
};

type RunnerOptions<Pose> = {
  scenario: string;
  resultKind?: RealGpuResultKind;
  configs?: readonly RealGpuBenchmarkConfig[];
  warmupSeconds?: number;
  sampleSeconds?: number;
  capturePauseSeconds?: number;
  prepareScene: () => Promise<void>;
  capturePose: () => Pose;
  restorePose: (pose: Pose) => void;
  setMovement: (forward: boolean, turn: -1 | 0 | 1, boost: boolean) => void;
  profileFrames: (label: string, seconds: number) => Promise<ProfileResult>;
  setRenderDiagnostic: (patch: RenderDiagnosticPatch) => unknown;
  resetRenderDiagnostics: () => void;
  getProgramCount: () => number;
  getMetadata?: () => Record<string, unknown>;
};

const CONFIGS: readonly RealGpuBenchmarkConfig[] = [
  { id: 'REAL_GPU_NORMAL', label: 'Normal' },
  { id: 'REAL_GPU_NO_POST', label: 'Post Off', patch: { bypassPost: true } },
  { id: 'REAL_GPU_PR_1_0', label: 'PR 1.0', patch: { pixelRatio: 1 } },
  { id: 'REAL_GPU_PR_1_25', label: 'PR 1.25', patch: { pixelRatio: 1.25 } },
  { id: 'REAL_GPU_PR_1_5', label: 'PR 1.5', patch: { pixelRatio: 1.5 } },
  { id: 'REAL_GPU_NO_SHADOWS', label: 'Shadows Off', patch: { pixelRatio: 1.5, shadows: false } }
];

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

/** Runs the fixed P0 matrix in the real page. It is constructed only by the explicit URL flag. */
export class RealGpuP0Runner<Pose> {
  private readonly panel = document.createElement('section');
  private readonly title = document.createElement('strong');
  private readonly status = document.createElement('div');
  private readonly metrics = document.createElement('pre');
  private running = false;

  constructor(private readonly options: RunnerOptions<Pose>) {
    this.panel.id = 'real-gpu-p0-runner';
    this.panel.dataset.status = 'idle';
    this.panel.style.cssText = [
      'position:fixed', 'left:12px', 'bottom:44px', 'z-index:100001',
      'width:350px', 'box-sizing:border-box', 'padding:12px',
      'border:1px solid rgba(111,220,255,.38)', 'background:rgba(3,9,13,.94)',
      'color:#d9f7ff', 'font:600 12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace',
      'box-shadow:0 12px 40px rgba(0,0,0,.45)', 'pointer-events:none'
    ].join(';');
    this.title.textContent = 'REAL GPU P0 // WAITING';
    this.title.style.cssText = 'display:block;color:#7fddf4;margin-bottom:5px;letter-spacing:0';
    this.status.textContent = 'Preparando escena M01';
    this.metrics.style.cssText = 'margin:8px 0 0;white-space:pre-wrap;color:#b9dce5';
    this.panel.append(this.title, this.status, this.metrics);
    document.body.append(this.panel);
  }

  async run(): Promise<RealGpuP0Result | undefined> {
    if (this.running) return undefined;
    this.running = true;
    const warmupSeconds = this.options.warmupSeconds ?? 8;
    const sampleSeconds = this.options.sampleSeconds ?? 15;
    const capturePauseSeconds = this.options.capturePauseSeconds ?? 8;
    const result: RealGpuP0Result = {
      kind: this.options.resultKind ?? 'REAL_GPU_BASELINE',
      scenario: this.options.scenario,
      browser: navigator.userAgent,
      visibilityState: document.visibilityState,
      capturedAt: new Date().toISOString(),
      warmupSeconds,
      sampleSeconds,
      runs: []
    };
    this.panel.dataset.kind = result.kind;

    try {
      this.publish('preparing', '', 'Preparando M01 / salida del Arca');
      await this.options.prepareScene();
      result.metadata = this.options.getMetadata?.();
      this.requireVisible();
      this.publish('warmup', '', `Warm-up dinámico · ${warmupSeconds}s`);
      await this.driveFor(warmupSeconds);
      const pose = this.options.capturePose();

      const configs = this.options.configs ?? CONFIGS;
      for (const config of configs) {
        this.requireVisible();
        this.options.setMovement(false, 0, false);
        this.options.restorePose(pose);
        this.options.resetRenderDiagnostics();
        if (config.patch) this.options.setRenderDiagnostic(config.patch);
        await wait(1500);

        this.publish('measuring', config.id, `${config.label} · midiendo ${sampleSeconds}s`);
        const programsBefore = this.options.getProgramCount();
        const profile = await this.profileWithMovement(config.id, sampleSeconds);
        this.requireVisible();
        const programsAfter = this.options.getProgramCount();
        result.runs.push({
          config: config.id,
          label: config.label,
          profile,
          programsBefore,
          programsAfter,
          programDelta: programsAfter - programsBefore
        });
        this.publishResult(config, profile, programsBefore, programsAfter);
        await wait(capturePauseSeconds * 1000);
      }

      this.options.setMovement(false, 0, false);
      this.options.resetRenderDiagnostics();
      this.options.restorePose(pose);
      this.panel.dataset.status = 'complete';
      this.panel.dataset.config = '';
      this.title.textContent = 'REAL GPU P0 // COMPLETE';
      this.status.textContent = `${result.runs.length}/${configs.length} configuraciones capturadas`;
      const payload = document.createElement('script');
      payload.id = 'real-gpu-p0-metrics';
      payload.type = 'application/json';
      payload.textContent = JSON.stringify(result);
      document.body.append(payload);
      return result;
    } catch (error) {
      this.options.setMovement(false, 0, false);
      this.options.resetRenderDiagnostics();
      this.panel.dataset.status = 'failed';
      this.title.textContent = 'REAL GPU P0 // FAILED';
      this.status.textContent = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async profileWithMovement(label: string, seconds: number): Promise<ProfileResult> {
    let phase = 0;
    this.applyMovementPhase(phase);
    const interval = window.setInterval(() => {
      phase = (phase + 1) % 4;
      this.applyMovementPhase(phase);
    }, 2500);
    try {
      return await this.options.profileFrames(label, seconds);
    } finally {
      window.clearInterval(interval);
      this.options.setMovement(false, 0, false);
    }
  }

  private async driveFor(seconds: number): Promise<void> {
    let phase = 0;
    this.applyMovementPhase(phase);
    const interval = window.setInterval(() => {
      phase = (phase + 1) % 4;
      this.applyMovementPhase(phase);
    }, 2000);
    await wait(seconds * 1000);
    window.clearInterval(interval);
    this.options.setMovement(false, 0, false);
  }

  private applyMovementPhase(phase: number): void {
    const turn = phase % 2 === 0 ? 1 : -1;
    this.options.setMovement(true, turn, phase === 1 || phase === 2);
  }

  private requireVisible(): void {
    if (document.visibilityState !== 'visible') {
      throw new Error(`Benchmark cancelado: pestaña ${document.visibilityState}`);
    }
  }

  private publish(status: string, config: string, message: string): void {
    this.panel.dataset.status = status;
    this.panel.dataset.config = config;
    this.title.textContent = `REAL GPU P0 // ${config || status.toUpperCase()}`;
    this.status.textContent = message;
    this.metrics.textContent = '';
  }

  private publishResult(
    config: RealGpuBenchmarkConfig,
    profile: ProfileResult,
    before: number,
    after: number
  ): void {
    const frames = profile.frames;
    this.panel.dataset.status = 'capture';
    this.panel.dataset.config = config.id;
    this.panel.dataset.gpuRenderer = profile.device.glRenderer;
    this.panel.dataset.gpuVendor = profile.device.glVendor;
    this.title.textContent = `REAL GPU P0 // ${config.id}`;
    this.status.textContent = 'Captura disponible';
    this.metrics.textContent = [
      `FPS ${frames.fpsAverage.toFixed(1)}  |  1% LOW ${frames.fpsOnePercentLow.toFixed(1)}`,
      `MEAN ${frames.frameMs.mean.toFixed(2)}ms  P95 ${frames.frameMs.p95.toFixed(2)}  P99 ${frames.frameMs.p99.toFixed(2)}`,
      `MAX ${frames.frameMs.max.toFixed(2)}ms  >33 ${frames.over33ms}  >50 ${frames.over50ms}`,
      `DRAWS ${profile.renderer.calls}  TRIS ${profile.renderer.triangles}`,
      `PROGRAMS ${before} → ${after}  GEO ${profile.renderer.geometries}  TEX ${profile.renderer.textures}`,
      `PR ${profile.device.rendererPixelRatio.toFixed(2)}  BUFFER ${profile.device.drawingBufferWidth}x${profile.device.drawingBufferHeight}`,
      `GPU ${profile.device.glRenderer}`,
      `VENDOR ${profile.device.glVendor}`
    ].join('\n');
  }
}
