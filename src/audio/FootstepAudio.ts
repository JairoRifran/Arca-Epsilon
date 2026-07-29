import * as THREE from 'three';
import type { CharacterMoveState } from '../entities/SurfaceCharacter';
import { AudioManager } from './AudioManager';
import type { SfxTrackId } from './audioDefinitions';

export type FootstepMode = 'walk' | 'run' | 'none';

export interface FootstepAudioState {
  active: boolean;
  mode: FootstepMode;
  lastFootstepTime: number;
  surface: string;
  missingAssets: string[];
}

interface FootstepUpdate {
  active: boolean;
  position: THREE.Vector3;
  speed: number;
  moveState: CharacterMoveState;
  elapsedSeconds: number;
}

const WALK_ASSETS: readonly SfxTrackId[] = [
  'sfx-footstep-walk-01',
  'sfx-footstep-walk-02',
  'sfx-footstep-walk-03'
];
const RUN_ASSETS: readonly SfxTrackId[] = [
  'sfx-footstep-run-01',
  'sfx-footstep-run-02',
  'sfx-footstep-run-03'
];
const ALL_ASSETS = [...WALK_ASSETS, ...RUN_ASSETS];
const SURFACE_NAME = 'dry-alien-ground';

/** Distance-driven footsteps for the surface pilot. */
export class FootstepAudio {
  private readonly previousPosition = new THREE.Vector3();
  private hasPreviousPosition = false;
  private distanceSinceStep = 0;
  private variantIndex = 0;
  private active = false;
  private mode: FootstepMode = 'none';
  private lastFootstepTime = 0;

  constructor(private readonly audio: AudioManager) {}

  update(input: FootstepUpdate): void {
    const nextMode = resolveMode(input.moveState, input.speed);
    if (!input.active || nextMode === 'none') {
      this.resetMotion(input.position);
      this.active = false;
      this.mode = 'none';
      return;
    }

    if (!this.hasPreviousPosition) {
      this.previousPosition.copy(input.position);
      this.hasPreviousPosition = true;
      this.active = true;
      this.mode = nextMode;
      return;
    }

    const travelled = horizontalDistance(this.previousPosition, input.position);
    this.previousPosition.copy(input.position);
    this.active = true;
    this.mode = nextMode;

    // Teleports and debug repositioning do not count as a physical stride.
    if (travelled > 3.5) {
      this.distanceSinceStep = 0;
      return;
    }

    this.distanceSinceStep += travelled;
    const strideDistance = nextMode === 'run'
      ? THREE.MathUtils.clamp(input.speed * 0.33, 1.55, 2.25)
      : THREE.MathUtils.clamp(input.speed * 0.55, 1.05, 1.85);
    if (this.distanceSinceStep < strideDistance) return;

    this.distanceSinceStep %= strideDistance;
    this.lastFootstepTime = input.elapsedSeconds;
    void this.playStep(nextMode);
  }

  get state(): FootstepAudioState {
    return {
      active: this.active,
      mode: this.mode,
      lastFootstepTime: this.lastFootstepTime,
      surface: SURFACE_NAME,
      missingAssets: ALL_ASSETS.filter((id) => !this.audio.hasAsset(id))
    };
  }

  testWalkFootsteps(): Promise<boolean> {
    return this.preview('walk');
  }

  testRunFootsteps(): Promise<boolean> {
    return this.preview('run');
  }

  private resetMotion(position: THREE.Vector3): void {
    this.previousPosition.copy(position);
    this.hasPreviousPosition = true;
    this.distanceSinceStep = 0;
  }

  private async playStep(mode: Exclude<FootstepMode, 'none'>): Promise<boolean> {
    const assets = mode === 'run' ? RUN_ASSETS : WALK_ASSETS;
    const id = assets[this.variantIndex % assets.length];
    this.variantIndex += 1;
    const baseVolume = mode === 'run' ? 0.52 : 0.38;
    const playback = await this.audio.play(id, {
      loop: false,
      volume: baseVolume + (Math.random() - 0.5) * 0.06,
      fadeInSeconds: 0.012
    });
    playback?.setPlaybackRate(1 + (Math.random() - 0.5) * 0.05, 0.01);
    return Boolean(playback);
  }

  private async preview(mode: Exclude<FootstepMode, 'none'>): Promise<boolean> {
    let played = false;
    const delay = mode === 'run' ? 320 : 520;
    for (let index = 0; index < 3; index += 1) {
      played = await this.playStep(mode) || played;
      if (index < 2) await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
    }
    return played;
  }
}

function resolveMode(moveState: CharacterMoveState, speed: number): FootstepMode {
  if (speed < 0.25) return 'none';
  if (moveState === 'runForward') return 'run';
  if (
    moveState === 'walkForward' ||
    moveState === 'walkBackward' ||
    moveState === 'strafeLeft' ||
    moveState === 'strafeRight'
  ) return 'walk';
  return 'none';
}

function horizontalDistance(from: THREE.Vector3, to: THREE.Vector3): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}
