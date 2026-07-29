import type { ResourceSiteStatus, SurfaceResourceType } from '../assets/surfaceResourceDefinitions';

export type ColonyState = {
  colonyName: string;
  landingSecured: boolean;
  habitatOnline: boolean;
  energyOnline: boolean;
  oxygenOnline: boolean;
  waterFound: boolean;
  mineralsFound: boolean;
  energyFound: boolean;
  energySourceFound: boolean;
  organicFound: boolean;
  ancientResidueFound: boolean;
  surfaceSitesRevealed: boolean;
  waterStatus: ResourceSiteStatus;
  mineralStatus: ResourceSiteStatus;
  energyStatus: ResourceSiteStatus;
  resourceAnalysisReady: boolean;
  colonizationReadiness: number;
  readiness: number;
  baseSystemsReady: boolean;
  operational: boolean;
  baseNereidaOperational: boolean;
  expansionPrepared: boolean;
  currentStage: number;
  nextRequiredAction: string;
};

export type ColonyReadinessBreakdown = {
  landing: number;
  habitat: number;
  water: number;
  minerals: number;
  energy: number;
  total: number;
};

export class ColonyManager {
  readonly state: ColonyState = {
    colonyName: 'Base Nereida',
    landingSecured: false,
    habitatOnline: false,
    energyOnline: false,
    oxygenOnline: false,
    waterFound: false,
    mineralsFound: false,
    energyFound: false,
    energySourceFound: false,
    organicFound: false,
    ancientResidueFound: false,
    surfaceSitesRevealed: false,
    waterStatus: 'unknown',
    mineralStatus: 'unknown',
    energyStatus: 'unknown',
    resourceAnalysisReady: false,
    colonizationReadiness: 0,
    readiness: 0,
    baseSystemsReady: false,
    operational: false,
    baseNereidaOperational: false,
    expansionPrepared: false,
    currentStage: 0,
    nextRequiredAction: 'Completar aterrizaje en Cuenca Nereida.'
  };

  registerLandingSecured(): void {
    this.state.landingSecured = true;
    this.recalculateReadiness();
  }

  registerModuleDeployment(): void {
    this.state.landingSecured = true;
    this.state.habitatOnline = true;
    this.state.oxygenOnline = true;
    this.recalculateReadiness();
  }

  registerResourceScan(type: SurfaceResourceType): void {
    this.sampleResource(type);
    this.recalculateReadiness();
  }

  revealSurfaceSites(): void {
    this.state.surfaceSitesRevealed = true;
    for (const type of ['water', 'minerals', 'energy'] as SurfaceResourceType[]) {
      if (this.getResourceStatus(type) === 'unknown') this.setResourceStatus(type, 'detected');
    }
    this.recalculateReadiness();
  }

  locateResource(type: SurfaceResourceType): void {
    const status = this.getResourceStatus(type);
    if (status === 'unknown') this.setResourceStatus(type, 'detected');
    if (status === 'unknown' || status === 'detected') this.setResourceStatus(type, 'located');
    this.recalculateReadiness();
  }

  sampleResource(type: SurfaceResourceType): void {
    if (type === 'water' || type === 'minerals' || type === 'energy') {
      this.setResourceStatus(type, 'sampled');
    }
    this.markResourceFound(type);
    this.recalculateReadiness();
  }

  analyzeSamples(): boolean {
    this.recalculateReadiness();
    if (!this.state.resourceAnalysisReady) return false;
    for (const type of ['water', 'minerals', 'energy'] as SurfaceResourceType[]) {
      if (this.getResourceStatus(type) === 'sampled') this.setResourceStatus(type, 'analyzed');
    }
    this.recalculateReadiness();
    return this.state.baseSystemsReady;
  }

  getResourceStatus(type: SurfaceResourceType): ResourceSiteStatus {
    if (type === 'water') return this.state.waterStatus;
    if (type === 'minerals') return this.state.mineralStatus;
    if (type === 'energy') return this.state.energyStatus;
    if (type === 'organic') return this.state.organicFound ? 'sampled' : 'unknown';
    return this.state.ancientResidueFound ? 'sampled' : 'unknown';
  }

  markResourceFound(type: SurfaceResourceType): void {
    if (type === 'water') this.state.waterFound = true;
    if (type === 'minerals') this.state.mineralsFound = true;
    if (type === 'energy') {
      this.state.energyFound = true;
      this.state.energySourceFound = true;
      if (this.state.habitatOnline) {
        this.state.energyOnline = true;
      }
    }
    if (type === 'organic') this.state.organicFound = true;
    if (type === 'ancient') this.state.ancientResidueFound = true;
  }

  getColonyStatus(): ColonyState {
    return { ...this.state };
  }

  getNextObjective(): string {
    return this.state.nextRequiredAction;
  }

  getNextColonyAction(): string {
    return this.state.nextRequiredAction;
  }

  getReadinessBreakdown(): ColonyReadinessBreakdown {
    const breakdown = {
      landing: this.state.landingSecured ? 10 : 0,
      habitat: this.state.habitatOnline ? 25 : 0,
      water: Math.round(this.statusProgress(this.state.waterStatus) * 20),
      minerals: Math.round(this.statusProgress(this.state.mineralStatus) * 20),
      energy: Math.round(this.statusProgress(this.state.energyStatus) * 25),
      total: 0
    };
    breakdown.total = Math.min(
      100,
      breakdown.landing + breakdown.habitat + breakdown.water + breakdown.minerals + breakdown.energy
    );
    return breakdown;
  }

  confirmBaseOperational(): boolean {
    this.recalculateReadiness();
    if (!this.state.baseSystemsReady) return false;
    this.state.baseNereidaOperational = true;
    this.state.operational = true;
    this.recalculateReadiness();
    return true;
  }

  canDeployNextModule(): boolean {
    return this.state.landingSecured && !this.state.habitatOnline;
  }

  calculateReadiness(): number {
    return this.recalculateReadiness();
  }

  restore(snapshot: Partial<ColonyState>): void {
    const migratedWater = snapshot.waterStatus ?? (snapshot.waterFound ? 'analyzed' : 'unknown');
    const migratedMinerals = snapshot.mineralStatus ?? (snapshot.mineralsFound ? 'analyzed' : 'unknown');
    const migratedEnergy = snapshot.energyStatus ?? (snapshot.energyFound || snapshot.energySourceFound ? 'analyzed' : 'unknown');
    Object.assign(this.state, snapshot);
    this.state.waterStatus = migratedWater;
    this.state.mineralStatus = migratedMinerals;
    this.state.energyStatus = migratedEnergy;
    this.state.surfaceSitesRevealed = snapshot.surfaceSitesRevealed ?? [migratedWater, migratedMinerals, migratedEnergy].some((status) => status !== 'unknown');
    if (snapshot.baseNereidaOperational || snapshot.operational) {
      this.state.baseNereidaOperational = true;
      this.state.operational = true;
    }
    this.recalculateReadiness();
  }

  reset(): void {
    Object.assign(this.state, {
      landingSecured: false,
      habitatOnline: false,
      energyOnline: false,
      oxygenOnline: false,
      waterFound: false,
      mineralsFound: false,
      energyFound: false,
      energySourceFound: false,
      organicFound: false,
      ancientResidueFound: false,
      surfaceSitesRevealed: false,
      waterStatus: 'unknown',
      mineralStatus: 'unknown',
      energyStatus: 'unknown',
      resourceAnalysisReady: false,
      colonizationReadiness: 0,
      readiness: 0,
      baseSystemsReady: false,
      operational: false,
      baseNereidaOperational: false,
      expansionPrepared: false,
      currentStage: 0,
      nextRequiredAction: 'Completar aterrizaje en Cuenca Nereida.'
    });
  }

  recalculateReadiness(): number {
    this.state.waterFound = this.statusAtLeast(this.state.waterStatus, 'sampled');
    this.state.mineralsFound = this.statusAtLeast(this.state.mineralStatus, 'sampled');
    this.state.energyFound = this.statusAtLeast(this.state.energyStatus, 'sampled');
    this.state.energySourceFound = this.state.energyFound;
    this.state.resourceAnalysisReady =
      this.state.habitatOnline &&
      this.state.waterFound &&
      this.state.mineralsFound &&
      this.state.energyFound;
    const breakdown = this.getReadinessBreakdown();
    this.state.energyOnline = this.state.habitatOnline && this.state.energyStatus === 'analyzed';

    this.state.colonizationReadiness = breakdown.total;
    this.state.readiness = this.state.colonizationReadiness;
    this.state.baseSystemsReady =
      this.state.habitatOnline &&
      this.state.waterStatus === 'analyzed' &&
      this.state.mineralStatus === 'analyzed' &&
      this.state.energyStatus === 'analyzed';
    if (!this.state.baseSystemsReady) {
      this.state.baseNereidaOperational = false;
    }
    this.state.operational = this.state.baseSystemsReady && this.state.baseNereidaOperational;
    this.state.expansionPrepared =
      this.state.operational && this.state.organicFound && this.state.ancientResidueFound;
    this.state.currentStage = this.resolveStage();
    this.state.nextRequiredAction = this.resolveNextAction();
    return this.state.colonizationReadiness;
  }

  private resolveStage(): number {
    if (this.state.expansionPrepared) return 7;
    if (this.state.operational) return 6;
    if (this.state.baseSystemsReady) return 5;
    if (this.state.resourceAnalysisReady) return 5;
    if (this.state.energyFound || this.state.energySourceFound) return 5;
    if (this.state.mineralsFound) return 4;
    if (this.state.waterFound) return 3;
    if (this.state.surfaceSitesRevealed) return 2;
    if (this.state.habitatOnline) return 2;
    if (this.state.landingSecured) return 1;
    return 0;
  }

  private resolveNextAction(): string {
    if (!this.state.landingSecured) return 'Confirmar llegada a Cuenca Nereida.';
    if (!this.state.habitatOnline) return 'Desplegar Habitat Module Nereida-01.';
    if (!this.state.surfaceSitesRevealed) return 'Ejecutar barrido geológico desde el Hábitat Nereida-01.';
    if (!this.state.waterFound) return 'Localizar y tomar una muestra en Laguna Nereida.';
    if (!this.state.mineralsFound) return 'Localizar y tomar una muestra en Veta Ferrita.';
    if (!this.state.energyFound && !this.state.energySourceFound) return 'Localizar y muestrear la Fisura Geotérmica.';
    if (!this.state.baseSystemsReady) return 'Regresar al Hábitat Nereida-01 para analizar las muestras.';
    if (!this.state.operational) return 'Regresar al Habitat Nereida-01 y confirmar Base Nereida operativa.';
    if (!this.state.expansionPrepared) return 'Preparar expansion con muestras organicas y residuo Atlas.';
    return 'Base Nereida operativa; preparar expansion.';
  }

  private setResourceStatus(type: SurfaceResourceType, status: ResourceSiteStatus): void {
    if (type === 'water') this.state.waterStatus = status;
    if (type === 'minerals') this.state.mineralStatus = status;
    if (type === 'energy') this.state.energyStatus = status;
  }

  private statusProgress(status: ResourceSiteStatus): number {
    if (status === 'detected') return 0.15;
    if (status === 'located') return 0.35;
    if (status === 'sampled') return 0.65;
    if (status === 'analyzed') return 1;
    return 0;
  }

  private statusAtLeast(status: ResourceSiteStatus, minimum: ResourceSiteStatus): boolean {
    const order: ResourceSiteStatus[] = ['unknown', 'detected', 'located', 'sampled', 'analyzed'];
    return order.indexOf(status) >= order.indexOf(minimum);
  }
}
