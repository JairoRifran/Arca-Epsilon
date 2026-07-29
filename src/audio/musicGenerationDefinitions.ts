import warScore from './musicWarScore.json';
import type { MusicTrackId, WarMusicTrackId } from './audioDefinitions';

/**
 * War-score definitions: the music for the campaign against the Coalition of
 * Silence (M18 onward).
 *
 * The data itself lives in `musicWarScore.json` because two very different
 * consumers need exactly the same values and must never drift apart:
 *
 *  - this module, which types it for the game and exposes the declarative cue
 *    registry;
 *  - `scripts/generate-elevenlabs-audio.mjs`, which reads the same JSON from
 *    disk to drive generation (a `.mjs` script cannot import a `.ts` module).
 *
 * The cues are wired into the score in `audioDefinitions.resolveMusicTrack`
 * and consumed by `MusicManager` (mix, crossfade and hysteresis) — this module
 * stays declarative. Cues whose mission does not exist yet (M24-M25) are
 * registered and resolvable but deliberately unreferenced by any state
 * machine. See `WAR_INTENSITY_CUES` for the five-level dynamic system and
 * `WAR_CUE_MIX` for the per-cue mix values.
 */

/** Dynamic intensity levels, from distant threat to decisive battle. */
export type WarMusicIntensity = 'ambient' | 'alert' | 'combat' | 'crisis' | 'climax';

export type WarMusicTrackDefinition = {
  /** Stable generation id, also the `--id` argument of the generator. */
  id: string;
  /** Declarative cue name the game addresses this track by. */
  cue: WarMusicTrackId;
  /** Human-readable Spanish title, for documentation and tooling. */
  title: string;
  /** ElevenLabs Music prompt. English on purpose: the model responds better. */
  prompt: string;
  /** Target length. ElevenLabs Music is capped at 300 s per request. */
  durationSeconds: number;
  /** Always true for this score: no lyrics and no spoken word anywhere. */
  instrumental: boolean;
  /** Whether the track is written to sit in a seamless loop. */
  loop: boolean;
  intensity: WarMusicIntensity;
  /** What the track is for, in narrative terms. */
  narrativeUse: string;
  /** Suggested mission(s). Advisory only — nothing is bound to state yet. */
  recommendedMission: string;
  /** Base file name, without extension, matching the project convention. */
  outputFile: string;
  /** Generation order: lower runs first. */
  priority: number;
};

/** The three reusable motifs the whole war score is built from. */
export const WAR_MUSIC_MOTIFS: Readonly<Record<'humanity' | 'pleyadian' | 'coalition', string>> =
  warScore.motifs;

/** Every war track, in declaration order. */
export const warMusicTracks: readonly WarMusicTrackDefinition[] =
  warScore.tracks as readonly WarMusicTrackDefinition[];

/** Where generated war music lands, relative to the project root. */
export const WAR_MUSIC_OUTPUT_DIRECTORY = warScore.outputDirectory;

/** Public URL a generated war track will be served from. */
export function warMusicTrackUrl(track: WarMusicTrackDefinition): string {
  return `/audio/music/${track.outputFile}.mp3`;
}

/** Look a track up by its generation id. */
export function findWarMusicTrack(id: string): WarMusicTrackDefinition | undefined {
  return warMusicTracks.find((track) => track.id === id);
}

/** Look a track up by its declarative cue name. */
export function findWarMusicTrackByCue(cue: string): WarMusicTrackDefinition | undefined {
  return warMusicTracks.find((track) => track.cue === cue);
}

/**
 * Cues present in the catalogue but not registered in `warMusicTrackIds`.
 * Always empty in a healthy build — an unregistered cue never reaches the
 * audio manifest, so its MP3 would exist on disk and never play. Exposed for
 * the audio probe rather than executed in the game loop.
 */
export function unregisteredWarCues(registered: readonly string[]): string[] {
  const known = new Set(registered);
  return warMusicTracks.map((track) => track.cue).filter((cue) => !known.has(cue));
}

// The runtime half lives in `warScoreMix.ts` so the browser bundle never
// reaches this catalogue. Re-exported here so generation-side tooling keeps a
// single import.
export {
  WAR_INTENSITY_CUES,
  FINAL_ORBIT_SEQUENCE,
  WAR_CUE_MIX,
  WAR_CUE_FALLBACKS,
  type WarCueMix
} from './warScoreMix';
