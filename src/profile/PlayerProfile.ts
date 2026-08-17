export const PLAYER_PROFILE_VERSION = 1;
export const LOCAL_PLAYER_ID = 'local-player';

export type IdentityProvider = 'local' | 'email' | 'google' | 'steam';

export type PlayerIdentity = {
  provider: IdentityProvider;
  providerUserId: string;
};

export type ShipEntitlementSource = 'starter' | 'unlock' | 'premium' | 'dlc' | 'event';

export type ShipEntitlement = {
  id: string;
  catalogItemId: string;
  source: ShipEntitlementSource;
  grantedAt: number;
};

export type PlayerProfileStats = {
  combatMatchesPlayed: number;
  combatWins: number;
  combatKills: number;
};

export type PlayerProfilePreferences = {
  garageAutoRotate: boolean;
};

export type PlayerProfile = {
  version: number;
  id: string;
  displayName: string;
  identity: PlayerIdentity;
  selectedShipId: string;
  entitlements: ShipEntitlement[];
  stats: PlayerProfileStats;
  preferences: PlayerProfilePreferences;
  updatedAt: number;
};

export function ownedShipIds(profile: PlayerProfile): string[] {
  return profile.entitlements.map((entitlement) => entitlement.catalogItemId);
}

export function ownsShip(profile: PlayerProfile, shipId: string): boolean {
  return profile.entitlements.some((entitlement) => entitlement.catalogItemId === shipId);
}
