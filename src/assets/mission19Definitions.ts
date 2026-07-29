import { resonadorAtlasDefinition } from './mission03Definitions';

/**
 * Mission 19 "Nereida bajo Ataque".
 *
 * The drone that escaped Aurora in M18 sent Base Nereida's coordinates. The
 * Coalition is not here to level the base: it wants a path to the Atlas
 * resonator and the Pleyadian records inside it. Nereida survives, but the
 * Coalition leaves with a fraction of the orbital map — and turns toward the
 * Ark.
 *
 * Everything is built on hardware Nereida already has (the resonator, the
 * defensive beacons, the colony module, its terminals and energy stations).
 * Nothing about Nereida's layout is moved or rebuilt: the M19 stations are
 * expressed as offsets from the Atlas resonator, so they follow it.
 *
 * The pilot still has no hand weapon. Ground fighting is resolved through
 * remote turrets, barriers and Atlas pulses; air fighting reuses the ship's
 * existing WeaponSystem. Nothing is irreversible: waves restart from stable
 * checkpoints and the Atlas core can always be re-stabilised.
 */
export type Mission19StepId =
  | 'inactive'
  | 'emergencyTransmission'
  | 'travelToNereida'
  | 'clearAirspace'
  | 'landAtNereida'
  | 'restoreDefenses'
  | 'repelGroundIncursion'
  | 'protectAtlas'
  | 'chooseOperationalPriority'
  | 'activateCounterattack'
  | 'detectDataLeak'
  | 'recoverEnemyWreckage'
  | 'confirmArkTarget'
  | 'completed';

/** Which piece of hardware or activity the current step is fought at. */
export type Mission19Target = 'ship' | 'sky' | 'landing' | 'defense' | 'atlas' | 'battery' | 'wreckage' | 'terminal' | 'none';

export type Mission19StepDefinition = {
  id: Mission19StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission19Target;
};

/** The three systems that have to come back up before the ground push. */
export type NereidaDefenseId = 'beacon' | 'emergencyPower' | 'atlasBarrier';
export const NEREIDA_DEFENSE_ORDER: readonly NereidaDefenseId[] = ['beacon', 'emergencyPower', 'atlasBarrier'];

export const NEREIDA_DEFENSE_LABELS: Record<NereidaDefenseId, string> = {
  beacon: 'BALIZA DEFENSIVA',
  emergencyPower: 'ENERGIA DE EMERGENCIA',
  atlasBarrier: 'BARRERA ATLAS'
};

/**
 * The temporary operational priority. It changes dialogue and which system
 * takes visible damage, but never forks the story: the mission continues the
 * same way whichever is chosen.
 */
export type OperationalPriority = 'none' | 'atlasCore' | 'pleyadianRecords' | 'defensePower';
export const OPERATIONAL_PRIORITIES: readonly Exclude<OperationalPriority, 'none'>[] = [
  'atlasCore',
  'pleyadianRecords',
  'defensePower'
];
export const PRIORITY_LABELS: Record<Exclude<OperationalPriority, 'none'>, string> = {
  atlasCore: 'NUCLEO ATLAS',
  pleyadianRecords: 'REGISTROS PLEYADIANOS',
  defensePower: 'ENERGIA DEFENSIVA'
};

const [atlasX, atlasZ] = resonadorAtlasDefinition.position;
/** Offset from the Atlas resonator, so M19 hardware follows it. */
function nearAtlas(dx: number, dz: number): readonly [number, number] {
  return [atlasX + dx, atlasZ + dz] as const;
}

export type NereidaStationDefinition = {
  id: string;
  name: string;
  shortName: string;
  position: readonly [number, number];
  height: number;
};

/** Where the ship sets down: a clear apron short of the resonator. */
export const nereidaLandingZone: NereidaStationDefinition = {
  id: 'nereida-landing-apron',
  name: 'Zona de Aterrizaje // Nereida',
  shortName: 'Apron',
  position: nearAtlas(-58, 44),
  height: 0
};

/** The emergency power station and the Atlas access gate. */
export const nereidaEmergencyPower: NereidaStationDefinition = {
  id: 'nereida-emergency-power',
  name: 'Estación de Energía de Emergencia',
  shortName: 'Energía',
  position: nearAtlas(-34, 20),
  height: 1.2
};
export const nereidaAtlasGate: NereidaStationDefinition = {
  id: 'nereida-atlas-gate',
  name: 'Compuerta de Acceso Atlas',
  shortName: 'Compuerta',
  position: nearAtlas(-18, -6),
  height: 1.4
};
/** The heavy battery rehabilitated for the counterattack. */
export const nereidaHeavyBattery: NereidaStationDefinition = {
  id: 'nereida-heavy-battery',
  name: 'Batería Pesada de Nereida',
  shortName: 'Batería pesada',
  position: nearAtlas(24, 30),
  height: 1.8
};
/** Where the extraction unit's wreckage is scanned. */
export const nereidaWreckage: NereidaStationDefinition = {
  id: 'nereida-enemy-wreckage',
  name: 'Restos de Unidad de Extracción',
  shortName: 'Restos',
  position: nearAtlas(10, 46),
  height: 0.6
};

/**
 * Deterministic ground-incursion lanes. Each breach drone walks one lane from
 * its entry point toward the Atlas gate, so there is no pathfinding.
 */
export const INCURSION_LANES: readonly (readonly [number, number])[] = [
  nearAtlas(-150, -110),
  nearAtlas(-170, 40),
  nearAtlas(-120, 150),
  nearAtlas(30, -160)
];

export const mission19Tuning = {
  stationRange: 18,
  fieldRange: 15,
  /** How close the ship must be to Nereida for the arrival to register. */
  arrivalRange: 220,

  transmissionSeconds: 4,
  /** Seconds of flight before the airspace contacts appear. */
  travelSeconds: 6,
  landingSeconds: 3,
  /** Seconds to bring back ONE of the three defence systems. */
  defenseSeconds: 3.6,
  /** Seconds at the gate to seal it and isolate the Atlas data. */
  gateSealSeconds: 6,
  /** Seconds to rehabilitate the heavy battery. */
  batterySeconds: 6,
  wreckageScanSeconds: 6,
  linkRepairSeconds: 5,
  confirmSeconds: 4,

  // --- Enemies -------------------------------------------------------------
  /** Air wave met on the way in, and the ground incursion size. */
  airWaveCount: 4,
  groundWaveCount: 4,
  /** The single extraction unit that reaches the gate. */
  extractionUnitHealth: 150,
  breachDroneHealth: 70,
  breachDroneRadius: 6,
  /** Metres per second a breach drone advances along its lane. */
  breachSpeed: 7.5,
  /** Seconds between AI re-evaluations (frequency-limited). */
  aiIntervalSeconds: 0.25,
  /** Max simultaneous ground enemies. */
  maxGroundEnemies: 6,

  // --- Meters --------------------------------------------------------------
  /** Nereida structural integrity, 0..100. Never reaches zero irreversibly. */
  nereidaIntegrityFloor: 18,
  integrityLossPerBreach: 6,
  /** Atlas core stability, 0..100. */
  atlasStabilityFloor: 15,
  atlasDrainPerSecond: 4.5,
  atlasRecoveryPerSecond: 7,
  /** Below this the HUD screams; still recoverable. */
  atlasWarningLevel: 40,

  /** Seconds the enemy needs to siphon its fraction of the orbital map. */
  dataLeakSeconds: 8
} as const;

export const mission19Steps: Record<Mission19StepId, Mission19StepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'Misión 19: Nereida bajo Ataque',
    stepTitle: 'En espera',
    objective: 'Aurora resistió. Nereida todavía no sabe lo que viene.',
    nextAction: 'Completa la Misión 18.',
    hint: 'El paquete ya salió. Solo falta que lleguen.',
    target: 'none'
  },
  emergencyTransmission: {
    id: 'emergencyTransmission',
    title: 'Misión 19: Nereida bajo Ataque',
    stepTitle: 'Transmisión de emergencia',
    objective: 'Nereida pide ayuda: sin comunicaciones y sin defensas exteriores.',
    nextAction: 'Confirma la llamada en la terminal y embarca.',
    hint: 'La señal llega cortada. Eso ya dice bastante.',
    target: 'terminal'
  },
  travelToNereida: {
    id: 'travelToNereida',
    title: 'Misión 19: Nereida bajo Ataque',
    stepTitle: 'Vuelo a Nereida',
    objective: 'Vuela a Base Nereida bajo interferencia.',
    nextAction: 'Sube a la nave con F y pon rumbo a Nereida.',
    hint: 'La interferencia sube cuanto más te acercas.',
    target: 'ship'
  },
  clearAirspace: {
    id: 'clearAirspace',
    title: 'Misión 19: Nereida bajo Ataque',
    stepTitle: 'Espacio aéreo',
    objective: 'Drones en ruta. Despeja el corredor de aproximación.',
    nextAction: 'Fija blanco y dispara con Espacio / clic.',
    hint: 'Pasadas cortas. Nereida no puede esperar.',
    target: 'sky'
  },
  landAtNereida: {
    id: 'landAtNereida',
    title: 'Misión 19: Nereida bajo Ataque',
    stepTitle: 'Perímetro comprometido',
    objective: 'Aterriza en la zona segura del perímetro.',
    nextAction: 'Aterriza cerca del apron y baja de la nave.',
    hint: 'Humo, alarmas y defensas caídas. Llegamos tarde por poco.',
    target: 'landing'
  },
  restoreDefenses: {
    id: 'restoreDefenses',
    title: 'Misión 19: Nereida bajo Ataque',
    stepTitle: 'Restaurar defensa',
    objective: 'Reactiva baliza defensiva, energía de emergencia y barrera Atlas.',
    nextAction: 'Reactiva los tres sistemas con E.',
    hint: 'Sin barrera, el resonador queda a la intemperie.',
    target: 'defense'
  },
  repelGroundIncursion: {
    id: 'repelGroundIncursion',
    title: 'Misión 19: Nereida bajo Ataque',
    stepTitle: 'Incursión',
    objective: 'Unidades terrestres avanzan hacia Atlas. Deténlas con las defensas.',
    nextAction: 'Las torretas y la baliza disparan solas. Mantén la energía.',
    hint: 'No bajes a pelear: no tenés con qué. Usá las defensas.',
    target: 'defense'
  },
  protectAtlas: {
    id: 'protectAtlas',
    title: 'Misión 19: Nereida bajo Ataque',
    stepTitle: 'Brecha Atlas',
    objective: 'Una unidad alcanzó el acceso. Cierra compuertas y aísla los datos.',
    nextAction: 'Ve a la compuerta y séllala con E.',
    hint: 'Si entran al resonador, se llevan todo.',
    target: 'atlas'
  },
  chooseOperationalPriority: {
    id: 'chooseOperationalPriority',
    title: 'Misión 19: Nereida bajo Ataque',
    stepTitle: 'Prioridad operativa',
    objective: 'No alcanza para todo. Elige qué sostener primero.',
    nextAction: 'Confirma la prioridad en la compuerta con E.',
    hint: 'Núcleo, registros o energía. Lo demás aguanta como pueda.',
    target: 'atlas'
  },
  activateCounterattack: {
    id: 'activateCounterattack',
    title: 'Misión 19: Nereida bajo Ataque',
    stepTitle: 'Contraataque',
    objective: 'Rehabilita la batería pesada y expulsa a la unidad de extracción.',
    nextAction: 'Ve a la batería pesada y actívala con E.',
    hint: 'Lleva años apagada. Va a alcanzar para un disparo bueno.',
    target: 'battery'
  },
  detectDataLeak: {
    id: 'detectDataLeak',
    title: 'Misión 19: Nereida bajo Ataque',
    stepTitle: 'Fuga de datos',
    objective: 'Se retiran, pero alcanzaron a transmitir una fracción del mapa.',
    nextAction: 'Confirma qué se llevaron.',
    hint: 'No era todo. Fue suficiente.',
    target: 'atlas'
  },
  recoverEnemyWreckage: {
    id: 'recoverEnemyWreckage',
    title: 'Misión 19: Nereida bajo Ataque',
    stepTitle: 'Recuperación',
    objective: 'Escanea los restos y repara el enlace Nereida–Aurora.',
    nextAction: 'Ve a los restos y escanéalos con E.',
    hint: 'Queremos saber qué se llevaron y hacia dónde.',
    target: 'wreckage'
  },
  confirmArkTarget: {
    id: 'confirmArkTarget',
    title: 'Misión 19: Nereida bajo Ataque',
    stepTitle: 'Destino: el Arca',
    objective: 'Nuevas firmas ascienden hacia la órbita. Confirma su rumbo.',
    nextAction: 'Confirma el estado de Atlas y el rumbo enemigo con E.',
    hint: 'Nereida era el camino. El Arca siempre fue el objetivo.',
    target: 'terminal'
  },
  completed: {
    id: 'completed',
    title: 'Misión 19: Nereida bajo Ataque',
    stepTitle: 'Nereida resistió',
    objective: 'Nereida aguantó, pero la Coalición ya sabe hacia dónde ir.',
    nextAction: 'Prepara la batalla por el Arca.',
    hint: 'Nereida era el camino. El Arca siempre fue el objetivo.',
    target: 'none'
  }
};
