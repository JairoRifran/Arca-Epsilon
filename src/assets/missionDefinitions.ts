export type MissionStepId =
  | 'briefing'
  // --- Flight onboarding, inserted ahead of M01's original first step -------
  // Four short manoeuvres taught by doing them once. They sit here, before
  // `scannerTutorial`, because the prologue hands over the moment the exit
  // corridor is clear and the pilot has not yet flown anything.
  | 'flightOrientation'
  | 'propulsionTrial'
  | 'navigationTrial'
  | 'stabilizationTrial'
  | 'scannerTutorial'
  | 'followSignal'
  // --- The recon beacon: what the pilot does instead of waiting ------------
  // The old mission refused the descent and then asked the pilot to hold
  // position while a percentage counted up. These three steps are that wait,
  // made playable: find the Ark's own beacon, scan it, hold steady while the
  // atmospheric read transfers. Completing them is what earns the corridor.
  //
  // A refused descent is deliberately NOT a step here. The pilot can dive at
  // E-01 from any of these, so denial is an event that overrides the objective
  // and names its cause — not a place the mission parks them.
  | 'beaconApproach'
  | 'beaconSurvey'
  | 'dataTransfer'
  | 'scanPlanet'
  | 'analyzeHabitability'
  | 'surviveComplication'
  | 'scanOrbitalMarker'
  | 'decodeDescentCorridor'
  | 'approachPlanet'
  | 'atmosphericEntry'
  | 'landingApproach'
  | 'touchdown'
  | 'firstFoothold'
  | 'transmitData'
  | 'missionComplete';

export type MissionStepDefinition = {
  id: MissionStepId;
  title: string;
  objective: string;
  nextAction: string;
  hint: string;
};

export const mission01 = {
  id: 'mission-01-search-home',
  name: 'Mision 01: Buscar un Nuevo Hogar',
  briefing:
    'Piloto, aqui Comando Arca. La Tierra ya no existe como hogar y nuestras reservas fallan. Tu mision es localizar un planeta habitable, analizarlo y enviar los datos a la Arca Epsilon. El futuro humano depende de lo que encuentres.',
  completion:
    'Mision completa: primer punto de apoyo humano establecido en E-01. Protocolo de colonizacion preparado. Siguiente: desplegar el primer modulo colonial.',
  steps: [
    {
      id: 'briefing',
      title: 'Protocolo Éxodo',
      objective: 'Escuchá el briefing de Comando Arca.',
      nextAction: 'Confirmá la misión y prepará sensores.',
      hint: 'El objetivo principal es encontrar un planeta habitable para la humanidad.'
    },
    {
      id: 'flightOrientation',
      title: 'Control de actitud',
      objective: 'Orientá la nave hacia la baliza de salida.',
      nextAction: 'Movés el mouse para apuntar. El marcador confirma cuando estás alineado.',
      hint: 'No hace falta precisión: alcanza con que la baliza quede centrada.'
    },
    {
      id: 'propulsionTrial',
      title: 'Propulsión',
      objective: 'Avanzá por el corredor de salida.',
      nextAction: 'Mantené W para acelerar. Shift da impulso.',
      hint: 'La velocidad y la distancia a la baliza están en el HUD.'
    },
    {
      id: 'navigationTrial',
      title: 'Corrección de rumbo',
      objective: 'Alineate con la baliza de navegación.',
      nextAction: 'Girá hacia el nuevo marcador y sostené el rumbo.',
      hint: 'El giro se hace apuntando con el mouse; A y D desplazan de costado.'
    },
    {
      id: 'stabilizationTrial',
      title: 'Estabilización',
      objective: 'Reducí la velocidad dentro de la zona marcada.',
      nextAction: 'Soltá W y usá S para frenar hasta estabilizar la nave.',
      hint: 'El escáner necesita la nave estable: sin eso no hay lectura.'
    },
    {
      id: 'scannerTutorial',
      title: 'Perímetro de Arca Epsilon',
      objective: 'Activá el escáner de largo alcance.',
      nextAction: 'Presioná E para iniciar el barrido.',
      hint: 'El protocolo exige confirmar el entorno antes de fijar un destino.'
    },
    {
      id: 'followSignal',
      title: 'Biosfera E-01 detectada',
      objective: 'Fijá rumbo hacia el planeta candidato E-01.',
      nextAction: 'Seguí la guía de navegación hasta alcanzar órbita de análisis.',
      hint: 'Todavía no hay autorización de descenso: la atmósfera está sin confirmar.'
    },
    {
      id: 'beaconApproach',
      title: 'Baliza de reconocimiento',
      objective: 'Acercate a la baliza de reconocimiento del Arca.',
      nextAction: 'Seguí el marcador hasta la órbita baja de E-01.',
      hint: 'La baliza llegó antes que vos y sigue transmitiendo datos incompletos.'
    },
    {
      id: 'beaconSurvey',
      title: 'Escaneo orbital',
      objective: 'Escaneá la baliza de reconocimiento.',
      nextAction: 'Mantenete en rango y presioná E para enlazar el escáner.',
      hint: 'Salir del rango interrumpe el enlace, pero no borra lo escaneado.'
    },
    {
      id: 'dataTransfer',
      title: 'Transferencia de datos',
      objective: 'Mantené la nave estable durante la transferencia.',
      nextAction: 'Quedate en rango y por debajo de 24 m/s hasta completar la lectura.',
      hint: 'La transferencia se pausa si te alejás o acelerás, pero nunca retrocede.'
    },
    {
      id: 'scanPlanet',
      title: 'Análisis orbital preliminar',
      objective: 'Escaneá E-01 desde órbita para comprobar sus datos críticos.',
      nextAction: 'Entrá en rango y presioná E para analizar agua, temperatura, radiación, gravedad y biología.',
      hint: 'Los datos atmosféricos ya llegaron desde la baliza; falta el resto.'
    },
    {
      id: 'analyzeHabitability',
      title: 'Barrido orbital en curso',
      objective: 'Mantené la nave estable mientras se completa el protocolo de habitabilidad.',
      nextAction: 'Permanecé en órbita hasta verificar las lecturas críticas.',
      hint: 'Romper el rango reduce el progreso y mantiene bloqueado el descenso.'
    },
    {
      id: 'surviveComplication',
      title: 'Interferencia orbital',
      objective: 'Sobreviví la anomalía y protegé el bloqueo del escáner.',
      nextAction: 'Evitá el pulso defensivo o usá armas sólo si es necesario.',
      hint: 'Escapar también es una respuesta válida. No es una batalla de oleadas.'
    },
    {
      id: 'scanOrbitalMarker',
      title: 'Marcador Atlas detectado',
      objective: 'Investigá la estructura orbital no humana.',
      nextAction: 'Acercate al Marcador Atlas y presioná E para escanear.',
      hint: 'La entrada sigue denegada hasta que el marcador revele un corredor seguro.'
    },
    {
      id: 'decodeDescentCorridor',
      title: 'Corredor Atlas',
      objective: 'Decodificá un corredor seguro de descenso.',
      nextAction: 'Mantené la nave dentro del rango de la señal Atlas.',
      hint: 'No rompas el rango del marcador durante la decodificación.'
    },
    {
      id: 'approachPlanet',
      title: 'Autorización de descenso',
      objective: 'Ingresá al corredor de descenso.',
      nextAction: 'Seguí la guía hacia el corredor de entrada y mantené la trayectoria.',
      hint: 'Velocidad recomendada y ángulo de entrada están marcados en el HUD.'
    },
    {
      id: 'atmosphericEntry',
      title: 'Entrada atmosférica',
      objective: 'Mantené la estabilidad durante el ingreso a E-01.',
      nextAction: 'Reducí la velocidad y estabilizá la nave hasta atravesar la cizalla.',
      hint: 'Soltá Shift y usá S si el calor o la inestabilidad suben demasiado.'
    },
    {
      id: 'landingApproach',
      title: 'Cuenca Nereida',
      objective: 'Localizá la zona segura de aterrizaje.',
      nextAction: 'Seguí la baliza de aterrizaje y reducí la velocidad.',
      hint: 'La asistencia de aterrizaje se activa dentro de la zona marcada.'
    },
    {
      id: 'touchdown',
      title: 'Aterrizaje asistido',
      objective: 'Completá el aterrizaje asistido.',
      nextAction: 'Permanecé dentro de la zona y bajá de 9 m/s.',
      hint: 'La nave aterriza sola cuando la velocidad sea segura.'
    },
    {
      id: 'firstFoothold',
      title: 'Primer punto de apoyo',
      objective: 'Primer punto de apoyo establecido.',
      nextAction: 'Prepará el despliegue del primer módulo colonial.',
      hint: 'La fase planetaria queda lista para la siguiente iteración.'
    },
    {
      id: 'transmitData',
      title: 'Enlace con Arca Epsilon',
      objective: 'Transmití los datos de superficie a la Arca Epsilon.',
      nextAction: 'Canal automático activo desde la Cuenca Nereida.',
      hint: 'La Arca recibe telemetría para preparar la colonización.'
    },
    {
      id: 'missionComplete',
      title: 'Mission 01 completada',
      objective: 'Superficie asegurada en E-01.',
      nextAction: 'Colonizacion preparada: desplegar primer modulo en una futura mision.',
      hint: 'La fase planetaria queda desbloqueada para la siguiente iteracion.'
    }
  ] satisfies MissionStepDefinition[]
};
