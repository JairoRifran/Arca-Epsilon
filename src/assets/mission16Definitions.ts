import { auroraSettlementLayout } from './auroraSettlementLayout';

/**
 * Mission 16 "Protocolo Pleyadiano".
 *
 * M15 proved the Coalition can reach into Aurora physically. The Pleyadians
 * break their silence to reveal that E-01 is a "mundo semilla" — part of an
 * old network that preserves life and routes between civilisations — and hand
 * humanity an INCOMPLETE defensive protocol that Aurora must build and hold.
 *
 * There is still no armed combat and no enemy troops: every station is a hold-
 * to-work interaction reusing hardware the colony already owns (the analysis
 * terminal, the Atlas resonator by remote link, the comms antenna) plus three
 * new Pleyadian nodes ringed around the settlement. Nothing here can be lost
 * irreversibly — drifting off a station costs the banked seconds of that step,
 * never the mission.
 */
export type Mission16StepId =
  | 'inactive'
  | 'receiveAlert'
  | 'accessTerminal'
  | 'establishTripleLink'
  | 'recoverAtlasKey'
  | 'revealSeedWorld'
  | 'unlockDetection'
  | 'unlockShield'
  | 'unlockAlertNetwork'
  | 'synchronizeNodes'
  | 'runSimulation'
  | 'confirmEnergyDeficit'
  | 'completed';

/** Which piece of hardware the current step is worked at. */
export type Mission16Target = 'terminal' | 'antenna' | 'node' | 'core' | 'none';

export type Mission16StepDefinition = {
  id: Mission16StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission16Target;
};

/** The three defensive protocol prototypes, unlocked strictly in order. */
export type ProtocolId = 'detection' | 'shield' | 'alertNetwork';
export const PROTOCOL_ORDER: readonly ProtocolId[] = ['detection', 'shield', 'alertNetwork'];

export type PleyadianNodeDefinition = {
  id: string;
  name: string;
  shortName: string;
  /** Derived from the shared settlement layout — never an absolute coordinate. */
  position: readonly [number, number];
  /** The harmonic frequency band this node aligns to, for HUD copy. */
  band: string;
  /** Height of the emitter head above the seated base. */
  height: number;
};

const [nodeNorth, nodeSouthEast, nodeWest] = auroraSettlementLayout.pleyadianNodes;

export const pleyadianNodeDefinitions: readonly PleyadianNodeDefinition[] = [
  {
    id: 'pleyadian-node-aurora',
    name: 'Nodo Pleyadiano // Aurora',
    shortName: 'Nodo Aurora',
    position: nodeNorth,
    band: 'ARMÓNICA I',
    height: 2.1
  },
  {
    id: 'pleyadian-node-nereida',
    name: 'Nodo Pleyadiano // Nereida',
    shortName: 'Nodo Nereida',
    position: nodeSouthEast,
    band: 'ARMÓNICA II',
    height: 2.1
  },
  {
    id: 'pleyadian-node-arca',
    name: 'Nodo Pleyadiano // Arca',
    shortName: 'Nodo Arca',
    position: nodeWest,
    band: 'ARMÓNICA III',
    height: 2.1
  }
];

export const NODE_COUNT = pleyadianNodeDefinitions.length;

/** The triple link binds these three anchors of the human network. */
export const TRIPLE_LINK_ANCHORS = ['Aurora', 'Base Nereida', 'el Arca'] as const;

export const mission16Tuning = {
  /** On-foot interaction range for every M16 terminal/antenna station. */
  stationRange: 16,
  /** Range at which a Pleyadian node can be phase-aligned. */
  nodeRange: 13,
  /** Beyond this a node's alignment readout is dead. */
  nodeSearchRange: 90,

  /** Seconds at the terminal to confirm the sabotage was a vulnerability probe. */
  accessSeconds: 5,
  /** Seconds to calibrate ONE of the three link frequencies. */
  linkFrequencySeconds: 3,
  /** Seconds of remote link to pull the pattern from the Atlas resonator. */
  atlasKeySeconds: 6,
  /** Seconds the seed-world revelation holds before the mission moves on. */
  revelationSeconds: 3.5,
  /** Seconds to compile each protocol prototype (detection/shield/network). */
  protocolSeconds: 4,
  /** Seconds of stable phase-hold to synchronise one node. */
  nodeSyncSeconds: 3,
  /**
   * The harmonic phase a node drifts through; holding the emitter inside the
   * band is what counts as aligned. Deterministic so a test can reproduce it.
   */
  phaseTolerance: 20,
  /**
   * Legacy blind-nudge step. A press now captures the node's current phase
   * outright, so this is only the fallback spread if that capture is refused.
   */
  phaseStep: 9,
  /** Seconds running the defensive echo simulation to map approach routes. */
  simulationSeconds: 7,
  /** Seconds at the terminal to confirm the energy/sensor/shield/evac deficit. */
  deficitSeconds: 5
} as const;

export const mission16Steps: Record<Mission16StepId, Mission16StepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'Misión 16: Protocolo Pleyadiano',
    stepTitle: 'En espera',
    objective: 'Aurora resistió, pero la Coalición ya sabe que estamos aquí.',
    nextAction: 'Completa la Misión 15.',
    hint: 'El silencio después de la tormenta nunca dura.',
    target: 'none'
  },
  receiveAlert: {
    id: 'receiveAlert',
    title: 'Misión 16: Protocolo Pleyadiano',
    stepTitle: 'Alerta Pleyadiana',
    objective: 'Una transmisión Pleyadiana fragmentada exige respuesta inmediata.',
    nextAction: 'Ve a la terminal principal.',
    hint: 'No es una advertencia. Es una urgencia.',
    target: 'terminal'
  },
  accessTerminal: {
    id: 'accessTerminal',
    title: 'Misión 16: Protocolo Pleyadiano',
    stepTitle: 'Terminal',
    objective: 'Confirma en la terminal que el sabotaje fue una prueba de vulnerabilidades.',
    nextAction: 'Mantente en la terminal y cruza los registros con E.',
    hint: 'No querían destruir Aurora. Querían medirla.',
    target: 'terminal'
  },
  establishTripleLink: {
    id: 'establishTripleLink',
    title: 'Misión 16: Protocolo Pleyadiano',
    stepTitle: 'Enlace triple',
    objective: 'Enlaza Aurora, Base Nereida y el Arca en una sola red.',
    nextAction: 'Calibra las tres frecuencias con E.',
    hint: 'Tres anclas humanas. Una sola señal que la Coalición no pueda cortar.',
    target: 'terminal'
  },
  recoverAtlasKey: {
    id: 'recoverAtlasKey',
    title: 'Misión 16: Protocolo Pleyadiano',
    stepTitle: 'Clave Atlas',
    objective: 'Recupera el patrón de defensa del Resonador Atlas por enlace remoto.',
    nextAction: 'Sostén el enlace remoto con E hasta extraer la clave.',
    hint: 'El Atlas ya reconoce nuestra firma Pleyadiana. No hace falta viajar.',
    target: 'terminal'
  },
  revealSeedWorld: {
    id: 'revealSeedWorld',
    title: 'Misión 16: Protocolo Pleyadiano',
    stepTitle: 'Revelación',
    objective: 'E-01 es un mundo semilla de una red antigua que preserva la vida.',
    nextAction: 'Escucha la transmisión Pleyadiana.',
    hint: 'La Coalición ya considera activa la presencia humana.',
    target: 'terminal'
  },
  unlockDetection: {
    id: 'unlockDetection',
    title: 'Misión 16: Protocolo Pleyadiano',
    stepTitle: 'Protocolo // Detección',
    objective: 'Compila el prototipo de detección de firmas hostiles.',
    nextAction: 'Mantente en la terminal y compila el plano con E.',
    hint: 'Primero hay que ver la amenaza antes de detenerla.',
    target: 'terminal'
  },
  unlockShield: {
    id: 'unlockShield',
    title: 'Misión 16: Protocolo Pleyadiano',
    stepTitle: 'Protocolo // Escudo',
    objective: 'Compila el prototipo de refuerzo de escudo.',
    nextAction: 'Mantente en la terminal y compila el plano con E.',
    hint: 'El escudo de tormentas de M13 no basta contra lo que viene.',
    target: 'terminal'
  },
  unlockAlertNetwork: {
    id: 'unlockAlertNetwork',
    title: 'Misión 16: Protocolo Pleyadiano',
    stepTitle: 'Protocolo // Red de alerta',
    objective: 'Compila la red de alerta Aurora–Nereida–Arca.',
    nextAction: 'Mantente en la terminal y compila el plano con E.',
    hint: 'Que las tres anclas se avisen antes de caer.',
    target: 'terminal'
  },
  synchronizeNodes: {
    id: 'synchronizeNodes',
    title: 'Misión 16: Protocolo Pleyadiano',
    stepTitle: 'Sincronización',
    objective: 'Activa y sincroniza los tres nodos Pleyadianos alrededor de Aurora.',
    nextAction: 'Alinea la fase de cada nodo con E y sostén la estabilidad.',
    hint: 'La fase deriva sola. Mantenla en la banda hasta que se fije.',
    target: 'node'
  },
  runSimulation: {
    id: 'runSimulation',
    title: 'Misión 16: Protocolo Pleyadiano',
    stepTitle: 'Simulación',
    objective: 'Corre la simulación defensiva: identifica rutas de aproximación.',
    nextAction: 'Mantente en la terminal y proyecta los ecos con E.',
    hint: 'Son hologramas de señales, no enemigos. Todavía.',
    target: 'terminal'
  },
  confirmEnergyDeficit: {
    id: 'confirmEnergyDeficit',
    title: 'Misión 16: Protocolo Pleyadiano',
    stepTitle: 'Déficit energético',
    objective: 'Confirma que el protocolo no se sostiene con la infraestructura actual.',
    nextAction: 'Mantente en la terminal y cierra el informe con E.',
    hint: 'Ampliar energía, sensores, escudos y preparar evacuación.',
    target: 'terminal'
  },
  completed: {
    id: 'completed',
    title: 'Misión 16: Protocolo Pleyadiano',
    stepTitle: 'Protocolo asegurado',
    objective: 'Los planos defensivos Pleyadianos están guardados. Aurora aprenderá a sobrevivir.',
    nextAction: 'Prepara las defensas de Aurora.',
    hint: 'No podemos detener la guerra por ustedes. Solo enseñarles a sobrevivir a su llegada.',
    target: 'none'
  }
};
