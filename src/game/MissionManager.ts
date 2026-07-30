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

  /** Objective shown while a descent attempt stands refused. Empty otherwise. */
  private denialObjective = '';

  private denialReason = '';

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

  /**
   * The one instruction on screen right now.
   *
   * A standing refusal owns this line, so the HUD can never show a goal the
   * pilot is currently being blocked from pursuing — which is exactly what the
   * original mission did.
   */
  get currentObjective(): string {
    return this.denialObjective || mission01.steps[this.stepIndex].objective;
  }

  /**
   * Opens the mission at the first flight manoeuvre.
   *
   * The prologue hands over the moment the exit corridor is clear, and at that
   * point the pilot has been told what the mission is but has not yet flown
   * anything — so this lands on the tutorial rather than on the scanner, which
   * used to be M01's first real step.
   *
   * Bypasses the monotonic guard on purpose: this is an entry point, and the
   * debug surface calls it to reset before fast-forwarding.
   */
  start(): void {
    this.assignStep(mission01.steps.findIndex((candidate) => candidate.id === 'flightOrientation'));
    this.status = mission01.briefing;
  }

  restore(step: string, status?: string): boolean {
    const index = mission01.steps.findIndex((candidate) => candidate.id === step);
    if (index < 0) return false;
    this.assignStep(index);
    this.status = status || `Progreso restaurado: ${mission01.steps[index].objective}`;
    return true;
  }

  /**
   * Normalises a step id that is no longer valid.
   *
   * A save written before the onboarding existed can name a step that still
   * exists, so most legacy saves restore exactly. This covers the rest: an
   * unknown id resolves to the nearest earlier valid step rather than failing
   * the restore, so an old or hand-edited save continues instead of resetting.
   */
  restoreNearest(step: string | undefined, status?: string): MissionStepId {
    if (step && this.restore(step, status)) return this.step;
    this.assignStep(0);
    this.status = status || mission01.briefing;
    return this.step;
  }

  update(delta: number, distanceToObjective: number, signalStrength: number, scanProgress: number): MissionHudState {
    this.idleTimer += delta;
    const step = mission01.steps[this.stepIndex];
    const hint = this.hintOverride || (this.idleTimer > 8 ? step.hint : '');
    const scanningStep =
      this.step === 'analyzeHabitability' ||
      this.step === 'decodeDescentCorridor' ||
      this.step === 'beaconSurvey' ||
      this.step === 'dataTransfer';
    const entryStep = this.step === 'atmosphericEntry' || this.step === 'landingApproach' || this.step === 'touchdown';

    return {
      missionName: mission01.name,
      step: step.id,
      stepTitle: step.title,
      // A standing refusal owns the objective line. This is the fix for the
      // original defect: the instruction on screen is always the one that
      // resolves the pilot's actual situation, never a stale earlier goal.
      objective: this.denialObjective || step.objective,
      nextAction: step.nextAction,
      hint,
      status: this.status,
      distanceText: `${Math.max(0, Math.round(distanceToObjective))} m`,
      scannerStatus:
        scanProgress > 0 && scanProgress < 100 && scanningStep
          ? 'Analizando'
          : entryStep
            ? 'Descenso'
            : // The scanner stays cold through the manoeuvre tutorial: it is not
              // available yet, and showing it as "Activo" would advertise an
              // interaction the pilot cannot use.
              this.stepIndex <= this.indexOf('scannerTutorial')
              ? 'En espera'
              : 'Activo',
      signalStrength,
      scanProgress,
      complete: this.step === 'missionComplete'
    };
  }

  // --- Flight onboarding ---------------------------------------------------

  /**
   * Advances the manoeuvre tutorial.
   *
   * Driven by `Mission01FlightTutorial`, which owns the actual conditions. This
   * only mirrors its progress onto the mission step so the HUD, the save and the
   * objective all read from one place.
   */
  advanceFlightTutorial(step: MissionStepId): void {
    this.recordActivity();
    this.setStep(step);
  }

  /** The four manoeuvres are done; the scanner beat opens. */
  completeFlightTutorial(): void {
    this.recordActivity();
    this.setStep('scannerTutorial');
    this.status = 'Control de vuelo confirmado. Sensores de largo alcance disponibles.';
  }

  /**
   * The scanner beat. Deliberately still gated on `scannerTutorial` exactly:
   * accepting it during the manoeuvre steps would let a pilot skip the tutorial
   * by pressing E, which is the opposite of teaching it.
   */
  activateScanner(): void {
    this.recordActivity();
    if (this.step === 'scannerTutorial' || this.step === 'briefing') {
      this.setStep('followSignal');
      this.status = 'Sensores de largo alcance activos. Señal de biosfera detectada: E-01.';
    }
  }

  // --- Recon beacon --------------------------------------------------------

  /**
   * Reveals the beacon and points the mission at it.
   *
   * Called both when E-01 orbit is reached and, critically, the instant a
   * descent is refused — so the pilot never sees a refusal without also getting
   * the objective that resolves it.
   */
  locateBeacon(): boolean {
    this.recordActivity();
    if (this.stepIndex >= this.indexOf('beaconSurvey')) return false;
    this.setStep('beaconApproach');
    this.status = 'Baliza de reconocimiento del Arca localizada en órbita baja de E-01.';
    return true;
  }

  beginBeaconScan(): boolean {
    this.recordActivity();
    if (this.step !== 'beaconApproach') return false;
    this.setStep('beaconSurvey');
    this.status = 'Enlace de escáner establecido con la baliza de reconocimiento.';
    return true;
  }

  beginDataTransfer(): boolean {
    this.recordActivity();
    if (this.step !== 'beaconSurvey') return false;
    this.setStep('dataTransfer');
    this.status = 'Baliza escaneada. Transfiriendo lecturas atmosféricas al Arca.';
    return true;
  }

  completeDataTransfer(): boolean {
    this.recordActivity();
    if (this.step !== 'dataTransfer') return false;
    this.setStep('scanPlanet');
    this.status = 'Datos atmosféricos completos. Falta el resto del perfil de habitabilidad.';
    return true;
  }

  private indexOf(step: MissionStepId): number {
    return mission01.steps.findIndex((candidate) => candidate.id === step);
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

  // --- Refused descent -----------------------------------------------------

  /**
   * A descent was attempted without authorization.
   *
   * Deliberately not a step: the pilot can dive at E-01 from any point in the
   * orbital phase, so parking the mission in a `descentDenied` state would mean
   * either a non-monotonic machine or a dead end. Instead this is an overlay —
   * it replaces the objective with the reason and the fix, and clears itself the
   * moment the mission advances.
   *
   * The old behaviour is what made this worth fixing: the objective kept reading
   * "set course for E-01" while the game physically pushed the ship away, and
   * the actual cause only surfaced inside a 2.8 s throttle.
   */
  denyDescent(objective: string, reason: string): void {
    this.recordActivity();
    this.denialObjective = objective;
    this.denialReason = reason;
    this.status = reason;
  }

  clearDenial(): void {
    this.denialObjective = '';
    this.denialReason = '';
  }

  get descentDenied(): boolean {
    return this.denialObjective.length > 0;
  }

  get blockReason(): string {
    return this.denialReason;
  }

  setHint(message: string): void {
    this.hintOverride = message;
  }

  clearHint(): void {
    this.hintOverride = '';
  }

  /**
   * The single monotonic transition.
   *
   * Every gameplay transition goes through here, and none of them can move the
   * mission backwards. Before this guard existed, `setStep` assigned any index,
   * so a system firing out of order could silently rewind the mission — replay a
   * dialogue beat, or drop a completed objective back onto the HUD.
   *
   * `start` and `restore` deliberately bypass it: they are entry points, not
   * transitions. In particular `main.ts` fast-forwards the mission from the
   * debug surface by chaining `start(); activateScanner(); reachPlanetRange();
   * …`, and routing `start` through this guard would make that chain fail
   * silently on an advanced state.
   */
  private setStep(step: MissionStepId): void {
    const index = mission01.steps.findIndex((candidate) => candidate.id === step);
    if (index < 0 || index <= this.stepIndex) return;
    this.assignStep(index);
  }

  /** Non-monotonic assignment. Only `start` and `restore` may use it. */
  private assignStep(index: number): void {
    this.stepIndex = index;
    this.idleTimer = 0;
    this.hintOverride = '';
    // Any step change resolves an outstanding refusal: the pilot has moved on to
    // something else, so leaving the denial objective up would be the same stale
    // instruction the redesign exists to remove.
    this.denialObjective = '';
    this.denialReason = '';
  }

  recordActivity(): void {
    this.idleTimer = 0;
  }
}
