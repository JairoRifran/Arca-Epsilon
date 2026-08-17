export type CombatGameType = 'survival';
export type CombatWorldContext = 'orbital' | 'atmospheric' | 'surface';
export type CombatDifficulty = 'normal';

export type CombatScenarioDefinition = {
  id: string;
  name: string;
  worldContext: CombatWorldContext;
  description: string;
  playerSpawn: readonly [number, number, number];
  encounterOrigin: readonly [number, number, number];
  allowedGameTypes: readonly CombatGameType[];
  recommendedPlayers: readonly [number, number];
  waveSizes: readonly number[];
};

export const ARK_ORBIT_SURVIVAL: CombatScenarioDefinition = {
  id: 'ark-orbit-survival',
  name: 'Órbita del Arca',
  worldContext: 'orbital',
  description: 'Defiende el perímetro de la Arca Epsilon frente a tres oleadas de exploradores de la Coalición.',
  playerSpawn: [0, 18, 330],
  encounterOrigin: [0, 0, 20],
  allowedGameTypes: ['survival'],
  recommendedPlayers: [1, 4],
  waveSizes: [2, 4, 6]
};

export class CombatScenarioCatalog {
  private readonly scenarios = new Map<string, CombatScenarioDefinition>();

  constructor(definitions: readonly CombatScenarioDefinition[] = [ARK_ORBIT_SURVIVAL]) {
    definitions.forEach((definition) => this.scenarios.set(definition.id, definition));
  }

  get(id: string): CombatScenarioDefinition | undefined {
    return this.scenarios.get(id);
  }

  require(id: string): CombatScenarioDefinition {
    const scenario = this.get(id);
    if (!scenario) throw new Error(`Unknown combat scenario: ${id}`);
    return scenario;
  }

  list(): readonly CombatScenarioDefinition[] {
    return [...this.scenarios.values()];
  }
}
