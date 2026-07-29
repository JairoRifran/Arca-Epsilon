/**
 * Prologue of Mission 01: the departure from Arca Epsilon.
 *
 * The game used to open with the scout already adrift in space while Command
 * talked over it. This sequence puts the ship where it belongs at minute zero —
 * clamped to the lateral launch platform Epsilon-3 that `Mothership` already
 * builds — and makes the player earn the first metres of flight.
 *
 * Nothing here replaces M01: the sequence ends by handing over to
 * `scannerTutorial`, M01's real first step, whose objective ("leave the safe
 * zone and run the long-range sweep") is exactly what undocking leads into.
 */

export type ArkDepartureStepId =
  | 'inactive'
  | 'dockedAtArk'
  | 'commanderIntroduction'
  | 'missionContext'
  | 'preflightCheck'
  | 'readyForRelease'
  | 'releaseDockingClamps'
  | 'undocking'
  | 'clearArk'
  | 'completed';

export type ArkDepartureStepDefinition = {
  id: ArkDepartureStepId;
  title: string;
  objective: string;
  nextAction: string;
  hint: string;
};

/**
 * The five checks of the pre-flight pass. Deliberately one interaction, not
 * five errands: they resolve in sequence off a single held check so the
 * prologue stays an introduction rather than a chore list.
 */
export const ARK_SYSTEM_CHECKS = ['energía', 'motores', 'navegación', 'comunicaciones', 'casco'] as const;
export type ArkSystemCheckId = (typeof ARK_SYSTEM_CHECKS)[number];

export const arkDepartureTuning = {
  /** Seconds of held interaction to walk the five system checks. */
  preflightSeconds: 4.2,
  /** Seconds for the clamps to swing fully open once release starts. */
  clampReleaseSeconds: 3.4,
  /**
   * Metres from the cradle at which the exit corridor is considered cleared:
   * manoeuvring thrusters give way to normal flight and weapons come back.
   * Comfortably inside the Ark's 235 m safe zone, so clearing the corridor
   * does not require leaving the perimeter — that is M01's job, not ours.
   */
  safeDistance: 140,
  /**
   * Fraction of normal thrust available between clamp release and safe
   * distance. Enough to manoeuvre away deliberately, not enough to bolt.
   *
   * Tuned against the real flight model rather than guessed: at this cap the
   * hull pulls away from the cradle at roughly 4-5 m/s, so the corridor takes
   * about half a minute to clear — long enough for a kilometre-class hull to
   * slide past the canopy and read as enormous, short enough not to be a wait.
   */
  undockThrustLimit: 0.7,
  /** Distance under which the ship is still considered inside the corridor. */
  corridorLength: 90,
  /** Seconds the chapter title stays on screen. Never blocks the camera. */
  titleSeconds: 6.5
} as const;

export const arkDepartureSteps: Record<ArkDepartureStepId, ArkDepartureStepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'En espera',
    objective: '',
    nextAction: '',
    hint: ''
  },
  dockedAtArk: {
    id: 'dockedAtArk',
    title: 'Plataforma Epsilon-3',
    objective: 'Escuchá a la comandante del Arca Epsilon.',
    nextAction: 'Mirá alrededor mientras se abre el canal.',
    hint: 'La nave sigue anclada a la plataforma de lanzamiento.'
  },
  commanderIntroduction: {
    id: 'commanderIntroduction',
    title: 'Comando de Arca Epsilon',
    objective: 'Escuchá la presentación de la comandante.',
    nextAction: 'Avanzá el diálogo cuando termine cada línea.',
    hint: 'Los anclajes permanecen cerrados hasta que Comando lo autorice.'
  },
  missionContext: {
    id: 'missionContext',
    title: 'Protocolo Éxodo',
    objective: 'Recibí el contexto de la misión.',
    nextAction: 'Escuchá por qué el Arca no puede descender.',
    hint: 'E-01 es la primera candidata real desde que dejamos la Tierra.'
  },
  preflightCheck: {
    id: 'preflightCheck',
    title: 'Revisión previa al vuelo',
    objective: 'Comprobá los sistemas de la nave.',
    nextAction: 'Mantené E para recorrer energía, motores, navegación, comunicaciones y casco.',
    hint: 'Soltar la interacción pausa la revisión, no la reinicia.'
  },
  readyForRelease: {
    id: 'readyForRelease',
    title: 'Sistemas operativos',
    objective: 'Liberá los anclajes de la plataforma.',
    nextAction: 'Presioná E para iniciar la liberación.',
    hint: 'El corredor de salida ya está autorizado por Comando.'
  },
  releaseDockingClamps: {
    id: 'releaseDockingClamps',
    title: 'Liberando anclajes',
    objective: 'Esperá la apertura completa de los anclajes.',
    nextAction: 'El conducto umbilical se está retirando.',
    hint: 'La vibración es normal: son los brazos de amarre abriéndose.'
  },
  undocking: {
    id: 'undocking',
    title: 'Desacople',
    objective: 'Separate de la plataforma con propulsores de maniobra.',
    nextAction: 'Usá el empuje suave para salir del corredor de lanzamiento.',
    hint: 'Los motores principales siguen limitados dentro del corredor.'
  },
  clearArk: {
    id: 'clearArk',
    title: 'Corredor de salida',
    objective: 'Alejate del Arca hasta distancia segura.',
    nextAction: 'Mantené rumbo hacia el exterior del corredor.',
    hint: 'A distancia segura se habilita el vuelo normal.'
  },
  completed: {
    id: 'completed',
    title: 'Vuelo normal',
    objective: 'Nave liberada del Arca Epsilon.',
    nextAction: 'Continuá con la Misión 01.',
    hint: ''
  }
};

/**
 * Commander lines for the prologue, in order. These ids have no generated
 * voice file, so `VoiceManager` finds nothing and the dialogue plays as text —
 * the documented degradation path, not a missing asset.
 */
export const ARK_DEPARTURE_DIALOGUE = {
  introduction: 'm01_prologue_commander_intro',
  context: 'm01_prologue_context',
  situation: 'm01_prologue_situation',
  firstTask: 'm01_prologue_first_task',
  preflight: 'm01_prologue_preflight',
  clampsReleased: 'm01_prologue_clamps_released',
  farewell: 'm01_prologue_farewell'
} as const;

/** Chapter card shown once, briefly, at the start of a new game. */
export const ARK_DEPARTURE_TITLE = {
  game: 'ARCA EPSILON',
  chapter: 'CAPÍTULO I',
  mission: 'Misión 01: Buscar un Nuevo Hogar'
} as const;
