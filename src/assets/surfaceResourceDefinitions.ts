export type SurfaceResourceType = 'water' | 'minerals' | 'energy' | 'organic' | 'ancient';
export type ResourceSiteStatus = 'unknown' | 'detected' | 'located' | 'sampled' | 'analyzed';
export type ResourceTerrainKind = 'lagoon' | 'shelf' | 'trench';

export type ResourceTerrainProfile = {
  kind: ResourceTerrainKind;
  radii: [number, number];
  rotation: number;
  innerRatio: number;
  elevationOffset: number;
  slope: [number, number];
};

export type SurfaceResourceDefinition = {
  id: string;
  name: string;
  type: SurfaceResourceType;
  description: string;
  yieldAmount: number;
  position: [number, number];
  sampleOffset: [number, number];
  visualRotation?: number;
  terrainProfile?: ResourceTerrainProfile;
  mapHint?: 'thermal';
  shipScanRange: number;
  sampleRange: number;
};

export const surfaceResources: SurfaceResourceDefinition[] = [
  {
    id: 'res-water-aquifer',
    name: 'Laguna Nereida',
    type: 'water',
    description: 'Laguna somera alimentada por filtración basáltica. El análisis debe confirmar salinidad, microorganismos y potabilidad.',
    yieldAmount: 120,
    position: [-340, -210],
    sampleOffset: [20, 8.2],
    terrainProfile: {
      kind: 'lagoon',
      radii: [34, 32],
      rotation: 0.12,
      innerRatio: 0.68,
      elevationOffset: -2.3,
      slope: [0, 0]
    },
    shipScanRange: 118,
    sampleRange: 11
  },
  {
    id: 'res-minerals-deposit',
    name: 'Veta Ferrita',
    type: 'minerals',
    description: 'Formación rocosa rica en aleaciones naturales pesadas para blindaje y expansión modular.',
    yieldAmount: 85,
    position: [350, -120],
    sampleOffset: [-8, 1.2],
    visualRotation: -1.43,
    terrainProfile: {
      kind: 'shelf',
      radii: [38, 28],
      rotation: 0,
      innerRatio: 0.58,
      elevationOffset: 0,
      slope: [-0.018, 0.006]
    },
    shipScanRange: 112,
    sampleRange: 10
  },
  {
    id: 'res-energy-vent',
    name: 'Fisura Geotérmica',
    type: 'energy',
    description: 'Flujo térmico subterráneo constante con alta entalpía para alimentación de generadores termoeléctricos.',
    yieldAmount: 150,
    position: [80, 350],
    sampleOffset: [-2, -9],
    terrainProfile: {
      kind: 'trench',
      radii: [48, 32],
      rotation: -0.3,
      innerRatio: 0.58,
      elevationOffset: -0.8,
      slope: [0.012, 0.005]
    },
    mapHint: 'thermal',
    shipScanRange: 124,
    sampleRange: 12
  },
  {
    id: 'res-organic-sample',
    name: 'Muestras de Liquen Luminiscente',
    type: 'organic',
    description: 'Flora microbiana autóctona adaptada a baja radiación solar, rica en compuestos enzimáticos.',
    yieldAmount: 40,
    position: [245, 260],
    sampleOffset: [3.2, 0],
    shipScanRange: 96,
    sampleRange: 9
  },
  {
    id: 'res-ancient-relic',
    name: 'Residuo de Telemetría Atlas',
    type: 'ancient',
    description: 'Aleación cristalina inerte que emite un pulso armónico compatible con el Marcador Atlas en órbita.',
    yieldAmount: 60,
    position: [-220, 300],
    sampleOffset: [3.2, 0],
    shipScanRange: 96,
    sampleRange: 9
  }
];
