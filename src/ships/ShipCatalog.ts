import { combatTuningProfile, PLAYER_TORPEDO_TUBES } from '../game/CombatTuningProfile';

export const STARTER_SHIP_ID = 'epsilon-scout';

export type ShipAcquisitionType = 'starter' | 'unlock' | 'premium' | 'dlc' | 'event';

export type ShipStats = {
  primaryDamage: number;
  hullCapacity: number;
  shieldCapacity: number;
  thrust: number;
  boostMultiplier: number;
  maneuverResponse: number;
  torpedoCapacity: number;
};

export type ShipDefinition = {
  id: string;
  displayName: string;
  className: string;
  description: string;
  model: {
    garage: string;
    gameplayMedium: string;
    gameplayLow: string;
    gameplayOriginal: string;
  };
  stats: ShipStats;
  weaponProfile: 'scout-standard';
  flightProfile: 'epsilon-scout-flight';
  acquisition: {
    type: ShipAcquisitionType;
    entitlementId: string;
  };
};

export const STARTER_SHIP: ShipDefinition = {
  id: STARTER_SHIP_ID,
  displayName: 'Nave de Manejo Epsilon',
  className: 'Explorador táctico',
  description: 'Explorador humano modular preparado para reconocimiento, defensa orbital y operaciones de colonia.',
  model: {
    garage: '/models/optimized/scout-ship.medium.glb',
    gameplayMedium: '/models/optimized/scout-ship.medium.glb',
    gameplayLow: '/models/optimized/scout-ship.low.glb',
    gameplayOriginal: '/models/player-scout.glb'
  },
  stats: {
    primaryDamage: combatTuningProfile.weapons.laserDamage,
    hullCapacity: 100,
    shieldCapacity: 100,
    thrust: 35,
    boostMultiplier: 2.35,
    maneuverResponse: 0.0023,
    torpedoCapacity: PLAYER_TORPEDO_TUBES.tubeCount
  },
  weaponProfile: 'scout-standard',
  flightProfile: 'epsilon-scout-flight',
  acquisition: {
    type: 'starter',
    entitlementId: `ship:${STARTER_SHIP_ID}`
  }
};

/** Data-only catalog. Production currently registers exactly one real ship. */
export class ShipCatalog {
  private readonly entries = new Map<string, ShipDefinition>();

  constructor(definitions: readonly ShipDefinition[] = [STARTER_SHIP]) {
    definitions.forEach((definition) => this.register(definition));
  }

  register(definition: ShipDefinition): void {
    if (!definition.id || this.entries.has(definition.id)) {
      throw new Error(`Duplicate or invalid ship definition: ${definition.id}`);
    }
    if (Object.values(definition.stats).some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new Error(`Invalid stats for ship definition: ${definition.id}`);
    }
    this.entries.set(definition.id, definition);
  }

  get(id: string): ShipDefinition | undefined {
    return this.entries.get(id);
  }

  require(id: string): ShipDefinition {
    return this.get(id) ?? this.getStarter();
  }

  getStarter(): ShipDefinition {
    const starter = this.entries.get(STARTER_SHIP_ID);
    if (!starter) throw new Error('Starter ship missing from catalog');
    return starter;
  }

  list(): readonly ShipDefinition[] {
    return [...this.entries.values()];
  }
}
