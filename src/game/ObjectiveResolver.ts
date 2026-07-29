import type { MissionStepId } from '../assets/missionDefinitions';
import type { SurfaceMissionStep } from './FirstFootholdMission';
import type { PlayerMode } from './PlayerModeSystem';

export type ObjectivePhase = 'space' | 'descent' | 'surface' | 'colonization';
export type ObjectiveUrgency = 'normal' | 'attention' | 'critical' | 'complete';

export type ObjectiveDisplay = {
  missionTitle: string;
  stepTitle: string;
  objectiveText: string;
  keyHint: string;
  targetName: string;
  targetDistance: number;
  blockedReason: string;
  missingRequirements: string[];
  title: string;
  step: string;
  objective: string;
  nextAction: string;
  key: string;
  target: string;
  distance: number;
  phase: ObjectivePhase;
  urgency: ObjectiveUrgency;
  playerMode: PlayerMode;
  onFoot: boolean;
  shouldExitShip: boolean;
  shouldReturnToShip: boolean;
};

export type ObjectiveResolverContext = {
  phase: ObjectivePhase;
  missionStep?: MissionStepId;
  missionTitle: string;
  stepTitle?: string;
  objective: string;
  nextAction: string;
  target: string;
  distance: number;
  surfaceStep?: SurfaceMissionStep;
  activeStep?: {
    id: string;
    title: string;
    stepTitle: string;
    objective: string;
    nextAction: string;
  };
  heat?: number;
  stability?: number;
  hazardActive?: boolean;
  playerMode?: PlayerMode;
  onFoot?: boolean;
  shouldExitShip?: boolean;
  shouldReturnToShip?: boolean;
  actionOverride?: string;
  keyOverride?: string;
  blockedReason?: string;
  missingRequirements?: string[];
};

const KEY_BY_SPACE_STEP: Partial<Record<MissionStepId, string>> = {
  scannerTutorial: 'E',
  followSignal: 'WASD',
  scanPlanet: 'E',
  analyzeHabitability: 'WASD',
  surviveComplication: 'WASD',
  scanOrbitalMarker: 'E',
  decodeDescentCorridor: 'WASD',
  approachPlanet: 'WASD',
  atmosphericEntry: 'WASD',
  landingApproach: 'WASD',
  touchdown: 'E',
  firstFoothold: 'E',
  transmitData: 'E'
};

function inferKey(action: string): string {
  const match = action.match(/\b(WASD|Shift|Space|Espacio|[EFMQRV])\b/i);
  return match ? match[1].toUpperCase() : '';
}

export function getCurrentObjectiveDisplay(context: ObjectiveResolverContext): ObjectiveDisplay {
  const activeStep = context.activeStep ?? context.surfaceStep;
  const step = activeStep?.id ?? context.missionStep ?? 'unknown';
  const baseNextAction = context.actionOverride ?? activeStep?.nextAction ?? context.nextAction;
  const nextAction = context.actionOverride
    ? baseNextAction
    : context.shouldExitShip
    ? `${baseNextAction} Opcional: presiona F para descender de la nave.`
    : context.shouldReturnToShip
      ? `${baseNextAction} La nave permanece disponible para embarcar con F.`
      : baseNextAction;
  const key = context.keyOverride !== undefined
    ? context.keyOverride
    : context.shouldReturnToShip
    ? 'F'
    : context.shouldExitShip
      ? 'F'
      : activeStep
        ? inferKey(activeStep.nextAction)
        : KEY_BY_SPACE_STEP[context.missionStep ?? 'briefing'] ?? inferKey(context.nextAction);

  let urgency: ObjectiveUrgency = 'normal';
  if (context.hazardActive || (context.heat ?? 0) >= 82 || (context.stability ?? 100) <= 42) {
    urgency = 'critical';
  } else if (context.phase === 'descent' || (context.distance > 0 && context.distance < 70)) {
    urgency = 'attention';
  }
  if (step === 'missionComplete' || step === 'prepareExpansion' || step === 'completed') {
    urgency = 'complete';
  }

  return {
    missionTitle: context.missionTitle,
    stepTitle: activeStep?.stepTitle ?? context.stepTitle ?? activeStep?.title ?? step,
    objectiveText: activeStep?.objective ?? context.objective,
    keyHint: key,
    targetName: context.target,
    targetDistance: Number.isFinite(context.distance) ? Math.max(0, context.distance) : Number.POSITIVE_INFINITY,
    blockedReason: context.blockedReason ?? '',
    missingRequirements: [...(context.missingRequirements ?? [])],
    title: activeStep?.title ?? context.missionTitle,
    step,
    objective: activeStep?.objective ?? context.objective,
    nextAction,
    key,
    target: context.target,
    distance: Number.isFinite(context.distance) ? Math.max(0, context.distance) : Number.POSITIVE_INFINITY,
    phase: context.phase,
    urgency,
    playerMode: context.playerMode ?? 'SHIP_SPACE',
    onFoot: context.onFoot ?? false,
    shouldExitShip: context.shouldExitShip ?? false,
    shouldReturnToShip: context.shouldReturnToShip ?? false
  };
}
