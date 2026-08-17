export type BootTaskId =
  | 'backdrop'
  | 'mothership'
  | 'playerShip'
  | 'orbitalMarker'
  | 'cockpit'
  | 'pilot'
  | 'systems';

type BootTask = {
  weight: number;
  progress: number;
};

export type BootMenuState = {
  hasSave: boolean;
  savedAt?: number;
  degraded?: boolean;
};

const TASKS: Record<BootTaskId, BootTask> = {
  backdrop: { weight: 0.7, progress: 0 },
  mothership: { weight: 3.2, progress: 0 },
  playerShip: { weight: 2.1, progress: 0 },
  orbitalMarker: { weight: 1.5, progress: 0 },
  cockpit: { weight: 1.4, progress: 0 },
  pilot: { weight: 1.5, progress: 0 },
  systems: { weight: 0.8, progress: 0 }
};

/**
 * Owns the boot-only DOM and its inexpensive 2D star layer. Game state stays
 * in main.ts; this class only aggregates real asset progress and presents it.
 */
export class BootExperience {
  private readonly progressBar: HTMLElement;
  private readonly progressValue: HTMLElement;
  private readonly status: HTMLElement;
  private readonly loadingView: HTMLElement;
  private readonly menuView: HTMLElement;
  private readonly saveSummary: HTMLElement;
  private readonly launchButton: HTMLButtonElement;
  private readonly loadButton: HTMLButtonElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly tasks = new Map<BootTaskId, BootTask>();
  private readonly reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly starX = new Float32Array(112);
  private readonly starY = new Float32Array(112);
  private readonly starSize = new Float32Array(112);
  private readonly starAlpha = new Float32Array(112);
  private readonly starDepth = new Float32Array(112);
  private animationFrame = 0;
  private width = 1;
  private height = 1;
  private hasFailedAsset = false;
  private customReducedMotion = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly diagnosticsMode: boolean
  ) {
    this.progressBar = this.getElement('#boot-progress-bar');
    this.progressValue = this.getElement('#boot-progress-value');
    this.status = this.getElement('#loading-status');
    this.loadingView = this.getElement('#boot-loading-view');
    this.menuView = this.getElement('#main-menu');
    this.saveSummary = this.getElement('#menu-save-summary');
    this.launchButton = this.getElement<HTMLButtonElement>('#launch-button');
    this.loadButton = this.getElement<HTMLButtonElement>('#load-game-button');
    this.canvas = this.getElement<HTMLCanvasElement>('#boot-starfield');
    this.context = this.canvas.getContext('2d', { alpha: true });

    for (const [id, task] of Object.entries(TASKS) as [BootTaskId, BootTask][]) {
      this.tasks.set(id, { ...task });
    }
    this.seedStars();
    this.resizeCanvas();
    window.addEventListener('resize', this.resizeCanvas, { passive: true });
    document.addEventListener('visibilitychange', this.syncAnimation);
    new MutationObserver(this.syncAnimation).observe(this.root, {
      attributes: true,
      attributeFilter: ['class']
    });
    this.root.classList.toggle('is-test-mode', diagnosticsMode);
    this.bindPanels();
    this.syncAnimation();
  }

  updateTask(id: BootTaskId, progress: number, status?: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.progress = Math.max(task.progress, Math.min(1, Math.max(0, progress)));
    if (status) this.status.textContent = status;
    this.renderProgress();
  }

  completeTask(id: BootTaskId, status?: string): void {
    this.updateTask(id, 1, status);
  }

  failTask(id: BootTaskId, message: string): void {
    this.hasFailedAsset = true;
    this.root.classList.add('has-load-warning');
    this.status.textContent = message;
    const task = this.tasks.get(id);
    if (task) task.progress = Math.max(task.progress, 0.05);
    this.renderProgress();
  }

  revealMenu(state: BootMenuState): void {
    this.completeTask('systems');
    this.root.classList.add('is-ready');
    this.root.classList.remove('is-loading');
    this.loadingView.setAttribute('aria-hidden', 'true');
    this.menuView.setAttribute('aria-hidden', 'false');
    this.launchButton.disabled = false;
    this.loadButton.disabled = !state.hasSave;

    if (state.hasSave) {
      const formatted = state.savedAt
        ? new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(state.savedAt)
        : 'progreso local disponible';
      this.saveSummary.textContent = `Expedicion registrada · ${formatted}`;
    } else {
      this.saveSummary.textContent = 'Sin expedicion guardada · el viaje comienza en la Arca';
    }

    if (state.degraded || this.hasFailedAsset) {
      this.saveSummary.textContent += ' · modo de compatibilidad activo';
    }
  }

  showMenu(state: BootMenuState): void {
    this.root.inert = false;
    this.root.classList.remove('is-hidden');
    this.revealMenu(state);
    this.closePanel();
    this.syncAnimation();
  }

  hide(): void {
    this.closePanel();
    this.root.inert = true;
    this.root.classList.add('is-hidden');
  }

  setReducedMotion(reduced: boolean): void {
    this.customReducedMotion = reduced;
    this.root.classList.toggle('reduce-motion', reduced);
    this.syncAnimation();
  }

  openPanel(name: string): void {
    const drawer = this.root.querySelector<HTMLElement>('#menu-drawer');
    if (!drawer) return;
    drawer.querySelectorAll<HTMLElement>('[data-menu-panel]').forEach((panel) => {
      const active = panel.dataset.menuPanel === name;
      panel.hidden = !active;
      panel.setAttribute('aria-hidden', String(!active));
    });
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    this.root.classList.add('has-open-panel');
    drawer.querySelector<HTMLElement>(`[data-menu-panel="${name}"] button, [data-menu-panel="${name}"] input`)?.focus();
  }

  closePanel(): void {
    const drawer = this.root.querySelector<HTMLElement>('#menu-drawer');
    if (!drawer) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    this.root.classList.remove('has-open-panel');
  }

  private renderProgress(): void {
    let weightedProgress = 0;
    let totalWeight = 0;
    this.tasks.forEach((task) => {
      weightedProgress += task.weight * task.progress;
      totalWeight += task.weight;
    });
    const progress = totalWeight > 0 ? weightedProgress / totalWeight : 0;
    const percent = Math.round(progress * 100);
    this.progressBar.style.transform = `scaleX(${progress.toFixed(4)})`;
    this.progressValue.textContent = `${percent}%`;
    this.progressBar.parentElement?.setAttribute('aria-valuenow', String(percent));
  }

  private bindPanels(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-open-menu-panel]').forEach((button) => {
      button.addEventListener('click', () => this.openPanel(button.dataset.openMenuPanel ?? ''));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-close-menu-panel]').forEach((button) => {
      button.addEventListener('click', () => this.closePanel());
    });
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && this.root.classList.contains('has-open-panel')) {
        event.stopPropagation();
        this.closePanel();
      }
    });
  }

  private seedStars(): void {
    let seed = 0x51a7e2;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let index = 0; index < this.starX.length; index += 1) {
      this.starX[index] = random();
      this.starY[index] = random();
      this.starSize[index] = 0.35 + random() * 1.05;
      this.starAlpha[index] = 0.12 + random() * 0.5;
      this.starDepth[index] = 0.2 + random() * 0.8;
    }
  }

  private readonly resizeCanvas = (): void => {
    const pixelRatio = this.diagnosticsMode ? 1 : Math.min(window.devicePixelRatio, 1.25);
    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
    this.canvas.width = Math.round(this.width * pixelRatio);
    this.canvas.height = Math.round(this.height * pixelRatio);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  private readonly syncAnimation = (): void => {
    const shouldAnimate =
      !this.diagnosticsMode &&
      !this.customReducedMotion &&
      !this.reducedMotionQuery.matches &&
      !document.hidden &&
      !this.root.classList.contains('is-hidden');
    if (shouldAnimate && this.animationFrame === 0) {
      this.animationFrame = requestAnimationFrame(this.drawStars);
    } else if (!shouldAnimate && this.animationFrame !== 0) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
      this.drawStaticStars();
    }
  };

  private readonly drawStars = (time: number): void => {
    this.animationFrame = 0;
    this.drawStaticStars(time);
    if (!this.root.classList.contains('is-hidden') && !document.hidden) {
      this.animationFrame = requestAnimationFrame(this.drawStars);
    }
  };

  private drawStaticStars(time = 0): void {
    const context = this.context;
    if (!context) return;
    context.clearRect(0, 0, this.width, this.height);
    context.fillStyle = '#d9f0ff';
    const drift = time * 0.0000025;
    for (let index = 0; index < this.starX.length; index += 1) {
      const depth = this.starDepth[index];
      const x = ((this.starX[index] + drift * depth) % 1) * this.width;
      const y = this.starY[index] * this.height;
      context.globalAlpha = this.starAlpha[index] * (0.82 + Math.sin(time * 0.00035 + index) * 0.18);
      context.beginPath();
      context.arc(x, y, this.starSize[index] * depth, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  private getElement<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing boot UI element: ${selector}`);
    return element;
  }
}
