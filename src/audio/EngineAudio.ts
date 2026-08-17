import { AudioManager, type AudioPlayback } from './AudioManager';
import type { SfxTrackId } from './audioDefinitions';

export interface EngineAudioInput {
  active: boolean;
  thrust: number;
  boost: boolean;
  brake: boolean;
  vertical: number;
  hover: number;
  groundEffect: number;
  speed: number;
  atmosphere: boolean;
  liftActive: boolean;
  dialogueActive: boolean;
}

export type EngineAudioState =
  | 'off'
  | 'idle'
  | 'hover'
  | 'thrust'
  | 'boost'
  | 'vertical'
  | 'brake'
  | 'lift-quiet';

export interface EngineAudioSnapshot {
  state: EngineAudioState;
  propulsionIntensity: number;
  hoverIntensity: number;
  verticalThrustIntensity: number;
  boostIntensity: number;
  groundWashIntensity: number;
  spaceCruiseActive: boolean;
  atmosphericAudioActive: boolean;
  dialogueDuckingActive: boolean;
  activeLayers: string[];
}

type LayerId = 'idle' | 'acceleration' | 'vertical' | 'boost' | 'wash' | 'cruise' | 'atmosphere';

const LAYER_ASSETS: Record<LayerId, SfxTrackId> = {
  idle: 'sfx-ship-idle',
  acceleration: 'sfx-ship-accelerate',
  vertical: 'sfx-vertical-thrust',
  boost: 'sfx-boost-intensity',
  wash: 'sfx-hover-wash',
  cruise: 'sfx-space-cruise',
  atmosphere: 'sfx-atmospheric-flight'
};

const BRAKE_COOLDOWN_SECONDS = 3;

/**
 * Physical propulsion mix built from independent real-audio layers. Input
 * intent changes gains with attack/release smoothing; pitch only opens by a
 * few percent so the engine keeps its mass instead of turning into a synth.
 */
export class EngineAudio {
  private readonly layers = new Map<LayerId, AudioPlayback>();
  private readonly starting = new Set<LayerId>();
  private readonly sentVolumes = createLayerRecord(-1);
  private readonly sentRates = createLayerRecord(-1);
  private state: EngineAudioState = 'off';
  private smoothedThrust = 0;
  private smoothedHover = 0;
  private smoothedVertical = 0;
  private smoothedBoost = 0;
  private smoothedGroundWash = 0;
  private lastBrakeAt = -Infinity;
  private atmosphereActive = false;
  private dialogueDucking = false;
  private layerEpoch = 0;

  constructor(private readonly audio: AudioManager) {}

  get engineState(): EngineAudioState {
    return this.state;
  }

  get propulsionIntensity(): number {
    return this.smoothedThrust;
  }

  get hoverIntensity(): number {
    return this.smoothedHover;
  }

  get verticalThrustIntensity(): number {
    return this.smoothedVertical;
  }

  get boostIntensity(): number {
    return this.smoothedBoost;
  }

  get groundWashIntensity(): number {
    return this.smoothedGroundWash;
  }

  get spaceCruiseActive(): boolean {
    return !this.atmosphereActive && this.state !== 'off';
  }

  get atmosphericAudioActive(): boolean {
    return this.atmosphereActive && this.state !== 'off';
  }

  get dialogueDuckingActive(): boolean {
    return this.dialogueDucking;
  }

  getSnapshot(): EngineAudioSnapshot {
    return {
      state: this.state,
      propulsionIntensity: this.smoothedThrust,
      hoverIntensity: this.smoothedHover,
      verticalThrustIntensity: this.smoothedVertical,
      boostIntensity: this.smoothedBoost,
      groundWashIntensity: this.smoothedGroundWash,
      spaceCruiseActive: this.spaceCruiseActive,
      atmosphericAudioActive: this.atmosphericAudioActive,
      dialogueDuckingActive: this.dialogueDucking,
      activeLayers: [...this.layers.keys()]
    };
  }

  update(delta: number, elapsedSeconds: number, input: EngineAudioInput): void {
    if (!input.active) {
      this.state = 'off';
      this.stopAll();
      return;
    }

    this.atmosphereActive = input.atmosphere;
    this.dialogueDucking = input.dialogueActive;
    this.smoothedThrust = smoothIntent(this.smoothedThrust, input.thrust, delta, 0.18, 0.48);
    this.smoothedHover = smoothIntent(this.smoothedHover, input.hover, delta, 0.35, 0.65);
    this.smoothedVertical = smoothIntent(this.smoothedVertical, input.vertical, delta, 0.12, 0.42);
    this.smoothedBoost = smoothIntent(this.smoothedBoost, input.boost ? 1 : 0, delta, 0.15, 0.55);
    const groundWashTarget = input.atmosphere
      ? input.groundEffect * Math.min(1, 0.18 + this.smoothedHover * 0.35 + this.smoothedVertical * 0.72)
      : 0;
    this.smoothedGroundWash = smoothIntent(this.smoothedGroundWash, groundWashTarget, delta, 0.2, 0.7);

    if (
      input.brake &&
      this.state !== 'brake' &&
      input.speed > 14 &&
      elapsedSeconds - this.lastBrakeAt > BRAKE_COOLDOWN_SECONDS
    ) {
      this.lastBrakeAt = elapsedSeconds;
      void this.audio.play('sfx-brake-release', { loop: false, volume: 0.46, fadeInSeconds: 0.1 });
    }

    const sceneScale = (input.liftActive ? 0.18 : 1) * (input.dialogueActive ? 0.46 : 1);
    const atmosphereScale = input.atmosphere ? 1 : 0.74;
    const boostBody = this.smoothedBoost * Math.max(0.35, this.smoothedThrust);
    const targets: Record<LayerId, number> = {
      idle: (0.24 + this.smoothedThrust * 0.12) * sceneScale,
      acceleration: this.smoothedThrust * 0.72 * sceneScale,
      vertical: (this.smoothedVertical * 0.86 + this.smoothedHover * 0.14) * atmosphereScale * sceneScale,
      boost: boostBody * 0.88 * sceneScale,
      wash: this.smoothedGroundWash * 0.58 * sceneScale,
      cruise: (input.atmosphere ? 0 : 0.12 + this.smoothedThrust * 0.26 + boostBody * 0.12) * sceneScale,
      atmosphere: (input.atmosphere ? 0.14 + this.smoothedThrust * 0.34 + this.smoothedVertical * 0.12 : 0) * sceneScale
    };

    for (const id of Object.keys(targets) as LayerId[]) this.applyLayer(id, targets[id]);

    this.applyRate('idle', 0.94 + this.smoothedThrust * 0.07);
    this.applyRate('acceleration', 0.9 + this.smoothedThrust * 0.16);
    this.applyRate('vertical', 0.92 + this.smoothedVertical * 0.12);
    this.applyRate('boost', 0.96 + boostBody * 0.1);

    this.state = input.liftActive
      ? 'lift-quiet'
      : input.brake
        ? 'brake'
        : input.boost && input.thrust > 0.05
          ? 'boost'
          : input.vertical > 0.25
            ? 'vertical'
            : input.thrust > 0.1
              ? 'thrust'
              : this.smoothedHover > 0.2
                ? 'hover'
                : 'idle';
  }

  stopAll(fadeSeconds = 0.5): void {
    this.layerEpoch += 1;
    this.layers.forEach((playback) => playback.stop(fadeSeconds));
    this.layers.clear();
    this.starting.clear();
    for (const id of Object.keys(this.sentVolumes) as LayerId[]) {
      this.sentVolumes[id] = -1;
      this.sentRates[id] = -1;
    }
    this.smoothedThrust = 0;
    this.smoothedHover = 0;
    this.smoothedVertical = 0;
    this.smoothedBoost = 0;
    this.smoothedGroundWash = 0;
    this.atmosphereActive = false;
    this.dialogueDucking = false;
  }

  private applyLayer(id: LayerId, volume: number): void {
    const clamped = Math.min(1, Math.max(0, volume));
    const playback = this.layers.get(id);
    if (!playback) {
      if (clamped > 0.015 && !this.starting.has(id)) {
        const epoch = this.layerEpoch;
        this.starting.add(id);
        void this.audio
          .play(LAYER_ASSETS[id], { loop: true, volume: clamped, fadeInSeconds: 0.45 })
          .then((started) => {
            this.starting.delete(id);
            if (!started) return;
            if (epoch !== this.layerEpoch) {
              started.stop(0.05);
              return;
            }
            this.layers.set(id, started);
            this.sentVolumes[id] = clamped;
          });
      }
      return;
    }
    if (Math.abs(clamped - this.sentVolumes[id]) > 0.012) {
      const previous = this.sentVolumes[id];
      this.sentVolumes[id] = clamped;
      playback.setVolume(Math.max(0.0001, clamped), clamped > previous ? 0.12 : 0.28);
    }
  }

  private applyRate(id: LayerId, rate: number): void {
    const clamped = Math.min(1.18, Math.max(0.85, rate));
    const playback = this.layers.get(id);
    if (!playback || Math.abs(clamped - this.sentRates[id]) <= 0.008) return;
    this.sentRates[id] = clamped;
    playback.setPlaybackRate(clamped, 0.28);
  }
}

function createLayerRecord(value: number): Record<LayerId, number> {
  return {
    idle: value,
    acceleration: value,
    vertical: value,
    boost: value,
    wash: value,
    cruise: value,
    atmosphere: value
  };
}

function smoothIntent(current: number, target: number, delta: number, attack: number, release: number): number {
  const clampedTarget = Math.min(1, Math.max(0, target));
  const time = clampedTarget > current ? attack : release;
  const response = 1 - Math.exp(-Math.max(0, delta) / Math.max(0.001, time));
  return current + (clampedTarget - current) * response;
}
