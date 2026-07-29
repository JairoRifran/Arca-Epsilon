import type { ResourceInventoryState } from './ResourceInventory';

export type UpgradeId =
  | 'scannerRange'
  | 'engineEfficiency'
  | 'shieldCapacity'
  | 'habitatEfficiency'
  | 'oxygenProcessing'
  | 'energyStorage'
  | 'resourceScannerPrecision';

export type UpgradeCost = Partial<
  Pick<ResourceInventoryState, 'minerals' | 'energyCells' | 'organicSamples' | 'ancientResidue' | 'memoryData'>
>;

export type UpgradeDefinition = {
  id: UpgradeId;
  name: string;
  description: string;
  cost: UpgradeCost;
  unlocked: boolean;
  purchased: boolean;
  effects: Record<string, number>;
};

export class UpgradeSystem {
  readonly upgrades: UpgradeDefinition[] = [
    {
      id: 'scannerRange',
      name: 'Scanner de superficie ampliado',
      description: 'Aumenta el radio de lectura para recursos de la Cuenca Nereida.',
      cost: { minerals: 20, memoryData: 10 },
      unlocked: true,
      purchased: false,
      effects: { scannerRangeMultiplier: 1.15 }
    },
    {
      id: 'engineEfficiency',
      name: 'Impulso eficiente en atmosfera',
      description: 'Reduce gasto energetico durante vuelos rasantes.',
      cost: { minerals: 30, energyCells: 20 },
      unlocked: false,
      purchased: false,
      effects: { energyDrainMultiplier: 0.9 }
    },
    {
      id: 'shieldCapacity',
      name: 'Capacidad de escudo de descenso',
      description: 'Mejora tolerancia a tormentas de superficie.',
      cost: { minerals: 40, energyCells: 25 },
      unlocked: false,
      purchased: false,
      effects: { shieldCapacityBonus: 10 }
    },
    {
      id: 'habitatEfficiency',
      name: 'Eficiencia del habitat',
      description: 'Reduce demanda de soporte vital del modulo Nereida-01.',
      cost: { minerals: 35, energyCells: 20 },
      unlocked: true,
      purchased: false,
      effects: { habitatEfficiency: 1.1 }
    },
    {
      id: 'oxygenProcessing',
      name: 'Procesamiento de oxigeno',
      description: 'Aprovecha liquenes locales sin abrir aun una cadena de crafting.',
      cost: { organicSamples: 25, minerals: 10 },
      unlocked: false,
      purchased: false,
      effects: { oxygenOutputMultiplier: 1.18 }
    },
    {
      id: 'energyStorage',
      name: 'Almacenamiento geotermico',
      description: 'Prepara baterias de base para expansiones futuras.',
      cost: { energyCells: 55, minerals: 20 },
      unlocked: false,
      purchased: false,
      effects: { energyStorageBonus: 20 }
    },
    {
      id: 'resourceScannerPrecision',
      name: 'Precision de scanner Atlas',
      description: 'Usa residuo antiguo para filtrar senales falsas de recursos.',
      cost: { ancientResidue: 30, memoryData: 15 },
      unlocked: false,
      purchased: false,
      effects: { resourceSignalNoise: -0.18 }
    }
  ];

  updateUnlocks(inventory: ResourceInventoryState, readiness: number): void {
    for (const upgrade of this.upgrades) {
      if (upgrade.id === 'engineEfficiency' || upgrade.id === 'shieldCapacity') {
        upgrade.unlocked = readiness >= 50;
      }
      if (upgrade.id === 'oxygenProcessing') {
        upgrade.unlocked = inventory.organicSamples > 0;
      }
      if (upgrade.id === 'energyStorage') {
        upgrade.unlocked = inventory.energyCells > 0;
      }
      if (upgrade.id === 'resourceScannerPrecision') {
        upgrade.unlocked = inventory.ancientResidue > 0;
      }
    }
  }

  getSnapshot(): UpgradeDefinition[] {
    return this.upgrades.map((upgrade) => ({
      ...upgrade,
      cost: { ...upgrade.cost },
      effects: { ...upgrade.effects }
    }));
  }
}
