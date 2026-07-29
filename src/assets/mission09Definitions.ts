export type Mission09StepId =
  | 'inactive'
  | 'analyzeResidual'
  | 'followRoute'
  | 'reachThreshold'
  | 'completed';

export type Mission09Target = 'base' | 'beacon' | 'threshold' | 'none';

export type Mission09StepDefinition = {
  id: Mission09StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission09Target;
};

export type AuroraSectorDefinition = {
  id: string;
  name: string;
  shortName: string;
  /** Sector centre in surface-local X/Z. */
  center: readonly [number, number];
  /** Half-size of the sector ground patch (square). */
  half: number;
  /** Base terrain tint for the patch. */
  tint: number;
  /** Dust/particle tint for the sector. */
  dust: number;
};

export type AtlasRouteBeaconDefinition = {
  id: string;
  name: string;
  shortName: string;
  sectorIndex: number;
  position: readonly [number, number];
};

/**
 * The Aurora route runs far south of Base Nereida (origin). Sector centres
 * are 750 units apart with 1000-unit patches, so consecutive patches overlap
 * and the base terrain (±900) covers the first sector — no ground gaps. Fog
 * hides the far patch edges during travel.
 */
export const auroraSectorDefinitions: readonly AuroraSectorDefinition[] = [
  { id: 'sector-nereida-exterior', name: 'Nereida Exterior', shortName: 'Nereida Ext.', center: [0, -650], half: 500, tint: 0x6b6456, dust: 0x8a8172 },
  { id: 'sector-ash-plains', name: 'Llanuras de Ceniza', shortName: 'Ceniza', center: [0, -1400], half: 500, tint: 0x565049, dust: 0x7d766c },
  { id: 'sector-atlas-canyons', name: 'Cañones Atlas', shortName: 'Cañones', center: [0, -2150], half: 500, tint: 0x6e5a48, dust: 0x8f7a62 },
  { id: 'sector-storm-plateau', name: 'Meseta de Tormentas', shortName: 'Tormentas', center: [0, -2900], half: 500, tint: 0x4b5158, dust: 0x6d747c },
  { id: 'sector-aurora-threshold', name: 'Umbral Aurora', shortName: 'Umbral', center: [0, -3650], half: 500, tint: 0x5f6b52, dust: 0x93a67e }
] as const;

export const atlasRouteBeaconDefinitions: readonly AtlasRouteBeaconDefinition[] = [
  { id: 'atlas-route-beacon-1', name: 'Baliza Atlas 1', shortName: 'Baliza 1', sectorIndex: 0, position: [90, -700] },
  { id: 'atlas-route-beacon-2', name: 'Baliza Atlas 2', shortName: 'Baliza 2', sectorIndex: 1, position: [-70, -1420] },
  { id: 'atlas-route-beacon-3', name: 'Baliza Atlas 3', shortName: 'Baliza 3', sectorIndex: 2, position: [90, -2180] },
  { id: 'atlas-route-beacon-4', name: 'Baliza Atlas 4', shortName: 'Baliza 4', sectorIndex: 3, position: [-50, -2920] },
  { id: 'atlas-route-beacon-5', name: 'Baliza Atlas 5', shortName: 'Baliza 5', sectorIndex: 4, position: [40, -3620] }
] as const;

export const auroraThresholdDefinition = {
  id: 'aurora-threshold',
  name: 'Horizonte Aurora',
  position: [0, -3980] as const
} as const;

export const mission09Tuning = {
  baseInteractionRange: 52,
  beaconScanRange: 36,
  beaconApproachRange: 120,
  sectorActivateRange: 1300,
  thresholdArrivalRange: 120,
  horizonScanRange: 150,
  /** Distance from Base Nereida at which its signal is fully lost. */
  baseSignalRange: 3600
} as const;

export const mission09Steps: Record<Mission09StepId, Mission09StepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'Misión 09: Expedición Aurora',
    stepTitle: 'En espera',
    objective: 'La grieta de señal debe estar contenida antes de leer la firma residual.',
    nextAction: 'Completa la Misión 08.',
    hint: 'La firma residual todavía no fue interpretada.',
    target: 'none'
  },
  analyzeResidual: {
    id: 'analyzeResidual',
    title: 'Misión 09: Expedición Aurora',
    stepTitle: 'Firma Residual',
    objective: 'Analiza la firma residual en Base Nereida.',
    nextAction: 'Usa E en la consola de Base Nereida.',
    hint: 'La firma no apunta a Nereida: señala algo mucho más lejos.',
    target: 'base'
  },
  followRoute: {
    id: 'followRoute',
    title: 'Misión 09: Expedición Aurora',
    stepTitle: 'Ruta Aurora',
    objective: 'Despega y sigue la Ruta Aurora escaneando las balizas Atlas.',
    nextAction: 'Viaja hacia la baliza y escanéala con E.',
    hint: 'Cada baliza confirma un tramo de la ruta hacia el Sector Aurora.',
    target: 'beacon'
  },
  reachThreshold: {
    id: 'reachThreshold',
    title: 'Misión 09: Expedición Aurora',
    stepTitle: 'Umbral Aurora',
    objective: 'Llega al Umbral Aurora y escanea el horizonte.',
    nextAction: 'Escanea el horizonte Aurora con E.',
    hint: 'La niebla baja se abrirá sobre el sector lejano.',
    target: 'threshold'
  },
  completed: {
    id: 'completed',
    title: 'Misión 09: Expedición Aurora',
    stepTitle: 'Sector Aurora',
    objective: 'Sector Aurora descubierto: una región donde la humanidad podría volver a respirar.',
    nextAction: 'A la espera de nuevos desarrollos.',
    hint: 'La colonización de Aurora será otra historia.',
    target: 'none'
  }
};
