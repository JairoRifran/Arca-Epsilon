import {
  LOCAL_PLAYER_ID,
  PLAYER_PROFILE_VERSION,
  type PlayerProfile,
  type ShipEntitlement,
  ownsShip
} from './PlayerProfile';
import { ShipCatalog, STARTER_SHIP_ID } from '../ships/ShipCatalog';

export type ProfileStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface PlayerProfileRepository {
  load(): PlayerProfile;
  save(profile: PlayerProfile): PlayerProfile;
  selectShip(shipId: string): PlayerProfile;
  recordCombatResult(won: boolean, kills: number): PlayerProfile;
}

const PROFILE_STORAGE_KEY = 'arca-epsilon-player-profile-v1';

export function profileStorageKeyForAccount(accountId?: string): string {
  const normalized = accountId?.trim();
  return normalized
    ? `${PROFILE_STORAGE_KEY}:account:${encodeURIComponent(normalized)}`
    : PROFILE_STORAGE_KEY;
}

function starterEntitlement(now: number): ShipEntitlement {
  return {
    id: `local:${STARTER_SHIP_ID}`,
    catalogItemId: STARTER_SHIP_ID,
    source: 'starter',
    grantedAt: now
  };
}

export function createDefaultPlayerProfile(now = Date.now()): PlayerProfile {
  return {
    version: PLAYER_PROFILE_VERSION,
    id: LOCAL_PLAYER_ID,
    displayName: 'Piloto Epsilon',
    identity: { provider: 'local', providerUserId: LOCAL_PLAYER_ID },
    selectedShipId: STARTER_SHIP_ID,
    entitlements: [starterEntitlement(now)],
    stats: { combatMatchesPlayed: 0, combatWins: 0, combatKills: 0 },
    preferences: { garageAutoRotate: true },
    updatedAt: now
  };
}

/**
 * Provisional local authority. A future remote implementation can satisfy the
 * same repository contract; premium entitlements must ultimately come from a
 * backend or Steam, never from a button toggling client state.
 */
export class LocalPlayerProfileRepository implements PlayerProfileRepository {
  constructor(
    private readonly storage: ProfileStorage,
    private readonly catalog: ShipCatalog,
    private readonly now: () => number = Date.now,
    private readonly storageKey = PROFILE_STORAGE_KEY
  ) {}

  load(): PlayerProfile {
    let parsed: unknown;
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (raw) parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    const profile = this.repair(parsed);
    this.persist(profile);
    return profile;
  }

  save(profile: PlayerProfile): PlayerProfile {
    const repaired = this.repair(profile);
    repaired.updatedAt = this.now();
    this.persist(repaired);
    return repaired;
  }

  selectShip(shipId: string): PlayerProfile {
    const profile = this.load();
    const requested = this.catalog.get(shipId);
    if (requested && ownsShip(profile, requested.id)) profile.selectedShipId = requested.id;
    else profile.selectedShipId = this.catalog.getStarter().id;
    return this.save(profile);
  }

  recordCombatResult(won: boolean, kills: number): PlayerProfile {
    const profile = this.load();
    profile.stats.combatMatchesPlayed += 1;
    profile.stats.combatWins += won ? 1 : 0;
    profile.stats.combatKills += Math.max(0, Math.floor(kills));
    return this.save(profile);
  }

  private repair(candidate: unknown): PlayerProfile {
    const fallback = createDefaultPlayerProfile(this.now());
    if (!candidate || typeof candidate !== 'object') return fallback;
    const raw = candidate as Partial<PlayerProfile>;
    const entitlements = Array.isArray(raw.entitlements)
      ? raw.entitlements.filter((entry): entry is ShipEntitlement => Boolean(
          entry && typeof entry.catalogItemId === 'string' && this.catalog.get(entry.catalogItemId)
        ))
      : [];
    if (!entitlements.some((entry) => entry.catalogItemId === STARTER_SHIP_ID)) {
      entitlements.unshift(starterEntitlement(this.now()));
    }
    const selected = typeof raw.selectedShipId === 'string' &&
      this.catalog.get(raw.selectedShipId) &&
      entitlements.some((entry) => entry.catalogItemId === raw.selectedShipId)
      ? raw.selectedShipId
      : STARTER_SHIP_ID;
    return {
      version: PLAYER_PROFILE_VERSION,
      id: typeof raw.id === 'string' && raw.id ? raw.id : fallback.id,
      displayName: typeof raw.displayName === 'string' && raw.displayName ? raw.displayName : fallback.displayName,
      identity: raw.identity?.provider && raw.identity?.providerUserId
        ? raw.identity
        : fallback.identity,
      selectedShipId: selected,
      entitlements,
      stats: {
        combatMatchesPlayed: this.nonNegativeInt(raw.stats?.combatMatchesPlayed),
        combatWins: this.nonNegativeInt(raw.stats?.combatWins),
        combatKills: this.nonNegativeInt(raw.stats?.combatKills)
      },
      preferences: {
        garageAutoRotate: raw.preferences?.garageAutoRotate !== false
      },
      updatedAt: Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : fallback.updatedAt
    };
  }

  private nonNegativeInt(value: unknown): number {
    return Math.max(0, Math.floor(typeof value === 'number' && Number.isFinite(value) ? value : 0));
  }

  private persist(profile: PlayerProfile): void {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(profile));
    } catch {
      // Private/blocked storage keeps a valid in-memory profile for this call.
    }
  }
}

export { PROFILE_STORAGE_KEY };
