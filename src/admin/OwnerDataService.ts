import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Read side of the owner dashboard.
 *
 * Every call is an RPC, never a table select. The base tables keep their
 * own-row-only RLS, so nothing here can widen a player's exposure by accident:
 * the database decides what an admin may see, and this file only decides how to
 * draw it. `ADMIN_REQUIRED` coming back is the normal answer for a signed-in
 * player who is not an admin, not an error to log.
 */

export type OwnerOverview = {
  players: number;
  newToday: number;
  new7d: number;
  new30d: number;
  activeToday: number;
  active7d: number;
  sessions7d: number;
  medianSessionMinutes: number;
  totalPlayHours: number;
  savedPlayers: number;
  verifiedPlayers: number;
  generatedAt: string;
};

export type OwnerDailyPoint = {
  day: string;
  signups: number;
  activePlayers: number;
  sessions: number;
};

export type OwnerPlayerRow = {
  userId: string;
  displayName: string;
  email: string;
  provider: string;
  createdAt: string;
  emailConfirmed: boolean;
  lastSeenAt: string | null;
  lastSaveAt: string | null;
  sessions: number;
  playMinutes: number;
  missionStep: string | null;
  stats: Record<string, unknown>;
};

export type OwnerPlayerPage = {
  rows: OwnerPlayerRow[];
  total: number;
};

export type OwnerProgressionRow = { missionStep: string; players: number };

/** Raised when the signed-in account is simply not an admin. */
export class NotAnAdminError extends Error {
  constructor() {
    super('Esta cuenta no tiene acceso de owner.');
    this.name = 'NotAnAdminError';
  }
}

function rethrow(error: { message?: string } | null): void {
  if (!error) return;
  if ((error.message ?? '').includes('ADMIN_REQUIRED')) throw new NotAnAdminError();
  throw new Error(error.message ?? 'Error desconocido de Supabase.');
}

const num = (value: unknown): number => {
  // Postgres returns bigint and numeric as strings over PostgREST.
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export class OwnerDataService {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Whether the current session may open the dashboard.
   *
   * Asks the database rather than reading anything client-side: a value kept in
   * user metadata would be editable by the account it describes.
   */
  async isAdmin(): Promise<boolean> {
    const { data, error } = await this.client.rpc('is_arca_admin');
    if (error) return false;
    return data === true;
  }

  async overview(): Promise<OwnerOverview> {
    const { data, error } = await this.client.rpc('owner_overview');
    rethrow(error);
    const raw = (data ?? {}) as Record<string, unknown>;
    return {
      players: num(raw.players),
      newToday: num(raw.newToday),
      new7d: num(raw.new7d),
      new30d: num(raw.new30d),
      activeToday: num(raw.activeToday),
      active7d: num(raw.active7d),
      sessions7d: num(raw.sessions7d),
      medianSessionMinutes: num(raw.medianSessionMinutes),
      totalPlayHours: num(raw.totalPlayHours),
      savedPlayers: num(raw.savedPlayers),
      verifiedPlayers: num(raw.verifiedPlayers),
      generatedAt: String(raw.generatedAt ?? '')
    };
  }

  async dailySeries(days: number): Promise<OwnerDailyPoint[]> {
    const { data, error } = await this.client.rpc('owner_daily_series', { p_days: days });
    rethrow(error);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      day: String(row.day ?? ''),
      signups: num(row.signups),
      activePlayers: num(row.active_players),
      sessions: num(row.sessions)
    }));
  }

  async players(search: string, limit: number, offset: number): Promise<OwnerPlayerPage> {
    const { data, error } = await this.client.rpc('owner_player_list', {
      p_search: search || null,
      p_limit: limit,
      p_offset: offset
    });
    rethrow(error);
    const raw = (data ?? []) as Record<string, unknown>[];
    return {
      // The total rides along on every row; an empty page means an empty result.
      total: raw.length > 0 ? num(raw[0].total_players) : 0,
      rows: raw.map((row) => ({
        userId: String(row.user_id ?? ''),
        displayName: String(row.display_name ?? ''),
        email: String(row.email ?? ''),
        provider: String(row.provider ?? 'email'),
        createdAt: String(row.created_at ?? ''),
        emailConfirmed: row.email_confirmed === true,
        lastSeenAt: (row.last_seen_at as string | null) ?? null,
        lastSaveAt: (row.last_save_at as string | null) ?? null,
        sessions: num(row.sessions),
        playMinutes: num(row.play_minutes),
        missionStep: (row.mission_step as string | null) ?? null,
        stats: (row.stats as Record<string, unknown>) ?? {}
      }))
    };
  }

  async progression(): Promise<OwnerProgressionRow[]> {
    const { data, error } = await this.client.rpc('owner_progression');
    rethrow(error);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      missionStep: String(row.mission_step ?? 'sin registro'),
      players: num(row.players)
    }));
  }
}

/**
 * Write side, used by the game itself.
 *
 * One row per play session, updated on a slow heartbeat. Deliberately fire and
 * forget: analytics must never be able to interrupt play, so every failure is
 * swallowed and the next beat simply tries again.
 */
export class PlaySessionReporter {
  private sessionId: string | null = null;
  private lastBeatAt = 0;

  constructor(
    private readonly client: SupabaseClient,
    /** Minimum gap between writes. Long, because this is presence, not events. */
    private readonly intervalMs = 60_000
  ) {}

  async beat(missionStep: string, now = Date.now(), force = false): Promise<void> {
    if (!force && now - this.lastBeatAt < this.intervalMs) return;
    this.lastBeatAt = now;
    try {
      const { data, error } = await this.client.rpc('record_play_heartbeat', {
        p_session_id: this.sessionId,
        p_mission_step: missionStep.slice(0, 64),
        p_client: 'web'
      });
      if (!error && typeof data === 'string') this.sessionId = data;
    } catch {
      // Offline, signed out, or not configured: nothing to do but try later.
    }
  }

  /** Ends the current session so the next beat opens a fresh one. */
  reset(): void {
    this.sessionId = null;
    this.lastBeatAt = 0;
  }
}
