/** Mission 21 "La ruptura del Silencio". */
export type Mission21StepId =
  | 'inactive'
  | 'decryptTransmission'
  | 'detectCapitalShip'
  | 'analyzeSignature'
  | 'receiveUltimatum'
  | 'chooseResponse'
  | 'restoreThreeChannels'
  | 'witnessDemonstration'
  | 'classifyAttackRoutes'
  | 'activatePleyadianNetwork'
  | 'detectSimultaneousAssault'
  | 'completed';

export type CoalitionResponseTone = 'none' | 'defiant' | 'diplomatic' | 'strategic';

export type Mission21Target =
  | 'ark'
  | 'capital'
  | 'response'
  | 'link'
  | 'beacon'
  | 'routes'
  | 'network'
  | 'none';

export type Mission21StepDefinition = {
  id: Mission21StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission21Target;
};

export type Mission21ChannelId = 'human' | 'pleyadian' | 'coalition';
export const MISSION21_CHANNEL_ORDER: readonly Mission21ChannelId[] = ['human', 'pleyadian', 'coalition'];
export const MISSION21_CHANNEL_LABELS: Record<Mission21ChannelId, string> = {
  human: 'FRECUENCIA HUMANA',
  pleyadian: 'FRECUENCIA PLEYADIANA',
  coalition: 'FRECUENCIA ENEMIGA'
};

export type EnclaveChannelId = 'aurora' | 'nereida' | 'ark';
export const ENCLAVE_CHANNEL_ORDER: readonly EnclaveChannelId[] = ['aurora', 'nereida', 'ark'];
export const ENCLAVE_CHANNEL_LABELS: Record<EnclaveChannelId, string> = {
  aurora: 'CANAL AURORA',
  nereida: 'CANAL NEREIDA',
  ark: 'CANAL DEL ARCA'
};

export type AttackRouteId = 'aurora' | 'nereida' | 'orbital';
export const ATTACK_ROUTE_ORDER: readonly AttackRouteId[] = ['aurora', 'nereida', 'orbital'];
export const ATTACK_ROUTE_LABELS: Record<AttackRouteId, string> = {
  aurora: 'RUTA AURORA',
  nereida: 'RUTA NEREIDA',
  orbital: 'RUTA ORBITAL'
};

export const mission21Tuning = {
  arkRange: 330,
  linkRange: 72,
  alignChannelSeconds: 2.4,
  capitalRevealSeconds: 3.2,
  signatureAnalysisSeconds: 4.2,
  ultimatumSeconds: 3.6,
  restoreChannelSeconds: 2.8,
  demonstrationSeconds: 3.4,
  classifyRouteSeconds: 2.2,
  networkActivationSeconds: 4.5,
  assaultDetectionSeconds: 4,
  visualUpdateInterval: 0.1,
  /** Offset from the Ark. Kept inside the camera far plane but well outside combat range. */
  capitalOffset: [1900, 620, -2850] as const,
  remoteBeaconOffset: [920, 260, -1280] as const,
  attackRouteOffsets: [
    [-1200, -360, 1800],
    [500, -420, 1960],
    [1120, 240, 420]
  ] as const
} as const;

const title = 'Misión 21: La ruptura del Silencio';

export const mission21Steps: Record<Mission21StepId, Mission21StepDefinition> = {
  inactive: {
    id: 'inactive', title, stepTitle: 'En espera',
    objective: 'La transmisión cifrada continúa fuera de los canales conocidos.',
    nextAction: 'Completa la Misión 20.',
    hint: 'El Arca resistió, pero algo mucho mayor entró al sistema.',
    target: 'none'
  },
  decryptTransmission: {
    id: 'decryptTransmission', title, stepTitle: 'Descifrar la transmisión',
    objective: 'Permanece junto al Arca y alinea las frecuencias humana, Pleyadiana y enemiga.',
    nextAction: 'Mantente cerca del Arca mientras se restauran los tres canales.',
    hint: 'Los daños de M20 dejaron las portadoras fuera de fase.',
    target: 'ark'
  },
  detectCapitalShip: {
    id: 'detectCapitalShip', title, stepTitle: 'Presencia capital',
    objective: 'Confirma la enorme firma que acaba de entrar al límite del sistema.',
    nextAction: 'Observa la firma distante.',
    hint: 'No se acerca. Todavía.',
    target: 'capital'
  },
  analyzeSignature: {
    id: 'analyzeSignature', title, stepTitle: 'Identificación',
    objective: 'Analiza masa, energía, patrón de salto y plataformas auxiliares.',
    nextAction: 'Permanece junto al Arca para completar el análisis.',
    hint: 'La lectura supera ampliamente a todas las unidades anteriores.',
    target: 'ark'
  },
  receiveUltimatum: {
    id: 'receiveUltimatum', title, stepTitle: 'Ultimátum',
    objective: 'Escucha las exigencias de la Coalición del Silencio.',
    nextAction: 'Mantén abierto el canal forzado.',
    hint: 'Sin rostro. Sin negociación. Solo condiciones.',
    target: 'capital'
  },
  chooseResponse: {
    id: 'chooseResponse', title, stepTitle: 'Respuesta humana',
    objective: 'Define el tono de la respuesta conjunta de Aurora, Nereida y el Arca.',
    nextAction: 'Elige una respuesta.',
    hint: 'El tono quedará registrado; la defensa común no cambia.',
    target: 'response'
  },
  restoreThreeChannels: {
    id: 'restoreThreeChannels', title, stepTitle: 'Interferencia total',
    objective: 'Recupera los canales de Aurora, Nereida y el Arca.',
    nextAction: 'Vuela al enlace indicado y estabilízalo.',
    hint: 'La Coalición intenta aislar los tres enclaves antes de atacar.',
    target: 'link'
  },
  witnessDemonstration: {
    id: 'witnessDemonstration', title, stepTitle: 'Prueba de fuerza',
    objective: 'Registra la destrucción de la baliza orbital remota.',
    nextAction: 'Observa la telemetría de la baliza.',
    hint: 'Un solo pulso. Ningún arma humana alcanzaría esa distancia.',
    target: 'beacon'
  },
  classifyAttackRoutes: {
    id: 'classifyAttackRoutes', title, stepTitle: 'Marcado de objetivos',
    objective: 'Clasifica las rutas hostiles hacia Aurora, Nereida y la red orbital.',
    nextAction: 'Permanece junto al Arca mientras se clasifican las tres rutas.',
    hint: 'Las firmas se separan. No es una amenaza única.',
    target: 'routes'
  },
  activatePleyadianNetwork: {
    id: 'activatePleyadianNetwork', title, stepTitle: 'Red Pleyadiana',
    objective: 'Activa el enlace Pleyadiano parcial y prepara la resistencia conjunta.',
    nextAction: 'Mantente junto al Arca para sincronizar la red.',
    hint: 'Los Pleyadianos pueden enlazarnos. No pueden ganar esta guerra solos.',
    target: 'network'
  },
  detectSimultaneousAssault: {
    id: 'detectSimultaneousAssault', title, stepTitle: 'Ruptura',
    objective: 'Confirma los ataques simultáneos contra los tres frentes.',
    nextAction: 'Revisa las alarmas de Aurora, Nereida y órbita.',
    hint: 'El Silencio terminó.',
    target: 'routes'
  },
  completed: {
    id: 'completed', title, stepTitle: 'Frentes rotos',
    objective: 'Los tres enclaves están bajo ataque. El Arca permanece operativo.',
    nextAction: 'Mantén la red de resistencia preparada.',
    hint: 'Misión 22 desbloqueada. Todavía no comienza.',
    target: 'none'
  }
};
