import type { MusicTrackId, WarMusicTrackId } from './audioDefinitions';
import type { WarMusicIntensity } from './musicGenerationDefinitions';

/**
 * Runtime half of the war score: the values the game actually reads while it
 * plays — which cue carries which intensity, and how each cue is mixed and
 * faded.
 *
 * Deliberately free of any dependency on `musicWarScore.json`. That catalogue
 * holds generation metadata (prompts, durations, output file names) which the
 * browser has no use for, so keeping it out of this module keeps it out of the
 * bundle — and keeps this module loadable by plain Node, which the audio probe
 * relies on. See `musicGenerationDefinitions.ts` for the catalogue side, which
 * re-exports everything here so tooling still has a single import.
 */

/**
 * The five-level dynamic system.
 *
 * These are the cues the mission code should ask for; each resolves to the
 * track that best carries that level. Keeping the indirection means a mission
 * never names a file, so re-scoring a level later is a one-line change here.
 */
export const WAR_INTENSITY_CUES: Readonly<Record<WarMusicIntensity, string>> = {
  ambient: 'music-war-ambient',
  alert: 'music-war-alert',
  combat: 'music-space-interception',
  crisis: 'music-atlas-breach',
  climax: 'music-ark-battle'
};

/**
 * Ordered sections of the final battle (M25). They are separate files so the
 * fight can be driven section by section instead of by one long track, and
 * each one is written to crossfade cleanly into the next.
 */
export const FINAL_ORBIT_SEQUENCE: readonly string[] = [
  'music-final-orbit-intro',
  'music-final-orbit-assault',
  'music-final-orbit-shield-break',
  'music-final-orbit-allies',
  'music-final-orbit-last-stand',
  'music-final-orbit-resolution'
];

export type WarCueMix = {
  /**
   * Absolute bed volume, replacing MusicManager's BASE_VOLUME while this cue
   * plays. All of them sit under it so alarms, weapons and dialogue stay
   * intelligible; combat and crisis sit lowest of all. Dialogue ducking then
   * scales this value by the same ratio it applies to any other bed.
   */
  volume: number;
  /** Seconds to fade this cue in when it becomes the active bed. */
  fadeInSeconds: number;
  /** Seconds to fade the previous bed out underneath it. */
  fadeOutSeconds: number;
  /**
   * Minimum seconds this cue must stay active before the director is allowed
   * to switch away. Hysteresis: without it, a level that oscillates around a
   * threshold restarts the music constantly.
   */
  minHoldSeconds: number;
};

/**
 * Mix and crossfade values, one entry per cue. Read by `MusicManager` when a
 * war cue becomes the active bed; the global mix and the player's own volume
 * settings are untouched. Fades are longer going down in intensity than coming
 * up, so escalation feels immediate and de-escalation feels like relief rather
 * than a cut. The record is total: a new cue must declare its mix.
 */
export const WAR_CUE_MIX: Readonly<Record<WarMusicTrackId, WarCueMix>> = {
  'music-war-ambient': { volume: 0.55, fadeInSeconds: 3.5, fadeOutSeconds: 3.5, minHoldSeconds: 12 },
  'music-war-alert': { volume: 0.6, fadeInSeconds: 2, fadeOutSeconds: 2.5, minHoldSeconds: 10 },
  'music-first-fire': { volume: 0.62, fadeInSeconds: 1.5, fadeOutSeconds: 2.5, minHoldSeconds: 14 },
  'music-space-interception': { volume: 0.62, fadeInSeconds: 1.2, fadeOutSeconds: 2.5, minHoldSeconds: 12 },
  'music-nereida-under-attack': { volume: 0.6, fadeInSeconds: 1.8, fadeOutSeconds: 3, minHoldSeconds: 14 },
  'music-atlas-breach': { volume: 0.58, fadeInSeconds: 1.2, fadeOutSeconds: 2.5, minHoldSeconds: 10 },
  'music-ark-battle': { volume: 0.62, fadeInSeconds: 2, fadeOutSeconds: 3, minHoldSeconds: 16 },
  'music-silence-rupture': { volume: 0.66, fadeInSeconds: 3.5, fadeOutSeconds: 4, minHoldSeconds: 18 },
  'music-broken-fronts': { volume: 0.58, fadeInSeconds: 2, fadeOutSeconds: 3, minHoldSeconds: 14 },
  'music-counteroffensive': { volume: 0.64, fadeInSeconds: 1.8, fadeOutSeconds: 3, minHoldSeconds: 16 },
  'music-return-to-origin': { volume: 0.64, fadeInSeconds: 3, fadeOutSeconds: 3.5, minHoldSeconds: 18 },
  'music-final-orbit-intro': { volume: 0.62, fadeInSeconds: 3, fadeOutSeconds: 2.5, minHoldSeconds: 8 },
  'music-final-orbit-assault': { volume: 0.64, fadeInSeconds: 1.5, fadeOutSeconds: 2.5, minHoldSeconds: 12 },
  'music-final-orbit-shield-break': { volume: 0.6, fadeInSeconds: 1, fadeOutSeconds: 2, minHoldSeconds: 8 },
  'music-final-orbit-allies': { volume: 0.64, fadeInSeconds: 2, fadeOutSeconds: 2.5, minHoldSeconds: 10 },
  'music-final-orbit-last-stand': { volume: 0.66, fadeInSeconds: 1.5, fadeOutSeconds: 3, minHoldSeconds: 14 },
  'music-final-orbit-resolution': { volume: 0.58, fadeInSeconds: 3.5, fadeOutSeconds: 5, minHoldSeconds: 12 },
  'music-ark-no-longer-alone': { volume: 0.56, fadeInSeconds: 4, fadeOutSeconds: 5, minHoldSeconds: 12 }
};

/**
 * Fallback chain per war cue, merged into MusicManager's TRACK_FALLBACKS.
 * Each one names older beds that are known to exist, so a missing or failed
 * war file degrades to a plausible bed instead of to silence.
 */
export const WAR_CUE_FALLBACKS: Readonly<Record<WarMusicTrackId, readonly MusicTrackId[]>> = {
  'music-war-ambient': ['music-shadow-orbit', 'music-deep-space'],
  'music-war-alert': ['music-defense-network', 'music-shadow-orbit'],
  'music-first-fire': ['music-defense-network', 'music-shadow-orbit'],
  'music-space-interception': ['music-defense-network', 'music-shadow-orbit'],
  'music-nereida-under-attack': ['music-shadow-orbit', 'music-atlas-mystery'],
  'music-atlas-breach': ['music-atlas-mystery', 'music-shadow-orbit'],
  'music-ark-battle': ['music-defense-network', 'music-shadow-orbit'],
  'music-silence-rupture': ['music-deep-space', 'music-atlas-mystery'],
  'music-broken-fronts': ['music-defense-network', 'music-shadow-orbit'],
  'music-counteroffensive': ['music-defense-network', 'music-main-theme'],
  'music-return-to-origin': ['music-main-theme', 'music-calm-exploration'],
  'music-final-orbit-intro': ['music-deep-space', 'music-main-theme'],
  'music-final-orbit-assault': ['music-defense-network', 'music-shadow-orbit'],
  'music-final-orbit-shield-break': ['music-shadow-orbit', 'music-deep-space'],
  'music-final-orbit-allies': ['music-first-contact', 'music-main-theme'],
  'music-final-orbit-last-stand': ['music-defense-network', 'music-main-theme'],
  'music-final-orbit-resolution': ['music-aurora-completion', 'music-calm-exploration'],
  'music-ark-no-longer-alone': ['music-aurora-completion', 'music-calm-exploration']
};
