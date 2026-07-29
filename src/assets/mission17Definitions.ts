import { auroraSettlementLayout } from './auroraSettlementLayout';

/**
 * Mission 17 "Preparativos de Defensa".
 *
 * M16 handed Aurora incomplete Pleyadian protocols; M17 builds them. The colony
 * turns from civil settlement into a place that can take a hit: a defensive
 * energy reserve, a perimeter sensor net, a reinforced shield, the tri-anchor
 * alert network, evacuation routes and an integrated drill — ending on real
 * signatures dropping out of the high atmosphere.
 *
 * Still no usable weapons and no armed combat (M18 is "Primer fuego"). Every
 * station is a hold-to-work interaction reusing colony hardware plus three
 * sensors and three shield emitters ringed around Aurora. Nothing is lost
 * irreversibly — the overload drill has a floor and can always be vented.
 */
export type Mission17StepId =
  | 'inactive'
  | 'emergencyCouncil'
  | 'installEnergyReserve'
  | 'deploySensors'
  | 'calibrateDetection'
  | 'installShieldEmitters'
  | 'establishAlertNetwork'
  | 'markEvacuationRoutes'
  | 'runDefenseDrill'
  | 'stabilizeOverload'
  | 'detectIncomingSignatures'
  | 'completed';

/** Which piece of hardware the current step is worked at. */
export type Mission17Target = 'terminal' | 'reserve' | 'sensor' | 'emitter' | 'core' | 'none';

export type Mission17StepDefinition = {
  id: Mission17StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission17Target;
};

export type DefenseSensorDefinition = {
  id: string;
  name: string;
  shortName: string;
  /** Derived from the shared settlement layout — never an absolute coordinate. */
  position: readonly [number, number];
  /** Which approach corridor this sensor watches, for HUD copy. */
  route: string;
  height: number;
};

export type ShieldEmitterDefinition = {
  id: string;
  name: string;
  shortName: string;
  position: readonly [number, number];
  height: number;
};

const [sensorNorth, sensorEast, sensorSouthWest] = auroraSettlementLayout.defenseSensors;
const [emitterA, emitterB, emitterC] = auroraSettlementLayout.shieldEmitters;

export const defenseSensorDefinitions: readonly DefenseSensorDefinition[] = [
  { id: 'aurora-sensor-north', name: 'Sensor Hostil // Norte', shortName: 'Sensor Norte', position: sensorNorth, route: 'CORREDOR NORTE', height: 2.4 },
  { id: 'aurora-sensor-east', name: 'Sensor Hostil // Este', shortName: 'Sensor Este', position: sensorEast, route: 'CORREDOR ESTE', height: 2.4 },
  { id: 'aurora-sensor-sw', name: 'Sensor Hostil // Suroeste', shortName: 'Sensor Suroeste', position: sensorSouthWest, route: 'CORREDOR SUROESTE', height: 2.4 }
];

export const shieldEmitterDefinitions: readonly ShieldEmitterDefinition[] = [
  { id: 'aurora-emitter-a', name: 'Emisor de Escudo // A', shortName: 'Emisor A', position: emitterA, height: 1.9 },
  { id: 'aurora-emitter-b', name: 'Emisor de Escudo // B', shortName: 'Emisor B', position: emitterB, height: 1.9 },
  { id: 'aurora-emitter-c', name: 'Emisor de Escudo // C', shortName: 'Emisor C', position: emitterC, height: 1.9 }
];

/** The defensive energy accumulator, beside the M13 storm generator. */
export const energyReserveDefinition = {
  id: 'aurora-energy-reserve',
  name: 'Reserva Energética Defensiva',
  shortName: 'Reserva energética',
  position: auroraSettlementLayout.energyReserve,
  height: 1.1
} as const;

export const SENSOR_COUNT = defenseSensorDefinitions.length;
export const EMITTER_COUNT = shieldEmitterDefinitions.length;

/** The three power circuits the reserve balances without dropping life support. */
export const ENERGY_CIRCUITS = ['SOPORTE VITAL', 'ESCUDO', 'SENSORES'] as const;
/** The three anchors of the alert network. */
export const ALERT_ENCLAVES = ['Aurora', 'Base Nereida', 'el Arca'] as const;
/** The three evacuation markers. */
export const EVAC_MARKERS = ['REFUGIO', 'PUNTO MÉDICO', 'ZONA DE EXTRACCIÓN'] as const;

export const mission17Tuning = {
  stationRange: 16,
  /** Range at which a sensor or emitter can be worked on foot. */
  deployRange: 13,
  /** Beyond this a deploy-target's readout is dead. */
  deploySearchRange: 110,

  councilSeconds: 5,
  /** Seconds to balance ONE of the three power circuits. */
  circuitSeconds: 2.6,
  /** Seconds to deploy ONE perimeter sensor. */
  sensorSeconds: 3.5,
  calibrationSeconds: 6,
  /** Seconds to install and load-test ONE shield emitter. */
  emitterSeconds: 3.5,
  /** Seconds to verify ONE alert channel. */
  alertChannelSeconds: 2.6,
  /** Seconds to mark ONE evacuation point. */
  evacMarkerSeconds: 2.2,
  drillSeconds: 7,
  /** Overload the drill leaves the network at, and how it is vented. */
  overloadStart: 60,
  overloadVentPerSecond: 16,
  overloadClimbPerSecond: 9,
  overloadFloor: 12,
  overloadWarningLevel: 78,
  /** Seconds the incoming-signatures beat holds before the mission closes. */
  detectionSeconds: 4
} as const;

export const mission17Steps: Record<Mission17StepId, Mission17StepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'Misión 17: Preparativos de Defensa',
    stepTitle: 'En espera',
    objective: 'Los planos Pleyadianos están, pero Aurora sigue siendo una colonia civil.',
    nextAction: 'Completa la Misión 16.',
    hint: 'Tenemos los planos. Falta construirlos.',
    target: 'none'
  },
  emergencyCouncil: {
    id: 'emergencyCouncil',
    title: 'Misión 17: Preparativos de Defensa',
    stepTitle: 'Consejo de emergencia',
    objective: 'Revisa los planos de M16 y confirma el déficit y los puntos vulnerables.',
    nextAction: 'Mantente en la terminal y abre el consejo con E.',
    hint: 'Sabemos qué construir. Hay que decidir en qué orden.',
    target: 'terminal'
  },
  installEnergyReserve: {
    id: 'installEnergyReserve',
    title: 'Misión 17: Preparativos de Defensa',
    stepTitle: 'Reserva energética',
    objective: 'Activa el acumulador y reparte energía sin apagar soporte vital.',
    nextAction: 'Equilibra los tres circuitos con E.',
    hint: 'Soporte vital primero. Siempre.',
    target: 'reserve'
  },
  deploySensors: {
    id: 'deploySensors',
    title: 'Misión 17: Preparativos de Defensa',
    stepTitle: 'Sensores perimetrales',
    objective: 'Despliega los tres sensores; cada uno cubre una ruta de aproximación.',
    nextAction: 'Ve a cada sensor y despliégalo con E.',
    hint: 'Norte, este y suroeste. Tres puertas por vigilar.',
    target: 'sensor'
  },
  calibrateDetection: {
    id: 'calibrateDetection',
    title: 'Misión 17: Preparativos de Defensa',
    stepTitle: 'Calibración',
    objective: 'Sincroniza los sensores con el protocolo Pleyadiano e identifica firmas simuladas.',
    nextAction: 'Mantente en la terminal y calibra la detección con E.',
    hint: 'La red Pleyadiana enseña a los sensores qué buscar.',
    target: 'terminal'
  },
  installShieldEmitters: {
    id: 'installShieldEmitters',
    title: 'Misión 17: Preparativos de Defensa',
    stepTitle: 'Refuerzo de escudo',
    objective: 'Instala los tres emisores y conéctalos al sistema de escudo.',
    nextAction: 'Ve a cada emisor, instálalo y prueba su carga con E.',
    hint: 'El escudo de M13 no basta. Hay que reforzarlo en anillo.',
    target: 'emitter'
  },
  establishAlertNetwork: {
    id: 'establishAlertNetwork',
    title: 'Misión 17: Preparativos de Defensa',
    stepTitle: 'Red de alerta',
    objective: 'Enlaza Aurora, Nereida y el Arca y verifica los tres canales.',
    nextAction: 'Mantente en la terminal y verifica los canales con E.',
    hint: 'Que las tres se enteren en el mismo segundo.',
    target: 'terminal'
  },
  markEvacuationRoutes: {
    id: 'markEvacuationRoutes',
    title: 'Misión 17: Preparativos de Defensa',
    stepTitle: 'Evacuación',
    objective: 'Marca refugio, punto médico y zona de extracción, y corre un simulacro.',
    nextAction: 'Mantente en la terminal y marca las rutas con E.',
    hint: 'Si algo falla, la gente tiene que saber a dónde correr.',
    target: 'terminal'
  },
  runDefenseDrill: {
    id: 'runDefenseDrill',
    title: 'Misión 17: Preparativos de Defensa',
    stepTitle: 'Prueba integral',
    objective: 'Simula una intrusión atmosférica: sensores, alerta y escudo responden.',
    nextAction: 'Mantente en la terminal y lanza el simulacro con E.',
    hint: 'Ecos, no enemigos. Todavía.',
    target: 'terminal'
  },
  stabilizeOverload: {
    id: 'stabilizeOverload',
    title: 'Misión 17: Preparativos de Defensa',
    stepTitle: 'Sobrecarga',
    objective: 'La red no aguanta un ataque prolongado. Estabilízala antes del apagón.',
    nextAction: 'Ve al núcleo y purga la sobrecarga con E.',
    hint: 'Aguanta la carga hasta que la red se asiente. No hay apagón total.',
    target: 'core'
  },
  detectIncomingSignatures: {
    id: 'detectIncomingSignatures',
    title: 'Misión 17: Preparativos de Defensa',
    stepTitle: 'Firmas entrantes',
    objective: 'La red detecta múltiples firmas descendiendo de la alta atmósfera.',
    nextAction: 'Observa la lectura de la red.',
    hint: 'Esto ya no es una simulación.',
    target: 'terminal'
  },
  completed: {
    id: 'completed',
    title: 'Misión 17: Preparativos de Defensa',
    stepTitle: 'Defensas en espera',
    objective: 'Aurora está preparada para resistir. Las firmas ya están aquí.',
    nextAction: 'Prepárate para el primer fuego.',
    hint: 'Esto ya no es una simulación.',
    target: 'none'
  }
};
