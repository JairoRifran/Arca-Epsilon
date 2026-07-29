import type { SurfaceResourceType } from '../assets/surfaceResourceDefinitions';

export type ResourceInventoryState = {
  waterData: number;
  minerals: number;
  energyCells: number;
  organicSamples: number;
  ancientResidue: number;
  memoryData: number;
};

export class ResourceInventory {
  readonly state: ResourceInventoryState = {
    waterData: 0,
    minerals: 0,
    energyCells: 0,
    organicSamples: 0,
    ancientResidue: 0,
    memoryData: 0
  };

  addSurfaceResource(type: SurfaceResourceType, amount: number): void {
    if (type === 'water') this.state.waterData += amount;
    if (type === 'minerals') this.state.minerals += amount;
    if (type === 'energy') this.state.energyCells += amount;
    if (type === 'organic') this.state.organicSamples += amount;
    if (type === 'ancient') this.state.ancientResidue += amount;
  }

  addMemoryData(amount: number): void {
    this.state.memoryData += amount;
  }

  restore(snapshot: Partial<ResourceInventoryState>): void {
    for (const [key, value] of Object.entries(snapshot) as [keyof ResourceInventoryState, number][]) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        this.state[key] = Math.max(0, Math.round(value));
      }
    }
  }

  reset(): void {
    this.restore({
      waterData: 0,
      minerals: 0,
      energyCells: 0,
      organicSamples: 0,
      ancientResidue: 0,
      memoryData: 0
    });
  }

  getSnapshot(): ResourceInventoryState {
    return { ...this.state };
  }
}
