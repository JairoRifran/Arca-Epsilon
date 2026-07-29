import { AudioManager, type VoicePlayback } from './AudioManager';
import { dialogueDefinitions } from '../assets/dialogueDefinitions';
import type { SFXManager } from './SFXManager';

interface VoiceManifestEntry {
  id: string;
  speakerId: string;
  path: string;
}

interface VoiceManifest {
  version: number;
  generatedAt: string | null;
  assets: VoiceManifestEntry[];
}

export interface VoiceAudioState {
  enabled: boolean;
  manifestLoaded: boolean;
  currentDialogueId: string;
  playing: boolean;
  missingCount: number;
  availableCount: number;
  commanderAvailableCount: number;
  pleyadanAvailableCount: number;
  pleyadanEnabled: boolean;
  lastError: string;
}

const MANIFEST_PATH = '/audio/voice-manifest.json';
/**
 * Speakers whose lines will play a recorded take when one exists. Adding a
 * speaker here does nothing on its own: a line still only speaks once the
 * voice manifest carries an entry for its dialogue id, so listing
 * `aurora-crew` simply opens the channel for the colony crew's recordings.
 */
const VOICED_SPEAKERS = new Set(['commander-soren', 'pleyadan', 'aurora-crew']);
/** Directories a voice recording may be served from. */
const VOICE_PATH_PREFIXES = ['/audio/voices/', '/audio/mission-13/voices/'];

/**
 * Real recorded voice for Commander Valeria Soren. Follows the live
 * dialogue line: when a commander line appears the previous voice fades
 * fast, a soft comm click marks the transmission, and the recorded take
 * plays through the dedicated voice bus (voice slider × master × mute).
 * Skipping a line fades the voice with it; a missing recording degrades
 * silently to text-only. One-time lines never replay because this manager
 * only reacts to what DialogueManager actually puts on screen.
 */
export class VoiceManager {
  private readonly voices = new Map<string, string>();

  private manifestLoaded = false;

  private loadPromise: Promise<void> | null = null;

  private playback: VoicePlayback | null = null;

  private currentDialogueId = '';

  private playing = false;

  private lastError = '';

  private readonly voicedLineCount = dialogueDefinitions.filter(
    (definition) => VOICED_SPEAKERS.has(definition.speakerId)
  ).length;

  constructor(
    private readonly audio: AudioManager,
    private readonly sfx: SFXManager
  ) {}

  initialize(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = fetch(MANIFEST_PATH, { credentials: 'same-origin' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Voice manifest unavailable')))
      .then((manifest: VoiceManifest) => {
        for (const entry of manifest.assets ?? []) {
          if (
            entry &&
            typeof entry.id === 'string' &&
            typeof entry.path === 'string' &&
            VOICE_PATH_PREFIXES.some((prefix) => entry.path.startsWith(prefix)) &&
            !entry.path.includes('://')
          ) {
            this.voices.set(entry.id, entry.path);
          }
        }
        this.manifestLoaded = true;
      })
      .catch((error: unknown) => {
        this.manifestLoaded = false;
        this.lastError = error instanceof Error ? error.message : 'voice manifest load failed';
      });
    return this.loadPromise;
  }

  /** Follow the dialogue line currently on screen; call every frame. */
  syncDialogue(dialogueId: string | undefined, speakerId: string | undefined): void {
    const id = dialogueId ?? '';
    if (id === this.currentDialogueId) return;
    // Line changed (advanced, skipped or replaced): fade the old take fast.
    this.stopCurrent(0.16);
    this.currentDialogueId = id;
    if (!id || !speakerId || !VOICED_SPEAKERS.has(speakerId)) return;
    void this.startVoice(id);
  }

  /** Debug helper: force any available recorded dialogue voice. */
  playById(dialogueId: string): boolean {
    if (!this.voices.has(dialogueId)) return false;
    this.stopCurrent(0.1);
    this.currentDialogueId = dialogueId;
    void this.startVoice(dialogueId);
    return true;
  }

  stopCurrent(fadeSeconds = 0.2): void {
    if (this.playback) {
      this.playback.stop(fadeSeconds);
      this.playback = null;
    }
    this.playing = false;
  }

  get state(): VoiceAudioState {
    const commanderAvailableCount = this.countAvailableForSpeaker('commander-soren');
    const pleyadanAvailableCount = this.countAvailableForSpeaker('pleyadan');
    return {
      enabled: this.voices.size > 0,
      manifestLoaded: this.manifestLoaded,
      currentDialogueId: this.playing ? this.currentDialogueId : '',
      playing: this.playing,
      missingCount: Math.max(0, this.voicedLineCount - this.voices.size),
      availableCount: this.voices.size,
      commanderAvailableCount,
      pleyadanAvailableCount,
      pleyadanEnabled: pleyadanAvailableCount > 0,
      lastError: this.lastError
    };
  }

  private countAvailableForSpeaker(speakerId: string): number {
    return dialogueDefinitions.filter(
      (definition) => definition.speakerId === speakerId && this.voices.has(definition.id)
    ).length;
  }

  private async startVoice(dialogueId: string): Promise<void> {
    await this.initialize();
    const path = this.voices.get(dialogueId);
    if (!path) return;

    void this.sfx.play('commStart', 0.4);
    const playback = await this.audio.playVoice(path, {
      volume: 1,
      onEnded: () => {
        if (this.playback === playback) {
          this.playback = null;
          this.playing = false;
          void this.sfx.play('commEnd', 0.32);
        }
      }
    });
    // The line may have changed while the buffer decoded.
    if (this.currentDialogueId !== dialogueId) {
      playback?.stop(0.05);
      return;
    }
    if (!playback) {
      this.lastError = `voice missing or undecodable: ${dialogueId}`;
      return;
    }
    this.playback = playback;
    this.playing = true;
  }
}
