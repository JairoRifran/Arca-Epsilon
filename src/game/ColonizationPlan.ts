import type { HabitabilityReport } from './HabitabilitySystem';

export type ColonizationHook = {
  id: string;
  label: string;
  ready: boolean;
};

export type ColonyModuleType = 'habitat' | 'power_grid' | 'water_extractor' | 'hydroponics' | 'research_lab';

export type DeployedModule = {
  id: string;
  type: ColonyModuleType;
  position: [number, number, number];
  rotation: number;
  active: boolean;
};

export type SurfaceExplorationZone = {
  id: string;
  name: string;
  status: 'unexplored' | 'scanned' | 'secured';
  resourceYield: { water: number; minerals: number; energy: number };
};

export class ColonizationPlan {
  unlocked = false;

  readonly hooks: ColonizationHook[] = [
    { id: 'PlanetaryWorld', label: 'Planetary open-world layer', ready: false },
    { id: 'ColonyManager', label: 'Colony oxygen, water, energy and food manager', ready: false },
    { id: 'BaseModule', label: 'First deployable colony module', ready: false },
    { id: 'ResourceNode', label: 'Planetary resource node system', ready: false },
    { id: 'OrbitalMarker', label: 'Ancient marker decoding and descent corridor', ready: false },
    { id: 'LandingZone', label: 'Landing zone selection and descent flow', ready: false },
    { id: 'SurfaceArrival', label: 'First foothold and surface mission handoff', ready: false }
  ];

  readonly deployedModules: DeployedModule[] = [];

  readonly explorationZones: SurfaceExplorationZone[] = [
    { id: 'nereida-basin-core', name: 'Cuenca Nereida - Zona de Aterrizaje', status: 'secured', resourceYield: { water: 80, minerals: 45, energy: 60 } },
    { id: 'north-ridge-aquifer', name: 'Cresta Norte - Acuifero Subterraneo', status: 'unexplored', resourceYield: { water: 120, minerals: 30, energy: 20 } },
    { id: 'basalt-plateau-spire', name: 'Meseta de Basalto - Aguja Solar', status: 'unexplored', resourceYield: { water: 15, minerals: 90, energy: 110 } }
  ];

  unlock(report: HabitabilityReport): void {
    this.unlocked = report.viability >= 70;
    for (const hook of this.hooks) {
      hook.ready = this.unlocked;
    }
  }

  secureSurfaceArrival(): void {
    this.unlocked = true;
    for (const hook of this.hooks) {
      hook.ready = true;
    }
    // Deploy initial habitat module upon securing surface arrival
    if (this.deployedModules.length === 0) {
      this.deployModule('habitat', [0, 0, 0], 0);
    }
  }

  deployModule(type: ColonyModuleType, position: [number, number, number], rotation: number): DeployedModule {
    const module: DeployedModule = {
      id: `mod-${Date.now()}-${this.deployedModules.length}`,
      type,
      position,
      rotation,
      active: true
    };
    this.deployedModules.push(module);
    return module;
  }
}
