import type { Mission22FrontChoice } from './mission22Definitions';

export type Mission25StateId =
  | 'inactive'
  | 'awaitingTrigger'
  | 'finalBriefing'
  | 'threatDetected'
  | 'defensePerimeter'
  | 'arkSystemsUnderAttack'
  | 'relayDefense'
  | 'arkUnderPressure'
  | 'counterattackPreparation'
  | 'commandTargetLocated'
  | 'commandTargetProtected'
  | 'commandTargetExposed'
  | 'finalAssault'
  | 'threatCollapse'
  | 'arkStabilization'
  | 'chapterResolution'
  | 'completed';

export type Mission25Target = 'ark' | 'hostiles' | 'arkSystem' | 'relay' | 'commandTarget' | 'commandCore' | 'none';

export type Mission25StepDefinition = {
  id: Mission25StateId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission25Target;
};

export const MISSION25_STATE_ORDER: readonly Mission25StateId[] = [
  'inactive',
  'awaitingTrigger',
  'finalBriefing',
  'threatDetected',
  'defensePerimeter',
  'arkSystemsUnderAttack',
  'relayDefense',
  'arkUnderPressure',
  'counterattackPreparation',
  'commandTargetLocated',
  'commandTargetProtected',
  'commandTargetExposed',
  'finalAssault',
  'threatCollapse',
  'arkStabilization',
  'chapterResolution',
  'completed'
] as const;

export const MISSION25_SYSTEM_LABELS = [
  'MOTORES ORBITALES',
  'COMUNICACIONES',
  'NUCLEO DE ENERGIA'
] as const;

export const MISSION25_WAVE_COUNTS = [3, 4, 4, 5] as const;

export const mission25Tuning = {
  triggerDelaySeconds: 2.4,
  arkSectorRange: 520,
  interactionRange: 115,
  commandScanRange: 430,
  finalAssaultRange: 620,
  collapseSeconds: 3.4,
  stabilizationSeconds: 4.2,
  systemDamagePerPass: 6.5,
  minimumSystemIntegrity: 18,
  emergencyIntegrityThreshold: 28,
  emergencyRepairAmount: 18,
  nodeHealth: 96,
  commandCoreHealth: 264,
  visualUpdateInterval: 0.05,
  waveOriginOffsets: [
    [0, 72, -360],
    [340, 54, -80],
    [-330, 88, 90],
    [0, 105, -420]
  ] as const,
  commandTargetOffset: [0, 120, -760] as const
} as const;

export const MISSION25_PRIORITY_LABELS: Record<Mission22FrontChoice, string> = {
  none: 'SIN PRIORIDAD',
  aurora: 'COBERTURA AURORA',
  nereida: 'SOPORTE NEREIDA',
  orbital: 'VENTAJA ORBITAL'
};

const title = 'Mision 25: La ultima orbita';

function step(
  id: Mission25StateId,
  stepTitle: string,
  objective: string,
  nextAction: string,
  hint: string,
  target: Mission25Target
): Mission25StepDefinition {
  return { id, title, stepTitle, objective, nextAction, hint, target };
}

export const mission25Steps: Record<Mission25StateId, Mission25StepDefinition> = {
  inactive: step('inactive', 'En espera', 'La ultima orbita aun no esta disponible.', 'Completa la Mision 24.', 'El Arca conserva su posicion real.', 'none'),
  awaitingTrigger: step('awaitingTrigger', 'Control recuperado', 'Mantente junto al Arca mientras la red limpia el sector.', 'Espera la llamada de Valeria Soren.', 'M25 no comienza en el mismo frame que M24.', 'ark'),
  finalBriefing: step('finalBriefing', 'Ultimo perimetro', 'Recibe el parte final de la comandante.', 'Confirma el briefing junto al Arca con E.', 'E-01 depende de esta orbita.', 'ark'),
  threatDetected: step('threatDetected', 'Contactos hostiles', 'Identifica la formacion que entra al sector.', 'Escanea las firmas entrantes con E.', 'Todavia son firmas lejanas.', 'hostiles'),
  defensePerimeter: step('defensePerimeter', 'Defensa del perimetro', 'Intercepta la primera oleada antes de que alcance el Arca.', 'Fija blancos y dispara.', 'Los contactos prioritarios aparecen en el radar.', 'hostiles'),
  arkSystemsUnderAttack: step('arkSystemsUnderAttack', 'Sistemas bajo ataque', 'Protege los sistemas principales del Arca.', 'Intercepta atacantes y vigila la integridad.', 'Los impactos se aplican a anclas reales del casco.', 'arkSystem'),
  relayDefense: step('relayDefense', 'Reles de coordinacion', 'Sostene los reles que enlazan Aurora, Nereida y el Arca.', 'Elimina la oleada sobre la red conjunta.', 'El apoyo de M23 mantiene el enlace.', 'relay'),
  arkUnderPressure: step('arkUnderPressure', 'Arca bajo presion', 'Resiste el ultimo empuje sobre el casco.', 'Mantene el perimetro y prioriza atacantes.', 'No abandones el sector del Arca.', 'hostiles'),
  counterattackPreparation: step('counterattackPreparation', 'Preparar contraataque', 'Sincroniza la bateria principal con la red conjunta.', 'Acercate al Arca y confirma con E.', 'La prioridad de M22 modifica el apoyo disponible.', 'ark'),
  commandTargetLocated: step('commandTargetLocated', 'Centro de mando', 'La red localizo la matriz de mando enemiga.', 'Aproximata y analiza su proteccion con E.', 'El nucleo sigue protegido.', 'commandTarget'),
  commandTargetProtected: step('commandTargetProtected', 'Proteccion modular', 'Destruye los tres nodos que protegen el centro de mando.', 'Ataca los nodos marcados.', 'El nucleo no puede recibir dano todavia.', 'commandTarget'),
  commandTargetExposed: step('commandTargetExposed', 'Nucleo expuesto', 'La proteccion cayo; prepara la pasada final.', 'Entra en rango y confirma el ataque con E.', 'La red conjunta abre una ventana estable.', 'commandCore'),
  finalAssault: step('finalAssault', 'Ataque final', 'Neutraliza el nucleo de coordinacion.', 'Concentra el fuego sobre el nucleo expuesto.', 'El Arca debe permanecer dentro de tu campo visual.', 'commandCore'),
  threatCollapse: step('threatCollapse', 'Colapso de mando', 'El centro de mando esta colapsando.', 'Alejate del nucleo y observa la retirada.', 'Las fuerzas restantes pierden coordinacion.', 'commandTarget'),
  arkStabilization: step('arkStabilization', 'Estabilizar el Arca', 'Regresa al Arca y estabiliza sus sistemas.', 'Mantente junto al casco mientras la red se recupera.', 'No hay nuevas oleadas.', 'ark'),
  chapterResolution: step('chapterResolution', 'Mundo Semilla', 'Confirma que el corredor y E-01 siguen seguros.', 'Cierra el informe con E.', 'La victoria es local; la amenaza no desaparecio del universo.', 'ark'),
  completed: step('completed', 'Capitulo I completado', 'El Arca sobrevivio y E-01 puede convertirse en el Mundo Semilla.', 'Continua explorando el sector.', 'No se desbloquea una nueva mision.', 'none')
};
