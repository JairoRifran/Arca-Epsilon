/** Mission 23 "La contraofensiva". */
export type Mission23StepId =
  | 'inactive'
  | 'counteroffensiveCouncil'
  | 'synchronizeJointForces'
  | 'chooseTargetOrder'
  | 'approachJammerNode'
  | 'destroyJammerNode'
  | 'approachLogisticsPlatform'
  | 'disablePlatformDefenses'
  | 'destroyLogisticsCore'
  | 'approachJumpBeacon'
  | 'disableBeaconAnchors'
  | 'collapseJumpBeacon'
  | 'escapeDistortion'
  | 'recoverEnemyRoute'
  | 'confirmReturnToArk'
  | 'completed';

export type Mission23PrimaryTarget = 'jammer' | 'logistics';
export type Mission23TargetId = Mission23PrimaryTarget | 'jumpBeacon';
export type Mission23PlatformMethod = 'none' | 'controlledDestruction' | 'overload' | 'powerCut';
export type Mission23Target = 'ark' | 'choice' | Mission23TargetId | 'escape' | 'route' | 'none';

export type Mission23StepDefinition = {
  id: Mission23StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission23Target;
};

export const MISSION23_TARGET_LABELS: Record<Mission23TargetId, string> = {
  jammer: 'INTERFERIDOR ORBITAL',
  logistics: 'PLATAFORMA LOGÍSTICA',
  jumpBeacon: 'BALIZA DE SALTO'
};

export const MISSION23_PLATFORM_METHOD_LABELS: Record<Exclude<Mission23PlatformMethod, 'none'>, string> = {
  controlledDestruction: 'DESTRUCCIÓN CONTROLADA',
  overload: 'SOBRECARGA',
  powerCut: 'CORTE DE ENERGÍA'
};

export const mission23Tuning = {
  councilSeconds: 3.2,
  synchronizationSeconds: 4.8,
  commandRange: 360,
  approachRange: 430,
  triangulationRange: 720,
  triangulationSeconds: 1.6,
  jammerEscortCount: 4,
  logisticsEscortCount: 4,
  beaconEscortCount: 5,
  platformDefenseHealth: 84,
  platformEnergyHealth: 96,
  platformCoreHealth: 156,
  platformSupportDamage: 12,
  platformSupportInterval: 0.9,
  beaconAnchorHealth: 72,
  beaconCollapseSeconds: 5.2,
  escapeWindowSeconds: 14,
  escapeSafeDistance: 920,
  routeRecoverySeconds: 3.4,
  targetPositions: {
    // M20-M23 currently run in the shared surface flight volume. Keep these
    // orbital contacts above the terrain and below its 160 m flight ceiling so
    // their real geometry and weapon targets remain reachable.
    logistics: [1060, 120, -1160],
    jumpBeacon: [240, 180, -1780]
  } as const
} as const;

const title = 'Misión 23: La contraofensiva';

export const mission23Steps: Record<Mission23StepId, Mission23StepDefinition> = {
  inactive: { id: 'inactive', title, stepTitle: 'En espera', objective: 'Los nodos enemigos siguen activos.', nextAction: 'Completa la Misión 22.', hint: 'La contraofensiva aún no está autorizada.', target: 'none' },
  counteroffensiveCouncil: { id: 'counteroffensiveCouncil', title, stepTitle: 'Consejo de ataque', objective: 'Revisa los tres nodos y autoriza la primera contraofensiva humana.', nextAction: 'Escucha al consejo conjunto.', hint: 'Seguir defendiendo tres frentes no es sostenible.', target: 'ark' },
  synchronizeJointForces: { id: 'synchronizeJointForces', title, stepTitle: 'Preparar red conjunta', objective: 'Sincroniza Arca, Aurora, Nereida y la red Pleyadiana.', nextAction: 'Permanece junto al Arca para completar la sincronización.', hint: 'La prioridad elegida en M22 aporta una ventaja inicial.', target: 'ark' },
  chooseTargetOrder: { id: 'chooseTargetOrder', title, stepTitle: 'Orden de objetivos', objective: 'Elige si atacar primero el interferidor o la plataforma logística.', nextAction: 'Selecciona el primer objetivo.', hint: 'La baliza de salto permanecerá como objetivo final.', target: 'choice' },
  approachJammerNode: { id: 'approachJammerNode', title, stepTitle: 'Triangular interferidor', objective: 'Obtén tres lecturas para localizar el núcleo del interferidor.', nextAction: 'Acércate y registra cada lectura con E.', hint: 'El lock-on seguirá degradado hasta exponer el núcleo.', target: 'jammer' },
  destroyJammerNode: { id: 'destroyJammerNode', title, stepTitle: 'Neutralizar interferidor', objective: 'Destruye las escoltas y neutraliza el núcleo expuesto.', nextAction: 'Fija blancos y usa las armas existentes.', hint: 'Nereida mantendrá la triangulación estable.', target: 'jammer' },
  approachLogisticsPlatform: { id: 'approachLogisticsPlatform', title, stepTitle: 'Aproximación logística', objective: 'Alcanza la plataforma que abastece la ofensiva enemiga.', nextAction: 'Viaja hasta la plataforma logística.', hint: 'No es una nave capital: ataca sus sistemas funcionales.', target: 'logistics' },
  disablePlatformDefenses: { id: 'disablePlatformDefenses', title, stepTitle: 'Desarmar plataforma', objective: 'Desactiva defensa exterior y depósitos energéticos en orden.', nextAction: 'Ataca el módulo marcado.', hint: 'Aurora aporta sensores para identificar puntos vulnerables.', target: 'logistics' },
  destroyLogisticsCore: { id: 'destroyLogisticsCore', title, stepTitle: 'Núcleo logístico', objective: 'Elige un método y ejecuta el ataque coordinado.', nextAction: 'Selecciona el método y destruye el núcleo.', hint: 'La elección cambia la respuesta visual, no el desenlace.', target: 'logistics' },
  approachJumpBeacon: { id: 'approachJumpBeacon', title, stepTitle: 'Baliza de salto', objective: 'Localiza la estructura que mantiene abierta la ruta enemiga.', nextAction: 'Viaja hasta la baliza de salto.', hint: 'Es el objetivo final y mejor defendido.', target: 'jumpBeacon' },
  disableBeaconAnchors: { id: 'disableBeaconAnchors', title, stepTitle: 'Anclajes energéticos', objective: 'Desactiva los tres anclajes que estabilizan la ruta.', nextAction: 'Destruye los anclajes marcados.', hint: 'El núcleo no puede colapsarse mientras un anclaje siga activo.', target: 'jumpBeacon' },
  collapseJumpBeacon: { id: 'collapseJumpBeacon', title, stepTitle: 'Colapso sincronizado', objective: 'Despeja la escolta y sincroniza el pulso Pleyadiano.', nextAction: 'Mantén posición y completa el pulso.', hint: 'El colapso expondrá la ruta de la Coalición.', target: 'jumpBeacon' },
  escapeDistortion: { id: 'escapeDistortion', title, stepTitle: 'Evacuar distorsión', objective: 'Aléjate de la baliza antes de la siguiente onda energética.', nextAction: 'Acelera fuera de la zona de colapso.', hint: 'Un fallo reinicia el tramo de escape, nunca destruye la nave.', target: 'escape' },
  recoverEnemyRoute: { id: 'recoverEnemyRoute', title, stepTitle: 'Recuperar ruta', objective: 'Integra en la nave los datos expulsados por la baliza.', nextAction: 'Pulsa E para recuperar la ruta enemiga.', hint: 'Los datos señalan una concentración de fuerzas.', target: 'route' },
  confirmReturnToArk: { id: 'confirmReturnToArk', title, stepTitle: 'Regreso al Arca', objective: 'Regresa al Arca y confirma el destino de la fuerza enemiga.', nextAction: 'Acércate al Arca y confirma con E.', hint: 'Todo converge en el sector donde comenzó la misión.', target: 'ark' },
  completed: { id: 'completed', title, stepTitle: 'Ruta enemiga recuperada', objective: 'La contraofensiva neutralizó los tres nodos.', nextAction: 'Prepárate para regresar al origen.', hint: 'Misión 24 desbloqueada, aún no iniciada.', target: 'none' }
};
