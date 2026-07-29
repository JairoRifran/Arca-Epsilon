export type Mission06StepId =
  | 'inactive'
  | 'returnToBase'
  | 'analyzeResidue'
  | 'calibrateMatrix'
  | 'deployNorth'
  | 'deployEast'
  | 'deploySouth'
  | 'syncMatrix'
  | 'completed';

export type Mission06Target = 'base' | 'projectorNorth' | 'projectorEast' | 'projectorSouth' | 'none';

export type Mission06StepDefinition = {
  id: Mission06StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission06Target;
};

export const cloakingProjectorPositions = [
  [-45, 0, -180], // North
  [210, 0, 40],   // East
  [-90, 0, 190]   // South
] as const;

export const mission06Tuning = {
  baseInteractionRange: 52,
  projectorInteractionRange: 30,
  syncSeconds: 5.0
} as const;

export const mission06Steps: Record<Mission06StepId, Mission06StepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'Misión 06: Blindaje de Nereida',
    stepTitle: 'En espera',
    objective: 'La Coalición observa.',
    nextAction: 'Completa la Misión 05.',
    hint: '',
    target: 'none'
  },
  returnToBase: {
    id: 'returnToBase',
    title: 'Misión 06: Blindaje de Nereida',
    stepTitle: 'Análisis de Datos',
    objective: 'Regresa a Base Nereida para analizar los datos de la Sonda Silenciosa.',
    nextAction: 'Acércate al módulo hábitat.',
    hint: 'La sonda dejó rastros de telemetría en el sistema local.',
    target: 'base'
  },
  analyzeResidue: {
    id: 'analyzeResidue',
    title: 'Misión 06: Blindaje de Nereida',
    stepTitle: 'Análisis de Interferencia',
    objective: 'Analiza los residuos de interferencia capturados durante la retirada de la sonda.',
    nextAction: 'Usa E en la consola de Base Nereida.',
    hint: 'Debemos entender qué detectaron.',
    target: 'base'
  },
  calibrateMatrix: {
    id: 'calibrateMatrix',
    title: 'Misión 06: Blindaje de Nereida',
    stepTitle: 'Matriz de Ocultamiento',
    objective: 'Calibra la Matriz de Ocultamiento con los residuos de interferencia.',
    nextAction: 'Usa E en Base Nereida para calibrar la matriz.',
    hint: 'La matriz convertirá los rastros de la sonda en una máscara de baja firma.',
    target: 'base'
  },
  deployNorth: {
    id: 'deployNorth',
    title: 'Misión 06: Blindaje de Nereida',
    stepTitle: 'Proyector Norte',
    objective: 'Despliega el Proyector Norte.',
    nextAction: 'Llega a la coordenada y calibra con E.',
    hint: 'Evita encender el proyector fuera de la zona designada.',
    target: 'projectorNorth'
  },
  deployEast: {
    id: 'deployEast',
    title: 'Misión 06: Blindaje de Nereida',
    stepTitle: 'Proyector Este',
    objective: 'Despliega el Proyector Este.',
    nextAction: 'Llega a la coordenada y calibra con E.',
    hint: 'Cada proyector reducirá la firma térmica.',
    target: 'projectorEast'
  },
  deploySouth: {
    id: 'deploySouth',
    title: 'Misión 06: Blindaje de Nereida',
    stepTitle: 'Proyector Sur',
    objective: 'Despliega el Proyector Sur.',
    nextAction: 'Llega a la coordenada y calibra con E.',
    hint: 'Último vértice del triángulo de ocultamiento.',
    target: 'projectorSouth'
  },
  syncMatrix: {
    id: 'syncMatrix',
    title: 'Misión 06: Blindaje de Nereida',
    stepTitle: 'Sincronización',
    objective: 'Vuelve a la Base para sincronizar el campo.',
    nextAction: 'Mantén E en Base Nereida hasta completar el blindaje.',
    hint: 'El campo de ocultamiento necesita calibración central.',
    target: 'base'
  },
  completed: {
    id: 'completed',
    title: 'Misión 06: Blindaje de Nereida',
    stepTitle: 'Firma Reducida',
    objective: 'Base Nereida blindada y parcialmente oculta.',
    nextAction: 'A la espera de nuevos desarrollos.',
    hint: 'La Coalición del Silencio tendrá más dificultades para localizarnos.',
    target: 'none'
  }
};
