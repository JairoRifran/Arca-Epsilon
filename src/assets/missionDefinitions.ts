export type MissionStepId =
  | 'briefing'
  | 'scannerTutorial'
  | 'followSignal'
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
      objective: 'Escucha el briefing de Comando Arca.',
      nextAction: 'Confirma la mision y prepara sensores.',
      hint: 'El objetivo principal es encontrar un planeta habitable para la humanidad.'
    },
    {
      id: 'scannerTutorial',
      title: 'Perímetro de Arca Epsilon',
      objective: 'Sal de la zona segura y activa el escáner de largo alcance.',
      nextAction: 'Aléjate de la Arca y presiona E para iniciar el barrido.',
      hint: 'El protocolo exige confirmar el entorno antes de fijar un destino.'
    },
    {
      id: 'followSignal',
      title: 'Biosfera E-01 detectada',
      objective: 'Fija rumbo hacia el planeta candidato E-01.',
      nextAction: 'Sigue la guía de navegación hasta alcanzar órbita de análisis.',
      hint: 'Aún no existe autorización de descenso: primero debes completar el estudio orbital.'
    },
    {
      id: 'scanPlanet',
      title: 'Análisis orbital preliminar',
      objective: 'Escanea E-01 desde órbita para comprobar sus datos críticos.',
      nextAction: 'Entra en rango y presiona E para analizar atmósfera, agua, temperatura, radiación, gravedad y biología.',
      hint: 'No intentes descender sin completar todas las lecturas.'
    },
    {
      id: 'analyzeHabitability',
      title: 'Barrido orbital en curso',
      objective: 'Mantén la nave estable mientras se completa el protocolo de habitabilidad.',
      nextAction: 'Permanece en órbita hasta verificar las seis lecturas críticas.',
      hint: 'Romper el rango reduce el progreso y mantiene bloqueado el descenso.'
    },
    {
      id: 'surviveComplication',
      title: 'Interferencia orbital',
      objective: 'Sobrevive la anomalia y protege el bloqueo.',
      nextAction: 'Evita el pulso defensivo o usa armas solo si es necesario.',
      hint: 'Escapar tambien es una respuesta valida. No es una batalla de oleadas.'
    },
    {
      id: 'scanOrbitalMarker',
      title: 'Marcador Atlas detectado',
      objective: 'Investiga la estructura orbital no humana.',
      nextAction: 'Acércate al Marcador Atlas y presiona E para escanear.',
      hint: 'La entrada seguirá denegada hasta que la baliza revele un corredor seguro.'
    },
    {
      id: 'decodeDescentCorridor',
      title: 'Corredor Atlas',
      objective: 'Decodifica un corredor seguro de descenso.',
      nextAction: 'Mantén la nave dentro del rango de la señal Atlas.',
      hint: 'No rompas el rango del marcador durante la decodificacion.'
    },
    {
      id: 'approachPlanet',
      title: 'Autorización de descenso',
      objective: 'Datos mínimos confirmados. Inicia la aproximación a E-01.',
      nextAction: 'Sigue la guía hacia el corredor de entrada Atlas.',
      hint: 'La autorización depende del análisis orbital y del corredor Atlas decodificado.'
    },
    {
      id: 'atmosphericEntry',
      title: 'Entrada atmosférica',
      objective: 'Mantén estabilidad durante el ingreso a E-01.',
      nextAction: 'Reduce velocidad y estabiliza la nave hasta atravesar la cizalla.',
      hint: 'Suelta Shift y usa S si el calor o la inestabilidad suben demasiado.'
    },
    {
      id: 'landingApproach',
      title: 'Cuenca Nereida',
      objective: 'Localiza la zona segura de aterrizaje.',
      nextAction: 'Sigue la baliza de aterrizaje y reduce velocidad.',
      hint: 'La asistencia de aterrizaje se activa dentro de la zona marcada.'
    },
    {
      id: 'touchdown',
      title: 'Aterrizaje asistido',
      objective: 'Completa el aterrizaje asistido.',
      nextAction: 'Permanece dentro de la zona y baja de 9 m/s.',
      hint: 'La nave aterrizara cuando la velocidad sea segura.'
    },
    {
      id: 'firstFoothold',
      title: 'Primer punto de apoyo',
      objective: 'Primer punto de apoyo establecido.',
      nextAction: 'Prepara el despliegue del primer modulo colonial.',
      hint: 'La fase planetaria queda lista para la siguiente iteracion.'
    },
    {
      id: 'transmitData',
      title: 'Enlace con Arca Epsilon',
      objective: 'Transmite los datos de superficie a la Arca Epsilon.',
      nextAction: 'Canal automatico activo desde la Cuenca Nereida.',
      hint: 'La Arca recibe telemetria para preparar colonizacion.'
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
