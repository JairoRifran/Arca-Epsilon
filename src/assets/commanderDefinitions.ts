export type DialogueSpeakerId =
  | 'commander-soren'
  | 'arca-ai'
  | 'base-nereida'
  | 'pleyadan'
  | 'unknown-signal'
  | 'coalition-silence'
  | 'aurora-crew';

export type DialogueSpeakerDefinition = {
  id: DialogueSpeakerId;
  name: string;
  role: string;
  portraitLabel: string;
  signalClass: 'human' | 'ai' | 'base' | 'alien' | 'unknown';
};

export const dialogueSpeakers: Record<DialogueSpeakerId, DialogueSpeakerDefinition> = {
  'commander-soren': {
    id: 'commander-soren',
    name: 'Comandante Valeria Soren',
    role: 'Comando de Arca Epsilon',
    portraitLabel: 'VS',
    signalClass: 'human'
  },
  'arca-ai': {
    id: 'arca-ai',
    name: 'IA de Arca Epsilon',
    role: 'Núcleo de navegación colonial',
    portraitLabel: 'AE',
    signalClass: 'ai'
  },
  'base-nereida': {
    id: 'base-nereida',
    name: 'Base Nereida',
    role: 'Sistema colonial E-01',
    portraitLabel: 'BN',
    signalClass: 'base'
  },
  pleyadan: {
    id: 'pleyadan',
    name: 'Transmisión Pleyadana',
    role: 'Origen no humano confirmado',
    portraitLabel: 'P',
    signalClass: 'alien'
  },
  'unknown-signal': {
    id: 'unknown-signal',
    name: 'Señal desconocida',
    role: 'Canal sin identificar',
    portraitLabel: '?',
    signalClass: 'unknown'
  },
  'coalition-silence': {
    id: 'coalition-silence',
    name: 'Coalición del Silencio',
    role: 'Canal colectivo // Origen hostil',
    portraitLabel: 'CS',
    signalClass: 'unknown'
  },
  // The first three people living on Aurora. The voice pipeline only
  // generates speakers listed in its own speakerConfigs, so these lines stay
  // text-only until a voice is configured for this channel — by design, not
  // by omission.
  'aurora-crew': {
    id: 'aurora-crew',
    name: 'Tripulación Aurora',
    role: 'Primeros habitantes // Núcleo Aurora',
    portraitLabel: 'TA',
    signalClass: 'human'
  }
};

export const commanderDefinition = dialogueSpeakers['commander-soren'];
