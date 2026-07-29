export type GameInputAction = 'scan' | 'shipAccess' | 'toggleCamera' | 'map' | 'pause';

export type InputMode =
  | 'paused'
  | 'map'
  | 'boarding-transition'
  | 'on-foot'
  | 'surface-flight'
  | 'space-flight';

export type ActionConsumedBy = 'pause-menu' | 'map-overlay' | 'transition' | 'on-foot' | 'ship' | 'system' | 'none';

export type InputRoutingContext = {
  pauseOpen: boolean;
  mapOpen: boolean;
  transitionActive: boolean;
  onFoot: boolean;
  insideShip: boolean;
};

export type InputActionHandlers = Record<GameInputAction, () => boolean> & {
  closeMap: () => boolean;
};

export type InputActionState = {
  inputMode: InputMode;
  lastInputKey: string;
  lastInputAction: GameInputAction | 'none';
  actionConsumedBy: ActionConsumedBy;
  actionHandled: boolean;
};

/** Applies one priority contract to keyboard and debug-triggered actions. */
export class InputActionRouter {
  private lastInputKey = '';

  private lastInputAction: GameInputAction | 'none' = 'none';

  private actionConsumedBy: ActionConsumedBy = 'none';

  private actionHandled = false;

  recordKey(key: string): void {
    this.lastInputKey = key;
  }

  dispatch(
    action: GameInputAction,
    key: string,
    context: InputRoutingContext,
    handlers: InputActionHandlers
  ): boolean {
    this.lastInputKey = key;
    this.lastInputAction = action;

    if (action === 'pause') {
      if (context.mapOpen) {
        return this.finish('map-overlay', handlers.closeMap());
      }
      return this.finish('pause-menu', handlers.pause());
    }

    if (context.pauseOpen) return this.finish('pause-menu', false);

    if (action === 'map') {
      return this.finish('map-overlay', handlers.map());
    }

    if (context.mapOpen) return this.finish('map-overlay', false);
    if (context.transitionActive) return this.finish('transition', false);

    const consumer: ActionConsumedBy = context.onFoot ? 'on-foot' : context.insideShip ? 'ship' : 'system';
    return this.finish(consumer, handlers[action]());
  }

  snapshot(inputMode: InputMode): InputActionState {
    return {
      inputMode,
      lastInputKey: this.lastInputKey,
      lastInputAction: this.lastInputAction,
      actionConsumedBy: this.actionConsumedBy,
      actionHandled: this.actionHandled
    };
  }

  private finish(consumer: ActionConsumedBy, handled: boolean): boolean {
    this.actionConsumedBy = consumer;
    this.actionHandled = handled;
    return handled;
  }
}
