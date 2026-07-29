import { AURORA_WATER_FILTER, auroraSettlementLayout } from './auroraSettlementLayout';
export type Mission11StepId =
  | 'inactive'
  | 'diagnoseCore'
  | 'markSecondSite'
  | 'deploySecondModule'
  | 'connectEnergyLink'
  | 'installWaterFilter'
  | 'calibrateWaterFlow'
  | 'prepareCultivationBed'
  | 'startBioTrial'
  | 'assessImpact'
  | 'confirmCore'
  | 'completed';

export type Mission11Target = 'module' | 'secondModule' | 'link' | 'water' | 'bed' | 'none';

export type Mission11StepDefinition = {
  id: Mission11StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission11Target;
};

/**
 * Mission 11 lays a second block next to the Aurora-01 module from M10.
 *
 * Every site sits inside the levelled clearing except the microfilter, which
 * belongs on the north shore of the water sheet — deliberately away from the
 * M10 sampling stake so the two readings do not overlap, and shallow enough
 * that nothing is dredged. The cultivation bed goes on soil already analysed
 * in M10, west of the modules, with the protoflora band left untouched to
 * the south.
 */
export const auroraSecondModuleSiteDefinition = {
  id: 'aurora-second-module-site',
  name: 'Sitio Aurora-02',
  position: auroraSettlementLayout.secondModule
} as const;

export const auroraEnergyLinkDefinition = {
  id: 'aurora-energy-link',
  name: 'Enlace Energético Aurora',
  /** Midpoint between the two modules: where the conduit is coupled. */
  position: auroraSettlementLayout.energyLink
} as const;

export const auroraWaterFilterDefinition = {
  id: 'aurora-water-filter',
  name: 'Microfiltro Aurora',
  // On the real lake shore south of the settlement. The old spot (-30, -4163)
  // sat 150 m off to the west on high ground, ~165 m north of where the terrain
  // actually meets the water sheet, so the intake float dangled over dry land.
  // Here the terrain (~57.4) is just above the sheet (~56.4) and the intake,
  // which runs 11.5 m toward -z, reaches the waterline (~z = -4280). The pump
  // body stays dry; only the hose and float touch the water.
  position: AURORA_WATER_FILTER
} as const;

export const auroraCultivationBedDefinition = {
  id: 'aurora-cultivation-bed',
  name: 'Cama de Cultivo Aurora',
  position: auroraSettlementLayout.cultivationBed
} as const;

export const mission11Tuning = {
  /** On-foot interaction range for every Mission 11 station. */
  stationRange: 16,
  /** How far Aurora-02 may sit from Aurora-01. */
  maxSecondModuleDistance: 60,
  /** Seconds for the energy link handshake. */
  energyLinkSeconds: 6,
  /** Seconds for the water flow calibration. */
  waterFlowSeconds: 6,
  /** Seconds for the environmental impact assessment. */
  impactAssessmentSeconds: 5,
  /** Seconds Aurora-02 takes to unfold. */
  deploySeconds: 3.2
} as const;

export const mission11Steps: Record<Mission11StepId, Mission11StepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'Misión 11: Expansión Aurora',
    stepTitle: 'En espera',
    objective: 'Aurora-01 debe estar operativo antes de expandir el asentamiento.',
    nextAction: 'Completa la Misión 10.',
    hint: 'Un módulo aislado no es un asentamiento.',
    target: 'none'
  },
  diagnoseCore: {
    id: 'diagnoseCore',
    title: 'Misión 11: Expansión Aurora',
    stepTitle: 'Diagnóstico',
    objective: 'Ejecuta diagnóstico de Aurora-01.',
    nextAction: 'Acércate a Aurora-01 y ejecuta el diagnóstico con E.',
    hint: 'Energía mínima, soporte vital y sensores antes de sumar carga.',
    target: 'module'
  },
  markSecondSite: {
    id: 'markSecondSite',
    title: 'Misión 11: Expansión Aurora',
    stepTitle: 'Sitio Aurora-02',
    objective: 'Selecciona un punto para el Módulo Aurora-02.',
    nextAction: 'Ve al punto marcado y confirma el sitio con E.',
    hint: 'Fuera de la línea de agua y lejos de la protoflora.',
    target: 'secondModule'
  },
  deploySecondModule: {
    id: 'deploySecondModule',
    title: 'Misión 11: Expansión Aurora',
    stepTitle: 'Despliegue Aurora-02',
    objective: 'Despliega el Módulo Aurora-02.',
    nextAction: 'Usa E en el sitio marcado para desplegar Aurora-02.',
    hint: 'Energía, almacenamiento y control ambiental.',
    target: 'secondModule'
  },
  connectEnergyLink: {
    id: 'connectEnergyLink',
    title: 'Misión 11: Expansión Aurora',
    stepTitle: 'Enlace energético',
    objective: 'Conecta Aurora-01 con Aurora-02.',
    nextAction: 'Acopla el conducto con E y mantente en rango.',
    hint: 'Dos puntos vivos comparten carga mejor que uno solo.',
    target: 'link'
  },
  installWaterFilter: {
    id: 'installWaterFilter',
    title: 'Misión 11: Expansión Aurora',
    stepTitle: 'Microfiltro',
    objective: 'Instala el microfiltro junto al agua.',
    nextAction: 'Ve a la orilla e instala el microfiltro con E.',
    hint: 'Captación mínima: muestreo y filtrado, no explotación.',
    target: 'water'
  },
  calibrateWaterFlow: {
    id: 'calibrateWaterFlow',
    title: 'Misión 11: Expansión Aurora',
    stepTitle: 'Flujo de agua',
    objective: 'Calibra el flujo de agua hacia el núcleo.',
    nextAction: 'Mantente junto al microfiltro mientras calibra.',
    hint: 'Caudal mínimo verificado. Todavía no es agua potable masiva.',
    target: 'water'
  },
  prepareCultivationBed: {
    id: 'prepareCultivationBed',
    title: 'Misión 11: Expansión Aurora',
    stepTitle: 'Cama de cultivo',
    objective: 'Prepara la primera cama de cultivo.',
    nextAction: 'Vuelve al claro y prepara la cama con E.',
    hint: 'Sobre suelo ya analizado, sin tocar la protoflora.',
    target: 'bed'
  },
  startBioTrial: {
    id: 'startBioTrial',
    title: 'Misión 11: Expansión Aurora',
    stepTitle: 'Bioensayo',
    objective: 'Activa el bioensayo de crecimiento.',
    nextAction: 'Activa el bioensayo con E.',
    hint: 'Es una pregunta al suelo, no una cosecha.',
    target: 'bed'
  },
  assessImpact: {
    id: 'assessImpact',
    title: 'Misión 11: Expansión Aurora',
    stepTitle: 'Impacto ambiental',
    objective: 'Evalúa el impacto del núcleo Aurora.',
    nextAction: 'Vuelve a Aurora-01 y ejecuta la evaluación con E.',
    hint: 'Energía, agua, suelo, protoflora y huella. Todo se mide.',
    target: 'module'
  },
  confirmCore: {
    id: 'confirmCore',
    title: 'Misión 11: Expansión Aurora',
    stepTitle: 'Núcleo Aurora',
    objective: 'Confirma Núcleo Aurora.',
    nextAction: 'Confirma el Núcleo Aurora con E.',
    hint: 'No estamos tomando este valle. Estamos aprendiendo a vivir dentro de él.',
    target: 'module'
  },
  completed: {
    id: 'completed',
    title: 'Misión 11: Expansión Aurora',
    stepTitle: 'Núcleo operativo',
    objective: 'Núcleo Aurora operativo: dos módulos enlazados, agua filtrada y el primer bioensayo activo.',
    nextAction: 'A la espera de nuevos desarrollos.',
    hint: 'La especie que aprende a limitarse puede quedarse.',
    target: 'none'
  }
};
