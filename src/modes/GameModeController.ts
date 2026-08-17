export const GAME_MODES = ['menu', 'story', 'combat', 'garage'] as const;

export type GameMode = (typeof GAME_MODES)[number];

export type GameModeTransition = {
  from: GameMode;
  to: GameMode;
};

export type GameModeLifecycle = Partial<Record<GameMode, {
  enter?: (transition: GameModeTransition) => void | Promise<void>;
  exit?: (transition: GameModeTransition) => void | Promise<void>;
}>>;

/**
 * Single authority for the product-level mode. Story missions never need to
 * know that Garage or Combat exist; main only advances their authority while
 * this controller says the active mode is Story.
 */
export class GameModeController {
  private current: GameMode = 'menu';
  private transitioning = false;
  private readonly listeners = new Set<(transition: GameModeTransition) => void>();

  constructor(private readonly lifecycle: GameModeLifecycle = {}) {}

  get mode(): GameMode {
    return this.current;
  }

  get isStory(): boolean {
    return this.current === 'story';
  }

  get isCombat(): boolean {
    return this.current === 'combat';
  }

  get isGarage(): boolean {
    return this.current === 'garage';
  }

  async enter(next: GameMode): Promise<boolean> {
    if (next === this.current || this.transitioning) return false;
    this.transitioning = true;
    const transition = { from: this.current, to: next };
    try {
      await this.lifecycle[this.current]?.exit?.(transition);
      this.current = next;
      await this.lifecycle[next]?.enter?.(transition);
      this.listeners.forEach((listener) => listener(transition));
      return true;
    } finally {
      this.transitioning = false;
    }
  }

  subscribe(listener: (transition: GameModeTransition) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
