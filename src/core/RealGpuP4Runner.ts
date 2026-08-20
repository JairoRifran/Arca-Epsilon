import type { ProfileResult } from './FrameProfiler';
import type { GpuPrewarmResult } from './GpuResourcePrewarmer';
import type {
  CombatVfxDiagnosticPreset,
  CombatVfxPresentationConfig
} from '../systems/CombatVfxPresentation';

export type P4BenchmarkMode = 'baseline' | 'optimized';

export type RealGpuP4Result = {
  kind: 'REAL_GPU_COMBAT_VFX_P4';
  mode: P4BenchmarkMode;
  direct: boolean;
  scenario: string;
  browser: string;
  visibilityState: DocumentVisibilityState;
  capturedAt: string;
  sampleSeconds: number;
  preparation: GpuPrewarmResult | null;
  materialAudit: Record<string, unknown>;
  metadata: Record<string, unknown>;
  runs: Array<{
    preset: CombatVfxDiagnosticPreset;
    config: CombatVfxPresentationConfig;
    profile: ProfileResult;
  }>;
};

type P4RunnerOptions = {
  mode: P4BenchmarkMode;
  direct: boolean;
  scenario: string;
  presets: readonly CombatVfxDiagnosticPreset[];
  sampleSeconds?: number;
  prepareScene: () => Promise<void>;
  getPreparation: () => GpuPrewarmResult | null;
  resetScenario: () => void;
  runSequence: () => Promise<void>;
  profileFrames: (label: string, seconds: number) => Promise<ProfileResult>;
  setPreset: (preset: CombatVfxDiagnosticPreset) => CombatVfxPresentationConfig;
  getMaterialAudit: () => Record<string, unknown>;
  getMetadata: () => Record<string, unknown>;
  setDirect: (enabled: boolean) => void;
};

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

/** Category-isolation runner. It exists only behind the explicit P4 URL flag. */
export class RealGpuP4Runner {
  private readonly panel = document.createElement('section');
  private readonly title = document.createElement('strong');
  private readonly status = document.createElement('div');
  private readonly metrics = document.createElement('pre');

  constructor(private readonly options: P4RunnerOptions) {
    this.panel.id = 'real-gpu-p4-runner';
    this.panel.dataset.status = 'idle';
    this.panel.style.cssText = [
      'position:fixed', 'left:12px', 'bottom:44px', 'z-index:100001',
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

  async run(): Promise<RealGpuP4Result> {
    const sampleSeconds = this.options.sampleSeconds ?? 15;
    this.publish('preparing', 'Preparando la secuencia pesada de P3');
    this.options.setDirect(this.options.direct);
    await this.options.prepareScene();
    this.requireVisible();
    // Settle launch camera, LOD and deterministic combat movement before the
    // first measured category. P3 compared cold/warm; P4 compares warm/warm.
    this.publish('warmup', 'Asentando camara, LOD y secuencia sin perfilar');
    this.options.setPreset('full');
    this.options.resetScenario();
    await wait(750);
    await this.options.runSequence();
    this.options.resetScenario();
    await wait(900);
    this.requireVisible();
    const result: RealGpuP4Result = {
      kind: 'REAL_GPU_COMBAT_VFX_P4',
      mode: this.options.mode,
      direct: this.options.direct,
      scenario: this.options.scenario,
      browser: navigator.userAgent,
      visibilityState: document.visibilityState,
      capturedAt: new Date().toISOString(),
      sampleSeconds,
      preparation: this.options.getPreparation(),
      materialAudit: this.options.getMaterialAudit(),
      metadata: this.options.getMetadata(),
      runs: []
    };

    try {
      for (let index = 0; index < this.options.presets.length; index += 1) {
        this.requireVisible();
        const preset = this.options.presets[index];
        const config = this.options.setPreset(preset);
        this.options.resetScenario();
        await wait(750);
        this.publish(preset, `${index + 1}/${this.options.presets.length} · ${sampleSeconds}s`);
        const profilePromise = this.options.profileFrames(
          `P4_${this.options.mode}_${this.options.direct ? 'direct' : 'post'}_${preset}`,
          sampleSeconds
        );
        await this.options.runSequence();
        const profile = await profilePromise;
        this.requireVisible();
        result.runs.push({ preset, config, profile });
        this.publishResult(preset, profile);
        await wait(900);
      }
      this.options.resetScenario();
      this.options.setPreset('full');
      this.options.setDirect(false);
      this.panel.dataset.status = 'complete';
      this.title.textContent = `REAL GPU P4 // ${this.options.mode.toUpperCase()} COMPLETE`;
      this.status.textContent = `${result.runs.length} configuraciones capturadas`;
      const payload = document.createElement('script');
      payload.id = 'real-gpu-p4-metrics';
      payload.type = 'application/json';
      payload.textContent = JSON.stringify(result);
      document.body.append(payload);
      return result;
    } catch (error) {
      this.options.resetScenario();
      this.options.setPreset('full');
      this.options.setDirect(false);
      this.panel.dataset.status = 'failed';
      this.title.textContent = 'REAL GPU P4 // FAILED';
      this.status.textContent = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private publish(status: string, message: string): void {
    this.panel.dataset.status = status;
    this.title.textContent = `REAL GPU P4 // ${this.options.mode.toUpperCase()} // ${status.toUpperCase()}`;
    this.status.textContent = message;
    this.metrics.textContent = '';
  }

  private publishResult(preset: CombatVfxDiagnosticPreset, profile: ProfileResult): void {
    const frames = profile.frames;
    this.metrics.textContent = [
      `${preset.toUpperCase()}  FPS ${frames.fpsAverage.toFixed(1)}  1% ${frames.fpsOnePercentLow.toFixed(1)}`,
      `MEAN ${frames.frameMs.mean.toFixed(2)}  P95 ${frames.frameMs.p95.toFixed(2)}  P99 ${frames.frameMs.p99.toFixed(2)}`,
      `MAX ${frames.frameMs.max.toFixed(2)}  >33 ${frames.over33ms}  >50 ${frames.over50ms}`,
      `DRAWS ${profile.renderer.calls}  TRIS ${profile.renderer.triangles}`,
      `EVENTS ${profile.timeline?.events.length ?? 0}  SPIKES ${profile.timeline?.slowFrames.length ?? 0}`
    ].join('\n');
  }

  private requireVisible(): void {
    if (document.visibilityState !== 'visible') {
      throw new Error(`Benchmark cancelado: pestana ${document.visibilityState}`);
    }
  }
}
