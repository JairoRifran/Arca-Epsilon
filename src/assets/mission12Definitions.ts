import { auroraSettlementLayout } from './auroraSettlementLayout';
export type Mission12StepId =
  | 'inactive'
  | 'requestAuthorization'
  | 'prepareLifeSupport'
  | 'configureHabitation'
  | 'markLandingZone'
  | 'guideCapsuleDescent'
  | 'confirmDisembark'
  | 'startLoadCycle'
  | 'recalibrate'
  | 'verifyStability'
  | 'recordFirstNight'
  | 'completed';

export type Mission12Target = 'core' | 'secondModule' | 'landingZone' | 'capsule' | 'crew' | 'none';

export type Mission12StepDefinition = {
  id: Mission12StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission12Target;
};

export type AuroraCrewRole = 'lifeSupport' | 'biologist' | 'engineer';

export type AuroraCrewMemberDefinition = {
  id: string;
  role: AuroraCrewRole;
  name: string;
  shortName: string;
  /** Where this crew member settles once disembarked, in world X/Z. */
  position: readonly [number, number];
  /** Suit accent, so roles read apart at a glance. */
  accent: number;
};

/**
 * Mission 12 works inside the Aurora core built across M10 and M11. The
 * landing zone is deliberately placed southeast of Aurora-01: clear of the
 * cultivation bed (96, -4178), far from the microfilter on the north shore
 * (-30, -4163), and outside every protoflora colony in the valley — the
 * nearest sits around (150, -4280). Nothing lands on anything living.
 */
export const auroraLandingZoneDefinition = {
  id: 'aurora-landing-zone',
  name: 'Zona de Aterrizaje Aurora',
  position: auroraSettlementLayout.landingZone
} as const;

export const auroraCrewDefinitions: readonly AuroraCrewMemberDefinition[] = [
  {
    id: 'aurora-crew-life-support',
    role: 'lifeSupport',
    name: 'Especialista de Soporte Vital',
    shortName: 'Soporte',
    position: auroraSettlementLayout.crew[0],
    accent: 0x6fc3d8
  },
  {
    id: 'aurora-crew-biologist',
    role: 'biologist',
    name: 'Bióloga de Campo',
    shortName: 'Biología',
    position: auroraSettlementLayout.crew[1],
    accent: 0x86c97a
  },
  {
    id: 'aurora-crew-engineer',
    role: 'engineer',
    name: 'Ingeniero de Sistemas',
    shortName: 'Ingeniería',
    position: auroraSettlementLayout.crew[2],
    accent: 0xe0b070
  }
] as const;

export const mission12Tuning = {
  /** On-foot interaction range for every Mission 12 station. */
  stationRange: 18,
  /** Radius of the cleared landing pad. */
  landingZoneRange: 24,
  /** Seconds to bring life support up to crewed capacity. */
  lifeSupportSeconds: 6,
  /** Seconds the capsule takes to descend and settle. */
  capsuleDescentSeconds: 8,
  /** Seconds of the first crewed life-support cycle. */
  loadCycleSeconds: 8,
  /** Seconds to recalibrate after the consumption alert. */
  recalibrationSeconds: 6,
  /** Seconds of the first-night transition. */
  firstNightSeconds: 7,
  /** Stability floor the alert drops to; never reaches zero, nobody dies. */
  alertStabilityFloor: 62
} as const;

export const mission12Steps: Record<Mission12StepId, Mission12StepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'Misión 12: Primeros Habitantes',
    stepTitle: 'En espera',
    objective: 'El Núcleo Aurora debe estar operativo antes de traer personas.',
    nextAction: 'Completa la Misión 11.',
    hint: 'Aurora funciona vacío. Todavía no sabemos si funciona habitado.',
    target: 'none'
  },
  requestAuthorization: {
    id: 'requestAuthorization',
    title: 'Misión 12: Primeros Habitantes',
    stepTitle: 'Autorización',
    objective: 'Recibe autorización para el primer descenso humano.',
    nextAction: 'Solicita la autorización desde Aurora-01 con E.',
    hint: 'La Arca no manda gente hasta que el núcleo lo justifique.',
    target: 'core'
  },
  prepareLifeSupport: {
    id: 'prepareLifeSupport',
    title: 'Misión 12: Primeros Habitantes',
    stepTitle: 'Soporte vital',
    objective: 'Prepara soporte vital para tripulación.',
    nextAction: 'Mantente junto a Aurora-01 mientras sube la capacidad.',
    hint: 'Oxígeno, energía, agua filtrada y presión interna.',
    target: 'core'
  },
  configureHabitation: {
    id: 'configureHabitation',
    title: 'Misión 12: Primeros Habitantes',
    stepTitle: 'Refugio',
    objective: 'Configura el refugio para los primeros habitantes.',
    nextAction: 'Configura las literas con E.',
    hint: 'Tres literas compactas. Nada más: no vinimos a instalar una ciudad.',
    target: 'core'
  },
  markLandingZone: {
    id: 'markLandingZone',
    title: 'Misión 12: Primeros Habitantes',
    stepTitle: 'Zona de aterrizaje',
    objective: 'Marca la zona de aterrizaje.',
    nextAction: 'Ve a la zona despejada y marca la baliza con E.',
    hint: 'Lejos del filtro, lejos del cultivo y fuera de la protoflora.',
    target: 'landingZone'
  },
  guideCapsuleDescent: {
    id: 'guideCapsuleDescent',
    title: 'Misión 12: Primeros Habitantes',
    stepTitle: 'Descenso',
    objective: 'Guía el descenso de la cápsula.',
    nextAction: 'Mantente en la zona mientras la cápsula desciende.',
    hint: 'Tres personas bajando a un mundo que hace unas semanas no existía para nosotros.',
    target: 'landingZone'
  },
  confirmDisembark: {
    id: 'confirmDisembark',
    title: 'Misión 12: Primeros Habitantes',
    stepTitle: 'Desembarco',
    objective: 'Confirma desembarco de la tripulación.',
    nextAction: 'Confirma el desembarco con E.',
    hint: 'Por primera vez desde la Tierra, hay humanos llegando a un nuevo hogar.',
    target: 'capsule'
  },
  startLoadCycle: {
    id: 'startLoadCycle',
    title: 'Misión 12: Primeros Habitantes',
    stepTitle: 'Primer ciclo',
    objective: 'Inicia el primer ciclo de soporte vital.',
    nextAction: 'Inicia el ciclo desde Aurora-01 con E.',
    hint: 'Consumo real de oxígeno, agua y energía con personas dentro.',
    target: 'core'
  },
  recalibrate: {
    id: 'recalibrate',
    title: 'Misión 12: Primeros Habitantes',
    stepTitle: 'Recalibración',
    objective: 'Recalibra el soporte vital.',
    nextAction: 'Ve a Aurora-02 y mantente en rango mientras recalibra.',
    hint: 'El consumo humano real está por encima de la simulación.',
    target: 'secondModule'
  },
  verifyStability: {
    id: 'verifyStability',
    title: 'Misión 12: Primeros Habitantes',
    stepTitle: 'Estabilidad',
    objective: 'Verifica estabilidad del núcleo habitado.',
    nextAction: 'Ejecuta el escaneo final desde Aurora-01 con E.',
    hint: 'Oxígeno, agua, energía, cultivo y protoflora. Todo se mide.',
    target: 'core'
  },
  recordFirstNight: {
    id: 'recordFirstNight',
    title: 'Misión 12: Primeros Habitantes',
    stepTitle: 'Primera noche',
    objective: 'Registra la primera noche humana en Aurora.',
    nextAction: 'Registra la primera noche con E.',
    hint: 'Por primera vez desde la Tierra, seres humanos van a dormir bajo otro cielo.',
    target: 'core'
  },
  completed: {
    id: 'completed',
    title: 'Misión 12: Primeros Habitantes',
    stepTitle: 'Núcleo habitado',
    objective: 'Núcleo Aurora habitado: tres personas viviendo bajo otro cielo.',
    nextAction: 'A la espera de nuevos desarrollos.',
    hint: 'Habitar no es poseer.',
    target: 'none'
  }
};
