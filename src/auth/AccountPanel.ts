import type { AccountPanelState } from './AuthTypes';

export type AccountPanelActions = {
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, displayName: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  syncNow(): Promise<void>;
};

type AccountFormMode = 'signin' | 'register';

export class AccountPanel {
  private readonly menuState: HTMLElement;
  private readonly signedOut: HTMLElement;
  private readonly signedIn: HTMLElement;
  private readonly unavailable: HTMLElement;
  private readonly status: HTMLElement;
  private readonly accountName: HTMLElement;
  private readonly accountEmail: HTMLElement;
  private readonly syncStatus: HTMLElement;
  private readonly signinForm: HTMLFormElement;
  private readonly registerForm: HTMLFormElement;
  private readonly recoveryForm: HTMLFormElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly signoutButton: HTMLButtonElement;
  private readonly syncButton: HTMLButtonElement;
  private readonly tabs: HTMLButtonElement[];
  private state: AccountPanelState = {
    configured: false,
    busy: false,
    syncState: 'local'
  };
  private mode: AccountFormMode = 'signin';

  constructor(
    root: ParentNode,
    private readonly actions: AccountPanelActions
  ) {
    this.menuState = this.get(root, '#account-menu-state');
    this.signedOut = this.get(root, '#account-signed-out');
    this.signedIn = this.get(root, '#account-signed-in');
    this.unavailable = this.get(root, '#account-unavailable');
    this.status = this.get(root, '#account-status');
    this.accountName = this.get(root, '#account-display-name');
    this.accountEmail = this.get(root, '#account-email');
    this.syncStatus = this.get(root, '#account-sync-status');
    this.signinForm = this.get(root, '#account-signin-form');
    this.registerForm = this.get(root, '#account-register-form');
    this.recoveryForm = this.get(root, '#account-recovery-form');
    this.resetButton = this.get(root, '#account-reset-password');
    this.signoutButton = this.get(root, '#account-signout');
    this.syncButton = this.get(root, '#account-sync-now');
    this.tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-account-mode]'));
    this.bind();
    this.render();
  }

  setState(patch: Partial<AccountPanelState>): void {
    this.state = { ...this.state, ...patch };
    this.render();
  }

  showMessage(message: string): void {
    this.setState({ message, busy: false });
  }

  private bind(): void {
    this.tabs.forEach((tab) => {
      tab.addEventListener('click', () => this.setMode(tab.dataset.accountMode === 'register' ? 'register' : 'signin'));
    });
    this.signinForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!this.signinForm.reportValidity()) return;
      const data = new FormData(this.signinForm);
      void this.actions.signIn(String(data.get('email') ?? '').trim(), String(data.get('password') ?? ''));
    });
    this.registerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!this.registerForm.reportValidity()) return;
      const data = new FormData(this.registerForm);
      const password = String(data.get('password') ?? '');
      if (password !== String(data.get('passwordConfirm') ?? '')) {
        this.showMessage('Las contraseñas no coinciden.');
        return;
      }
      void this.actions.signUp(
        String(data.get('email') ?? '').trim(),
        password,
        String(data.get('displayName') ?? '').trim()
      );
    });
    this.recoveryForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!this.recoveryForm.reportValidity()) return;
      const data = new FormData(this.recoveryForm);
      const password = String(data.get('password') ?? '');
      if (password !== String(data.get('passwordConfirm') ?? '')) {
        this.showMessage('Las contraseñas no coinciden.');
        return;
      }
      void this.actions.updatePassword(password);
    });
    this.resetButton.addEventListener('click', () => {
      const email = this.signinForm.elements.namedItem('email');
      if (!(email instanceof HTMLInputElement) || !email.reportValidity()) return;
      void this.actions.resetPassword(email.value.trim());
    });
    this.signoutButton.addEventListener('click', () => { void this.actions.signOut(); });
    this.syncButton.addEventListener('click', () => { void this.actions.syncNow(); });
  }

  private setMode(mode: AccountFormMode): void {
    this.mode = mode;
    this.state.message = undefined;
    this.render();
  }

  private render(): void {
    const { configured, busy, session, syncState, verificationEmail, passwordRecovery, lastSyncedAt } = this.state;
    this.menuState.textContent = session ? session.displayName : 'Invitado';
    this.signedIn.hidden = !session || passwordRecovery === true;
    this.signedOut.hidden = Boolean(session) || !configured;
    this.unavailable.hidden = configured || Boolean(session);
    this.recoveryForm.hidden = !session || passwordRecovery !== true;
    this.signinForm.hidden = this.mode !== 'signin';
    this.registerForm.hidden = this.mode !== 'register';
    this.tabs.forEach((tab) => {
      const active = tab.dataset.accountMode === this.mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });

    const controls = [
      ...Array.from(this.signinForm.elements),
      ...Array.from(this.registerForm.elements),
      ...Array.from(this.recoveryForm.elements),
      this.resetButton,
      this.signoutButton,
      this.syncButton
    ];
    controls.forEach((control) => {
      if (control instanceof HTMLInputElement || control instanceof HTMLButtonElement) control.disabled = busy;
    });

    if (session) {
      this.accountName.textContent = session.displayName;
      this.accountEmail.textContent = session.provider === 'steam' ? 'Identidad Steam vinculada' : session.email;
    }
    const syncLabels: Record<AccountPanelState['syncState'], string> = {
      local: 'Progreso local',
      syncing: 'Sincronizando progreso',
      synced: 'Progreso sincronizado',
      offline: 'Sin conexión · progreso local protegido',
      error: 'Sincronización pendiente'
    };
    this.syncStatus.textContent = syncLabels[syncState];
    if (lastSyncedAt && syncState === 'synced') {
      this.syncStatus.textContent += ` · ${new Intl.DateTimeFormat('es-UY', { timeStyle: 'short' }).format(lastSyncedAt)}`;
    }
    if (verificationEmail) {
      this.status.textContent = `Revisa ${verificationEmail} para confirmar la cuenta.`;
      this.status.dataset.tone = 'success';
    } else {
      this.status.textContent = this.state.message ?? '';
      this.status.dataset.tone = syncState === 'error' ? 'warning' : 'neutral';
    }
  }

  private get<T extends HTMLElement>(root: ParentNode, selector: string): T {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing account UI element: ${selector}`);
    return element;
  }
}
