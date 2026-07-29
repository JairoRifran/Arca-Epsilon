/** Mission 24 "Regreso al origen". */
export type Mission24StepId =
  | 'inactive'
  | 'decodeReturnRoute'
  | 'prepareLaunch'
  | 'boardShip'
  | 'ignitionSequence'
  | 'lowAtmosphereAscent'
  | 'cloudLayerCrossing'
  | 'midAtmosphereAscent'
  | 'upperAtmosphereAscent'
  | 'vacuumTransition'
  | 'orbitalInsertion'
  | 'stabilizeOrbit'
  | 'approachArk'
  | 'arriveAtOrigin'
  | 'assessArkDamage'
  | 'restoreEnclaveLinks'
  | 'prepareArkSystems'
  | 'integratePleyadianNetwork'
  | 'prepareCivilianShelters'
  | 'assembleAlliedForces'
  | 'revisitStartingSector'
  | 'runDefenseRehearsal'
  | 'detectFinalFleet'
  | 'enterFinalFormation'
  | 'completed';

export type Mission24Target =
  | 'base'
  | 'ship'
  | 'ascent'
  | 'orbit'
  | 'ark'
  | 'arkSystem'
  | 'enclaveLink'
  | 'arkPreparation'
  | 'pleyadianNode'
  | 'civilianShelter'
  | 'alliedAssembly'
  | 'startingSector'
  | 'rehearsal'
  | 'finalFleet'
  | 'formation'
  | 'none';

export type Mission24StepDefinition = {
  id: Mission24StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission24Target;
};

export const MISSION24_STEP_ORDER: readonly Mission24StepId[] = [
  'inactive',
  'decodeReturnRoute',
  'prepareLaunch',
  'boardShip',
  'ignitionSequence',
  'lowAtmosphereAscent',
  'cloudLayerCrossing',
  'midAtmosphereAscent',
  'upperAtmosphereAscent',
  'vacuumTransition',
  'orbitalInsertion',
  'stabilizeOrbit',
  'approachArk',
  'arriveAtOrigin',
  'assessArkDamage',
  'restoreEnclaveLinks',
  'prepareArkSystems',
  'integratePleyadianNetwork',
  'prepareCivilianShelters',
  'assembleAlliedForces',
  'revisitStartingSector',
  'runDefenseRehearsal',
  'detectFinalFleet',
  'enterFinalFormation',
  'completed'
] as const;

export const MISSION24_ARK_SYSTEM_LABELS = [
  'COMUNICACIONES',
  'MOTORES ORBITALES',
  'ESCUDO DEL ARCA',
  'MODULOS CIVILES',
  'NUCLEO COLONIAL'
] as const;

export const MISSION24_ENCLAVE_LABELS = [
  'AURORA',
  'BASE NEREIDA',
  'ARCA EPSILON',
  'RED PLEYADIANA'
] as const;

export const MISSION24_ARK_PREPARATION_LABELS = [
  'ESCUDO',
  'MOTORES',
  'BATERIA PRINCIPAL'
] as const;

export const MISSION24_STARTING_SECTOR_LABELS = [
  'PERIMETRO DE PARTIDA',
  'RUTA DE RESTOS',
  'UMBRAL CIEGO'
] as const;

export const mission24Tuning = {
  baseRange: 58,
  shipPreparationRange: 8,
  ignitionSeconds: 5,
  launchClearance: 12,
  lowAtmosphereTop: 34,
  cloudLayerTop: 64,
  midAtmosphereTop: 96,
  upperAtmosphereTop: 126,
  vacuumAltitude: 152,
  insertionHorizontalSpeed: 17,
  insertionMaxVerticalSpeed: 8,
  insertionHoldSeconds: 2.2,
  orbitStableMaxVerticalSpeed: 3.4,
  stabilizationSeconds: 2.8,
  arkApproachRange: 180,
  arkInteractionRange: 74,
  stationRange: 76,
  rehearsalSeconds: 4.8,
  formationRange: 105,
  visualUpdateInterval: 0.05
} as const;

const title = 'Mision 24: Regreso al origen';

function step(
  id: Mission24StepId,
  stepTitle: string,
  objective: string,
  nextAction: string,
  hint: string,
  target: Mission24Target
): Mission24StepDefinition {
  return { id, title, stepTitle, objective, nextAction, hint, target };
}

export const mission24Steps: Record<Mission24StepId, Mission24StepDefinition> = {
  inactive: step('inactive', 'En espera', 'La ruta al origen aun no esta disponible.', 'Completa la Mision 23.', 'No se inicia M25.', 'none'),
  decodeReturnRoute: step('decodeReturnRoute', 'Ruta recuperada', 'Decodifica la ruta recuperada.', 'Regresa a Base Nereida y analiza los datos con E.', 'La ruta coincide con el sector inicial del Arca.', 'base'),
  prepareLaunch: step('prepareLaunch', 'Preparacion de vuelo', 'Prepara la nave para el ascenso.', 'Estaciona, desciende con F e inspecciona la nave con E.', 'Motores, escudo termico y navegacion deben quedar listos.', 'ship'),
  boardShip: step('boardShip', 'Embarque', 'Embarca e inicia la secuencia de lanzamiento.', 'Vuelve a la nave con F.', 'La secuencia solo arranca con el piloto a bordo.', 'ship'),
  ignitionSequence: step('ignitionSequence', 'Secuencia de encendido', 'Activa motores y confirma sistemas.', 'Pulsa E para iniciar la cuenta regresiva.', 'Salir antes del encendido final cancela la cuenta.', 'ship'),
  lowAtmosphereAscent: step('lowAtmosphereAscent', 'Atmosfera baja', 'Despega de E-01 y atraviesa la atmosfera baja.', 'Mantiene Space para ganar altitud.', 'La asistencia conserva el corredor sin quitar control.', 'ascent'),
  cloudLayerCrossing: step('cloudLayerCrossing', 'Capa de nubes', 'Atraviesa la capa de nubes.', 'Mantiene Space y el rumbo indicado.', 'Navega por instrumentos mientras baja la visibilidad.', 'ascent'),
  midAtmosphereAscent: step('midAtmosphereAscent', 'Atmosfera media', 'Inicia la trayectoria orbital.', 'Mantiene Space y agrega W para inclinar la trayectoria.', 'Gana velocidad horizontal de forma progresiva.', 'ascent'),
  upperAtmosphereAscent: step('upperAtmosphereAscent', 'Alta atmosfera', 'Alcanza la alta atmosfera.', 'Sostiene el empuje y estabiliza la inclinacion.', 'El viento cae mientras aparecen las estrellas.', 'ascent'),
  vacuumTransition: step('vacuumTransition', 'Transicion al vacio', 'Sal de la atmosfera.', 'Mantiene el vector hasta confirmar vacio.', 'La respuesta de vuelo cambia de forma gradual.', 'ascent'),
  orbitalInsertion: step('orbitalInsertion', 'Insercion orbital', 'Completa la insercion orbital.', 'Usa W para ganar velocidad horizontal y controla Space.', 'Mantiene velocidad y estabilidad dentro de la banda.', 'orbit'),
  stabilizeOrbit: step('stabilizeOrbit', 'Orbita estable', 'Estabiliza la nave y localiza el Arca.', 'Nivela la nave mientras recalibra navegacion.', 'La asistencia elimina solo la deriva peligrosa.', 'orbit'),
  approachArk: step('approachArk', 'Regreso al Arca', 'Regresa al Arca.', 'Vuela fisicamente hasta la Arca Epsilon.', 'La silueta es la misma que al inicio.', 'ark'),
  arriveAtOrigin: step('arriveAtOrigin', 'Sector inicial', 'Acercate al Arca.', 'Confirma la llegada con E.', 'No se mueve ni reemplaza el Mothership existente.', 'ark'),
  assessArkDamage: step('assessArkDamage', 'Evaluacion del Arca', 'Evalua el estado del Arca.', 'Escanea los cinco sistemas marcados con E.', 'Reutiliza las estaciones y telemetria de M20.', 'arkSystem'),
  restoreEnclaveLinks: step('restoreEnclaveLinks', 'Enlaces de enclaves', 'Restaura los enlaces con Aurora y Nereida.', 'Sincroniza cada canal marcado con E.', 'Aurora, Nereida, Arca y Pleyadianos deben responder.', 'enclaveLink'),
  prepareArkSystems: step('prepareArkSystems', 'Sistemas principales', 'Prepara los sistemas principales del Arca.', 'Calibra escudo, motores y bateria con E.', 'Cada estacion ejecuta una preparacion distinta.', 'arkPreparation'),
  integratePleyadianNetwork: step('integratePleyadianNetwork', 'Red Pleyadiana', 'Sincroniza la red Pleyadiana.', 'Integra los tres nodos externos con E.', 'El pulso final permanece bloqueado para M25.', 'pleyadianNode'),
  prepareCivilianShelters: step('prepareCivilianShelters', 'Refugios civiles', 'Prepara los modulos civiles.', 'Sella refugios y rutas de evacuacion con E.', 'Soporte vital y capacidad medica quedan en reserva.', 'civilianShelter'),
  assembleAlliedForces: step('assembleAlliedForces', 'Fuerzas aliadas', 'Reune las fuerzas aliadas.', 'Confirma la formacion conjunta con E.', 'Las presencias aliadas son tacticas y ligeras.', 'alliedAssembly'),
  revisitStartingSector: step('revisitStartingSector', 'El lugar del comienzo', 'Recorre el sector inicial.', 'Visita los tres puntos historicos marcados.', 'Compara la llegada vulnerable con la red actual.', 'startingSector'),
  runDefenseRehearsal: step('runDefenseRehearsal', 'Ensayo defensivo', 'Completa el ensayo defensivo.', 'Activa la simulacion con E y manten posicion.', 'Solo se usan blancos holograficos.', 'rehearsal'),
  detectFinalFleet: step('detectFinalFleet', 'Firmas entrantes', 'Identifica la flota enemiga.', 'Analiza la firma distante con E.', 'La flota no es atacable y no inicia combate.', 'finalFleet'),
  enterFinalFormation: step('enterFinalFormation', 'Formacion final', 'Ocupa la formacion junto al Arca.', 'Vuela al punto asignado y confirma con E.', 'M25 queda desbloqueada, pero no comienza.', 'formation'),
  completed: step('completed', 'Regreso completado', 'El Arca y sus aliados estan en formacion.', 'Espera la siguiente mision.', 'No hay oleadas activas.', 'none')
};
