import { AudioManager, type AudioPlayback } from './AudioManager';
import { sfxCueFallbacks, sfxCues, type SfxCue } from './audioDefinitions';

export class SFXManager {
  private loops = new Map<SfxCue, AudioPlayback>();
  private lastPlayedAt = new Map<SfxCue, number>();
  /**
   * Cues whose startLoop is in flight. `startLoop` awaits a decode before it
   * can register the playback, so without this a caller that asks twice in
   * the same frame — or on two consecutive frames — starts the same loop
   * twice and it never stops cleanly.
   */
  private pendingLoops = new Set<SfxCue>();
  /** Last volume applied per loop, so imperceptible changes are skipped. */
  private loopVolumes = new Map<SfxCue, number>();

  constructor(private readonly audio: AudioManager) {}

  async play(cue: SfxCue, volume = 1): Promise<AudioPlayback | null> {
    const playback = await this.audio.play(sfxCues[cue], { loop: false, volume });
    if (playback) return playback;
    // The cue's own asset has not been generated yet: stand in with the
    // closest existing sound rather than going silent.
    const fallback = sfxCueFallbacks[cue];
    if (!fallback) return null;
    return this.audio.play(sfxCues[fallback], { loop: false, volume });
  }

  /**
   * Ambience one-shot with a per-cue cooldown, so the journey's wind, dust
   * and thunder accents never turn into a stutter when the player lingers
   * inside an environmental event.
   */
  async playAmbient(cue: SfxCue, nowSeconds: number, cooldownSeconds: number, volume = 1): Promise<void> {
    const last = this.lastPlayedAt.get(cue) ?? -Infinity;
    if (nowSeconds - last < cooldownSeconds) return;
    this.lastPlayedAt.set(cue, nowSeconds);
    await this.play(cue, volume);
  }

  async startLoop(cue: SfxCue, volume = 1, fadeInSeconds = 0.15): Promise<void> {
    if (this.loops.has(cue) || this.pendingLoops.has(cue)) return;
    this.pendingLoops.add(cue);
    try {
      const fallback = sfxCueFallbacks[cue];
      const options = { loop: true, volume, fadeInSeconds };
      const playback =
        (await this.audio.play(sfxCues[cue], options)) ??
        (fallback ? await this.audio.play(sfxCues[fallback], options) : null);
      if (!playback) return;
      // A stopLoop may have landed while the decode was in flight; honour it
      // instead of leaving an orphaned loop running.
      if (!this.pendingLoops.has(cue)) {
        playback.stop(0.05);
        return;
      }
      this.loops.set(cue, playback);
      this.loopVolumes.set(cue, volume);
    } finally {
      this.pendingLoops.delete(cue);
    }
  }

  /**
   * Retune a running loop. Skips writes below an audible threshold so a
   * per-frame mixer does not schedule a ramp on every single frame.
   */
  setLoopVolume(cue: SfxCue, volume: number, fadeSeconds = 0.25): void {
    const playback = this.loops.get(cue);
    if (!playback) return;
    const previous = this.loopVolumes.get(cue) ?? -1;
    if (Math.abs(previous - volume) < 0.02) return;
    this.loopVolumes.set(cue, volume);
    playback.setVolume(volume, fadeSeconds);
  }

  isLoopActive(cue: SfxCue): boolean {
    return this.loops.has(cue) || this.pendingLoops.has(cue);
  }

  stopLoop(cue: SfxCue, fadeSeconds = 0.15): void {
    const playback = this.loops.get(cue);
    playback?.stop(fadeSeconds);
    this.loops.delete(cue);
    this.loopVolumes.delete(cue);
    // Cancels an in-flight startLoop so it discards its playback on arrival.
    this.pendingLoops.delete(cue);
  }

  stopAllLoops(fadeSeconds = 0.15): void {
    this.loops.forEach((playback) => playback.stop(fadeSeconds));
    this.loops.clear();
    this.loopVolumes.clear();
    this.pendingLoops.clear();
  }
}
