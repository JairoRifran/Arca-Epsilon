import { MISSION25_SYSTEM_LABELS, type Mission25StateId } from '../assets/mission25Definitions';

export type Mission25HudState = {
  step: Mission25StateId;
  objective: string;
  arkIntegrity: number;
  systemIntegrities: readonly number[];
  activeEnemies: number;
  wave: number;
  nodesDestroyed: number;
  coreIntegrity: number;
  coreExposed: boolean;
  stabilizationProgress: number;
};

/** Compact, lazily mounted combat readout. The global HUD remains authoritative. */
export class Mission25Hud {
  private root?: HTMLElement;
  private objective?: HTMLElement;
  private arkIntegrity?: HTMLElement;
  private systems?: HTMLElement;
  private pressure?: HTMLElement;
  private counterattack?: HTMLElement;

  constructor(private readonly parent: HTMLElement) {}

  get mounted(): boolean { return Boolean(this.root); }
  get visible(): boolean { return Boolean(this.root?.classList.contains('is-active')); }

  setVisible(visible: boolean): void {
    if (visible) this.ensureMounted();
    this.root?.classList.toggle('is-active', visible);
    this.root?.setAttribute('aria-hidden', String(!visible));
  }

  update(state: Mission25HudState): void {
    this.ensureMounted();
    this.objective!.textContent = state.objective;
    this.arkIntegrity!.textContent = `${Math.round(state.arkIntegrity)}%`;
    this.arkIntegrity!.dataset.state = state.arkIntegrity < 40 ? 'critical' : state.arkIntegrity < 70 ? 'pressure' : 'stable';
    let systemsMarkup = '';
    for (let index = 0; index < MISSION25_SYSTEM_LABELS.length; index += 1) {
      const label = MISSION25_SYSTEM_LABELS[index];
      const integrity = Math.round(state.systemIntegrities[index] ?? 0);
      const status = integrity < 40 ? 'CRITICO' : integrity < 70 ? 'PRESION' : 'ESTABLE';
      systemsMarkup += `<span><b>${label}</b><strong>${integrity}%</strong><small>${status}</small></span>`;
    }
    this.systems!.innerHTML = systemsMarkup;
    this.pressure!.textContent = state.activeEnemies > 0
      ? `OLEADA ${state.wave} // ${state.activeEnemies} CONTACTOS`
      : state.step === 'arkStabilization'
        ? `ESTABILIZACION ${Math.round(state.stabilizationProgress)}%`
        : 'PERIMETRO SIN CONTACTOS';
    this.counterattack!.textContent = state.coreExposed
      ? `NUCLEO ${Math.round(state.coreIntegrity)}%`
      : state.nodesDestroyed > 0
        ? `NODOS ${state.nodesDestroyed}/3`
        : state.step === 'counterattackPreparation' || state.step.startsWith('command')
          ? 'CONTRAATAQUE EN PREPARACION'
          : 'RED CONJUNTA EN ESPERA';
  }

  dispose(): void {
    this.root?.remove();
    this.root = undefined;
    this.objective = undefined;
    this.arkIntegrity = undefined;
    this.systems = undefined;
    this.pressure = undefined;
    this.counterattack = undefined;
  }

  private ensureMounted(): void {
    if (this.root) return;
    const root = document.createElement('section');
    root.id = 'mission25-hud';
    root.className = 'mission25-hud';
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('aria-label', 'Estado de la ultima orbita');
    root.innerHTML = `
      <header><span>M25 // LA ULTIMA ORBITA</span><strong data-role="ark-integrity">100%</strong></header>
      <p data-role="objective"></p>
      <div data-role="systems"></div>
      <footer><span data-role="pressure"></span><span data-role="counterattack"></span></footer>
    `;
    this.parent.append(root);
    this.root = root;
    this.objective = root.querySelector('[data-role="objective"]') as HTMLElement;
    this.arkIntegrity = root.querySelector('[data-role="ark-integrity"]') as HTMLElement;
    this.systems = root.querySelector('[data-role="systems"]') as HTMLElement;
    this.pressure = root.querySelector('[data-role="pressure"]') as HTMLElement;
    this.counterattack = root.querySelector('[data-role="counterattack"]') as HTMLElement;
  }
}
