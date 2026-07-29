import { mission01, type MissionStepId } from '../assets/missionDefinitions';
import type { HabitabilityReport } from './HabitabilitySystem';

export type MissionHudState = {
  missionName: string;
  step: MissionStepId;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  status: string;
  distanceText: string;
  scannerStatus: string;
  signalStrength: number;
  scanProgress: number;
  complete: boolean;
};

export class MissionManager {
  private stepIndex = 0;

  private idleTimer = 0;

  private status = mission01.briefing;

  private hintOverride = '';

  get step(): MissionStepId {
    return mission01.steps[this.stepIndex].id;
  }

  get briefing(): string {
    return mission01.briefing;
  }

  get completion(): string {
    return mission01.completion;
  }

  get currentDefinition() {
    return mission01.steps[this.stepIndex];
  }

  start(): void {
    this.setStep('scannerTutorial');
    this.status = mission01.briefing;
  }

  restore(step: string, status?: string): boolean {
    const index = mission01.steps.findIndex((candidate) => candidate.id === step);
    if (index < 0) return false;
    this.stepIndex = index;
    this.status = status || `Progreso restaurado: ${mission01.steps[index].objective}`;
    this.idleTimer = 0;
    this.hintOverride = '';
    return true;
  }

  update(delta: number, distanceToObjective: number, signalStrength: number, scanProgress: number): MissionHudState {
    this.idleTimer += delta;
    const step = mission01.steps[this.stepIndex];
    const hint = this.hintOverride || (this.idleTimer > 8 ? step.hint : '');
    const scanningStep = this.step === 'analyzeHabitability' || this.step === 'decodeDescentCorridor';
    const entryStep = this.step === 'atmosphericEntry' || this.step === 'landingApproach' || this.step === 'touchdown';

    return {
      missionName: mission01.name,
      step: step.id,
      stepTitle: step.title,
      objective: step.objective,
      nextAction: step.nextAction,
      hint,
      status: this.status,
      distanceText: `${Math.max(0, Math.round(distanceToObjective))} m`,
      scannerStatus:
        scanProgress > 0 && scanProgress < 100 && scanningStep
          ? 'Analizando'
          : entryStep
            ? 'Descenso'
            : this.step === 'scannerTutorial'
              ? 'En espera'
              : 'Activo',
      signalStrength,
      scanProgress,
      complete: this.step === 'missionComplete'
    };
  }

  activateScanner(): void {
    this.recordActivity();
    if (this.step === 'scannerTutorial' || this.step === 'briefing') {
      this.setStep('followSignal');
      this.status = 'Sensores de largo alcance activos. Senal de biosfera detectada: E-01.';
    }
  }

  reachPlanetRange(): void {
    if (this.step === 'followSignal') {
      this.setStep('scanPlanet');
      this.status = 'Senal de biosfera centrada. El planeta candidato esta dentro del rango de aproximacion.';
    }
  }

  startHabitabilityScan(): void {
    this.recordActivity();
    if (this.step === 'scanPlanet' || this.step === 'followSignal') {
      this.setStep('analyzeHabitability');
      this.status = 'Bloqueo de scanner establecido. Analizando atmosfera, agua, gravedad y radiacion.';
    }
  }

  triggerComplication(): void {
    if (this.step === 'analyzeHabitability') {
      this.setStep('surviveComplication');
      this.status = 'Pulso defensivo antiguo detectado. Mantiene el bloqueo o rompe contacto si la nave cae.';
    }
  }

  completeHabitability(report: HabitabilityReport): void {
    this.recordActivity();
    if (this.step === 'analyzeHabitability' || this.step === 'surviveComplication') {
      this.setStep('scanOrbitalMarker');
      this.status = `${report.planetName} supera viabilidad minima: ${report.viability}%. El scanner detecta una estructura orbital alineada con la biosfera.`;
    }
  }

  startMarkerDecode(): void {
    this.recordActivity();
    if (this.step === 'scanOrbitalMarker') {
      this.setStep('decodeDescentCorridor');
      this.status = 'Marcador Atlas enlazado. Decodificando telemetria de descenso.';
    }
  }

  completeMarkerDecode(): void {
    this.recordActivity();
    if (this.step === 'decodeDescentCorridor') {
      this.setStep('approachPlanet');
      this.status = 'Corredor de descenso Atlas disponible. La estructura senala la Cuenca Nereida.';
    }
  }

  beginAtmosphericEntry(): void {
    this.recordActivity();
    if (this.step === 'approachPlanet') {
      this.setStep('atmosphericEntry');
      this.status = 'Entrada atmosferica iniciada. Mantiene vector y estabiliza temperatura de casco.';
    }
  }

  completeAtmosphericEntry(): void {
    this.recordActivity();
    if (this.step === 'atmosphericEntry') {
      this.setStep('landingApproach');
      this.status = 'Capa de nubes superada. Baliza de aterrizaje de la Cuenca Nereida adquirida.';
    }
  }

  enterTouchdown(): void {
    this.recordActivity();
    if (this.step === 'landingApproach') {
      this.setStep('touchdown');
      this.status = 'Asistencia de aterrizaje activa. Reduce velocidad para tocar superficie.';
    }
  }

  completeTouchdown(): void {
    this.recordActivity();
    if (this.step === 'touchdown' || this.step === 'landingApproach') {
      this.setStep('firstFoothold');
      this.status = 'Superficie asegurada. Primer punto de apoyo humano establecido en E-01.';
    }
  }

  transmitData(): void {
    this.recordActivity();
    if (this.step === 'transmitData' || this.step === 'firstFoothold') {
      this.setStep('missionComplete');
      this.status = mission01.completion;
    }
  }

  setHint(message: string): void {
    this.hintOverride = message;
  }

  clearHint(): void {
    this.hintOverride = '';
  }

  private setStep(step: MissionStepId): void {
    const index = mission01.steps.findIndex((candidate) => candidate.id === step);
    if (index >= 0) {
      this.stepIndex = index;
      this.idleTimer = 0;
      this.hintOverride = '';
    }
  }

  recordActivity(): void {
    this.idleTimer = 0;
  }
}
