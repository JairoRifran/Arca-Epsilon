/** Mission 22 "Frentes rotos". */
export type Mission22StepId =
  | 'inactive'
  | 'simultaneousAlarm'
  | 'accessCommandTerminal'
  | 'assignInitialResources'
  | 'defendAuroraFront'
  | 'defendNereidaFront'
  | 'defendOrbitalFront'
  | 'manageCrossFrontCrisis'
  | 'chooseSupportPriority'
  | 'restoreJointNetwork'
  | 'detectCoordinationNodes'
  | 'surviveFinalPressure'
  | 'completed';

export type Mission22FrontId = 'aurora' | 'nereida' | 'orbital';
export type Mission22FrontChoice = 'none' | Mission22FrontId;
export type Mission22ResourceId = 'energy' | 'defense' | 'communications';
export type Mission22CoordinationNodeId = 'jammer' | 'logistics' | 'jumpBeacon';
export type Mission22Target = 'ark' | 'terminal' | 'choice' | Mission22FrontId | 'network' | 'nodes' | 'none';

export type Mission22StepDefinition = {
  id: Mission22StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission22Target;
};

export const MISSION22_FRONT_ORDER: readonly Mission22FrontId[] = ['aurora', 'nereida', 'orbital'];
export const MISSION22_FRONT_LABELS: Record<Mission22FrontId, string> = {
  aurora: 'FRENTE AURORA',
  nereida: 'FRENTE NEREIDA',
  orbital: 'FRENTE ORBITAL'
};

export const MISSION22_RESOURCE_ORDER: readonly Mission22ResourceId[] = ['energy', 'defense', 'communications'];
export const MISSION22_RESOURCE_LABELS: Record<Mission22ResourceId, string> = {
  energy: 'ENERGÍA PLEYADIANA',
  defense: 'SOPORTE DEFENSIVO',
  communications: 'PRIORIDAD DE COMUNICACIONES'
};

export const MISSION22_NODE_ORDER: readonly Mission22CoordinationNodeId[] = ['jammer', 'logistics', 'jumpBeacon'];
export const MISSION22_NODE_LABELS: Record<Mission22CoordinationNodeId, string> = {
  jammer: 'INTERFERIDOR ORBITAL',
  logistics: 'PLATAFORMA LOGÍSTICA',
  jumpBeacon: 'BALIZA DE SALTO'
};

export const mission22Tuning = {
  terminalRange: 120,
  commandRange: 360,
  alarmSeconds: 3.2,
  crisisSeconds: 6,
  networkRestoreSeconds: 5,
  nodeDetectionSeconds: 2.4,
  finalPressureSeconds: 7,
  pressureTickSeconds: 0.25,
  integrityFloor: 18,
  auroraWaveCount: 3,
  nereidaWaveCount: 4,
  orbitalWaveCount: 4,
  finalWaveCount: 5,
  visualUpdateInterval: 0.1,
  orbitalRelayOffsets: [
    [-240, 72, 210],
    [40, 116, 330],
    [280, 54, 180]
  ] as const,
  coordinationNodeOffsets: [
    [-1180, 260, -900],
    [1060, -140, -1160],
    [240, 520, -1780]
  ] as const
} as const;

const title = 'Misión 22: Frentes rotos';

export const mission22Steps: Record<Mission22StepId, Mission22StepDefinition> = {
  inactive: {
    id: 'inactive', title, stepTitle: 'En espera',
    objective: 'La red humana permanece bajo ataques simultáneos.',
    nextAction: 'Completa la Misión 21.',
    hint: 'Tres frentes. Una sola nave.', target: 'none'
  },
  simultaneousAlarm: {
    id: 'simultaneousAlarm', title, stepTitle: 'Alarma simultánea',
    objective: 'Recibe la telemetría de Aurora, Nereida y el frente orbital.',
    nextAction: 'Revisa la integridad de los tres frentes.',
    hint: 'La red Pleyadiana parcial mantiene los canales abiertos.', target: 'ark'
  },
  accessCommandTerminal: {
    id: 'accessCommandTerminal', title, stepTitle: 'Centro de mando',
    objective: 'Accede a la terminal estratégica del Arca.',
    nextAction: 'Acércate a la terminal y pulsa E.',
    hint: 'No puedes estar físicamente en los tres frentes.', target: 'terminal'
  },
  assignInitialResources: {
    id: 'assignInitialResources', title, stepTitle: 'Asignación inicial',
    objective: 'Asigna energía, soporte defensivo y comunicaciones.',
    nextAction: 'Distribuye los tres recursos desde el panel estratégico.',
    hint: 'La asignación cambia la presión temporal, no el desenlace.', target: 'choice'
  },
  defendAuroraFront: {
    id: 'defendAuroraFront', title, stepTitle: 'Frente Aurora',
    objective: 'Sostén sensores, escudo y reserva energética de Aurora.',
    nextAction: 'Coordina las defensas M17–M18 y despeja el ataque.',
    hint: 'Los habitantes y módulos deben permanecer protegidos.', target: 'aurora'
  },
  defendNereidaFront: {
    id: 'defendNereidaFront', title, stepTitle: 'Frente Nereida',
    objective: 'Impide que las unidades de brecha extraigan datos de Atlas.',
    nextAction: 'Sostén compuertas y elimina la unidad extractora.',
    hint: 'Nereida ya conoce al enemigo; esta vez defiende el acceso.', target: 'nereida'
  },
  defendOrbitalFront: {
    id: 'defendOrbitalFront', title, stepTitle: 'Frente orbital',
    objective: 'Protege los tres relés entre el Arca y E-01.',
    nextAction: 'Pilota la nave, intercepta hostiles y asegura cada relé.',
    hint: 'Si caen los relés, los otros frentes combaten a ciegas.', target: 'orbital'
  },
  manageCrossFrontCrisis: {
    id: 'manageCrossFrontCrisis', title, stepTitle: 'Crisis cruzada',
    objective: 'Recupera el frente más dañado sin abandonar los otros dos.',
    nextAction: 'Regresa al mando del Arca y estabiliza la telemetría.',
    hint: 'Los sistemas dañados pueden recuperarse; ningún frente está perdido.', target: 'terminal'
  },
  chooseSupportPriority: {
    id: 'chooseSupportPriority', title, stepTitle: 'Transferencia de recursos',
    objective: 'Elige qué frente recibe el refuerzo Pleyadiano temporal.',
    nextAction: 'Selecciona Aurora, Nereida u órbita.',
    hint: 'La prioridad se registra, pero los tres enclaves deben sobrevivir.', target: 'choice'
  },
  restoreJointNetwork: {
    id: 'restoreJointNetwork', title, stepTitle: 'Defensa coordinada',
    objective: 'Restaura la sincronización Aurora–Nereida–Arca.',
    nextAction: 'Mantente junto al Arca y sincroniza la red conjunta.',
    hint: 'La respuesta común distribuye defensa donde la presión aumenta.', target: 'network'
  },
  detectCoordinationNodes: {
    id: 'detectCoordinationNodes', title, stepTitle: 'Nodos de coordinación',
    objective: 'Clasifica el interferidor, la plataforma logística y la baliza de salto.',
    nextAction: 'Analiza los tres patrones de ataque desde el Arca.',
    hint: 'Localízalos. La contraofensiva vendrá después.', target: 'nodes'
  },
  surviveFinalPressure: {
    id: 'surviveFinalPressure', title, stepTitle: 'Última presión',
    objective: 'Fija prioridades y supera la oleada orbital final.',
    nextAction: 'Defiende el Arca mientras Aurora y Nereida sostienen sus posiciones.',
    hint: 'Los tres frentes deben permanecer operativos.', target: 'orbital'
  },
  completed: {
    id: 'completed', title, stepTitle: 'Red humana operativa',
    objective: 'Aurora, Nereida y el Arca sobreviven con daños controlados.',
    nextAction: 'Mantén localizados los tres nodos de coordinación.',
    hint: 'Misión 23 desbloqueada. La contraofensiva todavía no comienza.', target: 'none'
  }
};
