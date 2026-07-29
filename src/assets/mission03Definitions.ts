export type Mission03StepId =
  | 'inactive'
  | 'deepSignal'
  | 'calibrateCommunications'
  | 'resonancePoint'
  | 'relayBeacon'
  | 'synchronization'
  | 'returnToBase'
  | 'atlasTranslation'
  | 'firstContact'
  | 'warning'
  | 'prepare'
  | 'completed';

export type Mission03Target = 'base' | 'communications' | 'resonator' | 'relay' | 'none';

export type Mission03StepDefinition = {
  id: Mission03StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission03Target;
};

export const mission03Steps: Record<Mission03StepId, Mission03StepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'Mision 03: Primer Contacto',
    stepTitle: 'En espera',
    objective: 'Base Nereida no ha detectado transmisiones estructuradas.',
    nextAction: 'Completa Base Nereida antes de investigar la Red Atlas.',
    hint: 'La mision comenzara cuando la base y las muestras esten operativas.',
    target: 'base'
  },
  deepSignal: {
    id: 'deepSignal',
    title: 'Mision 03: Primer Contacto',
    stepTitle: 'Senal profunda',
    objective: 'Base Nereida detecto una transmision estructurada en la Red Atlas.',
    nextAction: 'Regresa al Modulo Habitat y presiona E para revisar la senal.',
    hint: 'Las senales Atlas pueden venir de fuera del planeta.',
    target: 'communications'
  },
  calibrateCommunications: {
    id: 'calibrateCommunications',
    title: 'Mision 03: Primer Contacto',
    stepTitle: 'Calibrar comunicaciones',
    objective: 'Calibra la antena de Base Nereida para aislar la frecuencia.',
    nextAction: 'Interactua con el modulo de comunicaciones usando E.',
    hint: 'Permanece cerca de la antena mientras se separa el ruido geologico.',
    target: 'communications'
  },
  resonancePoint: {
    id: 'resonancePoint',
    title: 'Mision 03: Primer Contacto',
    stepTitle: 'Punto de resonancia',
    objective: 'La senal rebota en un punto de resonancia fuera del perimetro.',
    nextAction: 'Usa la nave para dirigirte al Resonador Atlas.',
    hint: 'La guia y el mapa local muestran el Resonador Atlas.',
    target: 'resonator'
  },
  relayBeacon: {
    id: 'relayBeacon',
    title: 'Mision 03: Primer Contacto',
    stepTitle: 'Baliza de enlace',
    objective: 'Despliega una baliza de enlace Atlas-Pleyadana.',
    nextAction: 'Desciende de la nave con F y coloca la baliza con E.',
    hint: 'La instalacion final requiere confirmacion cercana a pie.',
    target: 'relay'
  },
  synchronization: {
    id: 'synchronization',
    title: 'Mision 03: Primer Contacto',
    stepTitle: 'Sincronizacion',
    objective: 'Estabiliza la senal mientras Base Nereida recibe la transmision.',
    nextAction: 'Mantente dentro del area de enlace hasta completar la sincronizacion.',
    hint: 'Salir del rango reduce lentamente la estabilidad.',
    target: 'relay'
  },
  returnToBase: {
    id: 'returnToBase',
    title: 'Mision 03: Primer Contacto',
    stepTitle: 'Regreso a Base Nereida',
    objective: 'La senal fue estabilizada. Regresa al habitat para iniciar traduccion.',
    nextAction: 'Vuelve a Base Nereida y usa E en el modulo de comunicaciones.',
    hint: 'La nave sigue disponible para el trayecto de regreso.',
    target: 'communications'
  },
  atlasTranslation: {
    id: 'atlasTranslation',
    title: 'Mision 03: Primer Contacto',
    stepTitle: 'Traduccion Atlas',
    objective: 'Usa los datos del Marcador Atlas para traducir la transmision.',
    nextAction: 'Permanece junto al modulo mientras la matriz reconstruye el mensaje.',
    hint: 'Los fragmentos legibles apareceran de forma progresiva.',
    target: 'communications'
  },
  firstContact: {
    id: 'firstContact',
    title: 'Mision 03: Primer Contacto',
    stepTitle: 'Primer Contacto',
    objective: 'Establece comunicacion con los Pleyadanos.',
    nextAction: 'Presiona E junto al modulo de comunicaciones para abrir el canal.',
    hint: 'La transmision es remota; no hay presencia fisica en E-01.',
    target: 'communications'
  },
  warning: {
    id: 'warning',
    title: 'Mision 03: Primer Contacto',
    stepTitle: 'Advertencia',
    objective: 'Recibe la advertencia Pleyadana.',
    nextAction: 'Mantente junto a la proyeccion y presiona E para confirmar recepcion.',
    hint: 'Los Pleyadanos piden preparacion, no un ataque.',
    target: 'communications'
  },
  prepare: {
    id: 'prepare',
    title: 'Mision 03: Primer Contacto',
    stepTitle: 'Prepararse',
    objective: 'Registra la amenaza y prepara la siguiente fase de la colonia.',
    nextAction: 'Confirma el protocolo con E en Base Nereida.',
    hint: 'Proximo objetivo: preparar defensa orbital y ampliar la Red Atlas.',
    target: 'communications'
  },
  completed: {
    id: 'completed',
    title: 'Mision 03: Primer Contacto',
    stepTitle: 'Primer Contacto completado',
    objective: 'Contacto Pleyadano establecido. Amenaza galactica registrada.',
    nextAction: 'Preparar defensa orbital y ampliar la Red Atlas.',
    hint: 'La Mision 04 queda desbloqueada, pero todavia no ha comenzado.',
    target: 'base'
  }
};

export const resonadorAtlasDefinition = {
  id: 'resonador-atlas',
  name: 'Resonador Atlas',
  position: [620, -500] as const,
  relayRange: 72,
  synchronizationSeconds: 18,
  calibrationSeconds: 4.5
};
