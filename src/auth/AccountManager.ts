import type { SaveGameData, SaveSystem } from '../game/SaveSystem';
import {
  LocalPlayerProfileRepository,
  profileStorageKeyForAccount,
  type PlayerProfileRepository,
  type ProfileStorage
} from '../profile/PlayerProfileRepository';
import type { PlayerProfile, ShipEntitlement } from '../profile/PlayerProfile';
import { STARTER_SHIP_ID, type ShipCatalog } from '../ships/ShipCatalog';
import { AccountPanel } from './AccountPanel';
import type { AccountSession, AccountSyncState, AuthGateway } from './AuthTypes';
import {
  CloudSaveConflictError,
  type PlayerDataGateway,
  type RemoteSaveSlot
} from './SupabasePlayerDataService';

export type AccountManagerOptions = {
  root: ParentNode;
  auth?: AuthGateway;
  data?: PlayerDataGateway;
  storage: ProfileStorage & Pick<Storage, 'getItem' | 'setItem'>;
  catalog: ShipCatalog;
  saveSystem: SaveSystem;
  onProfileContextChanged(repository: PlayerProfileRepository, profile: PlayerProfile): void;
  onSaveContextChanged(): void;
};

export type AccountManagerState = {
  configured: boolean;
  userId?: string;
  provider: string;
  syncState: AccountSyncState;
  cloudRevision: number;
  pendingSave: boolean;
  activeSaveKey: string;
};

const CLAIM_PREFIX = 'arca-epsilon-account-claimed-v1:';

function maxStats(local: PlayerProfile, remote?: PlayerProfile): PlayerProfile['stats'] {
  return {
    combatMatchesPlayed: Math.max(local.stats.combatMatchesPlayed, remote?.stats.combatMatchesPlayed ?? 0),
    combatWins: Math.max(local.stats.combatWins, remote?.stats.combatWins ?? 0),
    combatKills: Math.max(local.stats.combatKills, remote?.stats.combatKills ?? 0)
  };
}

function starterOnly(entitlements: ShipEntitlement[]): ShipEntitlement[] {
  return entitlements.filter((entry) => entry.catalogItemId === STARTER_SHIP_ID && entry.source === 'starter');
}

function newestSave(...candidates: Array<SaveGameData | undefined>): SaveGameData | undefined {
  return candidates
    .filter((candidate): candidate is SaveGameData => Boolean(candidate))
    .sort((left, right) => (right.savedAt || 0) - (left.savedAt || 0))[0];
}

export class AccountManager {
  private readonly panel: AccountPanel;
  private readonly data?: PlayerDataGateway;
  private session?: AccountSession;
  private profileRepository: PlayerProfileRepository;
  private cloudRevision = 0;
  private pendingSave?: SaveGameData;
  private syncTimer = 0;
  private syncState: AccountSyncState = 'local';
  private lastSyncedAt = 0;
  private transition: Promise<void> = Promise.resolve();
  private readonly stopSaveListener: () => void;
  private readonly stopAuthListener?: () => void;

  constructor(private readonly options: AccountManagerOptions) {
    this.profileRepository = this.guestRepository();
    this.data = options.data;
    this.panel = new AccountPanel(options.root, {
      signIn: (email, password) => this.signIn(email, password),
      signUp: (email, password, displayName) => this.signUp(email, password, displayName),
      resetPassword: (email) => this.resetPassword(email),
      updatePassword: (password) => this.updatePassword(password),
      signOut: () => this.signOut(),
      syncNow: () => this.syncNow()
    });
    this.panel.setState({ configured: Boolean(options.auth) });
    this.stopSaveListener = options.saveSystem.onSaved((save) => this.queueSave(save));
    this.stopAuthListener = options.auth?.onAuthStateChange((session, event) => {
      this.enqueueTransition(async () => {
        if (session) await this.activateSession(session);
        else await this.activateGuest();
        if (event === 'password-recovery' && session) {
          this.panel.setState({ passwordRecovery: true, message: 'Define una nueva contraseña.' });
        }
      });
    });
    window.addEventListener('online', this.handleOnline, { passive: true });
    window.addEventListener('offline', this.handleOffline, { passive: true });
  }

  async initialize(): Promise<void> {
    if (!this.options.auth) {
      await this.activateGuest();
      this.panel.showMessage('El modo invitado está activo. Configura Supabase para habilitar cuentas.');
      return;
    }
    this.panel.setState({ busy: true, message: 'Verificando sesión segura.' });
    try {
      const session = await this.options.auth.getSession();
      await (session ? this.activateSession(session) : this.activateGuest());
    } catch (error) {
      await this.activateGuest();
      this.panel.setState({ syncState: 'offline', message: this.friendlyError(error) });
    }
  }

  get state(): AccountManagerState {
    return {
      configured: Boolean(this.options.auth),
      userId: this.session?.userId,
      provider: this.session?.provider ?? 'local',
      syncState: this.syncState,
      cloudRevision: this.cloudRevision,
      pendingSave: Boolean(this.pendingSave),
      activeSaveKey: this.options.saveSystem.activeKey
    };
  }

  dispose(): void {
    this.stopSaveListener();
    this.stopAuthListener?.();
    if (this.syncTimer) window.clearTimeout(this.syncTimer);
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  private async signIn(email: string, password: string): Promise<void> {
    if (!this.options.auth) return;
    this.panel.setState({ busy: true, message: 'Abriendo registro de piloto.', verificationEmail: undefined });
    try {
      const session = await this.options.auth.signIn(email, password);
      await this.activateSession(session);
    } catch (error) {
      this.panel.setState({ busy: false, message: this.friendlyError(error) });
    }
  }

  private async signUp(email: string, password: string, displayName: string): Promise<void> {
    if (!this.options.auth) return;
    this.panel.setState({ busy: true, message: 'Creando identidad de piloto.', verificationEmail: undefined });
    try {
      const result = await this.options.auth.signUp(email, password, displayName);
      if (result.session) await this.activateSession(result.session);
      else this.panel.setState({
        busy: false,
        verificationEmail: result.verificationRequired ? email : undefined,
        message: result.verificationRequired ? undefined : 'Cuenta creada.'
      });
    } catch (error) {
      this.panel.setState({ busy: false, message: this.friendlyError(error) });
    }
  }

  private async resetPassword(email: string): Promise<void> {
    if (!this.options.auth) return;
    this.panel.setState({ busy: true, message: 'Solicitando enlace de recuperación.' });
    try {
      await this.options.auth.resetPassword(email);
      this.panel.setState({ busy: false, message: 'Enlace de recuperación enviado.' });
    } catch (error) {
      this.panel.setState({ busy: false, message: this.friendlyError(error) });
    }
  }

  private async updatePassword(password: string): Promise<void> {
    if (!this.options.auth) return;
    this.panel.setState({ busy: true, message: 'Actualizando contraseña.' });
    try {
      await this.options.auth.updatePassword(password);
      this.panel.setState({ busy: false, passwordRecovery: false, message: 'Contraseña actualizada.' });
    } catch (error) {
      this.panel.setState({ busy: false, message: this.friendlyError(error) });
    }
  }

  private async signOut(): Promise<void> {
    if (!this.options.auth) return;
    this.panel.setState({ busy: true, message: 'Cerrando sesión.' });
    try {
      await this.flushPendingSave();
      await this.options.auth.signOut();
      await this.activateGuest();
    } catch (error) {
      this.panel.setState({ busy: false, message: this.friendlyError(error) });
    }
  }

  async syncNow(): Promise<void> {
    if (!this.session || !this.data) {
      this.setSyncState('local');
      return;
    }
    if (!navigator.onLine) {
      this.setSyncState('offline', 'Sin conexión. El progreso permanece guardado localmente.');
      return;
    }
    this.setSyncState('syncing');
    try {
      const localProfile = this.profileRepository.load();
      await this.data.saveProfile(localProfile);
      const localSave = this.pendingSave ?? this.options.saveSystem.loadGame();
      if (localSave) await this.pushSaveWithConflictResolution(localSave);
      this.pendingSave = undefined;
      this.lastSyncedAt = Date.now();
      this.setSyncState('synced');
    } catch (error) {
      this.setSyncState(navigator.onLine ? 'error' : 'offline', this.friendlyError(error));
    }
  }

  private async activateSession(session: AccountSession): Promise<void> {
    if (this.session?.userId === session.userId && this.options.saveSystem.activeAccountId === session.userId) {
      this.session = session;
      this.panel.setState({ session, busy: false, verificationEmail: undefined });
      return;
    }

    const guestRepository = this.guestRepository();
    const guestProfile = guestRepository.load();
    this.options.saveSystem.setAccountScope(undefined);
    const guestSave = this.options.saveSystem.loadGame();
    const claimKey = `${CLAIM_PREFIX}${session.userId}`;
    const claimed = this.readFlag(claimKey);

    this.session = session;
    this.cloudRevision = 0;
    this.pendingSave = undefined;
    this.profileRepository = this.accountRepository(session.userId);
    const accountLocalProfile = this.profileRepository.load();
    this.options.saveSystem.setAccountScope(session.userId);
    const accountLocalSave = this.options.saveSystem.loadGame();
    this.panel.setState({ session, busy: true, verificationEmail: undefined, message: 'Sincronizando bitácora de piloto.' });
    this.setSyncState('syncing');

    let remoteProfile: PlayerProfile | undefined;
    let remoteSave: RemoteSaveSlot | undefined;
    let cloudAvailable = Boolean(this.data && navigator.onLine);
    if (cloudAvailable && this.data) {
      try {
        [remoteProfile, remoteSave] = await Promise.all([
          this.data.loadProfile(session),
          this.data.loadSave()
        ]);
        this.cloudRevision = remoteSave?.revision ?? 0;
      } catch {
        cloudAvailable = false;
      }
    }

    const localCandidate = claimed ? accountLocalProfile : guestProfile;
    const mergedProfile = this.mergeProfile(session, localCandidate, remoteProfile);
    const repairedProfile = this.profileRepository.save(mergedProfile);
    this.options.onProfileContextChanged(this.profileRepository, repairedProfile);

    const localSaveCandidate = newestSave(accountLocalSave, claimed ? undefined : guestSave);
    const selectedSave = newestSave(localSaveCandidate, remoteSave?.payload);
    if (selectedSave) this.options.saveSystem.importCloudSave(selectedSave);
    this.writeFlag(claimKey);
    this.options.onSaveContextChanged();

    if (cloudAvailable && this.data) {
      try {
        await this.data.saveProfile(repairedProfile);
        if (selectedSave && selectedSave !== remoteSave?.payload) {
          this.cloudRevision = await this.data.saveSlot(selectedSave, this.cloudRevision);
        }
        this.lastSyncedAt = Date.now();
        this.setSyncState('synced');
      } catch (error) {
        this.pendingSave = selectedSave;
        this.setSyncState('error', this.friendlyError(error));
      }
    } else {
      this.pendingSave = selectedSave;
      this.setSyncState(navigator.onLine ? 'error' : 'offline', 'La cuenta está activa; la nube se reintentará más tarde.');
    }
    this.panel.setState({ session, busy: false });
  }

  private async activateGuest(): Promise<void> {
    if (this.syncTimer) window.clearTimeout(this.syncTimer);
    this.syncTimer = 0;
    this.session = undefined;
    this.pendingSave = undefined;
    this.cloudRevision = 0;
    this.profileRepository = this.guestRepository();
    this.options.saveSystem.setAccountScope(undefined);
    const profile = this.profileRepository.load();
    this.options.onProfileContextChanged(this.profileRepository, profile);
    this.options.onSaveContextChanged();
    this.setSyncState('local');
    this.panel.setState({
      session: undefined,
      busy: false,
      verificationEmail: undefined,
      passwordRecovery: false,
      message: this.options.auth ? 'Modo invitado. Tu progreso permanece en este dispositivo.' : undefined
    });
  }

  private mergeProfile(session: AccountSession, local: PlayerProfile, remote?: PlayerProfile): PlayerProfile {
    const remoteEntitlements = remote?.entitlements.length ? remote.entitlements : undefined;
    const entitlements = remoteEntitlements ?? starterOnly(local.entitlements);
    const starter = local.entitlements.find((entry) => entry.catalogItemId === STARTER_SHIP_ID);
    if (!entitlements.some((entry) => entry.catalogItemId === STARTER_SHIP_ID) && starter) entitlements.unshift(starter);
    const preferredSelection = remote?.selectedShipId ?? local.selectedShipId;
    return {
      version: local.version,
      id: session.userId,
      displayName: remote?.displayName || session.displayName || local.displayName,
      identity: { provider: session.provider, providerUserId: session.userId },
      selectedShipId: entitlements.some((entry) => entry.catalogItemId === preferredSelection)
        ? preferredSelection
        : STARTER_SHIP_ID,
      entitlements,
      stats: maxStats(local, remote),
      preferences: remote && remote.updatedAt >= local.updatedAt ? remote.preferences : local.preferences,
      updatedAt: Math.max(local.updatedAt, remote?.updatedAt ?? 0, Date.now())
    };
  }

  private queueSave(save: SaveGameData): void {
    if (!this.session || !this.data) return;
    this.pendingSave = save;
    if (this.syncTimer) window.clearTimeout(this.syncTimer);
    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = 0;
      void this.syncNow();
    }, 1400);
  }

  private async flushPendingSave(): Promise<void> {
    if (this.syncTimer) window.clearTimeout(this.syncTimer);
    this.syncTimer = 0;
    if (this.pendingSave) await this.syncNow();
  }

  private async pushSaveWithConflictResolution(save: SaveGameData): Promise<void> {
    if (!this.data) return;
    try {
      this.cloudRevision = await this.data.saveSlot(save, this.cloudRevision);
    } catch (error) {
      if (!(error instanceof CloudSaveConflictError)) throw error;
      const remote = await this.data.loadSave();
      this.cloudRevision = remote?.revision ?? 0;
      if (remote && (remote.payload.savedAt || 0) > (save.savedAt || 0)) {
        this.options.saveSystem.importCloudSave(remote.payload);
        this.options.onSaveContextChanged();
        return;
      }
      this.cloudRevision = await this.data.saveSlot(save, this.cloudRevision);
    }
  }

  private guestRepository(): LocalPlayerProfileRepository {
    return new LocalPlayerProfileRepository(this.options.storage, this.options.catalog);
  }

  private accountRepository(accountId: string): LocalPlayerProfileRepository {
    return new LocalPlayerProfileRepository(
      this.options.storage,
      this.options.catalog,
      Date.now,
      profileStorageKeyForAccount(accountId)
    );
  }

  private setSyncState(syncState: AccountSyncState, message?: string): void {
    this.syncState = syncState;
    this.panel.setState({ syncState, message, lastSyncedAt: this.lastSyncedAt || undefined });
  }

  private enqueueTransition(action: () => Promise<void>): void {
    this.transition = this.transition
      .then(action, action)
      .catch((error) => {
        this.panel.setState({ busy: false, syncState: 'error', message: this.friendlyError(error) });
      });
  }

  private readFlag(key: string): boolean {
    try {
      return this.options.storage.getItem(key) === 'true';
    } catch {
      return false;
    }
  }

  private writeFlag(key: string): void {
    try {
      this.options.storage.setItem(key, 'true');
    } catch {
      // Account-local profile and save scopes still prevent cross-user leakage.
    }
  }

  private friendlyError(error: unknown): string {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
    if (message.includes('email not confirmed')) return 'Confirma tu correo antes de iniciar sesión.';
    if (message.includes('password')) return 'La contraseña no cumple los requisitos de seguridad.';
    if (message.includes('rate limit')) return 'Demasiados intentos. Espera un momento antes de continuar.';
    if (message.includes('failed to fetch') || !navigator.onLine) return 'No hay conexión con el registro de pilotos.';
    if (error instanceof CloudSaveConflictError) return error.message;
    return 'No se pudo completar la operación de cuenta. Tu progreso local sigue protegido.';
  }

  private readonly handleOnline = (): void => {
    if (this.session) void this.syncNow();
  };

  private readonly handleOffline = (): void => {
    if (this.session) this.setSyncState('offline', 'Sin conexión. El progreso permanece guardado localmente.');
  };
}
