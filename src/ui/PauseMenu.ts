export type PauseMenuActions = {
  onResume: () => void;
  onSave: () => void;
  onReturnToMainMenu: () => void;
  onResetProgress: () => void;
};

export class PauseMenu {
  private readonly root: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly status: HTMLElement;
  private readonly resetButton: HTMLButtonElement;
  private resetArmed = false;

  constructor(actions: PauseMenuActions) {
    this.root = document.createElement('section');
    this.root.id = 'pause-menu';
    this.root.className = 'pause-menu';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = `
      <div class="pause-menu__panel" role="dialog" aria-modal="true" aria-labelledby="pause-menu-title">
        <p class="pause-menu__eyebrow">ARCA EPSILON // SISTEMA EN ESPERA</p>
        <h2 id="pause-menu-title">Juego en pausa</h2>
        <div class="pause-menu__actions">
          <button type="button" data-action="resume">Reanudar</button>
          <button type="button" data-action="save">Guardar progreso</button>
          <button type="button" data-action="controls" aria-expanded="false">Controles</button>
          <button type="button" data-action="menu">Volver al menu principal</button>
          <button type="button" class="is-danger" data-action="reset">Reiniciar progreso</button>
        </div>
        <div class="pause-menu__controls" hidden>
          <span><kbd>WASD</kbd> Movimiento</span>
          <span><kbd>E</kbd> Escanear / interactuar</span>
          <span><kbd>F</kbd> Entrar / salir de la nave</span>
          <span><kbd>M</kbd> Mapa</span>
          <span><kbd>Shift</kbd> Impulso</span>
          <span><kbd>V</kbd> Camara</span>
          <span><kbd>Esc</kbd> Pausa</span>
        </div>
        <p class="pause-menu__status" aria-live="polite"></p>
      </div>
    `;
    document.body.appendChild(this.root);

    this.controls = this.root.querySelector('.pause-menu__controls') as HTMLElement;
    this.status = this.root.querySelector('.pause-menu__status') as HTMLElement;
    this.resetButton = this.root.querySelector('[data-action="reset"]') as HTMLButtonElement;

    this.root.querySelector('[data-action="resume"]')?.addEventListener('click', actions.onResume);
    this.root.querySelector('[data-action="save"]')?.addEventListener('click', () => {
      actions.onSave();
      this.showStatus('Progreso guardado.');
    });
    this.root.querySelector('[data-action="controls"]')?.addEventListener('click', (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      const expanded = this.controls.hidden;
      this.controls.hidden = !expanded;
      button.setAttribute('aria-expanded', String(expanded));
    });
    this.root.querySelector('[data-action="menu"]')?.addEventListener('click', actions.onReturnToMainMenu);
    this.resetButton.addEventListener('click', () => {
      if (!this.resetArmed) {
        this.resetArmed = true;
        this.resetButton.textContent = 'Confirmar reinicio';
        this.showStatus('Esta accion elimina la partida local. Pulsa otra vez para confirmar.');
        return;
      }
      actions.onResetProgress();
    });
  }

  get active(): boolean {
    return this.root.classList.contains('is-active');
  }

  setOpen(open: boolean): void {
    this.root.classList.toggle('is-active', open);
    this.root.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('game-paused', open);
    if (open) {
      (this.root.querySelector('[data-action="resume"]') as HTMLButtonElement | null)?.focus();
    } else {
      this.resetArmed = false;
      this.resetButton.textContent = 'Reiniciar progreso';
      this.status.textContent = '';
    }
  }

  showStatus(message: string): void {
    this.status.textContent = message;
  }
}
