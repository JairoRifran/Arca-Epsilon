import {
  MISSION22_FRONT_LABELS,
  MISSION22_RESOURCE_LABELS,
  type Mission22FrontId,
  type Mission22ResourceId
} from '../assets/mission22Definitions';

const FRONTS: readonly Mission22FrontId[] = ['aurora', 'nereida', 'orbital'];

/** Strategic choice surface for initial allocation and the later support transfer. */
export class Mission22CommandPanel {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;
  private mode: 'initial' | 'support' = 'initial';
  private resource: Mission22ResourceId = 'energy';

  constructor(
    private readonly onAssign: (resource: Mission22ResourceId, front: Mission22FrontId) => void,
    private readonly onSupport: (front: Mission22FrontId) => void
  ) {
    this.root = document.createElement('section');
    this.root.id = 'mission22-command-panel';
    this.root.className = 'mission22-command';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.setAttribute('aria-label', 'Centro de mando estratégico');
    this.root.innerHTML = `
      <span>CENTRO DE MANDO // ARCA EPSILON</span>
      <h2></h2>
      <p></p>
      <div>
        ${FRONTS.map((front) => `<button type="button" data-front="${front}"><strong>${MISSION22_FRONT_LABELS[front]}</strong><small>Asignar recurso temporal</small></button>`).join('')}
      </div>
    `;
    this.title = this.root.querySelector('h2')!;
    this.subtitle = this.root.querySelector('p')!;
    document.body.appendChild(this.root);
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button[data-front]')) {
      button.addEventListener('click', () => {
        const front = button.dataset.front as Mission22FrontId;
        if (this.mode === 'initial') this.onAssign(this.resource, front);
        else this.onSupport(front);
      });
    }
  }

  get visible(): boolean { return this.root.classList.contains('is-visible'); }

  showInitial(resource: Mission22ResourceId): void {
    this.mode = 'initial';
    this.resource = resource;
    this.title.textContent = `Asignar ${MISSION22_RESOURCE_LABELS[resource]}`;
    this.subtitle.textContent = 'La decisión modifica la presión de este frente durante la misión.';
    this.setVisible(true);
  }

  showSupport(): void {
    this.mode = 'support';
    this.title.textContent = 'Transferir refuerzo Pleyadiano';
    this.subtitle.textContent = 'El frente elegido recibe energía, drones defensivos y capacidad de escudo.';
    this.setVisible(true);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('is-visible', visible);
    this.root.setAttribute('aria-hidden', String(!visible));
  }
}
