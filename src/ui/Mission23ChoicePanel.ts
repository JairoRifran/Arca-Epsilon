import {
  MISSION23_PLATFORM_METHOD_LABELS,
  MISSION23_TARGET_LABELS,
  type Mission23PlatformMethod,
  type Mission23PrimaryTarget
} from '../assets/mission23Definitions';

/** Compact, transient decision surface for M23. */
export class Mission23ChoicePanel {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;
  private mode: 'order' | 'method' = 'order';

  constructor(
    private readonly onOrder: (target: Mission23PrimaryTarget) => void,
    private readonly onMethod: (method: Exclude<Mission23PlatformMethod, 'none'>) => void
  ) {
    this.root = document.createElement('section');
    this.root.id = 'mission23-choice-panel';
    this.root.className = 'mission23-choice';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = '<span>PROTOCOLO DE CONTRAOFENSIVA</span><h2></h2><p></p><div></div>';
    this.title = this.root.querySelector('h2')!;
    this.subtitle = this.root.querySelector('p')!;
    document.body.appendChild(this.root);
  }
  get visible(): boolean { return this.root.classList.contains('is-visible'); }
  showOrder(): void {
    this.mode = 'order';
    this.title.textContent = 'Elegir primer objetivo';
    this.subtitle.textContent = 'La baliza de salto permanecerá como objetivo final.';
    this.render([
      ['jammer', MISSION23_TARGET_LABELS.jammer, 'Recuperar lock-on y comunicaciones'],
      ['logistics', MISSION23_TARGET_LABELS.logistics, 'Reducir refuerzos enemigos']
    ]);
  }
  showMethod(): void {
    this.mode = 'method';
    this.title.textContent = 'Método contra el núcleo';
    this.subtitle.textContent = 'Cambia la respuesta visual y táctica, no el resultado.';
    this.render([
      ['controlledDestruction', MISSION23_PLATFORM_METHOD_LABELS.controlledDestruction, 'Ataque preciso del Arca'],
      ['overload', MISSION23_PLATFORM_METHOD_LABELS.overload, 'Liberación energética rápida'],
      ['powerCut', MISSION23_PLATFORM_METHOD_LABELS.powerCut, 'Apagado y demolición contenida']
    ]);
  }
  setVisible(visible: boolean): void {
    this.root.classList.toggle('is-visible', visible);
    this.root.setAttribute('aria-hidden', String(!visible));
  }
  private render(options: readonly (readonly [string, string, string])[]): void {
    const container = this.root.querySelector('div')!;
    container.replaceChildren();
    for (const [value, label, detail] of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = `<strong>${label}</strong><small>${detail}</small>`;
      button.addEventListener('click', () => {
        if (this.mode === 'order') this.onOrder(value as Mission23PrimaryTarget);
        else this.onMethod(value as Exclude<Mission23PlatformMethod, 'none'>);
      });
      container.appendChild(button);
    }
    this.setVisible(true);
  }
}
