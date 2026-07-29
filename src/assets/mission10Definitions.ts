import { auroraSettlementLayout } from './auroraSettlementLayout';
export type Mission10StepId =
  | 'inactive'
  | 'initialSurvey'
  | 'descendToClearing'
  | 'scanWater'
  | 'scanSoil'
  | 'scanAtmosphere'
  | 'scanBiosafety'
  | 'returnToClearing'
  | 'markSite'
  | 'deployModule'
  | 'stabilizeModule'
  | 'completed';

export type Mission10Target = 'ship' | 'clearing' | 'sample' | 'module' | 'none';

export type Mission10StepDefinition = {
  id: Mission10StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission10Target;
};

export type AuroraSampleKind = 'water' | 'soil' | 'atmosphere' | 'biosafety';

export type AuroraSamplePointDefinition = {
  id: string;
  kind: AuroraSampleKind;
  name: string;
  shortName: string;
  /** Surface-local X/Z inside the Aurora valley. */
  position: readonly [number, number];
  /** Marker tint while dormant. */
  tint: number;
  /** Reading reported in the HUD once analysed. */
  reading: string;
};

/**
 * Mission 10 works entirely inside the Aurora valley revealed by M09. The
 * valley reveal group sits at the Aurora threshold (0, -3980); its floor is
 * centred 260 units further south and the water basin another 60 beyond
 * that, so the sample points below are the world-space equivalents of the
 * valley's own features: the north shore of the water sheet, the sediment
 * clearing east of it, a small rise west of the route, and the protoflora
 * band between the clearing and the water.
 */
export const auroraSamplePointDefinitions: readonly AuroraSamplePointDefinition[] = [
  {
    id: 'aurora-sample-water',
    kind: 'water',
    name: 'Orilla Aurora',
    shortName: 'Agua',
    // On the bank a few metres north of the waterline, not out on the sheet.
    position: [-46, -4158],
    tint: 0x4f9ec4,
    reading: 'Agua superficial: baja salinidad, trazas minerales, microorganismos simples.'
  },
  {
    id: 'aurora-sample-soil',
    kind: 'soil',
    name: 'Claro de Asentamiento',
    shortName: 'Suelo',
    position: auroraSettlementLayout.soilSample,
    tint: 0xb59a63,
    reading: 'Suelo: sedimento estable, humedad retenida, minerales aprovechables.'
  },
  {
    id: 'aurora-sample-atmosphere',
    kind: 'atmosphere',
    name: 'Mástil Atmosférico',
    shortName: 'Atmósfera',
    position: [-124, -4092],
    tint: 0x9fd5c8,
    reading: 'Atmósfera: presión estable, radiación baja, vientos regulares.'
  },
  {
    id: 'aurora-sample-biosafety',
    kind: 'biosafety',
    name: 'Banda de Protoflora',
    shortName: 'Protoflora',
    position: [52, -4224],
    tint: 0x7fbf74,
    reading: 'Protoformas: vida simple, sin patógenos detectados. Compatible con precaución.'
  }
] as const;

/** The natural clearing chosen for Aurora-01. Nothing is built until M10. */
export const auroraSettlementSiteDefinition = {
  id: 'aurora-settlement-site',
  name: 'Sitio Aurora-01',
  position: auroraSettlementLayout.habitat
} as const;

export const mission10Tuning = {
  /** Ship-borne survey of the valley from above. */
  surveyRange: 260,
  /** On-foot scan range for every sample point. */
  sampleScanRange: 16,
  /** Radius of the clearing that counts as "at the site". */
  clearingRange: 26,
  /** Seconds of life-support stabilization once the module is deployed. */
  stabilizationSeconds: 7,
  /** Seconds the module takes to unfold after deployment. */
  deploySeconds: 3.4
} as const;

export const mission10Steps: Record<Mission10StepId, Mission10StepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'Misión 10: Primer Módulo Aurora',
    stepTitle: 'En espera',
    objective: 'El Sector Aurora debe estar descubierto antes de evaluar su habitabilidad.',
    nextAction: 'Completa la Misión 09.',
    hint: 'Aurora todavía no fue medida, solo vista.',
    target: 'none'
  },
  initialSurvey: {
    id: 'initialSurvey',
    title: 'Misión 10: Primer Módulo Aurora',
    stepTitle: 'Reconocimiento',
    objective: 'Analiza el Valle Aurora desde la nave.',
    nextAction: 'Sobrevuela el valle y escanea con E.',
    hint: 'Un barrido general antes de pisar el suelo.',
    target: 'ship'
  },
  descendToClearing: {
    id: 'descendToClearing',
    title: 'Misión 10: Primer Módulo Aurora',
    stepTitle: 'Descenso',
    objective: 'Desciende al claro de asentamiento.',
    nextAction: 'Aterriza y baja de la nave con F.',
    hint: 'El claro de sedimento al este del agua es el sitio candidato.',
    target: 'clearing'
  },
  scanWater: {
    id: 'scanWater',
    title: 'Misión 10: Primer Módulo Aurora',
    stepTitle: 'Agua',
    objective: 'Escanea la fuente de agua del Valle Aurora.',
    nextAction: 'Acércate a la orilla y escanea con E.',
    hint: 'Pureza, minerales y posibles trazas biológicas.',
    target: 'sample'
  },
  scanSoil: {
    id: 'scanSoil',
    title: 'Misión 10: Primer Módulo Aurora',
    stepTitle: 'Suelo',
    objective: 'Escanea el suelo del claro.',
    nextAction: 'Colócate en el claro y escanea con E.',
    hint: 'Sedimentos, humedad y estabilidad del terreno.',
    target: 'sample'
  },
  scanAtmosphere: {
    id: 'scanAtmosphere',
    title: 'Misión 10: Primer Módulo Aurora',
    stepTitle: 'Atmósfera',
    objective: 'Analiza la atmósfera y el clima local.',
    nextAction: 'Ve al mástil atmosférico y escanea con E.',
    hint: 'Humedad, presión, radiación y régimen de vientos.',
    target: 'sample'
  },
  scanBiosafety: {
    id: 'scanBiosafety',
    title: 'Misión 10: Primer Módulo Aurora',
    stepTitle: 'Bioseguridad',
    objective: 'Analiza las protoformas biológicas.',
    nextAction: 'Acércate a la protoflora y escanea con E.',
    hint: 'Vida simple no implica vida inofensiva. Medir antes de asumir.',
    target: 'sample'
  },
  returnToClearing: {
    id: 'returnToClearing',
    title: 'Misión 10: Primer Módulo Aurora',
    stepTitle: 'Regreso al claro',
    objective: 'Regresa al claro de asentamiento.',
    nextAction: 'Vuelve al claro marcado en el mapa.',
    hint: 'Las cuatro lecturas están completas: Aurora admite un primer módulo.',
    target: 'clearing'
  },
  markSite: {
    id: 'markSite',
    title: 'Misión 10: Primer Módulo Aurora',
    stepTitle: 'Marcado del sitio',
    objective: 'Marca el sitio para Aurora-01 con E.',
    nextAction: 'Coloca la baliza de asentamiento con E.',
    hint: 'El sitio se elige una vez. Elígelo donde el valle lo permita.',
    target: 'clearing'
  },
  deployModule: {
    id: 'deployModule',
    title: 'Misión 10: Primer Módulo Aurora',
    stepTitle: 'Despliegue',
    objective: 'Despliega el Módulo Aurora-01.',
    nextAction: 'Usa E junto a la baliza para desplegar el módulo.',
    hint: 'Un módulo mínimo, no una colonia.',
    target: 'module'
  },
  stabilizeModule: {
    id: 'stabilizeModule',
    title: 'Misión 10: Primer Módulo Aurora',
    stepTitle: 'Soporte vital',
    objective: 'Estabiliza el soporte vital del módulo.',
    nextAction: 'Mantente junto al módulo mientras estabiliza.',
    hint: 'Energía mínima, filtrado atmosférico, anclajes y sensor de agua.',
    target: 'module'
  },
  completed: {
    id: 'completed',
    title: 'Misión 10: Primer Módulo Aurora',
    stepTitle: 'Aurora-01 operativo',
    objective: 'Módulo Aurora-01 operativo: el primer punto humano fuera de Nereida.',
    nextAction: 'A la espera de nuevos desarrollos.',
    hint: 'Este mundo puede recibirnos, pero no nos pertenece.',
    target: 'none'
  }
};
