export type ChapterEndStats = {
  enemiesNeutralized: number;
  arkIntegrity: number;
  m22Priority: string;
  m23Support: string;
};

/** Lazily created Chapter I closure. It never mutates or clears save data. */
export class ChapterEndScreen {
  private root?: HTMLElement;
  private stats?: HTMLElement;

  constructor(
    private readonly onContinue: () => void,
    private readonly onMenu: () => void
  ) {}

  get visible(): boolean { return Boolean(this.root?.classList.contains('is-visible')); }
  get mounted(): boolean { return Boolean(this.root); }

  show(stats: ChapterEndStats): void {
    this.ensureMounted();
    this.stats!.innerHTML = `
      <span><b>AMENAZAS NEUTRALIZADAS</b><strong>${stats.enemiesNeutralized}</strong></span>
      <span><b>INTEGRIDAD FINAL DEL ARCA</b><strong>${Math.round(stats.arkIntegrity)}%</strong></span>
      <span><b>HERENCIA M22</b><strong>${stats.m22Priority}</strong></span>
      <span><b>APOYO M23</b><strong>${stats.m23Support}</strong></span>
    `;
    this.root!.classList.add('is-visible');
    this.root!.setAttribute('aria-hidden', 'false');
  }

  hide(): void {
    this.root?.classList.remove('is-visible');
    this.root?.setAttribute('aria-hidden', 'true');
  }

  dispose(): void {
    this.root?.remove();
    this.root = undefined;
    this.stats = undefined;
  }

  private ensureMounted(): void {
    if (this.root) return;
    const root = document.createElement('section');
    root.id = 'chapter-end-screen';
    root.className = 'chapter-end-screen';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <div class="chapter-end-content">
        <span class="chapter-end-kicker">ARCA EPSILON</span>
        <h1>CAPÍTULO I</h1>
        <h2>EL MUNDO SEMILLA</h2>
        <p>E-01 ha sido asegurado.<br>La colonización puede comenzar.</p>
        <div class="chapter-end-stats" data-role="stats"></div>
        <strong class="chapter-end-continue">Continuará…</strong>
        <nav>
          <button type="button" data-action="continue">CONTINUAR EXPLORANDO</button>
          <button type="button" data-action="menu">VOLVER AL MENÚ</button>
        </nav>
      </div>
    `;
    root.querySelector<HTMLButtonElement>('[data-action="continue"]')!.addEventListener('click', this.onContinue);
    root.querySelector<HTMLButtonElement>('[data-action="menu"]')!.addEventListener('click', this.onMenu);
    document.body.append(root);
    this.root = root;
    this.stats = root.querySelector('[data-role="stats"]') as HTMLElement;
  }
}
