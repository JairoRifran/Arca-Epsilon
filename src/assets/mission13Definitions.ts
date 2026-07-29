import { auroraSettlementLayout } from './auroraSettlementLayout';
export type Mission13StepId =
  | 'inactive'
  | 'stormAlert'
  | 'secureGenerator'
  | 'anchorAntennaFirst'
  | 'anchorAntennaSecond'
  | 'activateAntenna'
  | 'returnToHabitat'
  | 'chargeShield'
  | 'stormSubsiding'
  | 'completed';

export type Mission13Target = 'habitat' | 'generator' | 'antenna' | 'none';

export type Mission13StepDefinition = {
  id: Mission13StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission13Target;
};

/**
 * Mission 13 stations, placed inside the Aurora clearing built across M10–M12
 * and deliberately clear of everything already standing there: the habitat
 * (120, -4160), Aurora-02 (146, -4142), the conduit (133, -4151), the
 * cultivation bed (96, -4178), the microfilter (-30, -4163) and the landing
 * pad (188, -4198). Nothing new lands on anything that already exists.
 */
export const auroraStormGeneratorDefinition = {
  id: 'aurora-storm-generator',
  name: 'Nodo Energético',
  shortName: 'Generador',
  /** Northeast of Aurora-02, on the power side of the settlement. */
  position: auroraSettlementLayout.stormGenerator
} as const;

export const auroraStormAntennaDefinition = {
  id: 'aurora-storm-antenna',
  name: 'Torre de Comunicaciones',
  shortName: 'Antena',
  /** Northwest of the habitat, upslope and clear of the cultivation bed. */
  position: auroraSettlementLayout.stormAntenna,
  /** The two guy-anchors the pilot has to secure before the mast will hold. */
  anchors: auroraSettlementLayout.stormAnchors
} as const;

/** The emergency shield panel lives on the habitat itself. */
export const auroraStormShieldDefinition = {
  id: 'aurora-storm-shield',
  name: 'Emisor de Protección',
  shortName: 'Escudo',
  position: auroraSettlementLayout.stormShield
} as const;

export const mission13Tuning = {
  /** On-foot interaction range for every M13 station. */
  stationRange: 16,
  /** Distance the pilot may stray from the shield panel before it stalls. */
  shieldHoldRange: 22,
  /** Seconds of hands-on work to stabilise the generator. */
  generatorSeconds: 7,
  /** Seconds per antenna guy-anchor. */
  anchorSeconds: 4.5,
  /** Seconds to bring the emergency shield to full charge. */
  shieldChargeSeconds: 12,
  /** Seconds the storm takes to blow itself out once the shield holds. */
  subsideSeconds: 9,
  /**
   * Seconds for the storm to build from first alert to full intensity. The
   * front keeps rising through the whole mission, so the later phases are
   * fought in worse weather than the earlier ones.
   */
  stormBuildSeconds: 95,
  /** Charge lost per second while the pilot is out of range of the panel. */
  shieldDecayPerSecond: 9
} as const;

export const mission13Steps: Record<Mission13StepId, Mission13StepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'Misión 13: La Primera Tormenta',
    stepTitle: 'En espera',
    objective: 'La colonia debe estar habitada antes de enfrentar su primera noche hostil.',
    nextAction: 'Completa la Misión 12.',
    hint: 'Aurora todavía no ha sido puesta a prueba.',
    target: 'none'
  },
  stormAlert: {
    id: 'stormAlert',
    title: 'Misión 13: La Primera Tormenta',
    stepTitle: 'Alerta',
    objective: 'Inspecciona la red exterior de la colonia.',
    nextAction: 'Sal del hábitat y confirma la alerta con E.',
    hint: 'Caída de presión y fluctuaciones eléctricas sobre el valle.',
    target: 'habitat'
  },
  secureGenerator: {
    id: 'secureGenerator',
    title: 'Misión 13: La Primera Tormenta',
    stepTitle: 'Generador',
    objective: 'Asegura el nodo energético.',
    nextAction: 'Mantente en el nodo mientras estabilizas la energía.',
    hint: 'Sin energía estable, el soporte vital no aguanta la noche.',
    target: 'generator'
  },
  anchorAntennaFirst: {
    id: 'anchorAntennaFirst',
    title: 'Misión 13: La Primera Tormenta',
    stepTitle: 'Anclaje 1',
    objective: 'Asegura el primer anclaje de la antena.',
    nextAction: 'Ve al primer anclaje y sujétalo con E.',
    hint: 'El mástil no aguanta las ráfagas sin sus dos tensores.',
    target: 'antenna'
  },
  anchorAntennaSecond: {
    id: 'anchorAntennaSecond',
    title: 'Misión 13: La Primera Tormenta',
    stepTitle: 'Anclaje 2',
    objective: 'Asegura el segundo anclaje de la antena.',
    nextAction: 'Ve al segundo anclaje y sujétalo con E.',
    hint: 'Dos tensores opuestos reparten la carga del viento.',
    target: 'antenna'
  },
  activateAntenna: {
    id: 'activateAntenna',
    title: 'Misión 13: La Primera Tormenta',
    stepTitle: 'Antena',
    objective: 'Reactiva la torre de comunicaciones.',
    nextAction: 'Activa la antena con E.',
    hint: 'Sin enlace, la tripulación queda a ciegas dentro del módulo.',
    target: 'antenna'
  },
  returnToHabitat: {
    id: 'returnToHabitat',
    title: 'Misión 13: La Primera Tormenta',
    stepTitle: 'Regreso',
    objective: 'Regresa al módulo principal.',
    nextAction: 'Vuelve al hábitat antes del pico de la tormenta.',
    hint: 'La gente está adentro. El escudo se activa desde el panel del hábitat.',
    target: 'habitat'
  },
  chargeShield: {
    id: 'chargeShield',
    title: 'Misión 13: La Primera Tormenta',
    stepTitle: 'Escudo',
    objective: 'Activa el campo protector del hábitat.',
    nextAction: 'Mantente junto al panel mientras carga el escudo.',
    hint: 'Si te alejas del panel, la carga se pierde.',
    target: 'habitat'
  },
  stormSubsiding: {
    id: 'stormSubsiding',
    title: 'Misión 13: La Primera Tormenta',
    stepTitle: 'Disipación',
    objective: 'Resiste hasta que la tormenta amaine.',
    nextAction: 'El campo aguanta. Espera a que pase el frente.',
    hint: 'El escudo sostiene. Ahora solo queda esperar.',
    target: 'habitat'
  },
  completed: {
    id: 'completed',
    title: 'Misión 13: La Primera Tormenta',
    stepTitle: 'Colonia intacta',
    objective: 'La colonia sobrevivió a su primera noche hostil.',
    nextAction: 'A la espera de nuevos desarrollos.',
    hint: 'Aurora aguantó. Con gente adentro.',
    target: 'none'
  }
};
