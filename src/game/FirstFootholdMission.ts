import { surfaceLore } from '../assets/surfaceLoreEntries';
import type { ColonyState } from './ColonyManager';

export type SurfaceMissionStepId =
  | 'confirmArrival'
  | 'deployHabitat'
  | 'surveyResourceSites'
  | 'scanWater'
  | 'scanMinerals'
  | 'scanEnergy'
  | 'stabilizeLifeSupport'
  | 'baseOperational'
  | 'prepareExpansion';

export type SurfaceMissionStep = {
  id: SurfaceMissionStepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  completionCondition: string;
  voiceLine?: string;
  recommendedTarget?: 'landing' | 'habitat' | 'water' | 'minerals' | 'energy' | 'organic' | 'ancient';
  priority: number;
};

export class FirstFootholdMission {
  private stepIndex = 0;

  private latestColony?: ColonyState;

  active = false;

  readonly missionId = 'mission-02-first-foothold';

  readonly phase = 'surface';

  statusMessage = surfaceLore.systemsOnlineMessage;

  readonly steps: SurfaceMissionStep[] = [
    {
      id: 'confirmArrival',
      title: 'Mision 02: Primer Punto de Apoyo',
      stepTitle: 'Llegada a Cuenca Nereida',
      objective: 'Confirmar llegada a Cuenca Nereida.',
      nextAction: 'Verifica telemetria de superficie y prepara despliegue.',
      hint: 'El escaner planetario esta disponible.',
      completionCondition: 'Aterrizaje completado y fase de superficie activa.',
      voiceLine: surfaceLore.systemsOnlineMessage,
      recommendedTarget: 'landing',
      priority: 10
    },
    {
      id: 'deployHabitat',
      title: 'Mision 02: Primer Punto de Apoyo',
      stepTitle: 'Establecer el hábitat',
      objective: 'Desplegar Modulo Habitat Nereida-01.',
      nextAction: 'Presiona E en la zona de aterrizaje para fijar el modulo.',
      hint: 'El Modulo Habitat Nereida-01 proporciona refugio y soporte vital.',
      completionCondition: 'habitatOnline === true',
      voiceLine: surfaceLore.deployModuleObjective,
      recommendedTarget: 'landing',
      priority: 20
    },
    {
      id: 'surveyResourceSites',
      title: 'Mision 02: Primer Punto de Apoyo',
      stepTitle: 'Barrido geológico de base',
      objective: 'Usa el Hábitat Nereida-01 para revelar zonas de recursos.',
      nextAction: 'Regresa al módulo y presiona E para ejecutar el barrido geológico.',
      hint: 'El mapa local mostrará ubicaciones aproximadas, no recursos confirmados.',
      completionCondition: 'surfaceSitesRevealed === true',
      voiceLine: 'La antena del hábitat puede triangular agua, minerales y calor geotérmico.',
      recommendedTarget: 'habitat',
      priority: 25
    },
    {
      id: 'scanWater',
      title: 'Mision 02: Primer Punto de Apoyo',
      stepTitle: 'Expedición a Laguna Nereida',
      objective: 'Localiza Laguna Nereida y confirma una muestra de agua.',
      nextAction: 'Viaja en la nave, localiza el sitio con E y toma una muestra a pie.',
      hint: 'Pulsa M para abrir el mapa local. F permite bajar de la nave; E confirma la muestra.',
      completionCondition: 'waterStatus === sampled',
      voiceLine: 'Lecturas hidrogeológicas a larga distancia en el sector occidental.',
      recommendedTarget: 'water',
      priority: 30
    },
    {
      id: 'scanMinerals',
      title: 'Mision 02: Primer Punto de Apoyo',
      stepTitle: 'Expedición a Veta Ferrita',
      objective: 'Localiza Veta Ferrita y toma una muestra estructural.',
      nextAction: 'Viaja al afloramiento, localízalo desde la nave y muestrea la roca a pie.',
      hint: 'Los minerales analizados permitirán reforzar el módulo y fabricar anclajes.',
      completionCondition: 'mineralStatus === sampled',
      voiceLine: 'Firma mineral estable detectada en las crestas orientales.',
      recommendedTarget: 'minerals',
      priority: 40
    },
    {
      id: 'scanEnergy',
      title: 'Mision 02: Primer Punto de Apoyo',
      stepTitle: 'Expedición a Fisura Geotérmica',
      objective: 'Localiza la Fisura Geotérmica y confirma su potencial energético.',
      nextAction: 'Localiza el flujo térmico desde la nave y confirma una lectura cercana a pie.',
      hint: 'La muestra térmica debe analizarse en el hábitat antes de conectar el generador.',
      completionCondition: 'energyStatus === sampled',
      voiceLine: 'Flujo térmico utilizable detectado en el borde sur de la cuenca.',
      recommendedTarget: 'energy',
      priority: 50
    },
    {
      id: 'stabilizeLifeSupport',
      title: 'Mision 02: Primer Punto de Apoyo',
      stepTitle: 'Analizar muestras',
      objective: 'Regresa al Módulo Hábitat para analizar las muestras.',
      nextAction: 'Acércate al hábitat y presiona E para validar agua, minerales y energía.',
      hint: 'Base Nereida no puede operar con datos de campo sin analizar.',
      completionCondition: 'baseSystemsReady === true',
      voiceLine: surfaceLore.establishBaselineObjective,
      recommendedTarget: 'habitat',
      priority: 60
    },
    {
      id: 'baseOperational',
      title: 'Mision 02: Primer Punto de Apoyo',
      stepTitle: 'Activar Base Nereida',
      objective: 'Confirmar Base Nereida operativa.',
      nextAction: 'Vuelve al modulo para transmitir estado operacional.',
      hint: 'Base Nereida puede sostener presencia humana inicial.',
      completionCondition: 'operational === true',
      voiceLine: surfaceLore.missionCompleteMessage,
      recommendedTarget: 'habitat',
      priority: 70
    },
    {
      id: 'prepareExpansion',
      title: 'Mision 02: Primer Punto de Apoyo',
      stepTitle: 'Base Nereida establecida',
      objective: 'Preparar expansion colonial.',
      nextAction: surfaceLore.nextPhaseHint,
      hint: surfaceLore.missionCompleteMessage,
      completionCondition: 'expansionPrepared === true',
      voiceLine: surfaceLore.nextPhaseHint,
      recommendedTarget: 'habitat',
      priority: 80
    }
  ];

  get currentStep(): SurfaceMissionStep {
    const step = this.steps[this.stepIndex];
    const colony = this.latestColony;
    if (!colony) return step;

    const status = step.id === 'scanWater'
      ? colony.waterStatus
      : step.id === 'scanMinerals'
        ? colony.mineralStatus
        : step.id === 'scanEnergy'
          ? colony.energyStatus
          : undefined;
    if (!status) return step;
    if (status === 'located') {
      return {
        ...step,
        objective: `${step.recommendedTarget === 'water' ? 'Laguna Nereida' : step.recommendedTarget === 'minerals' ? 'Veta Ferrita' : 'Fisura Geotérmica'} localizada. Confirma una muestra a pie.`,
        nextAction: 'Aterriza cerca, presiona F para bajar y usa E junto al sitio.'
      };
    }
    return step;
  }

  get currentStepId(): SurfaceMissionStepId {
    return this.currentStep.id;
  }

  start(): void {
    this.active = true;
    this.stepIndex = 1;
    this.statusMessage = surfaceLore.systemsOnlineMessage;
  }

  updateFromColonyState(colony: ColonyState): void {
    if (!this.active) return;
    this.latestColony = colony;

    if (!colony.habitatOnline) {
      this.stepIndex = 1;
    } else if (!colony.surfaceSitesRevealed) {
      this.stepIndex = 2;
    } else if (colony.waterStatus !== 'sampled' && colony.waterStatus !== 'analyzed') {
      this.stepIndex = 3;
    } else if (colony.mineralStatus !== 'sampled' && colony.mineralStatus !== 'analyzed') {
      this.stepIndex = 4;
    } else if (colony.energyStatus !== 'sampled' && colony.energyStatus !== 'analyzed') {
      this.stepIndex = 5;
    } else if (!colony.baseSystemsReady) {
      this.stepIndex = 6;
    } else if (!colony.baseNereidaOperational) {
      this.stepIndex = 7;
    } else if (!colony.expansionPrepared) {
      this.stepIndex = 8;
      this.statusMessage = surfaceLore.missionCompleteMessage;
    } else {
      this.stepIndex = 8;
      this.statusMessage = surfaceLore.nextPhaseHint;
    }
  }

  forceAdvance(): SurfaceMissionStepId {
    if (this.stepIndex < this.steps.length - 1) {
      this.stepIndex += 1;
    }
    return this.currentStep.id;
  }

  restore(step: string, colony: ColonyState): void {
    this.active = true;
    this.latestColony = colony;
    const migratedStep = step === 'scanWater' || step === 'scanMinerals' || step === 'scanEnergy'
      ? step
      : step;
    const index = this.steps.findIndex((candidate) => candidate.id === migratedStep);
    if (index >= 0) {
      this.stepIndex = index;
    } else {
      this.updateFromColonyState(colony);
    }
  }
}
