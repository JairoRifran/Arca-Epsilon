import type { ActiveDialogue } from '../game/DialogueManager';

export class CommsDialoguePanel {
  private readonly root: HTMLElement;

  private readonly portrait: HTMLElement;

  private readonly speakerName: HTMLElement;

  private readonly speakerRole: HTMLElement;

  private readonly message: HTMLElement;

  private readonly advanceButton: HTMLButtonElement;

  private readonly channelLabel: HTMLElement;

  private renderedId = '';

  private suppressed = false;

  constructor(onAdvance: () => void) {
    this.root = document.createElement('section');
    this.root.id = 'comms-dialogue';
    this.root.className = 'comms-dialogue';
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = `
      <div class="comms-dialogue__portrait" aria-hidden="true">
        <span></span>
        <i></i>
      </div>
      <div class="comms-dialogue__body">
        <div class="comms-dialogue__header">
          <div>
            <strong class="comms-dialogue__speaker"></strong>
            <span class="comms-dialogue__role"></span>
          </div>
          <div class="comms-dialogue__wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        </div>
        <p class="comms-dialogue__message"></p>
        <div class="comms-dialogue__footer">
          <span>CANAL ARCA // ENLACE SEGURO</span>
          <button type="button" aria-label="Avanzar diálogo"><kbd>Enter</kbd><b>Omitir</b></button>
        </div>
      </div>
    `;
    document.body.appendChild(this.root);

    this.portrait = this.root.querySelector('.comms-dialogue__portrait span') as HTMLElement;
    this.speakerName = this.root.querySelector('.comms-dialogue__speaker') as HTMLElement;
    this.speakerRole = this.root.querySelector('.comms-dialogue__role') as HTMLElement;
    this.message = this.root.querySelector('.comms-dialogue__message') as HTMLElement;
    this.advanceButton = this.root.querySelector('button') as HTMLButtonElement;
    this.channelLabel = this.root.querySelector('.comms-dialogue__footer > span') as HTMLElement;
    this.advanceButton.addEventListener('click', onAdvance);
  }

  get visible(): boolean {
    return this.root.classList.contains('is-visible') && !this.suppressed;
  }

  sync(dialogue: ActiveDialogue | undefined): void {
    if (!dialogue) {
      this.renderedId = '';
      this.root.classList.remove('is-visible');
      this.root.setAttribute('aria-hidden', 'true');
      return;
    }
    if (dialogue.id !== this.renderedId) {
      this.renderedId = dialogue.id;
      this.portrait.textContent = dialogue.speaker.portraitLabel;
      this.speakerName.textContent = dialogue.speaker.name;
      this.speakerRole.textContent = dialogue.speaker.role;
      this.message.textContent = dialogue.text;
      this.advanceButton.querySelector('b')!.textContent = dialogue.requiresConfirmation ? 'Continuar' : 'Omitir';
      this.advanceButton.querySelector('kbd')!.textContent = dialogue.requiresConfirmation ? 'Enter / Space' : 'Enter';
      this.root.dataset.priority = dialogue.priority;
      this.root.dataset.signal = dialogue.speaker.signalClass;
      this.root.dataset.dialogueId = dialogue.id;
      this.root.classList.toggle('is-subtitle', Boolean(dialogue.subtitleMode));
      this.channelLabel.textContent = dialogue.speaker.id === 'coalition-silence'
        ? 'COALICIÓN // CANAL FORZADO'
        : 'CANAL ARCA // ENLACE SEGURO';
    }
    this.root.classList.add('is-visible');
    this.root.setAttribute('aria-hidden', String(this.suppressed));
  }

  setSuppressed(suppressed: boolean): void {
    if (this.suppressed === suppressed) return;
    this.suppressed = suppressed;
    this.root.classList.toggle('is-suppressed', suppressed);
    this.root.setAttribute('aria-hidden', String(suppressed || !this.root.classList.contains('is-visible')));
  }
}
