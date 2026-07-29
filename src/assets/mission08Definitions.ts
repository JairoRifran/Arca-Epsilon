export type Mission08StepId =
  | 'inactive'
  | 'analyzeTrace'
  | 'travelToFracture'
  | 'stabilizeNorth'
  | 'stabilizeCentral'
  | 'stabilizeSouth'
  | 'returnToBase'
  | 'signalPurge'
  | 'completed';

export type Mission08Target = 'base' | 'fracture' | 'focusNorth' | 'focusCentral' | 'focusSouth' | 'none';

export type Mission08StepDefinition = {
  id: Mission08StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission08Target;
};

export type SignalFractureFocusDefinition = {
  id: string;
  name: string;
  shortName: string;
  position: readonly [number, number];
};

// Fresh south-east quadrant, well clear of Laguna/Veta/Fisura, the Atlas
// resonator, the Mission 04 beacons, the Mission 05 probe points, the
// Mission 06 cloaking projectors and the Mission 07 Atlas fracture (NW).
export const signalFractureDefinition = {
  id: 'signal-fracture',
  name: 'Grieta de Señal',
  position: [560, -430] as const
} as const;

export const signalFractureFocusDefinitions: readonly SignalFractureFocusDefinition[] = [
  {
    id: 'signal-focus-north',
    name: 'Foco Norte',
    shortName: 'Norte',
    position: [548, -474]
  },
  {
    id: 'signal-focus-central',
    name: 'Foco Central',
    shortName: 'Central',
    position: [590, -430]
  },
  {
    id: 'signal-focus-south',
    name: 'Foco Sur',
    shortName: 'Sur',
    position: [556, -388]
  }
] as const;

export const mission08Tuning = {
  baseInteractionRange: 52,
  fractureArrivalRange: 72,
  focusStabilizeRange: 8.5,
  purgeSeconds: 5.0
} as const;

export const mission08Steps: Record<Mission08StepId, Mission08StepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'Misión 08: La Primera Grieta',
    stepTitle: 'En espera',
    objective: 'El Archivo Semilla Atlas debe estar activo antes de rastrear la grieta.',
    nextAction: 'Completa la Misión 07.',
    hint: 'La firma residual todavía no es legible.',
    target: 'none'
  },
  analyzeTrace: {
    id: 'analyzeTrace',
    title: 'Misión 08: La Primera Grieta',
    stepTitle: 'Rastro de Escaneo',
    objective: 'Analiza el rastro de escaneo que dejó la Sonda Silenciosa sobre E-01.',
    nextAction: 'Usa E en la consola de Base Nereida.',
    hint: 'La Coalición observó lo suficiente para abrir una grieta de señal.',
    target: 'base'
  },
  travelToFracture: {
    id: 'travelToFracture',
    title: 'Misión 08: La Primera Grieta',
    stepTitle: 'Grieta de Señal',
    objective: 'Viaja hasta la Grieta de Señal marcada en el mapa.',
    nextAction: 'Llega a la Grieta de Señal y desciende con F.',
    hint: 'La grieta está separada de todos los sitios conocidos de Nereida.',
    target: 'fracture'
  },
  stabilizeNorth: {
    id: 'stabilizeNorth',
    title: 'Misión 08: La Primera Grieta',
    stepTitle: 'Foco Norte',
    objective: 'Estabiliza el Foco Norte de la grieta.',
    nextAction: 'Acércate a pie y usa E.',
    hint: 'Cada foco reduce la tensión de la grieta antes de la purga.',
    target: 'focusNorth'
  },
  stabilizeCentral: {
    id: 'stabilizeCentral',
    title: 'Misión 08: La Primera Grieta',
    stepTitle: 'Foco Central',
    objective: 'Estabiliza el Foco Central de la grieta.',
    nextAction: 'Acércate a pie y usa E.',
    hint: 'El foco central sostiene la mayor parte de la fractura.',
    target: 'focusCentral'
  },
  stabilizeSouth: {
    id: 'stabilizeSouth',
    title: 'Misión 08: La Primera Grieta',
    stepTitle: 'Foco Sur',
    objective: 'Estabiliza el Foco Sur de la grieta.',
    nextAction: 'Acércate a pie y usa E.',
    hint: 'Último foco antes de poder purgar la señal desde la base.',
    target: 'focusSouth'
  },
  returnToBase: {
    id: 'returnToBase',
    title: 'Misión 08: La Primera Grieta',
    stepTitle: 'Regreso a Base',
    objective: 'Vuelve a Base Nereida para ejecutar la purga de señal.',
    nextAction: 'Regresa a Base Nereida.',
    hint: 'La purga solo puede ejecutarse desde el núcleo de la base.',
    target: 'base'
  },
  signalPurge: {
    id: 'signalPurge',
    title: 'Misión 08: La Primera Grieta',
    stepTitle: 'Purga de Señal',
    objective: 'Ejecuta la Purga de Señal desde Base Nereida.',
    nextAction: 'Mantén E en Base Nereida hasta completar la purga.',
    hint: 'Si sales del rango de la base, la purga se degrada lentamente.',
    target: 'base'
  },
  completed: {
    id: 'completed',
    title: 'Misión 08: La Primera Grieta',
    stepTitle: 'Grieta Contenida',
    objective: 'Grieta de señal contenida. Nereida sigue oculta.',
    nextAction: 'A la espera de nuevos desarrollos.',
    hint: 'Quedó una firma residual que apunta hacia regiones lejanas de E-01.',
    target: 'none'
  }
};
