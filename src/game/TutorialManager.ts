import type { MissionStepId } from '../assets/missionDefinitions';
import type { SurfaceMissionStepId } from './FirstFootholdMission';
import type { Mission03StepId } from '../assets/mission03Definitions';

export type TutorialId =
  | 'moveShip'
  | 'scanner'
  | 'followMarker'
  | 'openMap'
  | 'scanE01'
  | 'scanAtlas'
  | 'surviveEntry'
  | 'surfaceMove'
  | 'shipAccess'
  | 'returnShip'
  | 'cameraToggle'
  | 'deployHabitat'
  | 'surveySites'
  | 'scanResources'
  | 'sampleWater'
  | 'sampleMinerals'
  | 'sampleEnergy'
  | 'analyzeSamples'
  | 'confirmBase'
  | 'atlasSignal'
  | 'atlasResonator'
  | 'placeRelay'
  | 'stabilizeSignal'
  | 'translateSignal'
  | 'alienContact';

export type TutorialContext = {
  missionStep?: MissionStepId;
  surfaceStep?: SurfaceMissionStepId;
  mission03Step?: Mission03StepId;
  inSurfacePhase: boolean;
  insideShip?: boolean;
  onFoot?: boolean;
  shipAccessAvailable?: boolean;
  cameraToggleAvailable?: boolean;
};

const SPACE_HINTS: Partial<Record<MissionStepId, [TutorialId, string]>> = {
  scannerTutorial: ['scanner', 'Pulsa E para activar el escaner de largo alcance.'],
  followSignal: ['followMarker', 'Usa WASD para dirigirte a BIOSFERA E-01. No desciendas sin datos completos.'],
  scanPlanet: ['scanE01', 'Escanea E-01 desde órbita antes de aproximarte a la atmósfera.'],
  scanOrbitalMarker: ['scanAtlas', 'El Marcador Atlas puede desbloquear un corredor seguro. Acércate y pulsa E.'],
  atmosphericEntry: ['surviveEntry', 'Suelta Shift, usa S para frenar y manten la nave alineada.']
};

const SURFACE_HINTS: Partial<Record<SurfaceMissionStepId, [TutorialId, string]>> = {
  deployHabitat: ['deployHabitat', 'Regresa a la plataforma de aterrizaje y pulsa E para desplegar el habitat.'],
  surveyResourceSites: ['surveySites', 'Usa E junto al hábitat para revelar zonas de recursos en el mapa local.'],
  scanWater: ['sampleWater', 'Usa M para llegar a Laguna Nereida. Localiza desde la nave, baja con F y toma la muestra con E.'],
  scanMinerals: ['sampleMinerals', 'Viaja a Veta Ferrita; algunos datos requieren confirmación cercana a pie.'],
  scanEnergy: ['sampleEnergy', 'Localiza la Fisura Geotérmica desde la nave y confirma la lectura a pie.'],
  stabilizeLifeSupport: ['analyzeSamples', 'Regresa al hábitat para analizar las muestras antes de activar la base.'],
  baseOperational: ['confirmBase', 'Junto al habitat, pulsa E para transmitir la confirmacion operacional.']
};

const MISSION03_HINTS: Partial<Record<Mission03StepId, [TutorialId, string]>> = {
  deepSignal: ['atlasSignal', 'Las senales Atlas pueden venir de fuera del planeta. Regresa a Base Nereida.'],
  resonancePoint: ['atlasResonator', 'Usa la guia y el mapa local para llegar al Resonador Atlas.'],
  relayBeacon: ['placeRelay', 'Desciende con F y coloca la baliza de enlace con E.'],
  synchronization: ['stabilizeSignal', 'Permanece dentro del rango para estabilizar la transmision.'],
  returnToBase: ['translateSignal', 'Regresa a Base Nereida para traducir el mensaje.'],
  firstContact: ['alienContact', 'La comunicacion alienigena puede revelar nuevas amenazas.']
};

export class TutorialManager {
  private readonly completed = new Set<TutorialId>();
  private idleSeconds = 0;

  recordActivity(): void {
    this.idleSeconds = 0;
  }

  complete(id: TutorialId): void {
    this.completed.add(id);
    this.recordActivity();
  }

  restore(ids: string[] | undefined): void {
    this.completed.clear();
    for (const id of ids ?? []) {
      if (this.isTutorialId(id)) this.completed.add(id);
    }
    this.recordActivity();
  }

  snapshot(): TutorialId[] {
    return [...this.completed];
  }

  update(delta: number, context: TutorialContext): string {
    this.idleSeconds += delta;
    if (this.idleSeconds < 8) return '';

    let contextual: [TutorialId, string] | undefined;
    if (context.inSurfacePhase) {
      if (context.mission03Step && MISSION03_HINTS[context.mission03Step]) {
        contextual = MISSION03_HINTS[context.mission03Step];
      } else if (context.shipAccessAvailable && context.onFoot) {
        contextual = ['returnShip', 'F — SUBIR A LA NAVE'];
      } else if (context.shipAccessAvailable && context.insideShip) {
        contextual = ['shipAccess', 'Presiona F para descender de la nave. E queda reservado para escanear e interactuar.'];
      } else if (context.surfaceStep) {
        contextual = SURFACE_HINTS[context.surfaceStep];
      }
    } else if (context.missionStep) {
      contextual = SPACE_HINTS[context.missionStep];
    }

    if (!contextual && context.cameraToggleAvailable) {
      contextual = ['cameraToggle', 'Presiona V dentro de la nave para alternar entre vista externa y cabina.'];
    }

    if (!contextual || this.completed.has(contextual[0])) return '';
    return contextual[1];
  }

  private isTutorialId(value: string): value is TutorialId {
    return [
      'moveShip',
      'scanner',
      'followMarker',
      'openMap',
      'scanE01',
      'scanAtlas',
      'surviveEntry',
      'surfaceMove',
      'shipAccess',
      'returnShip',
      'cameraToggle',
      'deployHabitat',
      'surveySites',
      'scanResources',
      'sampleWater',
      'sampleMinerals',
      'sampleEnergy',
      'analyzeSamples',
      'confirmBase',
      'atlasSignal',
      'atlasResonator',
      'placeRelay',
      'stabilizeSignal',
      'translateSignal',
      'alienContact'
    ].includes(value);
  }
}
