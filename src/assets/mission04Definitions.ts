export type Mission04StepId =
  | 'inactive'
  | 'returnToBase'
  | 'calibrateDefenseLink'
  | 'activateOrbitalSensor'
  | 'travelToBeacon'
  | 'deployBeacon'
  | 'synchronizeNetwork'
  | 'returnToShip'
  | 'orbitalScan'
  | 'threatSignature'
  | 'completed';

export type Mission04Target =
  | 'base'
  | 'communications'
  | 'orbitalSensor'
  | 'defenseBeacon'
  | 'ship'
  | 'threatSignature'
  | 'none';

export type Mission04StepDefinition = {
  id: Mission04StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission04Target;
};

export type DefenseBeaconSiteDefinition = {
  id: string;
  name: string;
  shortName: string;
  position: readonly [number, number];
};

export const defenseBeaconSites: readonly DefenseBeaconSiteDefinition[] = [
  {
    id: 'defense-beacon-north',
    name: 'Baliza Defensiva Norte',
    shortName: 'Norte',
    position: [-420, -500]
  },
  {
    id: 'defense-beacon-east',
    name: 'Baliza Defensiva Este',
    shortName: 'Este',
    position: [560, 180]
  },
  {
    id: 'defense-beacon-south',
    name: 'Baliza Defensiva Sur',
    shortName: 'Sur',
    position: [-430, 500]
  }
] as const;

export const mission04Tuning = {
  baseInteractionRange: 52,
  beaconApproachRange: 58,
  beaconInteractionRange: 10,
  synchronizationRange: 64,
  calibrationSeconds: 4.2,
  synchronizationSeconds: 12,
  orbitalScanAltitude: 32
} as const;

export const mission04Steps: Record<Mission04StepId, Mission04StepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'Mision 04: Protocolo de Defensa Orbital',
    stepTitle: 'En espera',
    objective: 'La red defensiva permanece bloqueada hasta completar el primer contacto.',
    nextAction: 'Completa la Mision 03.',
    hint: 'La advertencia Pleyadana debe ser registrada antes de activar el protocolo.',
    target: 'none'
  },
  returnToBase: {
    id: 'returnToBase',
    title: 'Mision 04: Protocolo de Defensa Orbital',
    stepTitle: 'Protocolo defensivo',
    objective: 'Comando Arca solicita preparar una red de alerta temprana sobre Cuenca Nereida.',
    nextAction: 'Regresa a Base Nereida y revisa el protocolo con E.',
    hint: 'No hay ataque en curso. La prioridad es obtener vision orbital.',
    target: 'communications'
  },
  calibrateDefenseLink: {
    id: 'calibrateDefenseLink',
    title: 'Mision 04: Protocolo de Defensa Orbital',
    stepTitle: 'Enlace defensivo',
    objective: 'Calibra el enlace entre Base Nereida, la Arca y la matriz Atlas.',
    nextAction: 'Calibra el enlace defensivo con E.',
    hint: 'Permanece junto al modulo de comunicaciones durante la calibracion.',
    target: 'communications'
  },
  activateOrbitalSensor: {
    id: 'activateOrbitalSensor',
    title: 'Mision 04: Protocolo de Defensa Orbital',
    stepTitle: 'Sensor orbital',
    objective: 'Activa el primer sensor orbital de alerta temprana desde Base Nereida.',
    nextAction: 'Activa el sensor orbital con E.',
    hint: 'El sensor no porta armas; solo amplifica telemetria de largo alcance.',
    target: 'orbitalSensor'
  },
  travelToBeacon: {
    id: 'travelToBeacon',
    title: 'Mision 04: Protocolo de Defensa Orbital',
    stepTitle: 'Malla de superficie',
    objective: 'Viaja al siguiente sitio de la malla defensiva.',
    nextAction: 'Usa la nave para llegar al sitio marcado.',
    hint: 'Los tres puntos rodean la cuenca y requieren desplazamiento aereo.',
    target: 'defenseBeacon'
  },
  deployBeacon: {
    id: 'deployBeacon',
    title: 'Mision 04: Protocolo de Defensa Orbital',
    stepTitle: 'Despliegue de baliza',
    objective: 'Instala el equipo de deteccion en el punto de anclaje.',
    nextAction: 'Desciende con F y activa la baliza con E.',
    hint: 'La activacion final requiere confirmacion manual a pie.',
    target: 'defenseBeacon'
  },
  synchronizeNetwork: {
    id: 'synchronizeNetwork',
    title: 'Mision 04: Protocolo de Defensa Orbital',
    stepTitle: 'Sincronizar red',
    objective: 'Sincroniza las tres balizas con Base Nereida y el sensor orbital.',
    nextAction: 'Permanece dentro del rango hasta sincronizar.',
    hint: 'Salir del area pausa y degrada lentamente el enlace defensivo.',
    target: 'defenseBeacon'
  },
  returnToShip: {
    id: 'returnToShip',
    title: 'Mision 04: Protocolo de Defensa Orbital',
    stepTitle: 'Regreso a la nave',
    objective: 'La malla de superficie esta estable. Regresa a la nave para el barrido orbital.',
    nextAction: 'Regresa a la nave y embarca con F.',
    hint: 'El escaner de la nave completara la triangulacion con la Arca.',
    target: 'ship'
  },
  orbitalScan: {
    id: 'orbitalScan',
    title: 'Mision 04: Protocolo de Defensa Orbital',
    stepTitle: 'Barrido orbital',
    objective: 'Eleva la nave y realiza un escaneo sobre Cuenca Nereida.',
    nextAction: 'Realiza un escaneo orbital con E.',
    hint: 'Space aplica empuje vertical; E inicia el barrido cuando alcanzas altura segura.',
    target: 'orbitalSensor'
  },
  threatSignature: {
    id: 'threatSignature',
    title: 'Mision 04: Protocolo de Defensa Orbital',
    stepTitle: 'Firma anomala',
    objective: 'Una lectura distante no coincide con tecnologia humana, Atlas ni Pleyadana.',
    nextAction: 'Analiza la firma anomala con E.',
    hint: 'Solo hay una traza remota. No se detectan naves ni ataque inminente.',
    target: 'threatSignature'
  },
  completed: {
    id: 'completed',
    title: 'Mision 04: Protocolo de Defensa Orbital',
    stepTitle: 'Red defensiva activa',
    objective: 'E-01 dispone de una red inicial de alerta orbital.',
    nextAction: 'Firma de la Coalicion archivada. Mision 05 preparada, pero no iniciada.',
    hint: 'La defensa inicial aporta vision y tiempo de respuesta, no armamento.',
    target: 'none'
  }
};
