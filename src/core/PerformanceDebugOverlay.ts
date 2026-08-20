import type * as THREE from 'three';
import type { FrameProfiler } from './FrameProfiler';
import type { PostPassId } from './PostProcessing';

export type RenderDiagnosticPatch = {
  bypassPost?: boolean;
  pixelRatio?: number;
  shadows?: boolean;
  postPasses?: Partial<Record<PostPassId, boolean>>;
  bloomScale?: number;
  composerSamples?: number;
  fusedOutputGrade?: boolean;
};

export type RenderDiagnosticState = {
  bypassPost: boolean;
  forcePixelRatio: number;
  disableShadows: boolean;
  postPasses: Record<PostPassId, boolean>;
  bloomScale: number;
  composerSamples: number;
  fusedOutputGrade: boolean;
  lastRenderPath: 'post' | 'direct';
};

type PerformanceDebugOverlayOptions = {
  profiler: FrameProfiler;
  renderer: THREE.WebGLRenderer;
  getFrameMs: () => number;
  getDiagnosticState: () => RenderDiagnosticState;
  setDiagnostic: (patch: RenderDiagnosticPatch) => RenderDiagnosticState;
  resetDiagnostic: () => void;
};

const OVERLAY_PROFILE_LABEL = 'performance-overlay';

/** Debug-only UI over the existing FrameProfiler; it is never created in normal play. */
export class PerformanceDebugOverlay {
  private readonly root = document.createElement('section');
  private readonly metrics = document.createElement('pre');
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private nextRefreshAt = 0;
  private visible = false;

  constructor(private readonly options: PerformanceDebugOverlayOptions) {
    this.root.id = 'performance-debug-overlay';
    this.root.setAttribute('aria-label', 'Performance diagnostics');
    this.root.style.cssText = [
      'position:fixed', 'top:12px', 'right:12px', 'z-index:100000',
      'display:none', 'width:270px', 'box-sizing:border-box',
      'padding:12px', 'border:1px solid rgba(111,220,255,.38)',
      'background:rgba(3,9,13,.92)', 'color:#d9f7ff',
      'font:600 12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace',
      'box-shadow:0 12px 40px rgba(0,0,0,.45)', 'pointer-events:auto'
    ].join(';');

    const heading = document.createElement('div');
    heading.textContent = 'ARCA // PERFORMANCE';
    heading.style.cssText = 'margin-bottom:8px;color:#7fddf4;font-size:12px;letter-spacing:0';
    this.root.append(heading, this.metrics, this.createControls());
    document.body.append(this.root);
    window.addEventListener('keydown', this.onKeyDown, true);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  update(now: number): void {
    if (!this.visible) return;
    this.ensureSampling();
    if (now < this.nextRefreshAt) return;
    this.nextRefreshAt = now + 300;

    const profile = this.options.profiler.snapshot(this.options.renderer);
    const frameMs = this.options.getFrameMs();
    const fps = frameMs > 0 ? 1000 / frameMs : 0;
    const { frames, renderer, device } = profile;
    this.metrics.textContent = [
      `FPS          ${fps.toFixed(1)}`,
      `FRAME ms     ${frameMs.toFixed(2)}`,
      `P95          ${frames.frameMs.p95.toFixed(2)}`,
      `P99          ${frames.frameMs.p99.toFixed(2)}`,
      `1% LOW       ${frames.fpsOnePercentLow.toFixed(1)}`,
      '',
      `DRAWS        ${renderer.calls}`,
      `TRIS         ${renderer.triangles}`,
      `PROGRAMS     ${renderer.programs}`,
      '',
      `DPR          ${device.devicePixelRatio.toFixed(2)}`,
      `PIXEL RATIO  ${device.rendererPixelRatio.toFixed(2)}`,
      `BUFFER       ${device.drawingBufferWidth} x ${device.drawingBufferHeight}`
    ].join('\n');
    this.refreshButtonState();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'F9' || event.repeat) return;
    event.preventDefault();
    event.stopPropagation();
    this.setVisible(!this.visible);
  };

  private setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.style.display = visible ? 'block' : 'none';
    if (visible) {
      this.nextRefreshAt = 0;
      this.ensureSampling();
      return;
    }
    if (
      this.options.profiler.active &&
      this.options.profiler.currentLabel === OVERLAY_PROFILE_LABEL
    ) {
      this.options.profiler.cancel();
    }
  }

  private ensureSampling(): void {
    if (!this.options.profiler.active) this.options.profiler.start(OVERLAY_PROFILE_LABEL);
  }

  private createControls(): HTMLElement {
    const controls = document.createElement('div');
    controls.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin-top:10px';
    this.addButton(controls, 'original-post', 'ORIGINAL', () => this.options.setDiagnostic({
      bloomScale: 1,
      composerSamples: 4,
      fusedOutputGrade: false
    }));
    this.addButton(controls, 'normal', 'NORMAL', () => this.options.resetDiagnostic());
    this.addButton(controls, 'post', 'POST OFF', () => this.options.setDiagnostic({ bypassPost: true }));
    this.addButton(controls, 'shadow', 'SHADOWS OFF', () => this.options.setDiagnostic({ shadows: false }));
    for (const [ratio, label] of [[1, '1.0'], [1.25, '1.25'], [1.5, '1.5']] as const) {
      this.addButton(controls, `pr-${ratio}`, `PR ${label}`, () => {
        this.options.setDiagnostic({ pixelRatio: ratio });
      });
    }
    return controls;
  }

  private addButton(parent: HTMLElement, id: string, label: string, action: () => void): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = [
      'min-height:30px', 'padding:4px', 'border:1px solid rgba(122,208,230,.28)',
      'background:#0a1820', 'color:#b9dce5', 'font:600 10px/1.1 ui-monospace,Consolas,monospace',
      'cursor:pointer', 'letter-spacing:0'
    ].join(';');
    button.addEventListener('click', action);
    this.buttons.set(id, button);
    parent.append(button);
  }

  private refreshButtonState(): void {
    const state = this.options.getDiagnosticState();
    const ratio = this.options.renderer.getPixelRatio();
    this.setButtonActive(
      'original-post',
      !state.bypassPost && state.composerSamples === 4 && state.bloomScale === 1 && !state.fusedOutputGrade
    );
    this.setButtonActive(
      'normal',
      !state.bypassPost && !state.disableShadows && state.forcePixelRatio === 0 && state.fusedOutputGrade
    );
    this.setButtonActive('post', state.bypassPost);
    this.setButtonActive('shadow', state.disableShadows);
    for (const value of [1, 1.25, 1.5]) {
      this.setButtonActive(`pr-${value}`, state.forcePixelRatio > 0 && Math.abs(ratio - value) < 0.01);
    }
  }

  private setButtonActive(id: string, active: boolean): void {
    const button = this.buttons.get(id);
    if (!button) return;
    button.style.borderColor = active ? '#75dcf2' : 'rgba(122,208,230,.28)';
    button.style.color = active ? '#ffffff' : '#b9dce5';
    button.style.background = active ? '#12313c' : '#0a1820';
  }
}
