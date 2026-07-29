import type { CoalitionResponseTone } from '../assets/mission21Definitions';

type ResponseTone = Exclude<CoalitionResponseTone, 'none'>;

const RESPONSES: readonly { tone: ResponseTone; label: string; text: string }[] = [
  { tone: 'defiant', label: 'Desafiante', text: 'No vamos a abandonar nuestro mundo.' },
  { tone: 'diplomatic', label: 'Diplomática', text: 'Podemos evitar otra guerra.' },
  { tone: 'strategic', label: 'Estratégica', text: 'Necesitamos tiempo para evaluar sus demandas.' }
];

/** Small one-shot choice surface for M21. It owns no mission state. */
export class Mission21ResponsePanel {
  private readonly root: HTMLElement;

  constructor(onChoose: (tone: ResponseTone) => void) {
    this.root = document.createElement('section');
    this.root.id = 'mission21-response-panel';
    this.root.className = 'mission21-response';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.setAttribute('aria-label', 'Respuesta conjunta a la Coalición');
    this.root.innerHTML = `
      <span>RESPUESTA CONJUNTA // AURORA · NEREIDA · ARCA</span>
      <h2>Elegí el tono de la respuesta</h2>
      <div>
        ${RESPONSES.map((response) => `
          <button type="button" data-tone="${response.tone}">
            <strong>${response.label}</strong>
            <small>${response.text}</small>
          </button>
        `).join('')}
      </div>
    `;
    document.body.appendChild(this.root);
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button[data-tone]')) {
      button.addEventListener('click', () => {
        const tone = button.dataset.tone as ResponseTone;
        onChoose(tone);
      });
    }
  }

  get visible(): boolean { return this.root.classList.contains('is-visible'); }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('is-visible', visible);
    this.root.setAttribute('aria-hidden', String(!visible));
  }
}
