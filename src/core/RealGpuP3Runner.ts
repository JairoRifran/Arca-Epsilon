import type { ProfileResult } from './FrameProfiler';
import type { GpuPrewarmResult } from './GpuResourcePrewarmer';

export type P3BenchmarkMode = 'baseline' | 'optimized' | 'direct';

export type RealGpuP3Result = {
  kind: 'REAL_GPU_STUTTER_P3';
  mode: P3BenchmarkMode;
  scenario: string;
  browser: string;
  visibilityState: DocumentVisibilityState;
  capturedAt: string;
  sampleSeconds: number;
  preparation: GpuPrewarmResult | null;
  metadata: Record<string, unknown>;
  runs: Array<{
    phase: 'cold' | 'warm';
    profile: ProfileResult;
    programsBefore: number;
    programsAfter: number;
    programDelta: number;
  }>;
};

type P3RunnerOptions = {
  mode: P3BenchmarkMode;
  scenario: string;
  sampleSeconds?: number;
  prepareScene: () => Promise<void>;
  getPreparation: () => GpuPrewarmResult | null;
  resetScenario: () => void;
  runSequence: () => Promise<void>;
  profileFrames: (label: string, seconds: number) => Promise<ProfileResult>;
  getProgramCount: () => number;
  getMetadata: () => Record<string, unknown>;
  setDirect: (enabled: boolean) => void;
};

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

/** Cold/warm first-use runner. Constructed only by the explicit P3 URL flag. */
export class RealGpuP3Runner {
  private readonly panel = document.createElement('section');
  private readonly title = document.createElement('strong');
  private readonly status = document.createElement('div');
  private readonly metrics = document.createElement('pre');

  constructor(private readonly options: P3RunnerOptions) {
    this.panel.id = 'real-gpu-p3-runner';
    this.panel.dataset.status = 'idle';
    this.panel.style.cssText = [
      'position:fixed', 'left:12px', 'bottom:44px', 'z-index:100001',
      'width:390px', 'box-sizing:border-box', 'padding:12px',
      'border:1px solid rgba(111,220,255,.38)', 'background:rgba(3,9,13,.94)',
      'color:#d9f7ff', 'font:600 12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace',
      'box-shadow:0 12px 40px rgba(0,0,0,.45)', 'pointer-events:none'
    ].join(';');
    this.title.style.cssText = 'display:block;color:#7fddf4;margin-bottom:5px;letter-spacing:0';
    this.metrics.style.cssText = 'margin:8px 0 0;white-space:pre-wrap;color:#b9dce5';
    this.panel.append(this.title, this.status, this.metrics);
    document.body.append(this.panel);
  }

  async run(): Promise<RealGpuP3Result> {
    const sampleSeconds = this.options.sampleSeconds ?? 15;
    this.publish('preparing', 'Preparando secuencia reproducible');
    this.options.setDirect(this.options.mode === 'direct');
    await this.options.prepareScene();
    this.requireVisible();
    const result: RealGpuP3Result = {
      kind: 'REAL_GPU_STUTTER_P3',
      mode: this.options.mode,
      scenario: this.options.scenario,
      browser: navigator.userAgent,
      visibilityState: document.visibilityState,
      capturedAt: new Date().toISOString(),
      sampleSeconds,
      preparation: this.options.getPreparation(),
      metadata: this.options.getMetadata(),
      runs: []
    };

    try {
      for (const phase of ['cold', 'warm'] as const) {
        this.requireVisible();
        this.options.resetScenario();
        await wait(750);
        const programsBefore = this.options.getProgramCount();
        this.publish(phase, `${phase.toUpperCase()} · secuencia de ${sampleSeconds}s`);
        const profilePromise = this.options.profileFrames(`P3_${this.options.mode}_${phase}`, sampleSeconds);
        await this.options.runSequence();
        const profile = await profilePromise;
        this.requireVisible();
        const programsAfter = this.options.getProgramCount();
        result.runs.push({
          phase,
          profile,
          programsBefore,
          programsAfter,
          programDelta: programsAfter - programsBefore
        });
        this.publishResult(phase, profile, programsBefore, programsAfter);
        await wait(1500);
      }
      this.options.resetScenario();
      this.options.setDirect(false);
      this.panel.dataset.status = 'complete';
      this.title.textContent = `REAL GPU P3 // ${this.options.mode.toUpperCase()} COMPLETE`;
      this.status.textContent = 'Cold/Warm capturados';
      const payload = document.createElement('script');
      payload.id = 'real-gpu-p3-metrics';
      payload.type = 'application/json';
      payload.textContent = JSON.stringify(result);
      document.body.append(payload);
      return result;
    } catch (error) {
      this.options.resetScenario();
      this.options.setDirect(false);
      this.panel.dataset.status = 'failed';
      this.title.textContent = 'REAL GPU P3 // FAILED';
      this.status.textContent = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private publish(status: string, message: string): void {
    this.panel.dataset.status = status;
    this.title.textContent = `REAL GPU P3 // ${this.options.mode.toUpperCase()} // ${status.toUpperCase()}`;
    this.status.textContent = message;
    this.metrics.textContent = '';
  }

  private publishResult(phase: 'cold' | 'warm', profile: ProfileResult, before: number, after: number): void {
    const frames = profile.frames;
    this.metrics.textContent = [
      `${phase.toUpperCase()}  FPS ${frames.fpsAverage.toFixed(1)}  1% ${frames.fpsOnePercentLow.toFixed(1)}`,
      `MEAN ${frames.frameMs.mean.toFixed(2)}  P95 ${frames.frameMs.p95.toFixed(2)}  P99 ${frames.frameMs.p99.toFixed(2)}`,
      `MAX ${frames.frameMs.max.toFixed(2)}  >33 ${frames.over33ms}  >50 ${frames.over50ms}`,
      `PROGRAMS ${before} -> ${after}`,
      `EVENTS ${profile.timeline?.events.length ?? 0}  SPIKES ${profile.timeline?.slowFrames.length ?? 0}`
    ].join('\n');
  }

  private requireVisible(): void {
    if (document.visibilityState !== 'visible') {
      throw new Error(`Benchmark cancelado: pestaña ${document.visibilityState}`);
    }
  }
}
