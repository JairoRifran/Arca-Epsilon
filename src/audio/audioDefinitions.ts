/**
 * War score (M18 onward): one cue per beat of the campaign against the
 * Coalition of Silence. Every id here has a generated MP3 under
 * `/audio/music/`; the prompts, durations and mix hints that produced them
 * live in `musicWarScore.json` + `musicGenerationDefinitions.ts`, which is the
 * single source of truth for the metadata. Only the names are repeated here,
 * because a TypeScript union cannot be derived from a JSON array.
 */
export type WarMusicTrackId =
  // Dynamic beds: the two levels the director rests on between set pieces.
  | 'music-war-ambient'
  | 'music-war-alert'
  // M18-M20 set pieces.
  | 'music-first-fire'
  | 'music-space-interception'
  | 'music-nereida-under-attack'
  | 'music-atlas-breach'
  | 'music-ark-battle'
  // M21-M22.
  | 'music-silence-rupture'
  | 'music-broken-fronts'
  // M23-M25. Registered and resolvable, but only wired where the mission
  // that uses them already exists.
  | 'music-counteroffensive'
  | 'music-return-to-origin'
  | 'music-final-orbit-intro'
  | 'music-final-orbit-assault'
  | 'music-final-orbit-shield-break'
  | 'music-final-orbit-allies'
  | 'music-final-orbit-last-stand'
  | 'music-final-orbit-resolution'
  | 'music-ark-no-longer-alone';

export type MusicTrackId =
  | 'music-main-theme'
  | 'music-space-exploration'
  | 'music-orbit-atlas'
  | 'music-atmospheric-entry'
  | 'music-surface-nereida'
  | 'music-first-contact'
  | 'music-defense-network'
  | 'music-shadow-orbit'
  | 'music-calm-exploration'
  | 'music-deep-space'
  | 'music-atlas-mystery'
  // --- Aurora expedition score: one bed per leg of the journey. These have
  // no generated files yet; MusicManager falls back down TRACK_FALLBACKS
  // until the pipeline produces them.
  | 'music-aurora-departure'
  | 'music-aurora-ash-plains'
  | 'music-aurora-atlas-canyons'
  | 'music-aurora-storm-plateau'
  | 'music-aurora-pre-reveal'
  | 'music-aurora-reveal'
  | 'music-aurora-completion'
  // --- Mission 13 score. These live under /audio/mission-13/music/ rather
  // than the generator's own folder, so they are declared in
  // MISSION13_STATIC_ASSETS below instead of arriving via audio-manifest.json.
  | 'music-m13-calm-before-storm'
  | 'music-m13-storm-rising'
  | 'music-m13-storm-peak'
  | 'music-m13-after-the-storm'
  | WarMusicTrackId;

export type MusicLayerId = 'music-layer-tension' | 'music-layer-interference';

export type MusicStingId =
  | 'music-sting-discovery'
  | 'music-sting-complete'
  | 'music-resolution-pad';

export type SfxTrackId =
  | 'sfx-ship-idle'
  | 'sfx-ship-accelerate'
  | 'sfx-hover-wash'
  | 'sfx-vertical-thrust'
  | 'sfx-boost-intensity'
  | 'sfx-brake-release'
  | 'sfx-space-cruise'
  | 'sfx-atmospheric-flight'
  | 'sfx-lift-motor'
  | 'sfx-hatch-open'
  | 'sfx-hatch-close'
  | 'sfx-platform-lock'
  | 'sfx-scanner-pulse'
  | 'sfx-atlas-signal'
  | 'sfx-relay-pulse'
  | 'sfx-defense-sync'
  | 'sfx-pleyadan-transmission'
  | 'sfx-interference-glitch'
  | 'sfx-probe-detected'
  | 'sfx-echo-resolved'
  | 'sfx-counter-signal'
  | 'sfx-probe-retreat'
  | 'sfx-mission-complete'
  | 'sfx-anomaly-detected'
  | 'sfx-comm-start'
  | 'sfx-comm-end'
  | 'sfx-footstep-walk-01'
  | 'sfx-footstep-walk-02'
  | 'sfx-footstep-walk-03'
  | 'sfx-footstep-run-01'
  | 'sfx-footstep-run-02'
  | 'sfx-footstep-run-03'
  // --- Aurora expedition ambience/one-shots. No generated files yet; every
  // cue below declares an existing-asset fallback in sfxCueFallbacks so the
  // journey still sounds like something before the pipeline runs.
  | 'sfx-aurora-wind-gust'
  | 'sfx-aurora-dust-sweep'
  | 'sfx-ship-turbulence-light'
  | 'sfx-atlas-route-lock'
  | 'sfx-base-signal-drop'
  | 'sfx-far-thunder'
  | 'sfx-aurora-fog-open'
  | 'sfx-aurora-reveal-swell'
  | 'sfx-route-beacon-scan'
  | 'sfx-route-beacon-confirm'
  // --- Mission 13: storm ambience, station work and shield. Declared in
  // MISSION13_STATIC_ASSETS with their /audio/mission-13/ paths; every one
  // has a fallback below so the mission is audible before they are authored.
  | 'sfx-m13-wind-distant-loop'
  | 'sfx-m13-wind-heavy-loop'
  | 'sfx-m13-electromagnetic-hum-loop'
  | 'sfx-m13-habitat-alarm-loop'
  | 'sfx-m13-debris-impacts-loop'
  | 'sfx-m13-generator-sparks-01'
  | 'sfx-m13-generator-sparks-02'
  | 'sfx-m13-generator-repair-loop'
  | 'sfx-m13-generator-stabilized'
  | 'sfx-m13-antenna-anchor-lock-01'
  | 'sfx-m13-antenna-anchor-lock-02'
  | 'sfx-m13-antenna-servo-loop'
  | 'sfx-m13-antenna-online'
  | 'sfx-m13-em-discharge-near-01'
  | 'sfx-m13-em-discharge-near-02'
  | 'sfx-m13-em-discharge-distant-01'
  | 'sfx-m13-em-discharge-distant-02'
  | 'sfx-m13-shield-charge-loop'
  | 'sfx-m13-shield-charge-warning'
  | 'sfx-m13-shield-activated'
  | 'sfx-m13-shield-impact-01'
  | 'sfx-m13-shield-impact-02'
  | 'sfx-m13-objective-complete'
  | 'sfx-m13-mission-complete';

export type AudioAssetId = MusicTrackId | MusicLayerId | MusicStingId | SfxTrackId;
export type AudioCategory = 'music' | 'sfx';

/**
 * Every war cue, in narrative order. Registering an id here is what makes the
 * MP3 reachable: `AudioManager` only serves assets whose id appears in the
 * runtime manifest, and the manifest is rebuilt from these same names.
 */
export const warMusicTrackIds = [
  'music-war-ambient',
  'music-war-alert',
  'music-first-fire',
  'music-space-interception',
  'music-nereida-under-attack',
  'music-atlas-breach',
  'music-ark-battle',
  'music-silence-rupture',
  'music-broken-fronts',
  'music-counteroffensive',
  'music-return-to-origin',
  'music-final-orbit-intro',
  'music-final-orbit-assault',
  'music-final-orbit-shield-break',
  'music-final-orbit-allies',
  'music-final-orbit-last-stand',
  'music-final-orbit-resolution',
  'music-ark-no-longer-alone'
] as const satisfies readonly WarMusicTrackId[];

type AssertNever<T extends never> = T;
/**
 * Compile-time guard: adding a cue to `WarMusicTrackId` without listing it
 * above (so it never reaches the manifest and silently never plays) fails the
 * build here rather than going unnoticed in game.
 */
export type WarCueCoverage = AssertNever<Exclude<WarMusicTrackId, (typeof warMusicTrackIds)[number]>>;

export const musicTrackIds: readonly MusicTrackId[] = [
  'music-main-theme',
  'music-space-exploration',
  'music-orbit-atlas',
  'music-atmospheric-entry',
  'music-surface-nereida',
  'music-first-contact',
  'music-defense-network',
  'music-shadow-orbit',
  'music-calm-exploration',
  'music-deep-space',
  'music-atlas-mystery',
  'music-aurora-departure',
  'music-aurora-ash-plains',
  'music-aurora-atlas-canyons',
  'music-aurora-storm-plateau',
  'music-aurora-pre-reveal',
  'music-aurora-reveal',
  'music-aurora-completion',
  'music-m13-calm-before-storm',
  'music-m13-storm-rising',
  'music-m13-storm-peak',
  'music-m13-after-the-storm',
  ...warMusicTrackIds
];

export const musicLayerIds: readonly MusicLayerId[] = [
  'music-layer-tension',
  'music-layer-interference'
];

export const musicStingIds: readonly MusicStingId[] = [
  'music-sting-discovery',
  'music-sting-complete',
  'music-resolution-pad'
];

export const sfxTrackIds: readonly SfxTrackId[] = [
  'sfx-ship-idle',
  'sfx-ship-accelerate',
  'sfx-hover-wash',
  'sfx-vertical-thrust',
  'sfx-boost-intensity',
  'sfx-brake-release',
  'sfx-space-cruise',
  'sfx-atmospheric-flight',
  'sfx-lift-motor',
  'sfx-hatch-open',
  'sfx-hatch-close',
  'sfx-platform-lock',
  'sfx-scanner-pulse',
  'sfx-atlas-signal',
  'sfx-relay-pulse',
  'sfx-defense-sync',
  'sfx-pleyadan-transmission',
  'sfx-interference-glitch',
  'sfx-probe-detected',
  'sfx-echo-resolved',
  'sfx-counter-signal',
  'sfx-probe-retreat',
  'sfx-mission-complete',
  'sfx-anomaly-detected',
  'sfx-comm-start',
  'sfx-comm-end',
  'sfx-footstep-walk-01',
  'sfx-footstep-walk-02',
  'sfx-footstep-walk-03',
  'sfx-footstep-run-01',
  'sfx-footstep-run-02',
  'sfx-footstep-run-03',
  'sfx-aurora-wind-gust',
  'sfx-aurora-dust-sweep',
  'sfx-ship-turbulence-light',
  'sfx-atlas-route-lock',
  'sfx-base-signal-drop',
  'sfx-far-thunder',
  'sfx-aurora-fog-open',
  'sfx-aurora-reveal-swell',
  'sfx-route-beacon-scan',
  'sfx-route-beacon-confirm',
  'sfx-m13-wind-distant-loop',
  'sfx-m13-wind-heavy-loop',
  'sfx-m13-electromagnetic-hum-loop',
  'sfx-m13-habitat-alarm-loop',
  'sfx-m13-debris-impacts-loop',
  'sfx-m13-generator-sparks-01',
  'sfx-m13-generator-sparks-02',
  'sfx-m13-generator-repair-loop',
  'sfx-m13-generator-stabilized',
  'sfx-m13-antenna-anchor-lock-01',
  'sfx-m13-antenna-anchor-lock-02',
  'sfx-m13-antenna-servo-loop',
  'sfx-m13-antenna-online',
  'sfx-m13-em-discharge-near-01',
  'sfx-m13-em-discharge-near-02',
  'sfx-m13-em-discharge-distant-01',
  'sfx-m13-em-discharge-distant-02',
  'sfx-m13-shield-charge-loop',
  'sfx-m13-shield-charge-warning',
  'sfx-m13-shield-activated',
  'sfx-m13-shield-impact-01',
  'sfx-m13-shield-impact-02',
  'sfx-m13-objective-complete',
  'sfx-m13-mission-complete'
];

export const engineAudioAssetIds: readonly SfxTrackId[] = [
  'sfx-ship-idle',
  'sfx-ship-accelerate',
  'sfx-hover-wash',
  'sfx-vertical-thrust',
  'sfx-boost-intensity',
  'sfx-brake-release',
  'sfx-space-cruise',
  'sfx-atmospheric-flight'
];

export const musicAssetIds: readonly AudioAssetId[] = [
  ...musicTrackIds,
  ...musicLayerIds,
  ...musicStingIds
];

export const expectedAudioAssetIds: readonly AudioAssetId[] = [
  ...musicAssetIds,
  ...sfxTrackIds
];

const engineAudioAssetSet = new Set<AudioAssetId>(engineAudioAssetIds);

export function isEngineAudioAsset(id: AudioAssetId): boolean {
  return engineAudioAssetSet.has(id);
}

export interface AudioManifestEntry {
  id: AudioAssetId;
  path: string;
  category: AudioCategory;
  loop: boolean;
  available: boolean;
  durationSeconds: number;
  tags: string[];
}

export interface AudioManifest {
  version: number;
  generatedAt: string | null;
  assets: AudioManifestEntry[];
}

export interface MusicContext {
  phase: string;
  currentMissionId: string;
  missionStep: string;
  interferenceActive: boolean;
  /** Contained danger: unstable sync, blocked descent, anomaly present. */
  tensionActive: boolean;
  /** Comms on screen: the score steps back so words stay intelligible. */
  dialogueActive: boolean;
  /** Current leg of the Aurora expedition, when M09 is under way. */
  auroraSegment?: AuroraTravelSegment | null;
}

export type SfxCue =
  | 'shipEngine'
  | 'shipThrust'
  | 'liftServo'
  | 'liftLock'
  | 'hatch'
  | 'hatchClose'
  | 'scanner'
  | 'atlas'
  | 'pleyadanContact'
  | 'defenseBeacon'
  | 'defenseNetwork'
  | 'silentProbe'
  | 'silentProbeInterference'
  | 'echoResolved'
  | 'counterSignal'
  | 'probeRetreat'
  | 'missionComplete'
  | 'commStart'
  | 'commEnd'
  | 'confirm'
  | 'warning'
  | 'auroraWindGust'
  | 'auroraDustSweep'
  | 'shipTurbulence'
  | 'atlasRouteLock'
  | 'baseSignalDrop'
  | 'farThunder'
  | 'auroraFogOpen'
  | 'auroraRevealSwell'
  | 'routeBeaconScan'
  | 'routeBeaconConfirm'
  // --- Mission 13 ---
  | 'stormWindDistant'
  | 'stormWindHeavy'
  | 'stormEmHum'
  | 'stormHabitatAlarm'
  | 'stormDebris'
  | 'stormGeneratorSparksA'
  | 'stormGeneratorSparksB'
  | 'stormGeneratorRepair'
  | 'stormGeneratorStabilized'
  | 'stormAnchorLockA'
  | 'stormAnchorLockB'
  | 'stormAntennaServo'
  | 'stormAntennaOnline'
  | 'stormDischargeNearA'
  | 'stormDischargeNearB'
  | 'stormDischargeFarA'
  | 'stormDischargeFarB'
  | 'stormShieldCharge'
  | 'stormShieldWarning'
  | 'stormShieldActivated'
  | 'stormShieldImpactA'
  | 'stormShieldImpactB'
  | 'stormObjectiveComplete'
  | 'stormMissionComplete';

export const sfxCues: Record<SfxCue, SfxTrackId> = {
  shipEngine: 'sfx-ship-idle',
  shipThrust: 'sfx-vertical-thrust',
  liftServo: 'sfx-lift-motor',
  liftLock: 'sfx-platform-lock',
  hatch: 'sfx-hatch-open',
  hatchClose: 'sfx-hatch-close',
  scanner: 'sfx-scanner-pulse',
  atlas: 'sfx-atlas-signal',
  pleyadanContact: 'sfx-pleyadan-transmission',
  defenseBeacon: 'sfx-relay-pulse',
  defenseNetwork: 'sfx-defense-sync',
  silentProbe: 'sfx-probe-detected',
  silentProbeInterference: 'sfx-interference-glitch',
  echoResolved: 'sfx-echo-resolved',
  counterSignal: 'sfx-counter-signal',
  probeRetreat: 'sfx-probe-retreat',
  missionComplete: 'sfx-mission-complete',
  commStart: 'sfx-comm-start',
  commEnd: 'sfx-comm-end',
  confirm: 'sfx-comm-start',
  warning: 'sfx-anomaly-detected',
  auroraWindGust: 'sfx-aurora-wind-gust',
  auroraDustSweep: 'sfx-aurora-dust-sweep',
  shipTurbulence: 'sfx-ship-turbulence-light',
  atlasRouteLock: 'sfx-atlas-route-lock',
  baseSignalDrop: 'sfx-base-signal-drop',
  farThunder: 'sfx-far-thunder',
  auroraFogOpen: 'sfx-aurora-fog-open',
  auroraRevealSwell: 'sfx-aurora-reveal-swell',
  routeBeaconScan: 'sfx-route-beacon-scan',
  routeBeaconConfirm: 'sfx-route-beacon-confirm',
  stormWindDistant: 'sfx-m13-wind-distant-loop',
  stormWindHeavy: 'sfx-m13-wind-heavy-loop',
  stormEmHum: 'sfx-m13-electromagnetic-hum-loop',
  stormHabitatAlarm: 'sfx-m13-habitat-alarm-loop',
  stormDebris: 'sfx-m13-debris-impacts-loop',
  stormGeneratorSparksA: 'sfx-m13-generator-sparks-01',
  stormGeneratorSparksB: 'sfx-m13-generator-sparks-02',
  stormGeneratorRepair: 'sfx-m13-generator-repair-loop',
  stormGeneratorStabilized: 'sfx-m13-generator-stabilized',
  stormAnchorLockA: 'sfx-m13-antenna-anchor-lock-01',
  stormAnchorLockB: 'sfx-m13-antenna-anchor-lock-02',
  stormAntennaServo: 'sfx-m13-antenna-servo-loop',
  stormAntennaOnline: 'sfx-m13-antenna-online',
  stormDischargeNearA: 'sfx-m13-em-discharge-near-01',
  stormDischargeNearB: 'sfx-m13-em-discharge-near-02',
  stormDischargeFarA: 'sfx-m13-em-discharge-distant-01',
  stormDischargeFarB: 'sfx-m13-em-discharge-distant-02',
  stormShieldCharge: 'sfx-m13-shield-charge-loop',
  stormShieldWarning: 'sfx-m13-shield-charge-warning',
  stormShieldActivated: 'sfx-m13-shield-activated',
  stormShieldImpactA: 'sfx-m13-shield-impact-01',
  stormShieldImpactB: 'sfx-m13-shield-impact-02',
  stormObjectiveComplete: 'sfx-m13-objective-complete',
  stormMissionComplete: 'sfx-m13-mission-complete'
};

/**
 * Mission 13 audio lives in its own `/audio/mission-13/` tree rather than the
 * generator's `/audio/generated/` + `/audio/music/` pair, so these entries are
 * declared here and registered directly with the AudioManager instead of
 * arriving through `audio-manifest.json`.
 *
 * Availability is proven by the fetch itself: a file that has not been
 * authored yet simply fails to load once, is cached as unavailable, and the
 * cue falls back to an existing sound. Nothing here asserts that the MP3s
 * exist.
 */
export type StaticAudioAsset = {
  id: AudioAssetId;
  path: string;
  category: AudioCategory;
  loop: boolean;
  durationSeconds: number;
};

const M13_MUSIC = '/audio/mission-13/music';
const M13_AMBIENCE = '/audio/mission-13/ambience';
const M13_SFX = '/audio/mission-13/sfx';

export const MISSION13_STATIC_ASSETS: readonly StaticAudioAsset[] = [
  // Score
  { id: 'music-m13-calm-before-storm', path: `${M13_MUSIC}/m13-calm-before-storm.mp3`, category: 'music', loop: true, durationSeconds: 70 },
  { id: 'music-m13-storm-rising', path: `${M13_MUSIC}/m13-storm-rising.mp3`, category: 'music', loop: true, durationSeconds: 80 },
  { id: 'music-m13-storm-peak', path: `${M13_MUSIC}/m13-storm-peak.mp3`, category: 'music', loop: true, durationSeconds: 80 },
  { id: 'music-m13-after-the-storm', path: `${M13_MUSIC}/m13-after-the-storm.mp3`, category: 'music', loop: true, durationSeconds: 60 },
  // Ambience loops
  { id: 'sfx-m13-wind-distant-loop', path: `${M13_AMBIENCE}/m13-wind-distant-loop.mp3`, category: 'sfx', loop: true, durationSeconds: 20 },
  { id: 'sfx-m13-wind-heavy-loop', path: `${M13_AMBIENCE}/m13-wind-heavy-loop.mp3`, category: 'sfx', loop: true, durationSeconds: 20 },
  { id: 'sfx-m13-electromagnetic-hum-loop', path: `${M13_AMBIENCE}/m13-electromagnetic-hum-loop.mp3`, category: 'sfx', loop: true, durationSeconds: 16 },
  { id: 'sfx-m13-habitat-alarm-loop', path: `${M13_AMBIENCE}/m13-habitat-alarm-loop.mp3`, category: 'sfx', loop: true, durationSeconds: 8 },
  { id: 'sfx-m13-debris-impacts-loop', path: `${M13_AMBIENCE}/m13-debris-impacts-loop.mp3`, category: 'sfx', loop: true, durationSeconds: 14 },
  // Generator
  { id: 'sfx-m13-generator-sparks-01', path: `${M13_SFX}/m13-generator-sparks-01.mp3`, category: 'sfx', loop: false, durationSeconds: 1.2 },
  { id: 'sfx-m13-generator-sparks-02', path: `${M13_SFX}/m13-generator-sparks-02.mp3`, category: 'sfx', loop: false, durationSeconds: 1.2 },
  { id: 'sfx-m13-generator-repair-loop', path: `${M13_SFX}/m13-generator-repair-loop.mp3`, category: 'sfx', loop: true, durationSeconds: 6 },
  { id: 'sfx-m13-generator-stabilized', path: `${M13_SFX}/m13-generator-stabilized.mp3`, category: 'sfx', loop: false, durationSeconds: 2.5 },
  // Antenna
  { id: 'sfx-m13-antenna-anchor-lock-01', path: `${M13_SFX}/m13-antenna-anchor-lock-01.mp3`, category: 'sfx', loop: false, durationSeconds: 1.6 },
  { id: 'sfx-m13-antenna-anchor-lock-02', path: `${M13_SFX}/m13-antenna-anchor-lock-02.mp3`, category: 'sfx', loop: false, durationSeconds: 1.6 },
  { id: 'sfx-m13-antenna-servo-loop', path: `${M13_SFX}/m13-antenna-servo-loop.mp3`, category: 'sfx', loop: true, durationSeconds: 5 },
  { id: 'sfx-m13-antenna-online', path: `${M13_SFX}/m13-antenna-online.mp3`, category: 'sfx', loop: false, durationSeconds: 3 },
  // Discharges
  { id: 'sfx-m13-em-discharge-near-01', path: `${M13_SFX}/m13-em-discharge-near-01.mp3`, category: 'sfx', loop: false, durationSeconds: 3 },
  { id: 'sfx-m13-em-discharge-near-02', path: `${M13_SFX}/m13-em-discharge-near-02.mp3`, category: 'sfx', loop: false, durationSeconds: 3 },
  { id: 'sfx-m13-em-discharge-distant-01', path: `${M13_SFX}/m13-em-discharge-distant-01.mp3`, category: 'sfx', loop: false, durationSeconds: 4 },
  { id: 'sfx-m13-em-discharge-distant-02', path: `${M13_SFX}/m13-em-discharge-distant-02.mp3`, category: 'sfx', loop: false, durationSeconds: 4 },
  // Shield
  { id: 'sfx-m13-shield-charge-loop', path: `${M13_SFX}/m13-shield-charge-loop.mp3`, category: 'sfx', loop: true, durationSeconds: 6 },
  { id: 'sfx-m13-shield-charge-warning', path: `${M13_SFX}/m13-shield-charge-warning.mp3`, category: 'sfx', loop: false, durationSeconds: 1.8 },
  { id: 'sfx-m13-shield-activated', path: `${M13_SFX}/m13-shield-activated.mp3`, category: 'sfx', loop: false, durationSeconds: 3.5 },
  { id: 'sfx-m13-shield-impact-01', path: `${M13_SFX}/m13-shield-impact-01.mp3`, category: 'sfx', loop: false, durationSeconds: 2 },
  { id: 'sfx-m13-shield-impact-02', path: `${M13_SFX}/m13-shield-impact-02.mp3`, category: 'sfx', loop: false, durationSeconds: 2 },
  // Objective stingers
  { id: 'sfx-m13-objective-complete', path: `${M13_SFX}/m13-objective-complete.mp3`, category: 'sfx', loop: false, durationSeconds: 2 },
  { id: 'sfx-m13-mission-complete', path: `${M13_SFX}/m13-mission-complete.mp3`, category: 'sfx', loop: false, durationSeconds: 4.5 }
] as const;

/**
 * Existing-asset stand-ins for cues whose own file has not been generated
 * yet. SFXManager tries the real cue first and drops to the fallback only if
 * playback returns null, so the journey is audible today and upgrades itself
 * silently the moment the pipeline produces the new MP3s.
 */
export const sfxCueFallbacks: Partial<Record<SfxCue, SfxCue>> = {
  auroraWindGust: 'shipThrust',
  auroraDustSweep: 'shipThrust',
  shipTurbulence: 'silentProbeInterference',
  atlasRouteLock: 'atlas',
  baseSignalDrop: 'warning',
  farThunder: 'silentProbeInterference',
  auroraFogOpen: 'scanner',
  auroraRevealSwell: 'atlas',
  routeBeaconScan: 'scanner',
  routeBeaconConfirm: 'confirm',
  // Mission 13 stand-ins: every storm cue maps onto an existing sound so the
  // mission is fully audible before the M13 files are authored.
  stormWindDistant: 'auroraWindGust',
  stormWindHeavy: 'auroraDustSweep',
  stormEmHum: 'silentProbeInterference',
  stormHabitatAlarm: 'warning',
  stormDebris: 'shipTurbulence',
  stormGeneratorSparksA: 'silentProbeInterference',
  stormGeneratorSparksB: 'echoResolved',
  stormGeneratorRepair: 'defenseNetwork',
  stormGeneratorStabilized: 'defenseNetwork',
  stormAnchorLockA: 'liftLock',
  stormAnchorLockB: 'liftLock',
  stormAntennaServo: 'liftServo',
  stormAntennaOnline: 'atlas',
  stormDischargeNearA: 'farThunder',
  stormDischargeNearB: 'farThunder',
  stormDischargeFarA: 'farThunder',
  stormDischargeFarB: 'farThunder',
  stormShieldCharge: 'defenseNetwork',
  stormShieldWarning: 'warning',
  stormShieldActivated: 'atlas',
  stormShieldImpactA: 'shipTurbulence',
  stormShieldImpactB: 'shipTurbulence',
  stormObjectiveComplete: 'confirm',
  stormMissionComplete: 'missionComplete'
};

/** Legs of the Aurora expedition, in travel order. Drives music + ambience. */
export type AuroraTravelSegment =
  | 'departure'
  | 'ashPlains'
  | 'atlasCanyons'
  | 'stormPlateau'
  | 'preReveal'
  | 'reveal'
  | 'completion';

const AURORA_SEGMENT_TRACKS: Record<AuroraTravelSegment, MusicTrackId> = {
  departure: 'music-aurora-departure',
  ashPlains: 'music-aurora-ash-plains',
  atlasCanyons: 'music-aurora-atlas-canyons',
  stormPlateau: 'music-aurora-storm-plateau',
  preReveal: 'music-aurora-pre-reveal',
  reveal: 'music-aurora-reveal',
  completion: 'music-aurora-completion'
};

export function resolveMusicTrack(context: MusicContext): MusicTrackId {
  if (context.currentMissionId === 'mission-24') {
    if (
      context.missionStep === 'detectFinalFleet' ||
      context.missionStep === 'enterFinalFormation' ||
      context.missionStep === 'completed'
    ) {
      return 'music-final-orbit-intro';
    }
    if (
      context.missionStep === 'decodeReturnRoute' ||
      context.missionStep === 'prepareLaunch' ||
      context.missionStep === 'boardShip' ||
      context.missionStep === 'ignitionSequence' ||
      context.missionStep === 'lowAtmosphereAscent' ||
      context.missionStep === 'cloudLayerCrossing' ||
      context.missionStep === 'midAtmosphereAscent' ||
      context.missionStep === 'upperAtmosphereAscent'
    ) {
      return 'music-war-ambient';
    }
    return 'music-return-to-origin';
  }
  if (context.currentMissionId === 'mission-23') return 'music-counteroffensive';
  // Mission 22: three fronts at once. The strategic bed carries the whole
  // mission so the score does not chase every front; only the orbital fight
  // lifts to the interception cue, and the close settles back to the ambient
  // war bed.
  if (context.currentMissionId === 'mission-22') {
    if (context.missionStep === 'simultaneousAlarm') return 'music-war-alert';
    if (context.missionStep === 'defendOrbitalFront') return 'music-space-interception';
    if (context.missionStep === 'completed') return 'music-war-ambient';
    return 'music-broken-fronts';
  }
  // Mission 21: the Coalition finally shows its face. The encrypted message
  // rides the ambient war bed; from the capital ship's arrival through the
  // ultimatum the same track holds unbroken (hysteresis keeps it from
  // restarting), channels recover on the alert bed, and the simultaneous
  // assault hands over to the broken-fronts bed that scores M22.
  if (context.currentMissionId === 'mission-21') {
    if (context.missionStep === 'decryptTransmission') return 'music-war-ambient';
    if (context.missionStep === 'restoreThreeChannels' || context.missionStep === 'witnessDemonstration') {
      return 'music-war-alert';
    }
    if (context.missionStep === 'detectSimultaneousAssault' || context.missionStep === 'completed') {
      return 'music-broken-fronts';
    }
    return 'music-silence-rupture';
  }
  // Mission 20: the orbital battle for the Ark. The ascent and the rendezvous
  // are flight, the waves are the battle theme, and the jammer — the one
  // system failure that can lose the mission — drops to the crisis cue. The
  // capital signature at the end crossfades into M21's theme.
  if (context.currentMissionId === 'mission-20') {
    if (context.missionStep === 'emergencyAscent') return 'music-space-interception';
    if (context.missionStep === 'rendezvousWithArk' || context.missionStep === 'restoreArkLink') {
      return 'music-war-alert';
    }
    if (context.missionStep === 'locateJammer' || context.missionStep === 'disableJammer') {
      return 'music-atlas-breach';
    }
    if (context.missionStep === 'detectCapitalSignature' || context.missionStep === 'completed') {
      return 'music-silence-rupture';
    }
    return 'music-ark-battle';
  }
  // Mission 19: Nereida under attack. The call for help and the flight there
  // ride the alert bed, the defence of the settlement has its own theme, the
  // Atlas Resonator breach is the crisis, the counterattack goes back to the
  // ship's interception cue and the recovery settles on the ambient war bed.
  if (context.currentMissionId === 'mission-19') {
    if (context.missionStep === 'emergencyTransmission' || context.missionStep === 'travelToNereida') {
      return 'music-war-alert';
    }
    if (context.missionStep === 'clearAirspace' || context.missionStep === 'activateCounterattack') {
      return 'music-space-interception';
    }
    if (context.missionStep === 'protectAtlas') return 'music-atlas-breach';
    if (
      context.missionStep === 'recoverEnemyWreckage' ||
      context.missionStep === 'confirmArkTarget' ||
      context.missionStep === 'completed'
    ) {
      return 'music-war-ambient';
    }
    return 'music-nereida-under-attack';
  }
  // Mission 18: the first shots of the war. Preparation is alert, the ground
  // defence is the first-fire theme, the critical system under threat is the
  // crisis cue, everything flown is interception, and the mission closes back
  // on the ambient war bed.
  if (context.currentMissionId === 'mission-18') {
    if (
      context.missionStep === 'realAlert' ||
      context.missionStep === 'identifyHostiles' ||
      context.missionStep === 'authorizeDefenseWeapons'
    ) {
      return 'music-war-alert';
    }
    if (context.missionStep === 'defendCriticalSystem' || context.missionStep === 'defendShield') {
      return 'music-atlas-breach';
    }
    if (
      context.missionStep === 'boardShip' ||
      context.missionStep === 'interceptDrones' ||
      context.missionStep === 'pursueFinalDrone'
    ) {
      return 'music-space-interception';
    }
    if (
      context.missionStep === 'recoverWreckage' ||
      context.missionStep === 'confirmNereidaTarget' ||
      context.missionStep === 'completed'
    ) {
      return 'music-war-ambient';
    }
    return 'music-first-fire';
  }
  if (context.currentMissionId === 'mission-05' || context.interferenceActive) {
    return 'music-shadow-orbit';
  }
  // Mission 06 shares the sober defensive-preparation bed; the tension
  // layer carries the synchronization on top of it.
  if (context.currentMissionId === 'mission-06') return 'music-defense-network';
  if (context.currentMissionId === 'mission-07') {
    return context.missionStep === 'activateArchive' || context.missionStep === 'completed'
      ? 'music-first-contact'
      : 'music-atlas-mystery';
  }
  // Mission 08: the signal fracture rides the dark shadow bed; the tension
  // layer carries the purge, and the resolution pad plays on containment.
  if (context.currentMissionId === 'mission-08') return 'music-shadow-orbit';
  // Mission 09: calm Nereida bed while briefing at base, ancient Atlas
  // mystery while following the route, vast deep-space for the far sectors.
  // Mission 13: the first storm. Rising unease while the pilot works the
  // stations outside, the darkest bed at the peak, and the relief pad once
  // the shield holds. Existing beds only — no new assets.
  // Mission 13 runs its own four-part score. Each track walks down
  // TRACK_FALLBACKS to an existing bed until its file is authored, so the
  // storm is scored either way.
  // Mission 15: the first physical attack. The ordinary morning rides the calm
  // Aurora bed, the sealed module and the core overload take the darkest one,
  // and the close resolves on the warm settlement pad. Existing beds only.
  if (context.currentMissionId === 'mission-15') {
    if (context.missionStep === 'routineTask') return 'music-calm-exploration';
    if (context.missionStep === 'analyzeParasite' || context.missionStep === 'completed') {
      return 'music-aurora-completion';
    }
    return 'music-shadow-orbit';
  }
  // Mission 14: the Coalition's residual mark. The investigation rides the
  // ancient-Atlas unease, the three purges ride the same dark shadow bed that
  // has carried every Coalition beat since M05, and the closure resolves on
  // the warm Aurora pad. Existing beds only — no new assets.
  if (context.currentMissionId === 'mission-14') {
    if (
      context.missionStep === 'inspectPower' ||
      context.missionStep === 'inspectComms' ||
      context.missionStep === 'inspectHabitat' ||
      context.missionStep === 'analyzeSignature'
    ) {
      return 'music-atlas-mystery';
    }
    if (context.missionStep === 'traceClosure' || context.missionStep === 'completed') {
      return 'music-aurora-completion';
    }
    return 'music-shadow-orbit';
  }
  if (context.currentMissionId === 'mission-13') {
    if (context.missionStep === 'stormSubsiding' || context.missionStep === 'completed') {
      return 'music-m13-after-the-storm';
    }
    if (context.missionStep === 'chargeShield' || context.missionStep === 'returnToHabitat') {
      return 'music-m13-storm-peak';
    }
    if (context.missionStep === 'stormAlert') return 'music-m13-calm-before-storm';
    // Generator, both anchors and the antenna activation ride the rising bed.
    return 'music-m13-storm-rising';
  }
  // Mission 12: people move in. Calm work while preparing, ancient-Atlas
  // unease on the consumption alert, and the warm Aurora close for the
  // arrival and the first night. Existing beds only — no new assets.
  if (context.currentMissionId === 'mission-12') {
    if (context.missionStep === 'recalibrate') return 'music-atlas-mystery';
    if (
      context.missionStep === 'confirmDisembark' ||
      context.missionStep === 'recordFirstNight' ||
      context.missionStep === 'completed'
    ) {
      return 'music-aurora-completion';
    }
    if (context.missionStep === 'guideCapsuleDescent') return 'music-aurora-reveal';
    return 'music-calm-exploration';
  }
  // Mission 11: the settlement grows. Calm work while building, the ancient
  // Atlas bed for the ethical/impact assessment, and the warm Aurora close
  // once the core is confirmed. Existing beds only — no new assets.
  if (context.currentMissionId === 'mission-11') {
    if (context.missionStep === 'assessImpact') return 'music-atlas-mystery';
    if (context.missionStep === 'confirmCore' || context.missionStep === 'completed') {
      return 'music-aurora-completion';
    }
    return 'music-calm-exploration';
  }
  // Mission 10: calm, careful science in the valley; the ancient-Atlas bed
  // while the readings are still open, and the warm Aurora close once the
  // module is deploying. No new assets — all existing beds or their chains.
  if (context.currentMissionId === 'mission-10') {
    if (context.missionStep === 'initialSurvey') return 'music-aurora-reveal';
    if (
      context.missionStep === 'deployModule' ||
      context.missionStep === 'stabilizeModule' ||
      context.missionStep === 'completed'
    ) {
      return 'music-aurora-completion';
    }
    if (context.missionStep === 'scanBiosafety') return 'music-atlas-mystery';
    return 'music-calm-exploration';
  }
  if (context.currentMissionId === 'mission-09') {
    // The expedition score follows the leg of the journey when the travel
    // director has one; the older step-based beds remain the safety net.
    if (context.auroraSegment) return AURORA_SEGMENT_TRACKS[context.auroraSegment];
    if (context.missionStep === 'analyzeResidual') return 'music-surface-nereida';
    if (context.missionStep === 'reachThreshold') return 'music-deep-space';
    return 'music-atlas-mystery';
  }
  if (context.currentMissionId === 'mission-04') return 'music-defense-network';
  if (context.currentMissionId === 'mission-03') {
    return context.missionStep === 'synchronizeSignal' || context.missionStep === 'placeRelay'
      ? 'music-atlas-mystery'
      : 'music-first-contact';
  }
  if (context.phase === 'atmospheric-entry' || context.phase === 'descent') {
    return 'music-atmospheric-entry';
  }
  if (context.phase === 'surface' || context.currentMissionId === 'mission-02') {
    return context.missionStep === 'completed' ? 'music-calm-exploration' : 'music-surface-nereida';
  }
  if (context.missionStep === 'scanOrbitalMarker' || context.missionStep === 'decodeDescentCorridor') {
    return 'music-orbit-atlas';
  }
  if (context.missionStep === 'approachPlanet') return 'music-atlas-mystery';
  if (context.missionStep === 'followSignal') return 'music-deep-space';
  if (context.missionStep === 'briefing' || context.missionStep === 'scannerTutorial') {
    return 'music-main-theme';
  }
  return 'music-space-exploration';
}
