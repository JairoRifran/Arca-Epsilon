import { AudioManager, type AudioPlayback } from './AudioManager';
import {
  resolveMusicTrack,
  type MusicContext,
  type MusicLayerId,
  type MusicStingId,
  type MusicTrackId
} from './audioDefinitions';
import { WAR_CUE_FALLBACKS, WAR_CUE_MIX, type WarCueMix } from './warScoreMix';

/**
 * The mix table as seen from the whole track space: war cues have an entry,
 * every older bed does not. Typing the lookup as partial keeps the `undefined`
 * branch honest instead of hiding it behind a cast.
 */
const CUE_MIX: Partial<Record<MusicTrackId, WarCueMix>> = WAR_CUE_MIX;

const BASE_VOLUME = 0.78;
const DUCKED_VOLUME = 0.3;
/** Ratio the whole score is scaled by while dialogue is on screen. */
const DUCK_SCALE = DUCKED_VOLUME / BASE_VOLUME;
const DEFAULT_FADE_IN = 1.8;
const DEFAULT_FADE_OUT = 1.8;
const LAYER_VOLUMES: Record<MusicLayerId, number> = {
  'music-layer-tension': 0.42,
  'music-layer-interference': 0.34
};
const STING_COOLDOWN_SECONDS = 12;
const TRACK_FALLBACKS: Record<MusicTrackId, readonly MusicTrackId[]> = {
  'music-main-theme': ['music-space-exploration', 'music-deep-space', 'music-calm-exploration'],
  'music-space-exploration': ['music-deep-space', 'music-calm-exploration', 'music-main-theme'],
  'music-orbit-atlas': ['music-atlas-mystery', 'music-deep-space', 'music-space-exploration'],
  'music-atmospheric-entry': ['music-shadow-orbit', 'music-deep-space', 'music-space-exploration'],
  'music-surface-nereida': ['music-calm-exploration', 'music-space-exploration', 'music-main-theme'],
  'music-first-contact': ['music-atlas-mystery', 'music-calm-exploration', 'music-orbit-atlas'],
  'music-defense-network': ['music-shadow-orbit', 'music-deep-space', 'music-space-exploration'],
  'music-shadow-orbit': ['music-deep-space', 'music-space-exploration', 'music-atlas-mystery'],
  'music-calm-exploration': ['music-surface-nereida', 'music-space-exploration', 'music-main-theme'],
  'music-deep-space': ['music-space-exploration', 'music-atlas-mystery', 'music-main-theme'],
  'music-atlas-mystery': ['music-orbit-atlas', 'music-deep-space', 'music-space-exploration'],
  // Aurora expedition beds. None of these files exist yet: each one walks
  // down to the closest existing bed so the leg still has a score today.
  'music-aurora-departure': ['music-calm-exploration', 'music-surface-nereida', 'music-space-exploration'],
  'music-aurora-ash-plains': ['music-deep-space', 'music-shadow-orbit', 'music-space-exploration'],
  'music-aurora-atlas-canyons': ['music-atlas-mystery', 'music-orbit-atlas', 'music-deep-space'],
  'music-aurora-storm-plateau': ['music-shadow-orbit', 'music-defense-network', 'music-deep-space'],
  'music-aurora-pre-reveal': ['music-deep-space', 'music-atlas-mystery', 'music-calm-exploration'],
  'music-aurora-reveal': ['music-first-contact', 'music-calm-exploration', 'music-atlas-mystery'],
  'music-aurora-completion': ['music-calm-exploration', 'music-first-contact', 'music-surface-nereida'],
  // Mission 13 score. Until the M13 files are authored these resolve to the
  // closest existing bed, so the storm is scored from the first playthrough.
  'music-m13-calm-before-storm': ['music-aurora-pre-reveal', 'music-atlas-mystery', 'music-deep-space'],
  'music-m13-storm-rising': ['music-aurora-storm-plateau', 'music-shadow-orbit', 'music-defense-network'],
  'music-m13-storm-peak': ['music-aurora-storm-plateau', 'music-shadow-orbit', 'music-defense-network'],
  'music-m13-after-the-storm': ['music-aurora-completion', 'music-calm-exploration', 'music-first-contact'],
  // War score (M18 onward). The chains are declared next to the tracks
  // themselves so the catalogue stays the single source of truth.
  ...WAR_CUE_FALLBACKS
};

/**
 * State-driven score with additive layers so the music never sits still:
 * one base bed per game situation (resolveMusicTrack), a tension layer that
 * fades in over any bed while danger is contained, an interference layer for
 * the Silent Probe, one-shot stings for discovery/completion moments, and a
 * calm resolution pad after threats withdraw. Dialogue ducks the whole score
 * so comms always read. Everything degrades to silence gracefully when an
 * asset has not been generated yet.
 */
export class MusicManager {
  private activeTrack: MusicTrackId | null = null;
  private desiredTrack: MusicTrackId | null = null;
  private playback: AudioPlayback | null = null;
  private readonly layerPlaybacks = new Map<MusicLayerId, AudioPlayback>();
  private readonly layerActive: Record<MusicLayerId, boolean> = {
    'music-layer-tension': false,
    'music-layer-interference': false
  };
  private ducked = false;
  private lastStingAt = new Map<MusicStingId, number>();
  private debugOverride: MusicTrackId | null = null;
  private transitionSerial = 0;
  /** What the resolver asked for this frame, before hysteresis. */
  private resolvedTrack: MusicTrackId | null = null;
  /** Timestamp (ms) the current bed was committed at, for minHoldSeconds. */
  private desiredSince = 0;
  /** Mission the current bed was committed under; a new mission cuts through. */
  private desiredMissionId = '';
  /**
   * How many beds have actually started playing. Diagnostics: a bed that is
   * held or re-requested without changing must not increment this, so a probe
   * can prove the score is not restarting under its own feet.
   */
  private startCount = 0;
  /**
   * Un-ducked volume of the bed currently playing. Kept as state rather than
   * recomputed, because a cue that fell back to another file must keep the
   * volume it was actually started at — otherwise recovering from a duck would
   * step it up to a level it never had.
   */
  private activeBaseVolume = BASE_VOLUME;

  constructor(private readonly audio: AudioManager) {}

  update(context: MusicContext): void {
    const nextTrack = this.debugOverride ?? resolveMusicTrack(context);
    const missionChanged = context.currentMissionId !== this.desiredMissionId;
    this.resolvedTrack = nextTrack;
    if (nextTrack !== this.desiredTrack && this.canSwitchTo(context, nextTrack, missionChanged)) {
      this.desiredTrack = nextTrack;
      this.desiredSince = now();
      this.desiredMissionId = context.currentMissionId;
      void this.transitionTo(nextTrack);
    } else if (missionChanged) {
      // A bed can intentionally span a mission boundary. Record the hand-off
      // without restarting it so later changes use the new mission's hold.
      this.desiredMissionId = context.currentMissionId;
    }
    this.setLayer('music-layer-tension', context.tensionActive);
    this.setLayer('music-layer-interference', context.interferenceActive);
    this.setDucked(context.dialogueActive);
  }

  /**
   * Hysteresis. A war cue holds for its `minHoldSeconds` before the director
   * is allowed to move on, so a mission that crosses a threshold back and
   * forth — or simply ticks through small objectives — does not restart the
   * music every few seconds. Nothing is queued: `update` runs every frame, so
   * the pending request is simply re-evaluated until the hold expires and the
   * latest state wins rather than a stale one.
   *
   * Three cases cut straight through: the first bed of the session, a debug
   * override, and a change of mission (a hand-off must not be delayed).
   */
  private canSwitchTo(context: MusicContext, nextTrack: MusicTrackId, missionChanged: boolean): boolean {
    if (!this.desiredTrack || this.debugOverride) return true;
    if (missionChanged) return true;
    if (
      context.currentMissionId === 'mission-24' &&
      (nextTrack === 'music-return-to-origin' || nextTrack === 'music-final-orbit-intro')
    ) return true;
    const hold = CUE_MIX[this.desiredTrack]?.minHoldSeconds ?? 0;
    if (hold <= 0) return true;
    return (now() - this.desiredSince) / 1000 >= hold;
  }

  /** Subtle one-shot accents; cooldown keeps them from becoming a jingle. */
  playSting(kind: 'discovery' | 'complete' | 'resolution', nowSeconds: number): void {
    const id: MusicStingId =
      kind === 'discovery'
        ? 'music-sting-discovery'
        : kind === 'complete'
          ? 'music-sting-complete'
          : 'music-resolution-pad';
    const last = this.lastStingAt.get(id) ?? -Infinity;
    if (nowSeconds - last < STING_COOLDOWN_SECONDS) return;
    this.lastStingAt.set(id, nowSeconds);
    void this.audio.play(id, { loop: false, volume: kind === 'resolution' ? 0.5 : 0.4, fadeInSeconds: 0.3 });
  }

  stop(fadeSeconds = 0.8): void {
    this.transitionSerial += 1;
    this.debugOverride = null;
    this.desiredTrack = null;
    this.activeTrack = null;
    // Clearing the hold as well: after a reload the next bed must start
    // immediately instead of waiting out the previous session's hysteresis.
    this.resolvedTrack = null;
    this.desiredSince = 0;
    this.desiredMissionId = '';
    this.activeBaseVolume = BASE_VOLUME;
    this.playback?.stop(fadeSeconds);
    this.playback = null;
    this.layerPlaybacks.forEach((playback) => playback.stop(fadeSeconds));
    this.layerPlaybacks.clear();
    this.layerActive['music-layer-tension'] = false;
    this.layerActive['music-layer-interference'] = false;
  }

  get currentTrack(): MusicTrackId | null {
    return this.activeTrack;
  }

  get requestedTrack(): MusicTrackId | null {
    return this.desiredTrack;
  }

  /**
   * What the resolver asks for right now. Differs from `requestedTrack` only
   * while a cue is being held back by hysteresis. Diagnostics only.
   */
  get pendingTrack(): MusicTrackId | null {
    return this.resolvedTrack !== this.desiredTrack ? this.resolvedTrack : null;
  }

  /** Number of beds started since boot. Diagnostics only. */
  get bedStartCount(): number {
    return this.startCount;
  }

  get activeLayers(): MusicLayerId[] {
    return (Object.keys(this.layerActive) as MusicLayerId[]).filter((id) => this.layerActive[id]);
  }

  get duckingAmount(): number {
    return this.ducked ? 1 - DUCKED_VOLUME / BASE_VOLUME : 0;
  }

  get duckingActive(): boolean {
    return this.ducked;
  }

  setDebugTrack(track: MusicTrackId | null): void {
    this.debugOverride = track;
    if (!track) return;
    if (track !== this.desiredTrack) {
      this.desiredTrack = track;
      void this.transitionTo(track);
    }
  }

  private setDucked(active: boolean): void {
    if (this.ducked === active) return;
    this.ducked = active;
    // Ducking scales whatever bed is playing, so a war cue keeps its own
    // balance instead of jumping to the generic level on every line of comms.
    const base = this.activeBaseVolume * (active ? DUCK_SCALE : 1);
    // Fast dip so the first words are clear; slow, unnoticeable recovery.
    const fade = active ? 0.35 : 1.6;
    this.playback?.setVolume(base, fade);
    this.layerPlaybacks.forEach((playback, id) => {
      playback.setVolume(LAYER_VOLUMES[id] * (active ? DUCK_SCALE : 1), fade);
    });
  }

  private setLayer(id: MusicLayerId, active: boolean): void {
    if (this.layerActive[id] === active) return;
    this.layerActive[id] = active;
    if (active) {
      void this.startLayer(id);
    } else {
      this.layerPlaybacks.get(id)?.stop(2.2);
      this.layerPlaybacks.delete(id);
    }
  }

  private async startLayer(id: MusicLayerId): Promise<void> {
    if (this.layerPlaybacks.has(id)) return;
    const duckScale = this.ducked ? DUCK_SCALE : 1;
    const playback = await this.audio.play(id, {
      loop: true,
      volume: LAYER_VOLUMES[id] * duckScale,
      fadeInSeconds: 2.4
    });
    if (!playback) return;
    if (!this.layerActive[id]) {
      playback.stop(0.4);
      return;
    }
    this.layerPlaybacks.set(id, playback);
  }

  private async transitionTo(track: MusicTrackId): Promise<void> {
    const serial = ++this.transitionSerial;
    await this.audio.initialize();
    const candidates = [track, ...TRACK_FALLBACKS[track]];
    const resolvedTrack = candidates.find((candidate) => this.audio.hasAsset(candidate));
    if (!resolvedTrack || this.desiredTrack !== track || serial !== this.transitionSerial) return;
    // Already playing this bed — including the case where two different cues
    // fall back to the same file. Never restart it.
    if (resolvedTrack === this.activeTrack && this.playback) return;

    const mix = CUE_MIX[track];
    const outgoingMix = this.activeTrack ? CUE_MIX[this.activeTrack] : undefined;
    const baseVolume = mix?.volume ?? BASE_VOLUME;
    const volume = baseVolume * (this.ducked ? DUCK_SCALE : 1);
    const next = await this.audio.play(resolvedTrack, {
      loop: true,
      volume,
      fadeInSeconds: mix?.fadeInSeconds ?? DEFAULT_FADE_IN
    });
    if (this.desiredTrack !== track || serial !== this.transitionSerial) {
      next?.stop(0.25);
      return;
    }
    if (!next) return;
    // Real crossfade: the incoming bed is already ramping up before the
    // outgoing one starts its own ramp down, and only one of each ever exists.
    const previous = this.playback;
    this.playback = next;
    this.activeTrack = resolvedTrack;
    this.activeBaseVolume = baseVolume;
    this.startCount += 1;
    previous?.stop(outgoingMix?.fadeOutSeconds ?? DEFAULT_FADE_OUT);
  }
}

/**
 * Monotonic clock for the hysteresis hold. Read on demand inside the existing
 * per-frame update — no timer, interval or animation frame of its own.
 */
function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
