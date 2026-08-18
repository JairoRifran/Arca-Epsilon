/**
 * Remappable keyboard controls.
 *
 * The game reads movement as `input.has('w')` in about thirty places and tests
 * actions against `event.code` in the keydown handler. Rewriting all of those
 * to consult a binding table would be a wide, risky change for a settings
 * feature, so the translation happens at the edge instead: a physical key is
 * resolved to the action it is bound to, and movement actions are then fed into
 * the input set under their *default* letter. Bind "adelante" to ArrowUp and
 * the handler still adds 'w', so every existing call site keeps working
 * untouched and there is one place where a remap can go wrong.
 */

export type BindableAction =
  | 'forward' | 'back' | 'left' | 'right'
  | 'boost' | 'ascend' | 'descend'
  | 'interact' | 'fire' | 'torpedo' | 'target' | 'reload'
  | 'camera' | 'starMap' | 'enterShip';

export type BindingDefinition = {
  readonly action: BindableAction;
  readonly label: string;
  /** Physical `KeyboardEvent.code` used when nothing is customised. */
  readonly defaultCode: string;
  /**
   * The lowercased `event.key` this action feeds into the shared input set.
   * Only movement-style actions have one; discrete actions are dispatched by
   * name instead.
   */
  readonly inputKey?: string;
  /** Grouping for the settings screen. */
  readonly group: 'Vuelo' | 'Combate' | 'Interfaz';
};

/**
 * Every rebindable action, in the order the settings screen lists them.
 *
 * Escape and Enter are deliberately absent: they close menus and advance
 * dialogue, and letting them be reassigned can leave a player unable to reach
 * the settings screen that would undo it.
 */
export const BINDING_DEFINITIONS: readonly BindingDefinition[] = [
  { action: 'forward', label: 'Avanzar', defaultCode: 'KeyW', inputKey: 'w', group: 'Vuelo' },
  { action: 'back', label: 'Retroceder / frenar', defaultCode: 'KeyS', inputKey: 's', group: 'Vuelo' },
  { action: 'left', label: 'Izquierda', defaultCode: 'KeyA', inputKey: 'a', group: 'Vuelo' },
  { action: 'right', label: 'Derecha', defaultCode: 'KeyD', inputKey: 'd', group: 'Vuelo' },
  { action: 'boost', label: 'Impulso', defaultCode: 'ShiftLeft', inputKey: 'shift', group: 'Vuelo' },
  { action: 'ascend', label: 'Ascender', defaultCode: 'KeyQ', inputKey: 'q', group: 'Vuelo' },
  { action: 'descend', label: 'Descender', defaultCode: 'KeyC', inputKey: 'c', group: 'Vuelo' },
  { action: 'fire', label: 'Disparar láser', defaultCode: 'Space', inputKey: ' ', group: 'Combate' },
  { action: 'torpedo', label: 'Lanzar torpedo', defaultCode: 'KeyR', group: 'Combate' },
  { action: 'reload', label: 'Recargar', defaultCode: 'KeyG', group: 'Combate' },
  { action: 'target', label: 'Fijar objetivo', defaultCode: 'KeyT', group: 'Combate' },
  { action: 'interact', label: 'Interactuar / escanear', defaultCode: 'KeyE', group: 'Interfaz' },
  { action: 'enterShip', label: 'Subir / bajar de la nave', defaultCode: 'KeyF', group: 'Interfaz' },
  { action: 'camera', label: 'Cambiar cámara', defaultCode: 'KeyV', group: 'Interfaz' },
  { action: 'starMap', label: 'Mapa estelar', defaultCode: 'KeyM', group: 'Interfaz' }
];

const DEFINITION_BY_ACTION = new Map<BindableAction, BindingDefinition>(
  BINDING_DEFINITIONS.map((definition) => [definition.action, definition])
);

const STORAGE_KEY = 'arca-epsilon:key-bindings:v1';

/** Every letter the shared input set uses for a bindable movement control. */
const CANONICAL_INPUT_KEYS = new Set(
  BINDING_DEFINITIONS.map((definition) => definition.inputKey).filter((key): key is string => Boolean(key))
);

/** Codes that must never be captured: they are how a player escapes a bad bind. */
const RESERVED_CODES = new Set(['Escape', 'Enter', 'NumpadEnter', 'Tab', 'F5', 'F11', 'F12']);

/** A short, readable name for a physical key. */
export function describeCode(code: string): string {
  if (code === 'Space') return 'Espacio';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code.startsWith('Arrow')) {
    const arrows: Record<string, string> = { Up: '↑', Down: '↓', Left: '←', Right: '→' };
    return arrows[code.slice(5)] ?? code;
  }
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  return code;
}

export type BindingConflict = { action: BindableAction; label: string };

export class KeyBindings {
  private readonly codes = new Map<BindableAction, string>();
  /** Reverse index, rebuilt on every change so lookups stay O(1) per keydown. */
  private byCode = new Map<string, BindableAction>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    this.resetAll(false);
    this.restore();
  }

  private reindex(): void {
    this.byCode = new Map();
    for (const [action, code] of this.codes) this.byCode.set(code, action);
  }

  private restore(): void {
    let raw: string | null = null;
    try {
      raw = this.storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return; // Private browsing or a blocked store: defaults are fine.
    }
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as Record<string, unknown>;
      for (const definition of BINDING_DEFINITIONS) {
        const code = stored[definition.action];
        // Unknown or reserved codes fall back rather than stranding the action.
        if (typeof code === 'string' && code && !RESERVED_CODES.has(code)) {
          this.codes.set(definition.action, code);
        }
      }
      this.reindex();
    } catch {
      this.resetAll(false);
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.codes)));
    } catch {
      // Nothing to do: the bindings still apply for this session.
    }
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  /** Fires whenever a binding changes, so the HUD can relabel its hints. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  codeFor(action: BindableAction): string {
    return this.codes.get(action) ?? DEFINITION_BY_ACTION.get(action)?.defaultCode ?? '';
  }

  /** Display label for the key currently bound to an action. */
  labelFor(action: BindableAction): string {
    return describeCode(this.codeFor(action));
  }

  actionFor(code: string): BindableAction | undefined {
    return this.byCode.get(code);
  }

  /** True when this physical key is currently bound to the given action. */
  matches(code: string, action: BindableAction): boolean {
    return this.codeFor(action) === code;
  }

  /**
   * The letter this key should register as in the shared input set.
   *
   * Returns undefined for keys with no movement meaning, which the caller
   * should then ignore rather than passing through: letting the raw key in as
   * well would make a rebound control fire twice.
   */
  inputKeyFor(code: string): string | undefined {
    const action = this.byCode.get(code);
    if (!action) return undefined;
    return DEFINITION_BY_ACTION.get(action)?.inputKey;
  }

  /**
   * True when this letter is one the input set treats as a movement control.
   *
   * Needed so a key that lost its binding stops steering: without it, rebinding
   * "adelante" to a key nobody held would leave W unbound, fall through to the
   * raw-key path, and keep moving the ship anyway.
   */
  isCanonicalInputKey(key: string): boolean {
    return CANONICAL_INPUT_KEYS.has(key);
  }

  isReserved(code: string): boolean {
    return RESERVED_CODES.has(code);
  }

  /** The action already using this code, if it is not the one being edited. */
  conflictFor(code: string, action: BindableAction): BindingConflict | undefined {
    const owner = this.byCode.get(code);
    if (!owner || owner === action) return undefined;
    return { action: owner, label: DEFINITION_BY_ACTION.get(owner)?.label ?? owner };
  }

  /**
   * Assigns a key, clearing whatever else held it.
   *
   * Swapping rather than refusing: a player remapping a scheme wholesale would
   * otherwise have to unbind everything first, and an action with no key is a
   * worse state than two actions trading places.
   */
  assign(action: BindableAction, code: string): boolean {
    if (!code || RESERVED_CODES.has(code)) return false;
    const previousOwner = this.byCode.get(code);
    const previousCode = this.codeFor(action);
    if (previousOwner && previousOwner !== action) this.codes.set(previousOwner, previousCode);
    this.codes.set(action, code);
    this.reindex();
    this.persist();
    this.notify();
    return true;
  }

  resetAll(notify = true): void {
    this.codes.clear();
    for (const definition of BINDING_DEFINITIONS) this.codes.set(definition.action, definition.defaultCode);
    this.reindex();
    if (notify) {
      this.persist();
      this.notify();
    }
  }

  isDefault(action: BindableAction): boolean {
    return this.codeFor(action) === DEFINITION_BY_ACTION.get(action)?.defaultCode;
  }
}
