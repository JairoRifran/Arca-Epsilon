export type Mission07StepId =
  | 'inactive'
  | 'analyzeSignal'
  | 'travelToFracture'
  | 'scanNorth'
  | 'scanCentral'
  | 'scanSouth'
  | 'activateArchive'
  | 'completed';

export type Mission07Target = 'base' | 'fracture' | 'nodeNorth' | 'nodeCentral' | 'nodeSouth' | 'archive' | 'none';

export type Mission07StepDefinition = {
  id: Mission07StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission07Target;
};

export type AtlasEchoNodeDefinition = {
  id: string;
  name: string;
  shortName: string;
  position: readonly [number, number];
};

export const atlasFractureDefinition = {
  id: 'atlas-fracture',
  name: 'Fractura Atlas',
  position: [-590, 115] as const
} as const;

export const atlasEchoNodeDefinitions: readonly AtlasEchoNodeDefinition[] = [
  {
    id: 'atlas-echo-node-north',
    name: 'Nodo Eco Norte',
    shortName: 'Norte',
    position: [-620, 72]
  },
  {
    id: 'atlas-echo-node-central',
    name: 'Nodo Eco Central',
    shortName: 'Central',
    position: [-578, 118]
  },
  {
    id: 'atlas-echo-node-south',
    name: 'Nodo Eco Sur',
    shortName: 'Sur',
    position: [-610, 166]
  }
] as const;

export const atlasSeedArchiveDefinition = {
  id: 'atlas-seed-archive',
  name: 'Archivo Semilla Atlas',
  position: [-548, 132] as const
} as const;

export const mission07Tuning = {
  baseInteractionRange: 52,
  fractureArrivalRange: 72,
  nodeScanRange: 8.5,
  archiveActivationRange: 10
} as const;

export const mission07Steps: Record<Mission07StepId, Mission07StepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'Misión 07: Ecos bajo la corteza',
    stepTitle: 'En espera',
    objective: 'El blindaje de Nereida debe estar online antes de leer señales profundas.',
    nextAction: 'Completa la Misión 06.',
    hint: 'La Matriz de Ocultamiento aun no ha bajado el ruido suficiente.',
    target: 'none'
  },
  analyzeSignal: {
    id: 'analyzeSignal',
    title: 'Misión 07: Ecos bajo la corteza',
    stepTitle: 'Señal Subterránea',
    objective: 'Analiza la señal subterránea desde Base Nereida.',
    nextAction: 'Usa E en la consola de Base Nereida.',
    hint: 'La señal aparece solo después de reducir la firma electromagnética de la base.',
    target: 'base'
  },
  travelToFracture: {
    id: 'travelToFracture',
    title: 'Misión 07: Ecos bajo la corteza',
    stepTitle: 'Fractura Atlas',
    objective: 'Viaja hasta la Fractura Atlas revelada por la Matriz de Ocultamiento.',
    nextAction: 'Llega a la Fractura Atlas y desciende con F.',
    hint: 'La zona marcada está separada de los recursos de Base Nereida.',
    target: 'fracture'
  },
  scanNorth: {
    id: 'scanNorth',
    title: 'Misión 07: Ecos bajo la corteza',
    stepTitle: 'Nodo Eco Norte',
    objective: 'Escanea el Nodo Eco Norte.',
    nextAction: 'Acércate a pie y usa E.',
    hint: 'Los nodos responden mejor a baja emisión, lejos de los sistemas de la nave.',
    target: 'nodeNorth'
  },
  scanCentral: {
    id: 'scanCentral',
    title: 'Misión 07: Ecos bajo la corteza',
    stepTitle: 'Nodo Eco Central',
    objective: 'Escanea el Nodo Eco Central.',
    nextAction: 'Acércate a pie y usa E.',
    hint: 'Cada lectura recompone una parte del archivo enterrado.',
    target: 'nodeCentral'
  },
  scanSouth: {
    id: 'scanSouth',
    title: 'Misión 07: Ecos bajo la corteza',
    stepTitle: 'Nodo Eco Sur',
    objective: 'Escanea el Nodo Eco Sur.',
    nextAction: 'Acércate a pie y usa E.',
    hint: 'Último eco antes de desbloquear el Archivo Semilla.',
    target: 'nodeSouth'
  },
  activateArchive: {
    id: 'activateArchive',
    title: 'Misión 07: Ecos bajo la corteza',
    stepTitle: 'Archivo Semilla Atlas',
    objective: 'Activa el Archivo Semilla Atlas.',
    nextAction: 'Usa E junto al archivo.',
    hint: 'El archivo no emite una llamada; espera una confirmación local.',
    target: 'archive'
  },
  completed: {
    id: 'completed',
    title: 'Misión 07: Ecos bajo la corteza',
    stepTitle: 'Mundo Semilla',
    objective: 'E-01 fue preparado por la Red Atlas como mundo semilla.',
    nextAction: 'Misión 08 preparada. No iniciada.',
    hint: 'La Red Atlas preservó condiciones para civilizaciones emergentes.',
    target: 'archive'
  }
};
