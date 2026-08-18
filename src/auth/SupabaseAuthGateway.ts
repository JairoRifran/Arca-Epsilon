import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AccountProvider,
  AccountSession,
  AuthGateway,
  AuthStateListener,
  SignUpResult
} from './AuthTypes';

function configuredValue(value: string | undefined): string {
  const normalized = value?.trim() ?? '';
  if (!normalized || normalized.includes('your-project') || normalized.includes('your_key_here')) return '';
  return normalized;
}

function accountProvider(user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }): AccountProvider {
  const explicit = user.user_metadata?.identity_provider;
  if (explicit === 'steam') return 'steam';
  return user.app_metadata?.provider === 'steam' ? 'steam' : 'email';
}

function accountSession(session: {
  user: {
    id: string;
    email?: string;
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  };
  expires_at?: number;
}): AccountSession {
  const metadataName = session.user.user_metadata?.display_name;
  return {
    userId: session.user.id,
    email: session.user.email ?? '',
    displayName: typeof metadataName === 'string' && metadataName.trim()
      ? metadataName.trim()
      : 'Piloto Epsilon',
    provider: accountProvider(session.user),
    expiresAt: session.expires_at ? session.expires_at * 1000 : undefined
  };
}

export class SupabaseAuthGateway implements AuthGateway {
  readonly configured = true;

  constructor(readonly client: SupabaseClient) {}

  async getSession(): Promise<AccountSession | undefined> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    return data.session ? accountSession(data.session) : undefined;
  }

  async signUp(email: string, password: string, displayName: string): Promise<SignUpResult> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: `${window.location.origin}${window.location.pathname}`
      }
    });
    if (error) throw error;
    return {
      session: data.session ? accountSession(data.session) : undefined,
      verificationRequired: data.session === null
    };
  }

  async signIn(email: string, password: string): Promise<AccountSession> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return accountSession(data.session);
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  async resetPassword(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}`
    });
    if (error) throw error;
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw error;
  }

  onAuthStateChange(listener: AuthStateListener): () => void {
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      const mappedEvent = event === 'PASSWORD_RECOVERY'
        ? 'password-recovery'
        : event === 'SIGNED_IN'
          ? 'signed-in'
          : event === 'SIGNED_OUT'
            ? 'signed-out'
            : event === 'TOKEN_REFRESHED'
              ? 'token-refreshed'
              : event === 'USER_UPDATED'
                ? 'user-updated'
                : 'initial';
      listener(session ? accountSession(session) : undefined, mappedEvent);
    });
    return () => data.subscription.unsubscribe();
  }
}

export function createSupabaseAuthGateway(): SupabaseAuthGateway | undefined {
  const url = configuredValue(import.meta.env.VITE_SUPABASE_URL);
  const publishableKey = configuredValue(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  if (!url || !publishableKey) return undefined;
  try {
    return new SupabaseAuthGateway(createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
      }
    }));
  } catch {
    return undefined;
  }
}
