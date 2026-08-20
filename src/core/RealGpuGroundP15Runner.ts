import type { ProfileResult } from './FrameProfiler';
import type { GroundDrawCensus } from './GroundP15Diagnostics';
import type { GroundPerformanceSnapshot } from './GroundPerformanceTelemetry';
import type { GroundSceneInventory } from './RealGpuGroundRunner';

export type GroundP15Mode = 'baseline' | 'optimized';
export type GroundP15RunId = 'base-route' | 'camera-turn' | 'grade-on' | 'grade-off';

export type GroundP15Run = {
  id: GroundP15RunId;
  profile: ProfileResult;
  ground: GroundPerformanceSnapshot;
  inventory: GroundSceneInventory;
  census: GroundDrawCensus;
};

export type RealGpuGroundP15Result = {
  kind: 'REAL_GPU_GROUND_P15';
  mode: GroundP15Mode;
  scenario: string;
  browser: string;
  visibilityState: DocumentVisibilityState;
  capturedAt: string;
  metadata: Record<string, unknown>;
  censusViews: Array<{ yaw: number; census: GroundDrawCensus }>;
  runs: GroundP15Run[];
};

type RunnerOptions = {
  mode: GroundP15Mode;
  prepareScene: () => Promise<void>;
  prepareBase: () => void;
  prepareWalkTurn: () => void;
  setMovement: (forward: -1 | 0 | 1, strafe: -1 | 0 | 1, sprint: boolean) => void;
  setCameraYaw: (yaw: number) => void;
  readCameraYaw: () => number;
  setGrade: (enabled: boolean) => void;
  resetDiagnostics: () => void;
  beginGroundWindow: () => void;
  endGroundWindow: () => GroundPerformanceSnapshot;
  getInventory: () => GroundSceneInventory;
  getCensus: () => GroundDrawCensus;
  getMetadata: () => Record<string, unknown>;
  profileFrames: (label: string, seconds: number) => Promise<ProfileResult>;
  markEvent: (name: string) => void;
  captureStage?: (stage: string) => Promise<void> | void;
};

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export class RealGpuGroundP15Runner {
  private readonly panel = document.createElement('section');
  private readonly title = document.createElement('strong');
  private readonly status = document.createElement('div');
  private readonly metrics = document.createElement('pre');
  private readonly timers: number[] = [];
  private movementTimer = 0;

  constructor(private readonly options: RunnerOptions) {
    this.panel.id = 'real-gpu-ground-p15-runner';
    this.panel.style.cssText = [
      'position:fixed', 'right:12px', 'bottom:44px', 'z-index:100001',
      'width:430px', 'box-sizing:border-box', 'padding:12px',
      'border:1px solid rgba(111,220,255,.38)', 'background:rgba(3,9,13,.94)',
      'color:#d9f7ff', 'font:600 12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace',
      'box-shadow:0 12px 40px rgba(0,0,0,.45)', 'pointer-events:none'
    ].join(';');
    this.title.style.cssText = 'display:block;color:#7fddf4;margin-bottom:5px;letter-spacing:0';
    this.metrics.style.cssText = 'margin:8px 0 0;white-space:pre-wrap;color:#b9dce5';
    this.panel.append(this.title, this.status, this.metrics);
    document.body.append(this.panel);
  }

  async run(): Promise<RealGpuGroundP15Result> {
    const result: RealGpuGroundP15Result = {
      kind: 'REAL_GPU_GROUND_P15',
      mode: this.options.mode,
      scenario: 'Cuenca Nereida // Base route + camera turn route',
      browser: navigator.userAgent,
      visibilityState: document.visibilityState,
      capturedAt: new Date().toISOString(),
      metadata: {},
      censusViews: [],
      runs: []
    };

    try {
      this.publish('PREPARING', 'Cargando Nereida y estabilizando High');
      await this.options.prepareScene();
      this.requireVisible();
      this.options.setGrade(true);
      await wait(1800);
      result.metadata = this.options.getMetadata();

      await this.captureBaseCensusViews(result);
      result.runs.push(await this.measureBaseRoute());
      await this.options.captureStage?.(`${this.options.mode}-base`);
      result.runs.push(await this.measureCameraTurn());
      await this.options.captureStage?.(`${this.options.mode}-camera-turn`);
      result.runs.push(await this.measureGrade(true));
      result.runs.push(await this.measureGrade(false));

      this.stopMotion();
      this.options.resetDiagnostics();
      this.panel.dataset.status = 'complete';
      this.title.textContent = `GROUND P15 ${this.options.mode.toUpperCase()} // COMPLETE`;
      this.status.textContent = `${result.runs.length} muestras + ${result.censusViews.length} census`;
      const payload = document.createElement('script');
      payload.id = 'real-gpu-ground-p15-metrics';
      payload.type = 'application/json';
      payload.textContent = JSON.stringify(result);
      document.body.append(payload);
      return result;
    } catch (error) {
      this.stopMotion();
      this.options.resetDiagnostics();
      this.panel.dataset.status = 'failed';
      this.title.textContent = 'GROUND P15 // FAILED';
      this.status.textContent = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private async captureBaseCensusViews(result: RealGpuGroundP15Result): Promise<void> {
    this.options.prepareBase();
    const startYaw = this.options.readCameraYaw();
    for (const offset of [0, Math.PI * 0.5, Math.PI, -Math.PI * 0.5]) {
      const yaw = startYaw + offset;
      this.options.setCameraYaw(yaw);
      await wait(700);
      result.censusViews.push({ yaw: Number(yaw.toFixed(3)), census: this.options.getCensus() });
    }
    this.options.setCameraYaw(startYaw);
    await wait(500);
  }

  private async measureBaseRoute(): Promise<GroundP15Run> {
    this.publish('1/4', 'Base route // warm-up');
    this.options.prepareBase();
    this.options.setGrade(true);
    this.startAlternatingWalk(false);
    const initialYaw = this.options.readCameraYaw();
    this.schedule(2200, () => this.options.setCameraYaw(initialYaw + Math.PI * 0.38));
    this.schedule(4800, () => this.options.setCameraYaw(initialYaw - Math.PI * 0.3));
    this.schedule(7200, () => this.options.setCameraYaw(initialYaw + Math.PI * 0.58));
    await wait(8000);
    this.clearTimers();
    this.options.beginGroundWindow();
    this.publish('1/4', 'Base route // sample 15s');
    this.schedule(2500, () => this.options.setCameraYaw(initialYaw + Math.PI * 0.5));
    this.schedule(6200, () => this.options.setCameraYaw(initialYaw - Math.PI * 0.42));
    this.schedule(9800, () => this.options.setCameraYaw(initialYaw + Math.PI * 0.75));
    this.schedule(12800, () => this.options.setCameraYaw(initialYaw));
    const profile = await this.options.profileFrames(`GROUND_P15_${this.options.mode}_base-route`, 15);
    const run = this.finishRun('base-route', profile);
    this.stopMotion();
    return run;
  }

  private async measureCameraTurn(): Promise<GroundP15Run> {
    this.publish('2/4', 'Camera turn route // warm-up');
    this.options.prepareWalkTurn();
    this.options.setGrade(true);
    this.startAlternatingWalk(false);
    await wait(8000);
    const initialYaw = this.options.readCameraYaw();
    this.options.beginGroundWindow();
    this.publish('2/4', 'Camera turn route // sample 15s');
    this.schedule(1500, () => {
      this.options.markEvent('camera-turn-start');
      this.options.setCameraYaw(initialYaw + Math.PI * 0.5);
    });
    this.schedule(4300, () => {
      this.options.markEvent('camera-turn-90');
      this.options.setCameraYaw(initialYaw + Math.PI);
    });
    this.schedule(7200, () => {
      this.options.markEvent('camera-turn-180');
      this.options.setCameraYaw(initialYaw - Math.PI * 0.12);
    });
    this.schedule(9700, () => {
      this.options.markEvent('camera-turn-end');
      this.options.setCameraYaw(initialYaw);
    });
    const profile = await this.options.profileFrames(`GROUND_P15_${this.options.mode}_camera-turn`, 15);
    const run = this.finishRun('camera-turn', profile);
    this.stopMotion();
    return run;
  }

  private async measureGrade(enabled: boolean): Promise<GroundP15Run> {
    const id: GroundP15RunId = enabled ? 'grade-on' : 'grade-off';
    this.publish(enabled ? '3/4' : '4/4', `${id} // warm-up`);
    this.options.prepareWalkTurn();
    this.options.setGrade(enabled);
    this.startAlternatingWalk(false);
    await wait(5000);
    this.options.beginGroundWindow();
    this.publish(enabled ? '3/4' : '4/4', `${id} // sample 10s`);
    const profile = await this.options.profileFrames(`GROUND_P15_${this.options.mode}_${id}`, 10);
    const run = this.finishRun(id, profile);
    this.stopMotion();
    return run;
  }

  private finishRun(id: GroundP15RunId, profile: ProfileResult): GroundP15Run {
    const run: GroundP15Run = {
      id,
      profile,
      ground: this.options.endGroundWindow(),
      inventory: this.options.getInventory(),
      census: this.options.getCensus()
    };
    const frames = profile.frames;
    this.metrics.textContent = [
      id.toUpperCase(),
      `FPS ${frames.fpsAverage}  1% ${frames.fpsOnePercentLow}`,
      `MEAN ${frames.frameMs.mean}  P95 ${frames.frameMs.p95}  P99 ${frames.frameMs.p99}`,
      `DRAWS ${profile.renderer.calls}  TRIS ${profile.renderer.triangles}`,
      `VISIBLE ${run.census.visibleObjects}  NEW ${run.census.newlyVisibleObjects}`,
      `BASE ${run.census.categories.base}  POST/SHADOW ${run.census.postAndShadowCalls}`
    ].join('\n');
    return run;
  }

  private startAlternatingWalk(sprint: boolean): void {
    let direction: -1 | 1 = 1;
    this.options.setMovement(direction, 0, sprint);
    this.movementTimer = window.setInterval(() => {
      direction = direction === 1 ? -1 : 1;
      this.options.setMovement(direction, 0, sprint);
    }, 2200);
  }

  private stopMotion(): void {
    this.clearTimers();
    if (this.movementTimer !== 0) {
      window.clearInterval(this.movementTimer);
      this.movementTimer = 0;
    }
    this.options.setMovement(0, 0, false);
  }

  private schedule(delay: number, callback: () => void): void {
    this.timers.push(window.setTimeout(callback, delay));
  }

  private clearTimers(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.length = 0;
  }

  private publish(stage: string, message: string): void {
    this.panel.dataset.status = stage;
    this.title.textContent = `GROUND P15 ${this.options.mode.toUpperCase()} // ${stage}`;
    this.status.textContent = message;
    this.metrics.textContent = '';
  }

  private requireVisible(): void {
    if (document.visibilityState !== 'visible') {
      throw new Error(`Benchmark cancelado: pestana ${document.visibilityState}`);
    }
  }
}
