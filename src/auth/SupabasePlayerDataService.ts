import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PLAYER_PROFILE_VERSION,
  type PlayerProfile,
  type PlayerProfilePreferences,
  type PlayerProfileStats,
  type ShipEntitlement,
  type ShipEntitlementSource
} from '../profile/PlayerProfile';
import type { SaveGameData } from '../game/SaveSystem';
import type { ShipCatalog } from '../ships/ShipCatalog';
import type { AccountSession } from './AuthTypes';

type ProfileRow = {
  user_id: string;
  display_name: string;
  selected_ship_id: string;
  stats: unknown;
  preferences: unknown;
  updated_at: string;
};

type EntitlementRow = {
  id: string;
  catalog_item_id: string;
  source: string;
  granted_at: string;
};

type SaveRow = {
  payload: unknown;
  revision: number;
  checksum: string;
  device_id: string;
  updated_at: string;
};

export type RemoteSaveSlot = {
  payload: SaveGameData;
  revision: number;
  checksum: string;
  deviceId: string;
  updatedAt: number;
};

export interface PlayerDataGateway {
  readonly deviceId: string;
  loadProfile(session: AccountSession): Promise<PlayerProfile | undefined>;
  saveProfile(profile: PlayerProfile): Promise<void>;
  loadSave(slotId?: string): Promise<RemoteSaveSlot | undefined>;
  saveSlot(payload: SaveGameData, expectedRevision: number, slotId?: string): Promise<number>;
}

const ENTITLEMENT_SOURCES = new Set<ShipEntitlementSource>(['starter', 'unlock', 'premium', 'dlc', 'event']);

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nonNegativeInt(value: unknown): number {
  return Math.max(0, Math.floor(typeof value === 'number' && Number.isFinite(value) ? value : 0));
}

function profileStats(value: unknown): PlayerProfileStats {
  const raw = objectRecord(value);
  return {
    combatMatchesPlayed: nonNegativeInt(raw.combatMatchesPlayed),
    combatWins: nonNegativeInt(raw.combatWins),
    combatKills: nonNegativeInt(raw.combatKills)
  };
}

function profilePreferences(value: unknown): PlayerProfilePreferences {
  const raw = objectRecord(value);
  return { garageAutoRotate: raw.garageAutoRotate !== false };
}

function validSave(value: unknown): value is SaveGameData {
  if (!value || typeof value !== 'object') return false;
  const save = value as Partial<SaveGameData>;
  return save.version === 2 &&
    typeof save.currentPhase === 'string' &&
    typeof save.currentMissionStep === 'string' &&
    Array.isArray(save.playerApproxPosition) &&
    save.playerApproxPosition.length === 3;
}

async function checksum(payload: SaveGameData): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

export class CloudSaveConflictError extends Error {
  constructor() {
    super('La partida remota cambió en otro dispositivo.');
    this.name = 'CloudSaveConflictError';
  }
}

export class SupabasePlayerDataService implements PlayerDataGateway {
  constructor(
    private readonly client: SupabaseClient,
    private readonly catalog: ShipCatalog,
    readonly deviceId: string
  ) {}

  async loadProfile(session: AccountSession): Promise<PlayerProfile | undefined> {
    const [profileResult, entitlementResult] = await Promise.all([
      this.client.from('player_profiles').select('*').eq('user_id', session.userId).maybeSingle(),
      this.client.from('player_entitlements').select('*').eq('user_id', session.userId)
    ]);
    if (profileResult.error) throw profileResult.error;
    if (entitlementResult.error) throw entitlementResult.error;
    if (!profileResult.data) return undefined;

    const row = profileResult.data as ProfileRow;
    const entitlements = (entitlementResult.data as EntitlementRow[] ?? [])
      .filter((entry) => this.catalog.get(entry.catalog_item_id))
      .map((entry): ShipEntitlement => ({
        id: entry.id,
        catalogItemId: entry.catalog_item_id,
        source: ENTITLEMENT_SOURCES.has(entry.source as ShipEntitlementSource)
          ? entry.source as ShipEntitlementSource
          : 'unlock',
        grantedAt: Date.parse(entry.granted_at) || Date.now()
      }));
    const selectedShipId = entitlements.some((entry) => entry.catalogItemId === row.selected_ship_id)
      ? row.selected_ship_id
      : this.catalog.getStarter().id;

    return {
      version: PLAYER_PROFILE_VERSION,
      id: session.userId,
      displayName: row.display_name || session.displayName,
      identity: { provider: session.provider, providerUserId: session.userId },
      selectedShipId,
      entitlements,
      stats: profileStats(row.stats),
      preferences: profilePreferences(row.preferences),
      updatedAt: Date.parse(row.updated_at) || Date.now()
    };
  }

  async saveProfile(profile: PlayerProfile): Promise<void> {
    const { error } = await this.client.from('player_profiles').upsert({
      user_id: profile.id,
      display_name: profile.displayName,
      selected_ship_id: profile.selectedShipId,
      stats: profile.stats,
      preferences: profile.preferences
    }, { onConflict: 'user_id' });
    if (error) throw error;
  }

  async loadSave(slotId = 'story-main'): Promise<RemoteSaveSlot | undefined> {
    const { data, error } = await this.client
      .from('save_slots')
      .select('payload, revision, checksum, device_id, updated_at')
      .eq('slot_id', slotId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    const row = data as SaveRow;
    if (!validSave(row.payload)) throw new Error('La partida remota no tiene un formato compatible.');
    return {
      payload: row.payload,
      revision: Number(row.revision) || 0,
      checksum: row.checksum,
      deviceId: row.device_id,
      updatedAt: Date.parse(row.updated_at) || 0
    };
  }

  async saveSlot(payload: SaveGameData, expectedRevision: number, slotId = 'story-main'): Promise<number> {
    const payloadChecksum = await checksum(payload);
    const { data, error } = await this.client.rpc('upsert_save_slot', {
      p_slot_id: slotId,
      p_payload: payload,
      p_expected_revision: expectedRevision,
      p_checksum: payloadChecksum,
      p_device_id: this.deviceId
    });
    if (error) {
      if (error.message.includes('SAVE_REVISION_CONFLICT')) throw new CloudSaveConflictError();
      throw error;
    }
    const result = Array.isArray(data) ? data[0] : data;
    const nextRevision = Number((result as { revision?: unknown } | null)?.revision);
    if (!Number.isFinite(nextRevision) || nextRevision < 1) {
      throw new Error('El servidor no confirmó la revisión de guardado.');
    }
    return nextRevision;
  }
}

export function getOrCreateDeviceId(storage: Pick<Storage, 'getItem' | 'setItem'>): string {
  const key = 'arca-epsilon-device-id-v1';
  try {
    const current = storage.getItem(key);
    if (current) return current;
    const created = crypto.randomUUID();
    storage.setItem(key, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}
