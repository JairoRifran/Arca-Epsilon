import { auroraSettlementLayout } from './auroraSettlementLayout';
export type Mission14StepId =
  | 'inactive'
  | 'inspectPower'
  | 'inspectComms'
  | 'inspectHabitat'
  | 'analyzeSignature'
  | 'purgePowerNode'
  | 'purgeCommsNode'
  | 'locateHiddenNode'
  | 'extractSample'
  | 'reverseTriangulate'
  | 'traceClosure'
  | 'completed';

/** Which piece of hardware the current step is fought at. */
export type Mission14Target = 'power' | 'comms' | 'habitat' | 'terminal' | 'hidden' | 'none';

export type Mission14StepDefinition = {
  id: Mission14StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission14Target;
};

/**
 * Mission 14 reuses the colony hardware that is already standing rather than
 * dropping new installations into the clearing. The contaminated power node is
 * M13's generator, the contaminated relay is M13's comms mast, and the third
 * node is a human perimeter sensor that has been sitting out in the valley
 * since the first survey — the Coalition never had to send anything new.
 *
 * Only two objects are genuinely new: the analysis terminal beside Aurora-02,
 * and the perimeter sensor itself.
 */
export const coalitionTerminalDefinition = {
  id: 'aurora-trace-terminal',
  name: 'Terminal Principal',
  shortName: 'Terminal',
  /** East of Aurora-02, clear of the conduit, the crew and the landing pad. */
  position: auroraSettlementLayout.traceTerminal
} as const;

/**
 * The contaminated device the mission has to find. Deliberately far from the
 * settlement and off every path the player has been walked down before, so the
 * search is a real search: roughly 115 m south-west of the habitat, out past
 * the protoflora band.
 */
export const coalitionHiddenNodeDefinition = {
  id: 'aurora-perimeter-sensor',
  name: 'Sensor Perimetral 04',
  shortName: 'Sensor',
  position: [30, -4232] as const
} as const;

export const mission14Tuning = {
  /** On-foot interaction range for every M14 station. */
  stationRange: 16,

  /** Seconds of hands-on work to read a post-storm inspection point. */
  inspectionSeconds: 3.2,
  /** Seconds at the terminal to confirm the signature match. */
  analysisSeconds: 7,

  // --- Phase 3: power node calibration -------------------------------------
  /**
   * The contaminated carrier drifts continuously, so the purge is a tuning
   * problem rather than a hold. Two offset sine terms keep it deterministic
   * and unpredictable-feeling without ever calling Math.random.
   */
  carrierCenter: 118,
  carrierAmplitudeSlow: 5,
  // The carrier drifts slowly enough that a good tune survives a few seconds.
  // At the old rates it walked out of tolerance almost immediately, so the
  // pilot spent the whole step chasing it and never banked any progress.
  carrierRateSlow: 0.13,
  carrierAmplitudeFast: 1.2,
  carrierRateFast: 0.3,
  /** Tuner travel. E steps the dial up and it wraps at the top of the band. */
  tunerMin: 110,
  tunerMax: 126,
  tunerStep: 1.6,
  /**
   * Deviation the purge tolerates before it stalls and starts bleeding back.
   *
   * Was 2.2, narrower than a single 1.6 step: the dial could jump straight over
   * the carrier, so landing a tune was closer to luck than aim.
   */
  tunerTolerance: 4.5,
  /** Seconds of in-tolerance work needed to purge the power node. */
  powerPurgeSeconds: 3,
  /**
   * Purge lost per second while the dial is off the carrier.
   *
   * Was 5, which erased a full second of work for every second off-tune and
   * made the progress bar run backwards faster than it could be filled.
   */
  powerPurgeDecayPerSecond: 1.2,

  // --- Phase 4: comms node pulse blocking ----------------------------------
  /** Seconds between corrupt pulses leaving the relay. */
  pulsePeriodSeconds: 3.2,
  /** Seconds of each cycle during which a pulse can be blocked. */
  pulseWindowSeconds: 0.6,
  /** Corrupt packets that have to be caught before the relay is clean. */
  pulseCount: 3,

  // --- Phase 5: signal search ----------------------------------------------
  /** Beyond this the readout is dead; inside it, intensity is meaningful. */
  searchRange: 150,
  /**
   * The map marker only appears this close. Further out the pilot has nothing
   * but intensity and a coarse bearing, which is the point of the phase.
   */
  revealRange: 42,
  /** Range at which the sensor can actually be worked. */
  lockRange: 14,

  // --- Phase 6: sample extraction ------------------------------------------
  /** Seconds of contact needed to pull the Coalition pattern out. */
  extractionSeconds: 9,
  /**
   * Seconds the device needs to finish its transmission. It creeps forward
   * even while the pilot is working, and runs at full speed the moment they
   * step away — if it completes, the attempt resets rather than dead-ends.
   */
  transmissionSeconds: 14,
  /** Fraction of transmission speed that still leaks while working. */
  transmissionWorkingFactor: 0.35,

  // --- Phases 7 and 8 ------------------------------------------------------
  /** Seconds at the relay to reconstruct where the packets were going. */
  triangulationSeconds: 8,
  /** Seconds for the residual interference to fade out of the valley. */
  closureSeconds: 10
} as const;

export const mission14Steps: Record<Mission14StepId, Mission14StepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'Misión 14: La Marca que Quedó',
    stepTitle: 'En espera',
    objective: 'La colonia debe superar su primera tormenta antes de revisar la red.',
    nextAction: 'Completa la Misión 13.',
    hint: 'Todavía no hay nada que analizar.',
    target: 'none'
  },
  inspectPower: {
    id: 'inspectPower',
    title: 'Misión 14: La Marca que Quedó',
    stepTitle: 'Inspección // Energía',
    objective: 'Inspecciona el nodo energético tras la tormenta.',
    nextAction: 'Ve al nodo energético y revísalo con E.',
    hint: 'La tormenta pasó. Toca revisar qué quedó en pie.',
    target: 'power'
  },
  inspectComms: {
    id: 'inspectComms',
    title: 'Misión 14: La Marca que Quedó',
    stepTitle: 'Inspección // Comunicaciones',
    objective: 'Inspecciona la torre de comunicaciones.',
    nextAction: 'Ve a la antena y revísala con E.',
    hint: 'La energía tiene un consumo que no corresponde a nada encendido.',
    target: 'comms'
  },
  inspectHabitat: {
    id: 'inspectHabitat',
    title: 'Misión 14: La Marca que Quedó',
    stepTitle: 'Inspección // Hábitat',
    objective: 'Inspecciona el módulo principal.',
    nextAction: 'Vuelve al hábitat y revisa sus sistemas con E.',
    hint: 'La antena sigue emitiendo pulsos con la tormenta ya disipada.',
    target: 'habitat'
  },
  analyzeSignature: {
    id: 'analyzeSignature',
    title: 'Misión 14: La Marca que Quedó',
    stepTitle: 'Análisis',
    objective: 'Analiza la firma residual en la terminal principal.',
    nextAction: 'Ve a la terminal y mantente en ella durante el análisis.',
    hint: 'Los pulsos son periódicos. Nada natural es tan puntual.',
    target: 'terminal'
  },
  purgePowerNode: {
    id: 'purgePowerNode',
    title: 'Misión 14: La Marca que Quedó',
    stepTitle: 'Purga // Energía',
    objective: 'Purga el nodo energético contaminado.',
    nextAction: 'Sintoniza la portadora con E y mantenla en rango.',
    hint: 'La portadora se desplaza sola: hay que perseguirla.',
    target: 'power'
  },
  purgeCommsNode: {
    id: 'purgeCommsNode',
    title: 'Misión 14: La Marca que Quedó',
    stepTitle: 'Purga // Comunicaciones',
    objective: 'Bloquea los tres pulsos corruptos del repetidor.',
    nextAction: 'Pulsa E dentro de la ventana de cada pulso.',
    hint: 'Fallar un pulso cuesta el siguiente ciclo, no la fase entera.',
    target: 'comms'
  },
  locateHiddenNode: {
    id: 'locateHiddenNode',
    title: 'Misión 14: La Marca que Quedó',
    stepTitle: 'Búsqueda',
    objective: 'Localiza el tercer nodo contaminado.',
    nextAction: 'Sigue la intensidad de señal por el valle.',
    hint: 'No es una sonda nueva. Es algo nuestro, contaminado.',
    target: 'hidden'
  },
  extractSample: {
    id: 'extractSample',
    title: 'Misión 14: La Marca que Quedó',
    stepTitle: 'Extracción',
    objective: 'Aísla el dispositivo y recupera el patrón de la Coalición.',
    nextAction: 'Mantente junto al sensor: si te alejas, termina de transmitir.',
    hint: 'Está transmitiendo ahora mismo. Hay que ganarle de mano.',
    target: 'hidden'
  },
  reverseTriangulate: {
    id: 'reverseTriangulate',
    title: 'Misión 14: La Marca que Quedó',
    stepTitle: 'Triangulación inversa',
    objective: 'Reconstruye el destino de los paquetes desde comunicaciones.',
    nextAction: 'Vuelve a la antena y mantente durante la reconstrucción.',
    hint: 'Con la muestra en mano se puede leer hacia dónde iban.',
    target: 'comms'
  },
  traceClosure: {
    id: 'traceClosure',
    title: 'Misión 14: La Marca que Quedó',
    stepTitle: 'Cierre',
    objective: 'Espera a que la interferencia residual se disipe.',
    nextAction: 'La purga terminó. La red se está limpiando sola.',
    hint: 'Casi toda la marca cayó. Casi.',
    target: 'none'
  },
  completed: {
    id: 'completed',
    title: 'Misión 14: La Marca que Quedó',
    stepTitle: 'Red limpia',
    objective: 'La red quedó limpia, pero un paquete escapó.',
    nextAction: 'A la espera de nuevos desarrollos.',
    hint: 'La Coalición del Silencio ya sabe que seguimos vivos.',
    target: 'none'
  }
};
