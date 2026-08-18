import type {
  AudioAssetId,
  AudioCategory,
  AudioManifest,
  AudioManifestEntry
} from './audioDefinitions';
import {
  MISSION13_STATIC_ASSETS,
  expectedAudioAssetIds,
  isEngineAudioAsset,
  musicAssetIds
} from './audioDefinitions';

export interface AudioSettings {
  muted: boolean;
  master: number;
  music: number;
  sfx: number;
  engine: number;
  voice: number;
}

export interface AudioPlayback {
  readonly id: AudioAssetId;
  stop(fadeSeconds?: number): void;
  setVolume(volume: number, fadeSeconds?: number): void;
  /** Smoothly retune the source; propulsion layers ride this for pitch. */
  setPlaybackRate(rate: number, glideSeconds?: number): void;
}

export interface VoicePlayback {
  stop(fadeSeconds?: number): void;
  setVolume(volume: number, fadeSeconds?: number): void;
}

interface PlayOptions {
  loop?: boolean;
  volume?: number;
  fadeInSeconds?: number;
}

const SETTINGS_KEY = 'arca-epsilon-audio-v1';
const MANIFEST_PATH = '/audio/audio-manifest.json';

export class AudioManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private categoryGains: Record<AudioCategory, GainNode | null> = { music: null, sfx: null };
  private engineGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private voiceBuffers = new Map<string, Promise<AudioBuffer | null>>();
  private manifest = new Map<AudioAssetId, AudioManifestEntry>();
  private buffers = new Map<AudioAssetId, Promise<AudioBuffer | null>>();
  /** Ids registered from a static table rather than the JSON manifest. */
  private staticAssetIds = new Set<AudioAssetId>();
  /** Paths already reported as missing, so each warns at most once. */
  private warnedMissingPaths = new Set<string>();
  private initializePromise: Promise<void> | null = null;
  private listeners = new Set<(settings: Readonly<AudioSettings>) => void>();
  private settings: AudioSettings = this.loadSettings();

  initialize(): Promise<void> {
    if (this.initializePromise) return this.initializePromise;
    this.initializePromise = fetch(MANIFEST_PATH, { credentials: 'same-origin' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Audio manifest unavailable')))
      .then((manifest: AudioManifest) => {
        for (const entry of manifest.assets ?? []) {
          if (this.isSafeGeneratedAsset(entry)) this.manifest.set(entry.id, entry);
        }
      })
      .catch(() => {
        this.manifest.clear();
      })
      .then(() => this.registerStaticAssets());
    return this.initializePromise;
  }

  /**
   * Assets that live outside the generator's own folders and therefore never
   * appear in audio-manifest.json. They are registered optimistically: the
   * fetch in loadBuffer is what actually proves whether the file exists, and
   * a miss is cached so it is attempted (and warned about) exactly once.
   *
   * A manifest entry always wins, so authoring a file into the generated
   * pipeline later silently takes precedence over the static declaration.
   */
  private registerStaticAssets(): void {
    for (const asset of MISSION13_STATIC_ASSETS) {
      if (this.manifest.has(asset.id)) continue;
      if (!this.isSafeStaticPath(asset.path)) continue;
      this.manifest.set(asset.id, {
        id: asset.id,
        path: asset.path,
        category: asset.category,
        loop: asset.loop,
        available: true,
        durationSeconds: asset.durationSeconds,
        tags: ['mission-13', asset.category]
      });
      this.staticAssetIds.add(asset.id);
    }
  }

  private isSafeStaticPath(path: string): boolean {
    return typeof path === 'string' && path.startsWith('/audio/mission-13/') && !path.includes('://');
  }

  async unlock(): Promise<void> {
    const context = this.ensureContext();
    if (context.state === 'suspended') await context.resume();
  }

  async play(id: AudioAssetId, options: PlayOptions = {}): Promise<AudioPlayback | null> {
    await this.initialize();
    const entry = this.manifest.get(id);
    if (!entry?.available) return null;

    const context = this.ensureContext();
    const buffer = await this.loadBuffer(entry);
    if (!buffer) return null;

    const source = context.createBufferSource();
    const localGain = context.createGain();
    const volume = clamp01(options.volume ?? 1);
    const fadeIn = Math.max(0, options.fadeInSeconds ?? 0);
    source.buffer = buffer;
    source.loop = options.loop ?? entry.loop;
    localGain.gain.setValueAtTime(fadeIn > 0 ? 0.0001 : volume, context.currentTime);
    if (fadeIn > 0) localGain.gain.linearRampToValueAtTime(volume, context.currentTime + fadeIn);
    const destination = isEngineAudioAsset(id) ? this.engineGain : this.categoryGains[entry.category];
    source.connect(localGain).connect(destination!);
    source.start();

    let stopped = false;
    return {
      id,
      stop: (fadeSeconds = 0.08) => {
        if (stopped) return;
        stopped = true;
        const now = context.currentTime;
        const fade = Math.max(0, fadeSeconds);
        localGain.gain.cancelScheduledValues(now);
        localGain.gain.setValueAtTime(Math.max(0.0001, localGain.gain.value), now);
        localGain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
        source.stop(now + fade + 0.02);
      },
      setVolume: (nextVolume, fadeSeconds = 0.08) => {
        if (stopped) return;
        const now = context.currentTime;
        const target = Math.max(0.0001, clamp01(nextVolume));
        localGain.gain.cancelScheduledValues(now);
        localGain.gain.setValueAtTime(Math.max(0.0001, localGain.gain.value), now);
        localGain.gain.exponentialRampToValueAtTime(target, now + Math.max(0.001, fadeSeconds));
      },
      setPlaybackRate: (rate, glideSeconds = 0.12) => {
        if (stopped) return;
        const now = context.currentTime;
        const target = Math.min(2, Math.max(0.5, Number.isFinite(rate) ? rate : 1));
        source.playbackRate.cancelScheduledValues(now);
        source.playbackRate.setValueAtTime(source.playbackRate.value, now);
        source.playbackRate.linearRampToValueAtTime(target, now + Math.max(0.001, glideSeconds));
      }
    };
  }

  /**
   * Voice playback: independent of the SFX/music manifest, routed through
   * its own gain (voice slider + mute + master). Only same-origin paths
   * under /audio/voices/ are accepted. Returns null when the file is
   * missing or fails to decode — callers fall back to text-only.
   */
  async playVoice(
    path: string,
    options: { volume?: number; onEnded?: () => void } = {}
  ): Promise<VoicePlayback | null> {
    // Same-origin voice directories only. Mission 13 keeps its recordings in
    // its own tree, so both roots are accepted.
    const allowedVoiceRoot =
      path.startsWith('/audio/voices/') || path.startsWith('/audio/mission-13/voices/');
    if (!allowedVoiceRoot || path.includes('://')) return null;
    const context = this.ensureContext();
    let cached = this.voiceBuffers.get(path);
    if (!cached) {
      cached = fetch(path, { credentials: 'same-origin' })
        .then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error('Voice unavailable')))
        .then((data) => context.decodeAudioData(data))
        .catch(() => null);
      this.voiceBuffers.set(path, cached);
    }
    const buffer = await cached;
    if (!buffer) return null;

    const source = context.createBufferSource();
    const localGain = context.createGain();
    const volume = clamp01(options.volume ?? 1);
    source.buffer = buffer;
    source.loop = false;
    localGain.gain.setValueAtTime(volume, context.currentTime);
    source.connect(localGain).connect(this.voiceGain!);
    if (options.onEnded) source.onended = options.onEnded;
    source.start();

    let stopped = false;
    return {
      stop: (fadeSeconds = 0.2) => {
        if (stopped) return;
        stopped = true;
        source.onended = null;
        const now = context.currentTime;
        localGain.gain.cancelScheduledValues(now);
        localGain.gain.setValueAtTime(Math.max(0.0001, localGain.gain.value), now);
        localGain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.01, fadeSeconds));
        source.stop(now + Math.max(0.01, fadeSeconds) + 0.02);
        options.onEnded?.();
      },
      setVolume: (nextVolume, fadeSeconds = 0.08) => {
        if (stopped) return;
        const now = context.currentTime;
        localGain.gain.cancelScheduledValues(now);
        localGain.gain.setValueAtTime(Math.max(0.0001, localGain.gain.value), now);
        localGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, clamp01(nextVolume)), now + Math.max(0.001, fadeSeconds));
      }
    };
  }

  /** Expected assets with no valid local file in the runtime manifest. */
  get missingAssetIds(): AudioAssetId[] {
    return expectedAudioAssetIds.filter((id) => !this.manifest.get(id)?.available);
  }

  get missingMusicAssetIds(): AudioAssetId[] {
    return musicAssetIds.filter((id) => !this.manifest.get(id)?.available);
  }

  get availableAssetIds(): AudioAssetId[] {
    return [...this.manifest.values()].filter((entry) => entry.available).map((entry) => entry.id);
  }

  hasAsset(id: AudioAssetId): boolean {
    return this.manifest.get(id)?.available === true;
  }

  getSettings(): Readonly<AudioSettings> {
    return { ...this.settings };
  }

  get isUnlocked(): boolean {
    return this.context?.state === 'running';
  }

  setSettings(update: Partial<AudioSettings>): void {
    this.updateSettings(update);
  }

  onSettingsChanged(listener: (settings: Readonly<AudioSettings>) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSettings());
    return () => this.listeners.delete(listener);
  }

  mountControls(parent: HTMLElement): void {
    if (parent.querySelector('.audio-controls')) return;
    const controls = document.createElement('section');
    controls.className = 'audio-controls';
    controls.setAttribute('aria-label', 'Controles de audio');
    controls.innerHTML = `
      <button class="audio-controls__toggle" type="button" aria-expanded="false" title="Ajustes de audio">AUDIO</button>
      <div class="audio-controls__panel" hidden>
        <label class="audio-controls__mute"><input type="checkbox" data-audio-setting="muted"> Silenciar</label>
        ${this.rangeMarkup('master', 'Volumen general')}
        ${this.rangeMarkup('music', 'Musica')}
        ${this.rangeMarkup('sfx', 'Efectos')}
        ${this.rangeMarkup('engine', 'Propulsion')}
        ${this.rangeMarkup('voice', 'Voz')}
      </div>
    `;
    controls.addEventListener('pointerdown', (event) => event.stopPropagation());
    const toggle = controls.querySelector<HTMLButtonElement>('.audio-controls__toggle')!;
    const panel = controls.querySelector<HTMLElement>('.audio-controls__panel')!;
    toggle.addEventListener('click', () => {
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      void this.unlock();
    });

    const mute = controls.querySelector<HTMLInputElement>('[data-audio-setting="muted"]')!;
    mute.checked = this.settings.muted;
    mute.addEventListener('change', () => this.updateSettings({ muted: mute.checked }));

    for (const key of ['master', 'music', 'sfx', 'engine', 'voice'] as const) {
      const input = controls.querySelector<HTMLInputElement>(`[data-audio-setting="${key}"]`)!;
      input.value = String(this.settings[key]);
      input.addEventListener('input', () => this.updateSettings({ [key]: Number(input.value) }));
    }
    parent.append(controls);
  }

  private rangeMarkup(key: 'master' | 'music' | 'sfx' | 'engine' | 'voice', label: string): string {
    return `<label><span>${label}</span><input type="range" min="0" max="1" step="0.05" data-audio-setting="${key}"></label>`;
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.categoryGains.music = this.context.createGain();
    this.categoryGains.sfx = this.context.createGain();
    this.engineGain = this.context.createGain();
    this.voiceGain = this.context.createGain();
    this.categoryGains.music.connect(this.masterGain);
    this.categoryGains.sfx.connect(this.masterGain);
    this.engineGain.connect(this.masterGain);
    this.voiceGain.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);
    this.applySettings();
    return this.context;
  }

  private async loadBuffer(entry: AudioManifestEntry): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(entry.id);
    if (cached) return cached;
    const promise = fetch(entry.path, { credentials: 'same-origin' })
      .then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error('Audio unavailable')))
      .then((data) => this.ensureContext().decodeAudioData(data))
      .catch(() => {
        // Statically declared assets are expected to be missing until they
        // are authored: warn once per path, then stay quiet. The null result
        // is cached, so this never retries and never spams the console.
        if (this.staticAssetIds.has(entry.id) && !this.warnedMissingPaths.has(entry.path)) {
          this.warnedMissingPaths.add(entry.path);
          console.info(`[audio] pendiente de generar: ${entry.path} (usando sonido de reemplazo)`);
        }
        return null;
      });
    this.buffers.set(entry.id, promise);
    return promise;
  }

  /** Ids whose file failed to load. Diagnostics-only. */
  get missingStaticAssetIds(): AudioAssetId[] {
    return [...this.staticAssetIds].filter((id) => {
      const entry = this.manifest.get(id);
      return entry ? this.warnedMissingPaths.has(entry.path) : false;
    });
  }

  private isSafeGeneratedAsset(entry: AudioManifestEntry): boolean {
    return Boolean(
      entry &&
      (entry.category === 'music' || entry.category === 'sfx') &&
      typeof entry.path === 'string' &&
      (entry.path.startsWith('/audio/generated/') || entry.path.startsWith('/audio/music/')) &&
      !entry.path.includes('://')
    );
  }

  private updateSettings(update: Partial<AudioSettings>): void {
    this.settings = {
      muted: update.muted ?? this.settings.muted,
      master: clamp01(update.master ?? this.settings.master),
      music: clamp01(update.music ?? this.settings.music),
      sfx: clamp01(update.sfx ?? this.settings.sfx),
      engine: clamp01(update.engine ?? this.settings.engine),
      voice: clamp01(update.voice ?? this.settings.voice)
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    this.applySettings();
    const snapshot = this.getSettings();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private applySettings(): void {
    if (!this.context || !this.masterGain) return;
    const now = this.context.currentTime;
    this.masterGain.gain.setTargetAtTime(this.settings.muted ? 0 : this.settings.master, now, 0.025);
    this.categoryGains.music?.gain.setTargetAtTime(this.settings.music, now, 0.025);
    this.categoryGains.sfx?.gain.setTargetAtTime(this.settings.sfx, now, 0.025);
    this.engineGain?.gain.setTargetAtTime(this.settings.engine, now, 0.025);
    this.voiceGain?.gain.setTargetAtTime(this.settings.voice, now, 0.025);
  }

  private loadSettings(): AudioSettings {
    const defaults: AudioSettings = { muted: false, master: 0.8, music: 0.45, sfx: 0.75, engine: 0.65, voice: 0.9 };
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<AudioSettings>;
      return {
        muted: stored.muted === true,
        master: clamp01(stored.master ?? defaults.master),
        music: clamp01(stored.music ?? defaults.music),
        sfx: clamp01(stored.sfx ?? defaults.sfx),
        engine: clamp01(stored.engine ?? defaults.engine),
        voice: clamp01(stored.voice ?? defaults.voice)
      };
    } catch {
      return defaults;
    }
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
