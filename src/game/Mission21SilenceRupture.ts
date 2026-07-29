import {
  ATTACK_ROUTE_ORDER,
  ENCLAVE_CHANNEL_ORDER,
  MISSION21_CHANNEL_ORDER,
  mission21Steps,
  mission21Tuning,
  type CoalitionResponseTone,
  type Mission21StepDefinition,
  type Mission21StepId
} from '../assets/mission21Definitions';
import type { Mission20Snapshot } from './Mission20ArkBattle';

export type Mission21Snapshot = {
  mission21Started: boolean;
  mission21Step: Mission21StepId;
  transmissionChannelsAligned: boolean[];
  transmissionDecoded: boolean;
  capitalShipDetected: boolean;
  capitalSignatureAnalyzed: boolean;
  ultimatumReceived: boolean;
  coalitionResponseTone: CoalitionResponseTone;
  enclaveChannelsRestored: boolean[];
  demonstrationObserved: boolean;
  attackRoutesClassified: boolean[];
  pleyadianNetworkActivated: boolean;
  simultaneousAssaultDetected: boolean;
  mission21Completed: boolean;
  mission22Unlocked: boolean;
};

export type Mission21Readout = {
  transmissionIntegrity: number;
  enemySignal: number;
  interferenceLevel: number;
  routesDetected: number;
  auroraStatus: 'linked' | 'isolated' | 'under-attack';
  nereidaStatus: 'linked' | 'isolated' | 'under-attack';
  arkStatus: 'operational' | 'isolated' | 'under-attack';
  responseTone: CoalitionResponseTone;
  phaseProgress: number;
};

const STEP_ORDER: readonly Mission21StepId[] = [
  'inactive',
  'decryptTransmission',
  'detectCapitalShip',
  'analyzeSignature',
  'receiveUltimatum',
  'chooseResponse',
  'restoreThreeChannels',
  'witnessDemonstration',
  'classifyAttackRoutes',
  'activatePleyadianNetwork',
  'detectSimultaneousAssault',
  'completed'
];

function stepIndex(step: Mission21StepId): number {
  const index = STEP_ORDER.indexOf(step);
  return index < 0 ? 0 : index;
}

function countEnabled(flags: readonly boolean[]): number {
  let count = 0;
  for (let index = 0; index < flags.length; index += 1) {
    if (flags[index]) count += 1;
  }
  return count;
}

export class Mission21SilenceRupture {
  readonly missionId = 'mission-21-silence-rupture';
  readonly missionName = 'Misión 21: La ruptura del Silencio';

  readonly state: Mission21Snapshot = {
    mission21Started: false,
    mission21Step: 'inactive',
    transmissionChannelsAligned: [false, false, false],
    transmissionDecoded: false,
    capitalShipDetected: false,
    capitalSignatureAnalyzed: false,
    ultimatumReceived: false,
    coalitionResponseTone: 'none',
    enclaveChannelsRestored: [false, false, false],
    demonstrationObserved: false,
    attackRoutesClassified: [false, false, false],
    pleyadianNetworkActivated: false,
    simultaneousAssaultDetected: false,
    mission21Completed: false,
    mission22Unlocked: false
  };

  private phaseTimer = 0;

  get started(): boolean { return this.state.mission21Started; }
  get completed(): boolean { return this.state.mission21Completed; }
  get step(): Mission21StepId { return this.state.mission21Step; }
  get stepDefinition(): Mission21StepDefinition { return mission21Steps[this.step]; }

  get alignedChannelCount(): number { return countEnabled(this.state.transmissionChannelsAligned); }
  get restoredChannelCount(): number { return countEnabled(this.state.enclaveChannelsRestored); }
  get classifiedRouteCount(): number { return countEnabled(this.state.attackRoutesClassified); }
  get activeAlignmentIndex(): number {
    return this.step === 'decryptTransmission'
      ? this.state.transmissionChannelsAligned.findIndex((value) => !value)
      : -1;
  }
  get activeEnclaveChannelIndex(): number {
    return this.step === 'restoreThreeChannels'
      ? this.state.enclaveChannelsRestored.findIndex((value) => !value)
      : -1;
  }
  get activeRouteIndex(): number {
    return this.step === 'classifyAttackRoutes'
      ? this.state.attackRoutesClassified.findIndex((value) => !value)
      : -1;
  }

  get phaseProgress(): number {
    const t = mission21Tuning;
    switch (this.step) {
      case 'decryptTransmission': return Math.min(100, this.phaseTimer / t.alignChannelSeconds * 100);
      case 'detectCapitalShip': return Math.min(100, this.phaseTimer / t.capitalRevealSeconds * 100);
      case 'analyzeSignature': return Math.min(100, this.phaseTimer / t.signatureAnalysisSeconds * 100);
      case 'receiveUltimatum': return Math.min(100, this.phaseTimer / t.ultimatumSeconds * 100);
      case 'restoreThreeChannels': return Math.min(100, this.phaseTimer / t.restoreChannelSeconds * 100);
      case 'witnessDemonstration': return Math.min(100, this.phaseTimer / t.demonstrationSeconds * 100);
      case 'classifyAttackRoutes': return Math.min(100, this.phaseTimer / t.classifyRouteSeconds * 100);
      case 'activatePleyadianNetwork': return Math.min(100, this.phaseTimer / t.networkActivationSeconds * 100);
      case 'detectSimultaneousAssault': return Math.min(100, this.phaseTimer / t.assaultDetectionSeconds * 100);
      case 'chooseResponse': return this.state.coalitionResponseTone === 'none' ? 0 : 100;
      case 'completed': return 100;
      default: return 0;
    }
  }

  get readout(): Mission21Readout {
    const restoreActive = stepIndex(this.step) >= stepIndex('restoreThreeChannels');
    const assault = this.state.simultaneousAssaultDetected;
    const linked = (index: number) => !restoreActive || this.state.enclaveChannelsRestored[index];
    const interference = this.completed
      ? 82
      : this.step === 'restoreThreeChannels'
        ? 94 - this.restoredChannelCount * 18
        : this.state.pleyadianNetworkActivated
          ? 42
          : stepIndex(this.step) >= stepIndex('receiveUltimatum')
            ? 78
            : 28;
    return {
      transmissionIntegrity: Number((this.alignedChannelCount / MISSION21_CHANNEL_ORDER.length * 100).toFixed(1)),
      enemySignal: stepIndex(this.step) >= stepIndex('detectCapitalShip') ? 100 : this.started ? 58 : 0,
      interferenceLevel: interference,
      routesDetected: this.classifiedRouteCount,
      auroraStatus: assault ? 'under-attack' : linked(0) ? 'linked' : 'isolated',
      nereidaStatus: assault ? 'under-attack' : linked(1) ? 'linked' : 'isolated',
      arkStatus: assault ? 'under-attack' : linked(2) ? 'operational' : 'isolated',
      responseTone: this.state.coalitionResponseTone,
      phaseProgress: Number(this.phaseProgress.toFixed(1))
    };
  }

  canStart(previous: Mission20Snapshot): boolean {
    return Boolean(
      !this.started &&
      !this.completed &&
      previous.mission20Completed &&
      previous.arkStabilized &&
      previous.mission21Unlocked
    );
  }

  start(previous: Mission20Snapshot): boolean {
    if (!this.canStart(previous)) return false;
    this.state.mission21Started = true;
    this.state.mission21Step = 'decryptTransmission';
    this.phaseTimer = 0;
    return true;
  }

  advanceTransmissionAlignment(delta: number, nearArk: boolean): number {
    if (this.step !== 'decryptTransmission') return -1;
    const index = this.activeAlignmentIndex;
    if (index < 0) return -1;
    if (!this.hold(delta, nearArk, mission21Tuning.alignChannelSeconds)) return -1;
    this.state.transmissionChannelsAligned[index] = true;
    this.phaseTimer = 0;
    if (this.alignedChannelCount >= MISSION21_CHANNEL_ORDER.length) {
      this.state.transmissionDecoded = true;
      this.goToStep('detectCapitalShip');
    }
    return index;
  }

  advanceCapitalDetection(delta: number): boolean {
    if (this.step !== 'detectCapitalShip') return false;
    if (!this.wait(delta, mission21Tuning.capitalRevealSeconds)) return false;
    this.state.capitalShipDetected = true;
    return this.goToStep('analyzeSignature');
  }

  advanceSignatureAnalysis(delta: number, nearArk: boolean): boolean {
    if (this.step !== 'analyzeSignature') return false;
    if (!this.hold(delta, nearArk, mission21Tuning.signatureAnalysisSeconds)) return false;
    this.state.capitalSignatureAnalyzed = true;
    return this.goToStep('receiveUltimatum');
  }

  advanceUltimatum(delta: number): boolean {
    if (this.step !== 'receiveUltimatum') return false;
    if (!this.wait(delta, mission21Tuning.ultimatumSeconds)) return false;
    this.state.ultimatumReceived = true;
    return this.goToStep('chooseResponse');
  }

  chooseResponse(tone: Exclude<CoalitionResponseTone, 'none'>): boolean {
    if (this.step !== 'chooseResponse' || this.state.coalitionResponseTone !== 'none') return false;
    this.state.coalitionResponseTone = tone;
    this.phaseTimer = 0;
    return this.goToStep('restoreThreeChannels');
  }

  advanceEnclaveChannel(delta: number, inRange: boolean): number {
    if (this.step !== 'restoreThreeChannels') return -1;
    const index = this.activeEnclaveChannelIndex;
    if (index < 0) return -1;
    if (!this.hold(delta, inRange, mission21Tuning.restoreChannelSeconds)) return -1;
    this.state.enclaveChannelsRestored[index] = true;
    this.phaseTimer = 0;
    if (this.restoredChannelCount >= ENCLAVE_CHANNEL_ORDER.length) this.goToStep('witnessDemonstration');
    return index;
  }

  advanceDemonstration(delta: number): boolean {
    if (this.step !== 'witnessDemonstration') return false;
    if (!this.wait(delta, mission21Tuning.demonstrationSeconds)) return false;
    this.state.demonstrationObserved = true;
    return this.goToStep('classifyAttackRoutes');
  }

  advanceRouteClassification(delta: number, nearArk: boolean): number {
    if (this.step !== 'classifyAttackRoutes') return -1;
    const index = this.activeRouteIndex;
    if (index < 0) return -1;
    if (!this.hold(delta, nearArk, mission21Tuning.classifyRouteSeconds)) return -1;
    this.state.attackRoutesClassified[index] = true;
    this.phaseTimer = 0;
    if (this.classifiedRouteCount >= ATTACK_ROUTE_ORDER.length) this.goToStep('activatePleyadianNetwork');
    return index;
  }

  advancePleyadianNetwork(delta: number, nearArk: boolean): boolean {
    if (this.step !== 'activatePleyadianNetwork') return false;
    if (!this.hold(delta, nearArk, mission21Tuning.networkActivationSeconds)) return false;
    this.state.pleyadianNetworkActivated = true;
    return this.goToStep('detectSimultaneousAssault');
  }

  advanceAssaultDetection(delta: number): boolean {
    if (this.step !== 'detectSimultaneousAssault') return false;
    if (!this.wait(delta, mission21Tuning.assaultDetectionSeconds)) return false;
    this.state.simultaneousAssaultDetected = true;
    this.completeMission();
    return true;
  }

  forceTransmissionDecoded(): void {
    this.forceTransmissionChannels(MISSION21_CHANNEL_ORDER.length - 1);
  }
  forceTransmissionChannels(index: number): void {
    if (!this.started) return;
    const end = Math.min(MISSION21_CHANNEL_ORDER.length - 1, Math.max(-1, Math.floor(index)));
    for (let i = 0; i <= end; i += 1) this.state.transmissionChannelsAligned[i] = true;
    if (this.alignedChannelCount >= MISSION21_CHANNEL_ORDER.length) {
      this.state.transmissionDecoded = true;
      if (this.step === 'decryptTransmission') this.goToStep('detectCapitalShip');
    }
    this.phaseTimer = 0;
  }
  forceCapitalDetected(): void {
    this.forceTransmissionDecoded();
    if (!this.started) return;
    this.state.capitalShipDetected = true;
    if (this.step === 'detectCapitalShip') this.goToStep('analyzeSignature');
    this.phaseTimer = 0;
  }
  forceSignatureAnalyzed(): void {
    this.forceCapitalDetected();
    if (!this.started) return;
    this.state.capitalSignatureAnalyzed = true;
    if (this.step === 'analyzeSignature') this.goToStep('receiveUltimatum');
    this.phaseTimer = 0;
  }
  forceUltimatum(): void {
    this.forceSignatureAnalyzed();
    if (!this.started) return;
    this.state.ultimatumReceived = true;
    if (this.step === 'receiveUltimatum') this.goToStep('chooseResponse');
    this.phaseTimer = 0;
  }
  forceResponse(tone: Exclude<CoalitionResponseTone, 'none'>): void {
    this.forceUltimatum();
    if (this.step === 'chooseResponse') this.chooseResponse(tone);
  }
  forceChannelsRestored(): void {
    this.forceEnclaveChannels(ENCLAVE_CHANNEL_ORDER.length - 1);
  }
  forceEnclaveChannels(index: number): void {
    this.forceResponse(this.state.coalitionResponseTone === 'none' ? 'strategic' : this.state.coalitionResponseTone);
    if (!this.started) return;
    const end = Math.min(ENCLAVE_CHANNEL_ORDER.length - 1, Math.max(-1, Math.floor(index)));
    for (let i = 0; i <= end; i += 1) this.state.enclaveChannelsRestored[i] = true;
    if (this.restoredChannelCount >= ENCLAVE_CHANNEL_ORDER.length && this.step === 'restoreThreeChannels') {
      this.goToStep('witnessDemonstration');
    }
    this.phaseTimer = 0;
  }
  forceDemonstration(): void {
    this.forceChannelsRestored();
    if (!this.started) return;
    this.state.demonstrationObserved = true;
    if (this.step === 'witnessDemonstration') this.goToStep('classifyAttackRoutes');
    this.phaseTimer = 0;
  }
  forceRoutesClassified(): void {
    this.forceAttackRoutes(ATTACK_ROUTE_ORDER.length - 1);
  }
  forceAttackRoutes(index: number): void {
    this.forceDemonstration();
    if (!this.started) return;
    const end = Math.min(ATTACK_ROUTE_ORDER.length - 1, Math.max(-1, Math.floor(index)));
    for (let i = 0; i <= end; i += 1) this.state.attackRoutesClassified[i] = true;
    if (this.classifiedRouteCount >= ATTACK_ROUTE_ORDER.length && this.step === 'classifyAttackRoutes') {
      this.goToStep('activatePleyadianNetwork');
    }
    this.phaseTimer = 0;
  }
  forceNetworkActivated(): void {
    this.forceRoutesClassified();
    if (!this.started) return;
    this.state.pleyadianNetworkActivated = true;
    if (this.step === 'activatePleyadianNetwork') this.goToStep('detectSimultaneousAssault');
    this.phaseTimer = 0;
  }
  forceComplete(): void {
    this.forceNetworkActivated();
    if (!this.started) return;
    this.state.simultaneousAssaultDetected = true;
    this.completeMission();
  }

  restore(saved: Partial<Mission21Snapshot> | undefined): void {
    this.reset();
    if (!saved?.mission21Started) return;
    Object.assign(this.state, saved);
    if (!mission21Steps[this.state.mission21Step]) this.state.mission21Step = 'decryptTransmission';
    this.state.transmissionChannelsAligned = this.restoreFlags(saved.transmissionChannelsAligned, MISSION21_CHANNEL_ORDER.length);
    this.state.enclaveChannelsRestored = this.restoreFlags(saved.enclaveChannelsRestored, ENCLAVE_CHANNEL_ORDER.length);
    this.state.attackRoutesClassified = this.restoreFlags(saved.attackRoutesClassified, ATTACK_ROUTE_ORDER.length);
    if (!['defiant', 'diplomatic', 'strategic'].includes(this.state.coalitionResponseTone)) {
      this.state.coalitionResponseTone = 'none';
    }
    this.normalizeMilestones();
    this.phaseTimer = 0;
  }

  snapshot(): Mission21Snapshot {
    return {
      ...this.state,
      transmissionChannelsAligned: [...this.state.transmissionChannelsAligned],
      enclaveChannelsRestored: [...this.state.enclaveChannelsRestored],
      attackRoutesClassified: [...this.state.attackRoutesClassified]
    };
  }

  reset(): void {
    Object.assign(this.state, {
      mission21Started: false,
      mission21Step: 'inactive' as Mission21StepId,
      transmissionChannelsAligned: [false, false, false],
      transmissionDecoded: false,
      capitalShipDetected: false,
      capitalSignatureAnalyzed: false,
      ultimatumReceived: false,
      coalitionResponseTone: 'none' as CoalitionResponseTone,
      enclaveChannelsRestored: [false, false, false],
      demonstrationObserved: false,
      attackRoutesClassified: [false, false, false],
      pleyadianNetworkActivated: false,
      simultaneousAssaultDetected: false,
      mission21Completed: false,
      mission22Unlocked: false
    });
    this.phaseTimer = 0;
  }

  private completeMission(): void {
    this.state.mission21Completed = true;
    this.state.mission22Unlocked = true;
    this.goToStep('completed');
  }

  private goToStep(step: Mission21StepId): boolean {
    if (stepIndex(step) <= stepIndex(this.state.mission21Step)) return false;
    this.state.mission21Step = step;
    this.phaseTimer = 0;
    return true;
  }

  private hold(delta: number, inRange: boolean, seconds: number): boolean {
    if (!inRange) {
      this.phaseTimer = Math.max(0, this.phaseTimer - Math.max(0, delta));
      return false;
    }
    return this.wait(delta, seconds);
  }

  private wait(delta: number, seconds: number): boolean {
    this.phaseTimer = Math.min(seconds, this.phaseTimer + Math.max(0, delta));
    return this.phaseTimer >= seconds;
  }

  private restoreFlags(value: boolean[] | undefined, count: number): boolean[] {
    return Array.from({ length: count }, (_, index) => Boolean(Array.isArray(value) && value[index]));
  }

  private normalizeMilestones(): void {
    const index = stepIndex(this.step);
    if (index >= stepIndex('detectCapitalShip')) {
      this.state.transmissionChannelsAligned = [true, true, true];
      this.state.transmissionDecoded = true;
    }
    if (index >= stepIndex('analyzeSignature')) this.state.capitalShipDetected = true;
    if (index >= stepIndex('receiveUltimatum')) this.state.capitalSignatureAnalyzed = true;
    if (index >= stepIndex('chooseResponse')) this.state.ultimatumReceived = true;
    if (index >= stepIndex('restoreThreeChannels') && this.state.coalitionResponseTone === 'none') {
      this.state.coalitionResponseTone = 'strategic';
    }
    if (index >= stepIndex('witnessDemonstration')) this.state.enclaveChannelsRestored = [true, true, true];
    if (index >= stepIndex('classifyAttackRoutes')) this.state.demonstrationObserved = true;
    if (index >= stepIndex('activatePleyadianNetwork')) this.state.attackRoutesClassified = [true, true, true];
    if (index >= stepIndex('detectSimultaneousAssault')) this.state.pleyadianNetworkActivated = true;
    if (index >= stepIndex('completed')) {
      this.state.simultaneousAssaultDetected = true;
      this.state.mission21Completed = true;
      this.state.mission22Unlocked = true;
    }
    this.state.mission22Unlocked = this.state.mission22Unlocked || this.state.mission21Completed;
  }
}
