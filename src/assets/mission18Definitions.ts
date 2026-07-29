import { auroraSettlementLayout } from './auroraSettlementLayout';

/**
 * Mission 18 "Primer Fuego".
 *
 * M17 ended with real signatures dropping out of the high atmosphere. This is
 * the first armed engagement: an armed-reconnaissance flight of Coalition scout
 * drones probing how Aurora resists. It is deliberately NOT the main force —
 * no humanoid troops, no fleet, and the pilot still has no hand weapon. Aurora
 * fights with three point-defence batteries (authorised here for the first
 * time) and with the ship's existing WeaponSystem during the intercept.
 *
 * Nothing is irreversible: drone waves fly repeatable deterministic routes, the
 * batteries help on their own, a lost shield emitter can be restored, and every
 * wave boundary is a stable checkpoint.
 */
export type Mission18StepId =
  | 'inactive'
  | 'realAlert'
  | 'identifyHostiles'
  | 'authorizeDefenseWeapons'
  | 'firstWave'
  | 'defendCriticalSystem'
  | 'boardShip'
  | 'interceptDrones'
  | 'defendShield'
  | 'pursueFinalDrone'
  | 'recoverWreckage'
  | 'confirmNereidaTarget'
  | 'completed';

/** Which piece of hardware or activity the current step is fought at. */
export type Mission18Target = 'terminal' | 'sensor' | 'turret' | 'critical' | 'ship' | 'sky' | 'wreckage' | 'none';

export type Mission18StepDefinition = {
  id: Mission18StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission18Target;
};

export type DefenseTurretDefinition = {
  id: string;
  name: string;
  shortName: string;
  /** Derived from the shared settlement layout — never an absolute coordinate. */
  position: readonly [number, number];
  /** Which approach corridor this battery covers, matching the M17 sensors. */
  corridor: string;
  height: number;
};

const [turretNorth, turretEast, turretWest] = auroraSettlementLayout.defenseTurrets;

export const defenseTurretDefinitions: readonly DefenseTurretDefinition[] = [
  { id: 'aurora-turret-north', name: 'Batería de Punto // Norte', shortName: 'Batería Norte', position: turretNorth, corridor: 'CORREDOR NORTE', height: 1.6 },
  { id: 'aurora-turret-east', name: 'Batería de Punto // Este', shortName: 'Batería Este', position: turretEast, corridor: 'CORREDOR ESTE', height: 1.6 },
  { id: 'aurora-turret-west', name: 'Batería de Punto // Oeste', shortName: 'Batería Oeste', position: turretWest, corridor: 'CORREDOR SUROESTE', height: 1.6 }
];

/** Where the downed drone is scanned/recovered. */
export const droneWreckageDefinition = {
  id: 'aurora-drone-wreckage',
  name: 'Restos de Dron // Coalición',
  shortName: 'Restos de dron',
  position: auroraSettlementLayout.droneWreckage,
  height: 0.6
} as const;

export const TURRET_COUNT = defenseTurretDefinitions.length;

/**
 * The engagement is authored as three short waves plus the lone runner. Counts
 * stay inside the 4-6 simultaneous-drone budget.
 */
export type DroneWaveId = 'first' | 'intercept' | 'shield' | 'runner';

export type DroneWaveDefinition = {
  id: DroneWaveId;
  /** How many drones fly this wave. */
  count: number;
  /** Which mission step the wave belongs to. */
  step: Mission18StepId;
  label: string;
};

export const droneWaveDefinitions: readonly DroneWaveDefinition[] = [
  { id: 'first', count: 4, step: 'firstWave', label: 'PRIMERA OLEADA' },
  { id: 'intercept', count: 4, step: 'interceptDrones', label: 'INTERCEPCION' },
  { id: 'shield', count: 3, step: 'defendShield', label: 'ATAQUE AL ESCUDO' },
  { id: 'runner', count: 1, step: 'pursueFinalDrone', label: 'DRON EN FUGA' }
];

/** The single critical system the breach drone strikes. */
export const CRITICAL_SYSTEM = {
  id: 'aurora-comms-mast',
  /** The M13 comms mast: the alert network's own antenna, the coherent target. */
  name: 'Antena de Comunicaciones',
  shortName: 'Antena'
} as const;

export const mission18Tuning = {
  stationRange: 16,
  /** Range at which a battery / the wreckage can be worked on foot. */
  fieldRange: 14,

  alertSeconds: 4,
  identifySeconds: 5,
  authorizeSeconds: 4,
  /** Seconds of repair work to bring the struck comms mast back. */
  repairSeconds: 7,
  wreckageScanSeconds: 6,
  confirmSeconds: 4,

  // --- Drones --------------------------------------------------------------
  /** Health of one scout drone. Laser does 24, missile 90, turret 18. */
  droneHealth: 96,
  /** Maximum drones alive at once, across every wave. */
  maxActiveDrones: 6,
  /** Radius used by the ship's WeaponSystem for hit tests. */
  droneRadius: 9,
  /** Cruise altitude above the settlement floor. */
  droneAltitude: 62,
  /** Radius of the deterministic approach ring. */
  droneOrbitRadius: 150,
  /** Radians per second along the approach route. */
  droneOrbitSpeed: 0.16,
  /** Seconds between drone AI/target re-evaluations (frequency-limited). */
  aiIntervalSeconds: 0.2,

  // --- Point-defence batteries --------------------------------------------
  /** Effective engagement range of one battery. */
  turretRange: 210,
  /** Seconds between battery shots. */
  turretFireInterval: 1.35,
  /** Damage per battery shot. */
  turretDamage: 18,
  /** Defensive energy drained per battery shot, in percent of the reserve. */
  turretEnergyPerShot: 1.1,
  /** Percent of defensive energy recovered per second from the M17 reserve. */
  energyRecoveryPerSecond: 2.2,
  /** Below this the batteries stop firing until the reserve recovers. */
  energyFloor: 4,

  // --- Shield --------------------------------------------------------------
  /** Shield integrity lost per drone strike during the shield-defence wave. */
  shieldDamagePerHit: 9,
  /** Percent of shield integrity recovered per second while it holds. */
  shieldRecoveryPerSecond: 1.6,
  /** Below this the dome collapses; it can always be restored (no game over). */
  shieldCollapseLevel: 0,
  /** Seconds of work to bring a collapsed dome back up. */
  shieldRestoreSeconds: 5,

  // --- The runner ----------------------------------------------------------
  /**
   * Seconds the last drone needs to send its packet. It ALWAYS transmits — the
   * story requires Nereida to be targeted — but killing it first changes the
   * closing copy from "escaped" to "shot down after transmitting".
   */
  runnerTransmitSeconds: 9
} as const;

export const mission18Steps: Record<Mission18StepId, Mission18StepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'Misión 18: Primer Fuego',
    stepTitle: 'En espera',
    objective: 'Las defensas están en modo de espera.',
    nextAction: 'Completa la Misión 17.',
    hint: 'Todo listo. Nada probado.',
    target: 'none'
  },
  realAlert: {
    id: 'realAlert',
    title: 'Misión 18: Primer Fuego',
    stepTitle: 'Alerta real',
    objective: 'Confirma que las firmas no son parte de la simulación.',
    nextAction: 'Ve a la terminal y activa el protocolo de emergencia.',
    hint: 'Los habitantes ya están bajando a los refugios.',
    target: 'terminal'
  },
  identifyHostiles: {
    id: 'identifyHostiles',
    title: 'Misión 18: Primer Fuego',
    stepTitle: 'Identificación',
    objective: 'Clasifica las firmas con los tres sensores perimetrales.',
    nextAction: 'Mantente en la terminal y clasifica los contactos con E.',
    hint: 'Rumbo, altitud y tiempo estimado de llegada.',
    target: 'terminal'
  },
  authorizeDefenseWeapons: {
    id: 'authorizeDefenseWeapons',
    title: 'Misión 18: Primer Fuego',
    stepTitle: 'Autorización de fuego',
    objective: 'Autoriza por primera vez las baterías defensivas de Aurora.',
    nextAction: 'Mantente en la terminal y autoriza el fuego con E.',
    hint: 'Tres baterías de punto, alimentadas por la reserva. Munición limitada.',
    target: 'terminal'
  },
  firstWave: {
    id: 'firstWave',
    title: 'Misión 18: Primer Fuego',
    stepTitle: 'Primera oleada',
    objective: 'Las baterías abren fuego. Mantén sensores, energía y fijación.',
    nextAction: 'Sostén la red mientras las baterías derriban la oleada.',
    hint: 'Las baterías disparan solas. Tu trabajo es que sigan teniendo con qué.',
    target: 'turret'
  },
  defendCriticalSystem: {
    id: 'defendCriticalSystem',
    title: 'Misión 18: Primer Fuego',
    stepTitle: 'Brecha',
    objective: 'Un dron alcanzó la antena de comunicaciones. Repárala bajo fuego.',
    nextAction: 'Ve a la antena y estabilízala con E.',
    hint: 'Sin antena, Nereida y el Arca dejan de escucharnos.',
    target: 'critical'
  },
  boardShip: {
    id: 'boardShip',
    title: 'Misión 18: Primer Fuego',
    stepTitle: 'Embarque',
    objective: 'Las baterías no alcanzan a los que quedan arriba. Sube a la nave.',
    nextAction: 'Vuelve a la nave con F y despega.',
    hint: 'Aurora no puede defenderse sola del aire.',
    target: 'ship'
  },
  interceptDrones: {
    id: 'interceptDrones',
    title: 'Misión 18: Primer Fuego',
    stepTitle: 'Intercepción',
    objective: 'Intercepta los drones restantes con las armas de la nave.',
    nextAction: 'Fija blanco y dispara con Espacio / clic.',
    hint: 'Pasadas cortas. No te alejes de la colonia.',
    target: 'sky'
  },
  defendShield: {
    id: 'defendShield',
    title: 'Misión 18: Primer Fuego',
    stepTitle: 'Defensa del escudo',
    objective: 'Una segunda oleada ataca un emisor. Evita el colapso de la cúpula.',
    nextAction: 'Derriba a los atacantes antes de que caiga la cúpula.',
    hint: 'Si la cúpula cae se puede levantar otra vez, pero costará.',
    target: 'sky'
  },
  pursueFinalDrone: {
    id: 'pursueFinalDrone',
    title: 'Misión 18: Primer Fuego',
    stepTitle: 'Último dron',
    objective: 'Un dron intenta retirarse transmitiendo un paquete.',
    nextAction: 'Derríbalo antes de que complete la transmisión.',
    hint: 'Está enviando algo. No alcanza con ahuyentarlo.',
    target: 'sky'
  },
  recoverWreckage: {
    id: 'recoverWreckage',
    title: 'Misión 18: Primer Fuego',
    stepTitle: 'Restos enemigos',
    objective: 'Escanea los restos de un dron abatido.',
    nextAction: 'Ve a los restos y escanéalos con E.',
    hint: 'Armamento y navegación. Queremos saber contra qué peleamos.',
    target: 'wreckage'
  },
  confirmNereidaTarget: {
    id: 'confirmNereidaTarget',
    title: 'Misión 18: Primer Fuego',
    stepTitle: 'Destino: Nereida',
    objective: 'Confirma hacia dónde apuntaba la transmisión enemiga.',
    nextAction: 'Mantente en la terminal y descifra el paquete con E.',
    hint: 'No era una unidad de asalto. Era una avanzada.',
    target: 'terminal'
  },
  completed: {
    id: 'completed',
    title: 'Misión 18: Primer Fuego',
    stepTitle: 'Aurora resistió',
    objective: 'Aurora quedó dañada pero operativa. La avanzada se retiró.',
    nextAction: 'Prepara la defensa de Base Nereida.',
    hint: 'Se retiran de Aurora. Pero ahora van hacia Nereida.',
    target: 'none'
  }
};
