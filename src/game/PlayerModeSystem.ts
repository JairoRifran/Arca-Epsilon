export type PlayerMode =
  | 'SHIP_SPACE'
  | 'SHIP_SURFACE'
  | 'COCKPIT'
  | 'EXITING_SHIP'
  | 'ON_FOOT'
  | 'ENTERING_SHIP';

export type PlayerTransitionEvent = 'exitComplete' | 'enterComplete';

export type CharacterControlState = {
  playerMode: PlayerMode;
  moveState: string;
  animation: string;
  inputVector: [number, number];
  velocity: [number, number, number];
  position: [number, number, number];
  facingYaw: number;
  cameraYaw: number;
  cameraPitch: number;
  cameraForward: [number, number, number];
  grounded: boolean;
};

/**
 * Keeps ship camera intent separate from the temporary exit/on-foot states.
 * Main owns the poses; this class owns legal transitions and their timing.
 */
export class PlayerModeSystem {
  mode: PlayerMode = 'SHIP_SPACE';

  transitionProgress = 0;

  readonly transitionDuration = 3.2;

  private previousShipMode: PlayerMode = 'SHIP_SURFACE';

  syncShipContext(onSurface: boolean, cockpit: boolean): PlayerMode {
    if (!this.insideShip || this.transitionActive) return this.mode;
    this.mode = cockpit ? 'COCKPIT' : onSurface ? 'SHIP_SURFACE' : 'SHIP_SPACE';
    this.previousShipMode = this.mode;
    return this.mode;
  }

  startExit(): boolean {
    if (this.mode !== 'SHIP_SURFACE' && this.mode !== 'COCKPIT') return false;
    this.previousShipMode = this.mode;
    this.mode = 'EXITING_SHIP';
    this.transitionProgress = 0;
    return true;
  }

  startEnter(): boolean {
    if (this.mode !== 'ON_FOOT') return false;
    this.mode = 'ENTERING_SHIP';
    this.transitionProgress = 0;
    return true;
  }

  update(delta: number): PlayerTransitionEvent | undefined {
    if (!this.transitionActive) return undefined;
    this.transitionProgress = Math.min(1, this.transitionProgress + Math.max(0, delta) / this.transitionDuration);
    if (this.transitionProgress < 1) return undefined;

    if (this.mode === 'EXITING_SHIP') {
      this.mode = 'ON_FOOT';
      return 'exitComplete';
    }

    this.mode = this.previousShipMode === 'COCKPIT' ? 'COCKPIT' : 'SHIP_SURFACE';
    return 'enterComplete';
  }

  forceOnFoot(): PlayerMode {
    if (this.mode === 'SHIP_SPACE') return this.mode;
    this.mode = 'ON_FOOT';
    this.transitionProgress = 1;
    return this.mode;
  }

  forceShip(onSurface: boolean, cockpit: boolean): PlayerMode {
    this.mode = cockpit ? 'COCKPIT' : onSurface ? 'SHIP_SURFACE' : 'SHIP_SPACE';
    this.previousShipMode = this.mode;
    this.transitionProgress = 0;
    return this.mode;
  }

  get insideShip(): boolean {
    return this.mode === 'SHIP_SPACE' || this.mode === 'SHIP_SURFACE' || this.mode === 'COCKPIT';
  }

  get onFootActive(): boolean {
    return this.mode === 'ON_FOOT';
  }

  get characterVisible(): boolean {
    return this.mode === 'ON_FOOT' || this.mode === 'EXITING_SHIP' || this.mode === 'ENTERING_SHIP';
  }

  get transitionActive(): boolean {
    return this.mode === 'EXITING_SHIP' || this.mode === 'ENTERING_SHIP';
  }
}
