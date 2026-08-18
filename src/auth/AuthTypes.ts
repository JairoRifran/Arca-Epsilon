export type AccountProvider = 'email' | 'steam';

export type AccountSession = {
  userId: string;
  email: string;
  displayName: string;
  provider: AccountProvider;
  expiresAt?: number;
};

export type SignUpResult = {
  session?: AccountSession;
  verificationRequired: boolean;
};

export type AuthStateEvent = 'initial' | 'signed-in' | 'signed-out' | 'password-recovery' | 'token-refreshed' | 'user-updated';
export type AuthStateListener = (session: AccountSession | undefined, event: AuthStateEvent) => void;

export interface AuthGateway {
  readonly configured: boolean;
  getSession(): Promise<AccountSession | undefined>;
  signUp(email: string, password: string, displayName: string): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<AccountSession>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  onAuthStateChange(listener: AuthStateListener): () => void;
}

export type AccountSyncState = 'local' | 'syncing' | 'synced' | 'offline' | 'error';

export type AccountPanelState = {
  configured: boolean;
  busy: boolean;
  session?: AccountSession;
  syncState: AccountSyncState;
  message?: string;
  verificationEmail?: string;
  passwordRecovery?: boolean;
  lastSyncedAt?: number;
};
