import { AURORA_PARASITE_LIFE_SUPPORT, auroraSettlementLayout } from './auroraSettlementLayout';
export type Mission15StepId =
  | 'inactive'
  | 'routineTask'
  | 'habitatEmergency'
  | 'restoreDoorPower'
  | 'detectCoordinatedFailure'
  | 'findEnergyParasite'
  | 'disableEnergyParasite'
  | 'findLifeSupportParasite'
  | 'disableLifeSupportParasite'
  | 'findCommsParasite'
  | 'disableCommsParasite'
  | 'centralOverload'
  | 'analyzeParasite'
  | 'completed';

/** Which piece of hardware the current step is fought at. */
export type Mission15Target =
  | 'supply'
  | 'habitat'
  | 'terminal'
  | 'energyParasite'
  | 'lifeParasite'
  | 'commsParasite'
  | 'core'
  | 'none';

export type Mission15StepDefinition = {
  id: Mission15StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission15Target;
};

/** Which colony system a parasite is strangling. */
export type ParasiteSystem = 'energy' | 'lifeSupport' | 'comms';

export type ParasiteNodeDefinition = {
  id: string;
  system: ParasiteSystem;
  name: string;
  shortName: string;
  /** Where the device is clamped onto existing colony hardware. */
  position: readonly [number, number];
  /** Height above ground: these are bolted onto panels and conduits. */
  height: number;
};

/**
 * Mission 15's parasites are clamped onto infrastructure the colony already
 * built, so none of them needs new ground of its own. Each sits a short walk
 * from the system it is strangling but far enough that it has to be found by
 * signal rather than by standing on the obvious station.
 */
export const parasiteNodeDefinitions: readonly ParasiteNodeDefinition[] = [
  {
    id: 'aurora-parasite-energy',
    system: 'energy',
    name: 'Nodo Parásito // Línea Energética',
    shortName: 'Parásito de energía',
    // Clamped to the conduit run north-east of the energy link, off the path
    // between the generator and Aurora-02.
    position: auroraSettlementLayout.parasiteEnergy,
    height: 1.2
  },
  {
    id: 'aurora-parasite-life',
    system: 'lifeSupport',
    name: 'Nodo Parásito // Soporte Vital',
    shortName: 'Parásito de soporte vital',
    // On the microfilter feed line west of the settlement.
    position: AURORA_PARASITE_LIFE_SUPPORT,
    height: 0.95
  },
  {
    id: 'aurora-parasite-comms',
    system: 'comms',
    name: 'Nodo Parásito // Comunicaciones',
    shortName: 'Parásito de comunicaciones',
    // Under the comms mast's cable anchor, south of the tower.
    position: auroraSettlementLayout.parasiteComms,
    height: 1.4
  }
];

/**
 * The sealed habitation module. This is M11's Aurora-02, not a new building:
 * the door panel is the point the pilot works, a couple of metres off the
 * module's own interaction spot so the two never fight for the same key press.
 */
export const sealedModuleDoorDefinition = {
  id: 'aurora-sealed-door',
  name: 'Módulo Aurora-02 // Puerta',
  shortName: 'Puerta',
  position: auroraSettlementLayout.sealedDoor
} as const;

/** The supply crate the opening routine is run at, beside the habitat. */
export const auroraSupplyCacheDefinition = {
  id: 'aurora-supply-cache',
  name: 'Depósito de Suministros',
  shortName: 'Suministros',
  position: auroraSettlementLayout.supplyCache
} as const;

export const mission15Tuning = {
  /** On-foot interaction range for every M15 station. */
  stationRange: 16,

  /** Seconds of hands-on work for the opening supply check. */
  routineSeconds: 4,
  /** Seconds to bring the door's emergency line back up. */
  doorPowerSeconds: 8,
  /** Seconds at the terminal to prove the failures are coordinated. */
  diagnosticSeconds: 7,

  // --- Sealed module pressure ---------------------------------------------
  /**
   * Percent of breathable pressure lost per second while the module stays
   * sealed. Tuned so the crew has minutes, not seconds: the phase is meant to
   * feel urgent, never to be lost to a slow walk.
   */
  pressureLossPerSecond: 1.6,
  /** Pressure the module never falls below; there is no irreversible failure. */
  pressureFloor: 22,
  /** Pressure recovered per second once the door is open again. */
  pressureRecoveryPerSecond: 14,

  // --- Search --------------------------------------------------------------
  /** Beyond this the parasite readout is dead. */
  searchRange: 140,
  /** The marker only appears this close; further out there is only intensity. */
  revealRange: 38,
  /** Range at which a parasite can actually be worked. */
  lockRange: 13,

  // --- Energy parasite: isolate lines, then hold the surge ------------------
  /** Lines that have to be pulled before the clamp can be cut free. */
  energyLineCount: 3,
  /** Seconds of steady load needed to settle the surge once lines are open. */
  surgeStabilizeSeconds: 6,
  /**
   * The surge drifts; holding the draw inside this band is what counts as
   * stable. Expressed in percent of nominal load.
   */
  surgeTolerance: 12,
  /** Percent the draw moves per interaction press. */
  surgeStep: 9,

  // --- Life-support parasite: close valves in pressure order ----------------
  valveCount: 4,
  /** Seconds before an opened valve drifts back and has to be redone. */
  valveHoldSeconds: 9,

  // --- Comms parasite: block a corrupt burst --------------------------------
  /** Symbols in the corrupt sequence. */
  sequenceLength: 4,
  /** Seconds each symbol stays on screen. */
  sequenceSymbolSeconds: 1.5,
  /** Edge-trigger guard after a sequence response. */
  sequenceInputLockSeconds: 0.28,

  // --- Central overload ----------------------------------------------------
  /** Seconds the core takes to reach critical if nothing is done. */
  overloadSeconds: 45,
  /** Percent of overload bled off per second of work at the core. */
  overloadVentPerSecond: 11,
  /** Overload level above which the HUD screams. */
  overloadWarningLevel: 65,

  /** Seconds at the terminal to trace the parasite back to Nereida. */
  analysisSeconds: 8
} as const;

export const mission15Steps: Record<Mission15StepId, Mission15StepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'Misión 15: Sabotaje en Aurora',
    stepTitle: 'En espera',
    objective: 'La red debe estar limpia antes de que aparezca la siguiente amenaza.',
    nextAction: 'Completa la Misión 14.',
    hint: 'Aurora volvió a la rutina.',
    target: 'none'
  },
  routineTask: {
    id: 'routineTask',
    title: 'Misión 15: Sabotaje en Aurora',
    stepTitle: 'Rutina',
    objective: 'Revisa el depósito de suministros de la colonia.',
    nextAction: 'Ve al depósito y revisa el inventario con E.',
    hint: 'Un día normal. El primero en mucho tiempo.',
    target: 'supply'
  },
  habitatEmergency: {
    id: 'habitatEmergency',
    title: 'Misión 15: Sabotaje en Aurora',
    stepTitle: 'Emergencia',
    objective: 'Aurora-02 se selló con gente adentro.',
    nextAction: 'Corre al módulo. La presión está cayendo.',
    hint: 'Hay tres personas del otro lado de esa puerta.',
    target: 'habitat'
  },
  restoreDoorPower: {
    id: 'restoreDoorPower',
    title: 'Misión 15: Sabotaje en Aurora',
    stepTitle: 'Puerta',
    objective: 'Restablece la energía y libera la puerta.',
    nextAction: 'Mantente en el panel de la puerta hasta liberarla.',
    hint: 'La línea de emergencia está cortada, no agotada.',
    target: 'habitat'
  },
  detectCoordinatedFailure: {
    id: 'detectCoordinatedFailure',
    title: 'Misión 15: Sabotaje en Aurora',
    stepTitle: 'Diagnóstico',
    objective: 'Confirma en la terminal si los fallos son residuales.',
    nextAction: 'Ve a la terminal principal y cruza los registros.',
    hint: 'Cuatro sistemas cayeron en el mismo minuto. Eso no es una tormenta.',
    target: 'terminal'
  },
  findEnergyParasite: {
    id: 'findEnergyParasite',
    title: 'Misión 15: Sabotaje en Aurora',
    stepTitle: 'Búsqueda // Energía',
    objective: 'Localiza el dispositivo adherido a la línea energética.',
    nextAction: 'Sigue la intensidad de señal.',
    hint: 'Algo pequeño, pegado a un cable. No vino solo.',
    target: 'energyParasite'
  },
  disableEnergyParasite: {
    id: 'disableEnergyParasite',
    title: 'Misión 15: Sabotaje en Aurora',
    stepTitle: 'Aislar // Energía',
    objective: 'Aísla las líneas y estabiliza la sobrecarga.',
    nextAction: 'Abre las tres líneas con E y sostén la carga en rango.',
    hint: 'Si cortás de golpe, la sobrecarga se va al módulo.',
    target: 'energyParasite'
  },
  findLifeSupportParasite: {
    id: 'findLifeSupportParasite',
    title: 'Misión 15: Sabotaje en Aurora',
    stepTitle: 'Búsqueda // Soporte Vital',
    objective: 'Localiza el dispositivo en el circuito de soporte vital.',
    nextAction: 'Sigue la intensidad de señal.',
    hint: 'El mismo patrón. Otro sistema.',
    target: 'lifeParasite'
  },
  disableLifeSupportParasite: {
    id: 'disableLifeSupportParasite',
    title: 'Misión 15: Sabotaje en Aurora',
    stepTitle: 'Válvulas',
    objective: 'Redirige la presión cerrando las válvulas correctas.',
    nextAction: 'Cierra las cuatro válvulas antes de que vuelvan a abrirse.',
    hint: 'Una válvula abierta vuelve a soltar presión sola.',
    target: 'lifeParasite'
  },
  findCommsParasite: {
    id: 'findCommsParasite',
    title: 'Misión 15: Sabotaje en Aurora',
    stepTitle: 'Búsqueda // Comunicaciones',
    objective: 'Localiza el dispositivo en el anclaje de la antena.',
    nextAction: 'Sigue la intensidad de señal.',
    hint: 'El tercero. Siempre fueron tres.',
    target: 'commsParasite'
  },
  disableCommsParasite: {
    id: 'disableCommsParasite',
    title: 'Misión 15: Sabotaje en Aurora',
    stepTitle: 'Secuencia',
    objective: 'Bloquea la secuencia corrupta que emite el nodo.',
    nextAction: 'Repite la secuencia con E cuando se repita el símbolo marcado.',
    hint: 'Emite cuatro símbolos. Solo uno hay que responder.',
    target: 'commsParasite'
  },
  centralOverload: {
    id: 'centralOverload',
    title: 'Misión 15: Sabotaje en Aurora',
    stepTitle: 'Sobrecarga',
    objective: 'Evita que el módulo central se sobrecargue.',
    nextAction: 'Ve al núcleo y purga la sobrecarga.',
    hint: 'El último nodo se llevó por delante todo lo que pudo.',
    target: 'core'
  },
  analyzeParasite: {
    id: 'analyzeParasite',
    title: 'Misión 15: Sabotaje en Aurora',
    stepTitle: 'Análisis',
    objective: 'Analiza el nodo recuperado en la terminal.',
    nextAction: 'Ve a la terminal y rastrea el origen del dispositivo.',
    hint: 'Sabemos qué hace. Falta saber cómo llegó.',
    target: 'terminal'
  },
  completed: {
    id: 'completed',
    title: 'Misión 15: Sabotaje en Aurora',
    stepTitle: 'Aurora restaurada',
    objective: 'Aurora resistió la primera agresión física de la Coalición.',
    nextAction: 'A la espera de nuevos desarrollos.',
    hint: 'Dejamos de construir un hogar. Ahora hay que defenderlo.',
    target: 'none'
  }
};
