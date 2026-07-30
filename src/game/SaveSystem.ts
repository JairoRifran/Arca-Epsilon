import type { ResourceSiteStatus, SurfaceResourceType } from '../assets/surfaceResourceDefinitions';
import type { ColonyState } from './ColonyManager';
import type { OrbitalScanDatum } from './HabitabilitySystem';
import type { ResourceInventoryState } from './ResourceInventory';
import type { Mission03SignalState } from './Mission03FirstContact';
import type { Mission03StepId } from '../assets/mission03Definitions';
import type { Mission04StepId } from '../assets/mission04Definitions';
import type { Mission05StepId, SilentProbeState } from '../assets/mission05Definitions';
import type { DefenseNetworkState } from './Mission04OrbitalDefense';
import type { TranslationState } from './SignalTranslationSystem';
import type { Mission06StepId } from '../assets/mission06Definitions';
import type { Mission07StepId } from '../assets/mission07Definitions';
import type { Mission08StepId } from '../assets/mission08Definitions';
import type { Mission09StepId } from '../assets/mission09Definitions';
import type { Mission10StepId } from '../assets/mission10Definitions';
import type { Mission11StepId } from '../assets/mission11Definitions';
import type { Mission12StepId } from '../assets/mission12Definitions';
import type { Mission13StepId } from '../assets/mission13Definitions';
import type { Mission14StepId } from '../assets/mission14Definitions';
import type { Mission15StepId } from '../assets/mission15Definitions';
import type { Mission16StepId } from '../assets/mission16Definitions';
import type { Mission17StepId } from '../assets/mission17Definitions';
import type { Mission18StepId } from '../assets/mission18Definitions';
import type { Mission19StepId, OperationalPriority } from '../assets/mission19Definitions';
import type { Mission20StepId } from '../assets/mission20Definitions';
import type { CoalitionResponseTone, Mission21StepId } from '../assets/mission21Definitions';
import type { Mission22FrontChoice, Mission22StepId } from '../assets/mission22Definitions';
import type {
  Mission23PlatformMethod,
  Mission23StepId,
  Mission23TargetId
} from '../assets/mission23Definitions';
import type { Mission24StepId } from '../assets/mission24Definitions';
import type { ArkDepartureStepId } from '../assets/arkDepartureDefinitions';
import type { ParasiteState } from './Mission15AuroraSabotage';

export type SavedResourcesFound = Record<SurfaceResourceType, boolean>;

export type SaveGameData = {
  version: 2;
  savedAt: number;
  currentPhase: 'space' | 'descent' | 'surface' | 'colonization';
  currentMissionId: string;
  currentMissionStep: string;
  e01Discovered: boolean;
  atlasMarkerScanned: boolean;
  descentCorridorDecoded: boolean;
  orbitalScanComplete?: boolean;
  habitabilityScore?: number;
  orbitalScanData?: OrbitalScanDatum[];
  descentAuthorized?: boolean;
  missingDescentRequirements?: string[];
  descentBlockedReason?: string;
  nereidaLandingCompleted: boolean;
  habitatModuleDeployed: boolean;
  scannedResources: SavedResourcesFound;
  surfaceSitesRevealed?: boolean;
  resourceSiteStatuses?: Record<'water' | 'minerals' | 'energy', ResourceSiteStatus>;
  colonyReadiness: number;
  baseNereidaOperational: boolean;
  currentObjective: string;
  lastKnownPhase: string;
  playerApproxPosition: [number, number, number];
  playerMode?: 'ship' | 'onFoot';
  characterPosition?: [number, number, number];
  shipSurfacePosition?: [number, number, number];
  insideShip?: boolean;
  characterUnlocked?: boolean;
  rampState?: 'retracted' | 'deployed';
  shipCameraMode?: 'external' | 'cockpit';
  colony: ColonyState;
  inventory: ResourceInventoryState;
  tutorialCompleted: string[];
  playedDialogueIds?: string[];
  lastCriticalDialogueId?: string;
  dialogueTextSpeed?: number;
  mission03Started?: boolean;
  mission03Step?: Mission03StepId;
  communicationCalibrated?: boolean;
  communicationCalibrationProgress?: number;
  relayBeaconPlaced?: boolean;
  relaySynchronized?: boolean;
  signalStability?: number;
  mission03SignalState?: Mission03SignalState;
  translationState?: TranslationState;
  translationProgress?: number;
  translatedFragments?: number;
  pleyadanContactEstablished?: boolean;
  atlasTranslationMatrixUnlocked?: boolean;
  galacticThreatKnown?: boolean;
  orbitalDefenseRequired?: boolean;
  mission04Unlocked?: boolean;
  mission03Completed?: boolean;
  mission04Started?: boolean;
  mission04Step?: Mission04StepId;
  defenseLinkCalibrated?: boolean;
  defenseLinkCalibrationProgress?: number;
  orbitalSensorActivated?: boolean;
  defensiveBeaconsPlaced?: boolean[];
  defenseNetworkSynchronized?: boolean;
  defenseSyncProgress?: number;
  defenseNetworkState?: DefenseNetworkState;
  activeDefenseBeaconTarget?: number;
  threatSignatureDetected?: boolean;
  mission04Completed?: boolean;
  mission05Unlocked?: boolean;
  mission05Started?: boolean;
  mission05Step?: Mission05StepId;
  probeDetected?: boolean;
  probeState?: SilentProbeState;
  interferenceActive?: boolean;
  activeEchoIndex?: number;
  echoesResolved?: number;
  counterSignalProgress?: number;
  probeRetreated?: boolean;
  firstHostileContactConfirmed?: boolean;
  mission05Completed?: boolean;
  mission06Unlocked?: boolean;
  mission06Started?: boolean;
  mission06Step?: Mission06StepId;
  interferenceResidueAnalyzed?: boolean;
  cloakingMatrixCalibrated?: boolean;
  cloakingProjectorsPlaced?: boolean[];
  cloakingProjectorsCalibrated?: boolean[];
  cloakingSyncProgress?: number;
  cloakingFieldOnline?: boolean;
  nereidaSignatureReduced?: boolean;
  mission06Completed?: boolean;
  mission07Unlocked?: boolean;
  mission07Started?: boolean;
  mission07Step?: Mission07StepId;
  subsurfaceSignalAnalyzed?: boolean;
  atlasFractureRevealed?: boolean;
  atlasEchoNodesScanned?: boolean[];
  atlasSeedArchiveUnlocked?: boolean;
  atlasSeedArchiveActivated?: boolean;
  seedWorldRevealed?: boolean;
  mission07Completed?: boolean;
  mission08Unlocked?: boolean;
  mission08Started?: boolean;
  mission08Step?: Mission08StepId;
  fractureTraceAnalyzed?: boolean;
  signalFractureRevealed?: boolean;
  fractureNodesStabilized?: boolean[];
  signalPurgeProgress?: number;
  signalFractureContained?: boolean;
  coalitionTraceResidual?: boolean;
  mission08Completed?: boolean;
  mission09Unlocked?: boolean;
  mission09Started?: boolean;
  mission09Step?: Mission09StepId;
  residualTraceAnalyzed?: boolean;
  auroraRouteDecoded?: boolean;
  auroraRouteBeaconsScanned?: boolean[];
  currentAuroraSector?: number;
  auroraSignalStrength?: number;
  auroraHorizonScanned?: boolean;
  auroraSectorDiscovered?: boolean;
  auroraLongRangeTravelCompleted?: boolean;
  mission09Completed?: boolean;
  mission10Unlocked?: boolean;
  // --- Mission 10: Primer Módulo Aurora. All optional, so saves written
  // before M10 existed load unchanged and simply start it fresh.
  mission10Started?: boolean;
  mission10Step?: Mission10StepId;
  auroraInitialSurveyComplete?: boolean;
  auroraWaterAnalyzed?: boolean;
  auroraSoilAnalyzed?: boolean;
  auroraAtmosphereAnalyzed?: boolean;
  auroraBioSafetyChecked?: boolean;
  auroraSettlementSiteMarked?: boolean;
  auroraModuleDeployed?: boolean;
  auroraModuleOperational?: boolean;
  auroraStabilizationProgress?: number;
  mission10Completed?: boolean;
  mission11Unlocked?: boolean;
  // --- Mission 11: Expansión Aurora. Optional like the M10 block, so saves
  // written before M11 existed load unchanged.
  mission11Started?: boolean;
  mission11Step?: Mission11StepId;
  auroraCoreDiagnosticComplete?: boolean;
  auroraSecondModuleSiteMarked?: boolean;
  auroraSecondModuleDeployed?: boolean;
  auroraEnergyLinkOnline?: boolean;
  auroraEnergyLinkProgress?: number;
  auroraWaterFilterInstalled?: boolean;
  auroraWaterFlowCalibrated?: boolean;
  auroraWaterFlowProgress?: number;
  auroraCultivationBedPrepared?: boolean;
  auroraBioTrialStarted?: boolean;
  auroraImpactAssessmentComplete?: boolean;
  auroraImpactAssessmentProgress?: number;
  auroraCoreOperational?: boolean;
  mission11Completed?: boolean;
  mission12Unlocked?: boolean;
  // --- Mission 12: Primeros Habitantes. Optional like the M10/M11 blocks,
  // so saves written before M12 existed load unchanged.
  mission12Started?: boolean;
  mission12Step?: Mission12StepId;
  auroraFirstCrewAuthorized?: boolean;
  auroraLifeSupportHumanReady?: boolean;
  auroraHabitationConfigured?: boolean;
  auroraLandingZoneMarked?: boolean;
  auroraCrewCapsuleLanded?: boolean;
  auroraFirstCrewDisembarked?: boolean;
  auroraHumanLoadCycleStarted?: boolean;
  auroraHumanLoadProgress?: number;
  auroraHumanLoadRecalibrated?: boolean;
  auroraRecalibrationProgress?: number;
  auroraInhabitedCoreStable?: boolean;
  auroraFirstNightRecorded?: boolean;
  mission12Completed?: boolean;
  mission13Unlocked?: boolean;
  // --- Mission 13: La Primera Tormenta. Optional like every Aurora block, so
  // saves written before M13 existed load unchanged with safe defaults.
  mission13Started?: boolean;
  mission13Step?: Mission13StepId;
  auroraStormAlertAcknowledged?: boolean;
  auroraGeneratorSecured?: boolean;
  auroraGeneratorProgress?: number;
  auroraAntennaAnchorsSecured?: boolean[];
  auroraAntennaOnline?: boolean;
  auroraShieldCharge?: number;
  auroraShieldOnline?: boolean;
  auroraStormPeakReached?: boolean;
  mission13Completed?: boolean;
  mission14Unlocked?: boolean;
  // --- Mission 14: La Marca que Quedó. Optional like every Aurora block, so
  // saves written before M14 existed load unchanged with safe defaults. Only
  // stable milestones are stored: the in-phase tuner, packet train, extraction
  // and closure timers are deliberately absent, so a reload always resumes at
  // the start of a phase rather than inside a half-finished interaction.
  mission14Started?: boolean;
  mission14Step?: Mission14StepId;
  coalitionTraceInspections?: boolean[];
  coalitionSignatureAnalyzed?: boolean;
  coalitionPowerNodePurged?: boolean;
  coalitionCommsNodePurged?: boolean;
  coalitionHiddenNodeLocated?: boolean;
  coalitionTraceSampleRecovered?: boolean;
  coalitionReverseTriangulationComplete?: boolean;
  mission14Completed?: boolean;
  mission15Unlocked?: boolean;
  // --- Mission 15: Sabotaje en Aurora. Optional like every Aurora block, so
  // saves written before M15 existed load unchanged with safe defaults. Only
  // stable milestones are stored. Pressure, surge, valves and overload remain
  // volatile; the comms sequence is persisted because its highlighted symbol
  // and logical progress must always restore as one checkpoint.
  mission15Started?: boolean;
  mission15Step?: Mission15StepId;
  auroraRoutineComplete?: boolean;
  auroraModuleSealed?: boolean;
  auroraModuleReleased?: boolean;
  auroraCoordinatedFailureConfirmed?: boolean;
  auroraParasiteStates?: ParasiteState[];
  auroraCommsSequence?: number[];
  auroraCommsSequenceStep?: number;
  auroraCommsSequenceCompleted?: boolean;
  auroraCentralOverloadResolved?: boolean;
  auroraParasiteAnalyzed?: boolean;
  mission15Completed?: boolean;
  mission16Unlocked?: boolean;
  // --- Mission 16: Protocolo Pleyadiano. Optional like every Aurora block, so
  // saves written before M16 existed load unchanged with safe defaults. Only
  // stable milestones are stored: the terminal hold, the node phase alignment
  // and the seed-world beat are volatile, so a reload resumes at the start of a
  // phase rather than inside a half-finished interaction.
  mission16Started?: boolean;
  mission16Step?: Mission16StepId;
  alertReceived?: boolean;
  linkFrequenciesCalibrated?: number;
  tripleLinkEstablished?: boolean;
  atlasKeyRecovered?: boolean;
  pleyadianSeedRevealed?: boolean;
  protocolsUnlocked?: boolean[];
  nodesSynchronized?: boolean[];
  simulationComplete?: boolean;
  defensePlansRecovered?: boolean;
  mission16Completed?: boolean;
  mission17Unlocked?: boolean;
  // --- Mission 17: Preparativos de Defensa. Optional like every Aurora block,
  // so saves written before M17 existed load unchanged with safe defaults. Only
  // stable milestones are stored: the terminal hold, the drill overload and the
  // incoming-signature beat are volatile, so a reload resumes at the start of a
  // phase rather than inside a half-finished interaction. Installed defences
  // are stored as flags, so a load restores them without ever duplicating one.
  mission17Started?: boolean;
  mission17Step?: Mission17StepId;
  councilReviewed?: boolean;
  energyCircuitsBalanced?: number;
  energyReserveOnline?: boolean;
  sensorsDeployed?: boolean[];
  sensorsCalibrated?: boolean;
  shieldEmittersInstalled?: boolean[];
  alertChannelsVerified?: number;
  alertNetworkOnline?: boolean;
  evacMarkersSet?: number;
  evacuationRoutesMarked?: boolean;
  defenseDrillComplete?: boolean;
  overloadStabilized?: boolean;
  incomingSignaturesDetected?: boolean;
  mission17Completed?: boolean;
  mission18Unlocked?: boolean;
  // --- Mission 18: Primer Fuego. Optional like every Aurora block, so saves
  // written before M18 existed load unchanged with safe defaults. Only stable
  // milestones are stored: live drones, projectiles, shield/energy meters and
  // battery cooldowns are deliberately absent, so a reload restarts the current
  // wave from its stable beginning rather than mid-dogfight.
  mission18Started?: boolean;
  mission18Step?: Mission18StepId;
  emergencyProtocolActive?: boolean;
  hostilesIdentified?: boolean;
  defenseWeaponsAuthorized?: boolean;
  firstWaveCleared?: boolean;
  criticalSystemStabilized?: boolean;
  interceptComplete?: boolean;
  shieldDefended?: boolean;
  enemyTransmissionSent?: boolean;
  finalDroneDestroyed?: boolean;
  wreckageRecovered?: boolean;
  nereidaTargetConfirmed?: boolean;
  dronesDestroyed?: number;
  mission18Completed?: boolean;
  mission19Unlocked?: boolean;
  // --- Mission 19: Nereida bajo Ataque. Optional like every Aurora block, so
  // older saves load unchanged with safe defaults. Only stable milestones are
  // stored: live enemies, projectiles, particles and the integrity/stability
  // meters are deliberately absent, so a reload restarts the current wave from
  // a stable state and can never load a corrupt physical situation.
  mission19Started?: boolean;
  mission19Step?: Mission19StepId;
  emergencyCallConfirmed?: boolean;
  arrivedAtNereida?: boolean;
  airspaceCleared?: boolean;
  landedAtNereida?: boolean;
  defensesRestored?: boolean[];
  groundIncursionRepelled?: boolean;
  atlasProtected?: boolean;
  operationalPriority?: OperationalPriority;
  counterattackActivated?: boolean;
  dataLeakConfirmed?: boolean;
  nereidaWreckageRecovered?: boolean;
  auroraLinkRepaired?: boolean;
  arkTargetConfirmed?: boolean;
  intrudersDestroyed?: number;
  mission19Completed?: boolean;
  mission20Unlocked?: boolean;
  // --- Mission 20: Batalla por el Arca. Optional like every later block, so
  // older saves load unchanged. Only stable milestones are stored: live
  // hostiles, projectiles and the hull/engine/module meters are deliberately
  // absent, so a reload restarts the current wave from a stable checkpoint.
  mission20Started?: boolean;
  mission20Step?: Mission20StepId;
  ascentComplete?: boolean;
  arkReached?: boolean;
  arkLinksRestored?: boolean[];
  /** Named apart from M18's `firstWaveCleared` so the two never collide. */
  arkFirstWaveCleared?: boolean;
  jammerLocated?: boolean;
  jammerDisabled?: boolean;
  enginesDefended?: boolean;
  civilianModulesProtected?: boolean;
  dataBreachStopped?: boolean;
  arkCounterattackActive?: boolean;
  finalWaveCleared?: boolean;
  arkStabilized?: boolean;
  capitalSignatureDetected?: boolean;
  dataSiphoned?: number;
  hostilesDestroyed?: number;
  mission20Completed?: boolean;
  mission21Unlocked?: boolean;
  // --- Mission 21: La ruptura del Silencio. Optional for compatibility with
  // every save written before M21. Only stable narrative and link milestones
  // are stored; capital-ship pulses and transient interference are rebuilt.
  mission21Started?: boolean;
  mission21Step?: Mission21StepId;
  transmissionChannelsAligned?: boolean[];
  transmissionDecoded?: boolean;
  capitalShipDetected?: boolean;
  capitalSignatureAnalyzed?: boolean;
  ultimatumReceived?: boolean;
  coalitionResponseTone?: CoalitionResponseTone;
  enclaveChannelsRestored?: boolean[];
  demonstrationObserved?: boolean;
  attackRoutesClassified?: boolean[];
  pleyadianNetworkActivated?: boolean;
  simultaneousAssaultDetected?: boolean;
  mission21Completed?: boolean;
  mission22Unlocked?: boolean;
  // --- Mission 22: Frentes rotos. Optional for all older saves. Live drones,
  // projectiles and temporary pressure timers are rebuilt from stable steps.
  mission22Started?: boolean;
  mission22Step?: Mission22StepId;
  auroraIntegrity?: number;
  nereidaIntegrity?: number;
  orbitalIntegrity?: number;
  mission22InitialEnergyFront?: Mission22FrontChoice;
  mission22InitialDefenseFront?: Mission22FrontChoice;
  mission22InitialCommsFront?: Mission22FrontChoice;
  auroraFrontDefended?: boolean;
  nereidaFrontDefended?: boolean;
  orbitalRelaysProtected?: boolean[];
  crossFrontCrisisManaged?: boolean;
  mission22SupportPriority?: Mission22FrontChoice;
  jointNetworkRestored?: boolean;
  coordinationNodesDetected?: boolean[];
  finalPressureSurvived?: boolean;
  mission22Completed?: boolean;
  mission23Unlocked?: boolean;
  // --- Mission 23: La contraofensiva. Only stable choices and milestones are
  // persisted. Live enemies, projectiles and collapse timers restart safely.
  mission23Started?: boolean;
  mission23Step?: Mission23StepId;
  mission23TargetOrder?: Mission23TargetId[];
  jointForcesSynchronized?: boolean;
  jammerTriangulationReadings?: boolean[];
  jammerNodeDestroyed?: boolean;
  platformDefensesDisabled?: boolean;
  platformEnergyDisabled?: boolean;
  mission23PlatformMethod?: Mission23PlatformMethod;
  logisticsPlatformDestroyed?: boolean;
  jumpBeaconAnchorsDisabled?: boolean[];
  jumpBeaconDestroyed?: boolean;
  escapeCompleted?: boolean;
  enemyRouteRecovered?: boolean;
  returnToArkConfirmed?: boolean;
  mission23Completed?: boolean;
  mission24Unlocked?: boolean;
  // Mission 24: stable narrative checkpoints only. Transient ascent forces,
  // input, particles, audio and turbulence are deliberately not persisted.
  mission24Started?: boolean;
  mission24Step?: Mission24StepId;
  returnRouteDecoded?: boolean;
  launchPrepared?: boolean;
  shipBoardedForReturn?: boolean;
  ignitionComplete?: boolean;
  takeoffComplete?: boolean;
  lowAtmosphereComplete?: boolean;
  cloudLayerComplete?: boolean;
  midAtmosphereComplete?: boolean;
  upperAtmosphereComplete?: boolean;
  vacuumTransitionComplete?: boolean;
  orbitalInsertionComplete?: boolean;
  orbitStabilized?: boolean;
  mission24ArkReached?: boolean;
  arkDamageAssessments?: boolean[];
  arkDamageAssessed?: boolean;
  enclaveLinksRestored?: boolean[];
  allEnclaveLinksRestored?: boolean;
  arkSystemsPrepared?: boolean[];
  allArkSystemsPrepared?: boolean;
  pleyadianNodesIntegrated?: boolean[];
  pleyadianNetworkIntegrated?: boolean;
  civilianSheltersPrepared?: boolean;
  alliedForcesAssembled?: boolean;
  startingSectorPointsVisited?: boolean[];
  startingSectorRevisited?: boolean;
  defenseRehearsalComplete?: boolean;
  finalFleetDetected?: boolean;
  finalFormationEntered?: boolean;
  mission24Completed?: boolean;
  mission25Unlocked?: boolean;

  // --- Mission 01 prologue: departure from Arca Epsilon --------------------
  // All optional. A save written before the prologue existed has none of
  // these, and `ArkDepartureSequence.markLegacySaveAsCompleted` reads that
  // absence as "this pilot already launched" — so an older save is never sent
  // back to the hangar and never replays the introduction.
  arkDepartureStep?: ArkDepartureStepId;
  arkDepartureStarted?: boolean;
  commanderIntroPlayed?: boolean;
  missionContextPlayed?: boolean;
  preflightComplete?: boolean;
  clampsReleased?: boolean;
  undockingStarted?: boolean;
  arkCleared?: boolean;
  arkDepartureCompleted?: boolean;

  // --- Mission 01 onboarding: flight tutorial, assist and recon beacon -----
  // Also all optional, and for the same reason. A save without these is a
  // pilot from before the onboarding existed: they already flew, so the
  // tutorial restores as finished and the assist as `off` rather than being
  // replayed at them. See `Mission01FlightAssist.restore`, where `off` is
  // forced for any save past the tutorial regardless of what the file says —
  // that is what stops assist leaking into later missions.
  mission01TutorialStarted?: boolean;
  mission01TutorialStep?: string;
  mission01TutorialCompletedSteps?: string[];
  mission01AssistLevel?: string;
  mission01AssistEngaged?: boolean;
  mission01BeaconPhase?: string;
  mission01BeaconLocated?: boolean;
  mission01BeaconScanned?: boolean;
  /** Persisted at 25% checkpoints, never mid-stream. */
  mission01TransferProgress?: number;
};

type LegacySaveGameData = Omit<SaveGameData, 'version' | 'tutorialCompleted'> & {
  version: 1;
  tutorialCompleted?: string[];
};

export type SaveLoadStatus = 'idle' | 'saved' | 'loaded' | 'migrated' | 'missing' | 'corrupt' | 'unsupported' | 'blocked';

export class SaveSystem {
  static readonly key = 'arca-epsilon-save-v2';
  static readonly legacyKey = 'arca-epsilon-save-v1';

  lastSaveTime = 0;
  lastLoadStatus: SaveLoadStatus = 'idle';
  lastWarning = '';

  saveGame(data: Omit<SaveGameData, 'version' | 'savedAt'>): SaveGameData {
    const payload: SaveGameData = {
      version: 2,
      savedAt: Date.now(),
      ...data
    };

    try {
      window.localStorage.setItem(SaveSystem.key, JSON.stringify(payload));
      this.lastSaveTime = payload.savedAt;
      this.lastLoadStatus = 'saved';
      this.lastWarning = '';
    } catch {
      this.lastLoadStatus = 'blocked';
      this.lastWarning = 'El navegador bloqueo el almacenamiento local.';
    }

    return payload;
  }

  loadGame(): SaveGameData | undefined {
    let sourceKey = SaveSystem.key;
    let raw = '';
    try {
      const currentRaw = window.localStorage.getItem(SaveSystem.key);
      const legacyRaw = window.localStorage.getItem(SaveSystem.legacyKey);
      sourceKey = currentRaw !== null ? SaveSystem.key : SaveSystem.legacyKey;
      raw = currentRaw ?? legacyRaw ?? '';
      if (!raw) {
        this.lastLoadStatus = 'missing';
        this.lastWarning = '';
        return undefined;
      }
      const parsed = JSON.parse(raw) as SaveGameData | LegacySaveGameData | { version?: unknown };
      if (parsed.version !== 1 && parsed.version !== 2) {
        this.lastLoadStatus = 'unsupported';
        this.lastWarning = 'La partida pertenece a una version no compatible.';
        return undefined;
      }
      if (!this.isStructurallyValid(parsed)) {
        this.quarantineCorruptSave(sourceKey, raw);
        this.lastLoadStatus = 'corrupt';
        this.lastWarning = 'La partida local estaba incompleta o danada y no fue cargada.';
        return undefined;
      }
      if (parsed.version === 1) {
        const migrated: SaveGameData = {
          ...parsed,
          version: 2,
          tutorialCompleted: parsed.tutorialCompleted ?? [],
          playedDialogueIds: parsed.playedDialogueIds ?? [],
          lastCriticalDialogueId: parsed.lastCriticalDialogueId ?? ''
        };
        window.localStorage.setItem(SaveSystem.key, JSON.stringify(migrated));
        this.lastSaveTime = migrated.savedAt || 0;
        this.lastLoadStatus = 'migrated';
        this.lastWarning = 'Partida anterior migrada al formato actual.';
        return migrated;
      }
      this.lastSaveTime = parsed.savedAt || 0;
      this.lastLoadStatus = 'loaded';
      this.lastWarning = '';
      return {
        ...parsed,
        tutorialCompleted: parsed.tutorialCompleted ?? [],
        playedDialogueIds: parsed.playedDialogueIds ?? [],
        lastCriticalDialogueId: parsed.lastCriticalDialogueId ?? ''
      };
    } catch {
      if (raw) this.quarantineCorruptSave(sourceKey, raw);
      this.lastLoadStatus = 'corrupt';
      this.lastWarning = 'No se pudo interpretar la partida local. Se iniciara sin cargarla.';
      return undefined;
    }
  }

  clearSave(): void {
    try {
      window.localStorage.removeItem(SaveSystem.key);
      window.localStorage.removeItem(SaveSystem.legacyKey);
    } catch {
      // Ignore blocked storage.
    }
    this.lastSaveTime = 0;
    this.lastLoadStatus = 'idle';
    this.lastWarning = '';
  }

  hasSave(): boolean {
    try {
      return window.localStorage.getItem(SaveSystem.key) !== null || window.localStorage.getItem(SaveSystem.legacyKey) !== null;
    } catch {
      return false;
    }
  }

  exportDebugSaveObject(): SaveGameData | undefined {
    return this.loadGame();
  }

  private quarantineCorruptSave(sourceKey: string, raw: string): void {
    try {
      window.localStorage.setItem(`${sourceKey}-corrupt-backup`, raw);
      window.localStorage.removeItem(sourceKey);
    } catch {
      // The warning state still reaches the UI if storage cleanup is blocked.
    }
  }

  private isStructurallyValid(value: unknown): value is SaveGameData | LegacySaveGameData {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<SaveGameData | LegacySaveGameData>;
    return Boolean(
      (candidate.version === 1 || candidate.version === 2) &&
        typeof candidate.currentPhase === 'string' &&
        typeof candidate.currentMissionStep === 'string' &&
        Array.isArray(candidate.playerApproxPosition) &&
        candidate.playerApproxPosition.length === 3 &&
        candidate.colony &&
        candidate.inventory &&
        candidate.scannedResources
    );
  }
}
