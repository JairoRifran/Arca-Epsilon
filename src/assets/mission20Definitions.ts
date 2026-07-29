/**
 * Mission 20 "Batalla por el Arca".
 *
 * The Coalition took the Ark's signature and orbital route from Nereida in M19
 * and is now in orbit. It is not trying to destroy the Ark: it wants to blind
 * its comms, break its orbital engines, siphon the colony data core and strand
 * it — so it can neither evacuate nor support E-01.
 *
 * Everything is fought from the ship, with the existing WeaponSystem. The Ark's
 * own turrets help automatically. No capital ship and no formal ultimatum
 * appear here: the mission ends on a far larger signature entering the system
 * and an encrypted transmission that stays unresolved (that is M21).
 *
 * All station positions are offsets from the Ark's own hull, resolved at
 * runtime from `mothership.group.position`, so nothing here hardcodes the Ark's
 * location, scale or layout.
 */
export type Mission20StepId =
  | 'inactive'
  | 'emergencyAscent'
  | 'rendezvousWithArk'
  | 'restoreArkLink'
  | 'firstOrbitalWave'
  | 'locateJammer'
  | 'disableJammer'
  | 'defendEngines'
  | 'protectCivilianModules'
  | 'stopDataBreach'
  | 'activateArkCounterattack'
  | 'finalOrbitalWave'
  | 'stabilizeArk'
  | 'detectCapitalSignature'
  | 'completed';

/** What the current step is fought at. */
export type Mission20Target = 'ship' | 'sky' | 'link' | 'engine' | 'module' | 'core' | 'battery' | 'none';

export type Mission20StepDefinition = {
  id: Mission20StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission20Target;
};

/** The three critical Ark systems M20 is fought over. */
export type ArkSystemId = 'comms' | 'propulsion' | 'dataCore';
export const ARK_SYSTEM_ORDER: readonly ArkSystemId[] = ['comms', 'propulsion', 'dataCore'];
export const ARK_SYSTEM_LABELS: Record<ArkSystemId, string> = {
  comms: 'COMUNICACIONES',
  propulsion: 'PROPULSION ORBITAL',
  dataCore: 'NUCLEO DE DATOS'
};

export type ArkStationDefinition = {
  id: string;
  name: string;
  shortName: string;
  /** Offset from the Ark hull origin, in world units. Never absolute. */
  offset: readonly [number, number, number];
};

/** Three external link points, spread along the hull. */
export const arkLinkPoints: readonly ArkStationDefinition[] = [
  { id: 'ark-link-fore', name: 'Enlace Externo // Proa', shortName: 'Proa', offset: [0, 26, -120] },
  { id: 'ark-link-mid', name: 'Enlace Externo // Central', shortName: 'Central', offset: [96, 12, 10] },
  { id: 'ark-link-aft', name: 'Enlace Externo // Popa', shortName: 'Popa', offset: [-88, -6, 118] }
];

/** The orbital engines the Coalition tries to break. */
export const arkEngines: readonly ArkStationDefinition[] = [
  { id: 'ark-engine-port', name: 'Motor Orbital // Babor', shortName: 'Motor babor', offset: [-64, -18, 150] },
  { id: 'ark-engine-starboard', name: 'Motor Orbital // Estribor', shortName: 'Motor estribor', offset: [64, -18, 150] }
];

/** Civilian capsules hanging off the hull, exposed during the fight. */
export const arkCivilianModules: readonly ArkStationDefinition[] = [
  { id: 'ark-civil-a', name: 'Módulo Civil A', shortName: 'Módulo A', offset: [118, -10, -46] },
  { id: 'ark-civil-b', name: 'Módulo Civil B', shortName: 'Módulo B', offset: [-118, -10, -30] }
];

/** The data core access the enemy couples onto, and the main battery. */
export const arkDataCore: ArkStationDefinition = {
  id: 'ark-data-core',
  name: 'Núcleo de Datos Coloniales',
  shortName: 'Núcleo',
  offset: [0, -30, 34]
};
export const arkMainBattery: ArkStationDefinition = {
  id: 'ark-main-battery',
  name: 'Batería Principal del Arca',
  shortName: 'Batería principal',
  offset: [0, 40, 62]
};

export const LINK_POINT_COUNT = arkLinkPoints.length;
export const ENGINE_COUNT = arkEngines.length;
export const CIVILIAN_MODULE_COUNT = arkCivilianModules.length;

export const mission20Tuning = {
  /** Working range at an external Ark station, flown to in the ship. */
  stationRange: 60,
  /** Altitude above Nereida that counts as "left the atmosphere". */
  ascentAltitude: 900,
  /** How close to the Ark counts as rendezvous. */
  rendezvousRange: 300,

  ascentSeconds: 6,
  rendezvousSeconds: 4,
  /** Seconds to sync ONE external link point. */
  linkSeconds: 3.4,
  /** Seconds to cut the enemy coupling off the data core. */
  breachCutSeconds: 6,
  /** Seconds to bring the main battery online. */
  batterySeconds: 6,
  stabilizeSeconds: 5,
  /** Seconds the far signature holds before the mission closes. */
  capitalSignatureSeconds: 5,
  /** Seconds of work to repair one damaged engine. */
  engineRepairSeconds: 4,

  // --- Enemies -------------------------------------------------------------
  /** Wave sizes. Never more than 8 alive at once. */
  firstWaveCount: 5,
  jammerEscortCount: 4,
  engineWaveCount: 4,
  moduleWaveCount: 4,
  breachWaveCount: 3,
  finalWaveCount: 6,
  maxSimultaneous: 8,

  jammerHealth: 220,
  jammerRadius: 14,
  /** Beyond this the jammer's signal readout is dead. */
  jammerSearchRange: 1400,
  /** Range at which the jammer can be engaged. */
  jammerLockRange: 320,
  /** Seconds between AI re-evaluations. */
  aiIntervalSeconds: 0.25,

  // --- Meters --------------------------------------------------------------
  /** Ark hull integrity, 0..100, with a floor: the Ark is never destroyed. */
  arkIntegrityFloor: 22,
  integrityLossPerHit: 3.5,
  /** Per-engine integrity, 0..100. Repairable, never lost for good. */
  engineIntegrityFloor: 10,
  engineLossPerHit: 9,
  /** Comms quality while the jammer is up, 0..100. */
  jammedCommsLevel: 18,
  /** Data siphoned by the coupled unit, 0..100. Capped: only partial data. */
  breachSiphonPerSecond: 3.2,
  maxSiphon: 46,
  /** Civilian module integrity, 0..100. */
  moduleLossPerHit: 12,
  moduleFloor: 20
} as const;

export const mission20Steps: Record<Mission20StepId, Mission20StepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'Misión 20: Batalla por el Arca',
    stepTitle: 'En espera',
    objective: 'Nereida resistió. El Arca todavía no sabe que la encontraron.',
    nextAction: 'Completa la Misión 19.',
    hint: 'Las firmas ya subieron a órbita.',
    target: 'none'
  },
  emergencyAscent: {
    id: 'emergencyAscent',
    title: 'Misión 20: Batalla por el Arca',
    stepTitle: 'Ascenso de emergencia',
    objective: 'Despega de Nereida y atraviesa la interferencia hacia la órbita.',
    nextAction: 'Sube a la nave con F y asciende.',
    hint: 'Restos atmosféricos y ruido. Subí igual.',
    target: 'ship'
  },
  rendezvousWithArk: {
    id: 'rendezvousWithArk',
    title: 'Misión 20: Batalla por el Arca',
    stepTitle: 'Encuentro',
    objective: 'Alcanza el Arca y evalúa comunicaciones, propulsión y núcleo de datos.',
    nextAction: 'Acércate al Arca.',
    hint: 'Sin comunicaciones y con defensas parciales.',
    target: 'ship'
  },
  restoreArkLink: {
    id: 'restoreArkLink',
    title: 'Misión 20: Batalla por el Arca',
    stepTitle: 'Restablecer enlace',
    objective: 'Sincroniza los tres puntos de enlace externos del casco.',
    nextAction: 'Vuela a cada punto de enlace y sincroniza.',
    hint: 'Sin enlace no hay fijación de blancos ni apoyo de las torretas.',
    target: 'link'
  },
  firstOrbitalWave: {
    id: 'firstOrbitalWave',
    title: 'Misión 20: Batalla por el Arca',
    stepTitle: 'Primera oleada',
    objective: 'Defiende el Arca de la primera oleada orbital.',
    nextAction: 'Fija blanco y dispara. Las torretas del Arca ayudan.',
    hint: 'Cazas ligeros por rutas fijas. No te alejes del casco.',
    target: 'sky'
  },
  locateJammer: {
    id: 'locateJammer',
    title: 'Misión 20: Batalla por el Arca',
    stepTitle: 'Interferidor',
    objective: 'Una unidad de guerra electrónica bloquea fijación y comunicaciones.',
    nextAction: 'Sigue la intensidad de señal hasta el interferidor.',
    hint: 'Sin lock-on tenés que ir a ojo. Seguí la señal.',
    target: 'sky'
  },
  disableJammer: {
    id: 'disableJammer',
    title: 'Misión 20: Batalla por el Arca',
    stepTitle: 'Desactivar interferidor',
    objective: 'Destruye sus escoltas y desactiva el interferidor.',
    nextAction: 'Elimina las escoltas y luego el interferidor.',
    hint: 'Está blindado y va lento. Primero saca lo que lo protege.',
    target: 'sky'
  },
  defendEngines: {
    id: 'defendEngines',
    title: 'Misión 20: Batalla por el Arca',
    stepTitle: 'Propulsores',
    objective: 'Van por los motores orbitales. Defiéndelos y repáralos si caen.',
    nextAction: 'Intercepta a los atacantes; estabiliza el motor dañado.',
    hint: 'Sin motores el Arca no puede evacuar ni apoyar E-01.',
    target: 'engine'
  },
  protectCivilianModules: {
    id: 'protectCivilianModules',
    title: 'Misión 20: Batalla por el Arca',
    stepTitle: 'Módulos civiles',
    objective: 'Las cápsulas civiles quedaron expuestas. Intercepta antes del impacto.',
    nextAction: 'Derriba a los drones que van a los módulos.',
    hint: 'Ahí adentro hay gente. No llegues tarde.',
    target: 'module'
  },
  stopDataBreach: {
    id: 'stopDataBreach',
    title: 'Misión 20: Batalla por el Arca',
    stepTitle: 'Brecha de datos',
    objective: 'Una unidad se acopló al núcleo de datos. Corta el enlace desde fuera.',
    nextAction: 'Acércate al núcleo y corta el acoplamiento.',
    hint: 'No entres: cortalo desde el casco.',
    target: 'core'
  },
  activateArkCounterattack: {
    id: 'activateArkCounterattack',
    title: 'Misión 20: Batalla por el Arca',
    stepTitle: 'Contraataque',
    objective: 'Reactiva la batería principal y coordina la descarga con Aurora y Nereida.',
    nextAction: 'Acércate a la batería principal y actívala.',
    hint: 'Tres enclaves disparando al mismo tiempo.',
    target: 'battery'
  },
  finalOrbitalWave: {
    id: 'finalOrbitalWave',
    title: 'Misión 20: Batalla por el Arca',
    stepTitle: 'Última oleada',
    objective: 'Resiste el último empuje enemigo.',
    nextAction: 'Fija blanco y dispara.',
    hint: 'Es el empujón final. Después se retiran.',
    target: 'sky'
  },
  stabilizeArk: {
    id: 'stabilizeArk',
    title: 'Misión 20: Batalla por el Arca',
    stepTitle: 'Estabilización',
    objective: 'Confirma la integridad del Arca y restablece el enlace con E-01.',
    nextAction: 'Acércate al Arca y confirma su estado.',
    hint: 'Golpeada, pero entera.',
    target: 'link'
  },
  detectCapitalSignature: {
    id: 'detectCapitalSignature',
    title: 'Misión 20: Batalla por el Arca',
    stepTitle: 'Señal mayor',
    objective: 'Los sensores detectan una firma de escala muy superior entrando al sistema.',
    nextAction: 'Observa la lectura.',
    hint: 'El ataque terminó. La señal no.',
    target: 'none'
  },
  completed: {
    id: 'completed',
    title: 'Misión 20: Batalla por el Arca',
    stepTitle: 'El Arca resistió',
    objective: 'El ataque terminó. La transmisión cifrada sigue.',
    nextAction: 'Prepárate para lo que viene.',
    hint: 'El ataque terminó. La señal no.',
    target: 'none'
  }
};
