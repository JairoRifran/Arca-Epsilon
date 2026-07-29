import * as THREE from 'three';

export type CameraMode = 'external' | 'cockpit';

/**
 * Owns only camera-mode intent and blend timing. Camera pose remains in the
 * main flight camera so both views share the same controls and mission flow.
 */
export class CameraModeSystem {
  mode: CameraMode = 'external';

  blend = 0;

  readonly transitionDuration = 0.62;

  setMode(mode: CameraMode): CameraMode {
    this.mode = mode;
    return this.mode;
  }

  toggle(): CameraMode {
    return this.setMode(this.mode === 'external' ? 'cockpit' : 'external');
  }

  update(delta: number): number {
    const target = this.mode === 'cockpit' ? 1 : 0;
    const response = 1 - Math.exp(-Math.max(0, delta) * (5.2 / this.transitionDuration));
    this.blend = THREE.MathUtils.lerp(this.blend, target, response);
    if (Math.abs(this.blend - target) < 0.001) this.blend = target;
    return this.blend;
  }

  get cockpitActive(): boolean {
    return this.mode === 'cockpit' && this.blend > 0.82;
  }

  get transitionActive(): boolean {
    const target = this.mode === 'cockpit' ? 1 : 0;
    return Math.abs(this.blend - target) > 0.001;
  }
}
