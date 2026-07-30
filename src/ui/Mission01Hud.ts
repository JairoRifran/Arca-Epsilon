/**
 * Compact HUD for Mission 01's onboarding.
 *
 * The brief for this is mostly a list of things not to do: no large panels over
 * the scene, no ten indications at once, no leftover instruction contradicting
 * the current one. So the readout is a single strip with a fixed set of slots,
 * and each phase declares which slots it wants. Slots not named by the current
 * phase are hidden — not left showing a stale value — which is what makes the
 * "one instruction at a time" rule structural instead of a convention someone
 * has to remember.
 *
 * The objective line is the single source of the current instruction. Nothing
 * else writes it, and the tutorial hint system is suppressed while this is
 * visible, so the pilot never gets two different next actions on screen.
 */

export type Mission01HudSlotId =
  | 'dock'
  | 'systems'
  | 'bearing'
  | 'speed'
  | 'alignment'
  | 'distance'
  | 'scanner'
  | 'transfer'
  | 'authorization'
  | 'corridor';

export type Mission01HudModel = {
  /** The one actionable instruction for the current phase. */
  objective: string;
  /** Real key bindings for this phase. Empty when the phase needs no key. */
  keys: readonly string[];
  /** Which slots to show, in order. Everything else is hidden. */
  slots: readonly Mission01HudSlotId[];
  values: Partial<Record<Mission01HudSlotId, string>>;
  /** 0..1 ring on the active slot: hold confirmation, scan lock or transfer. */
  progress?: number;
  /** Shown under the objective when something the pilot controls is blocking. */
  warning?: string;
};

const SLOT_LABELS: Record<Mission01HudSlotId, string> = {
  dock: 'ACOPLE',
  systems: 'SISTEMAS',
  bearing: 'BALIZA',
  speed: 'VEL',
  alignment: 'ALINEACIÓN',
  distance: 'DIST',
  scanner: 'ESCÁNER',
  transfer: 'TRANSFER',
  authorization: 'DESCENSO',
  corridor: 'CORREDOR'
};

const SLOT_ORDER: readonly Mission01HudSlotId[] = [
  'dock',
  'systems',
  'bearing',
  'speed',
  'alignment',
  'distance',
  'scanner',
  'transfer',
  'authorization',
  'corridor'
];

export class Mission01Hud {
  readonly element = document.createElement('section');

  private readonly objective = document.createElement('p');

  private readonly keys = document.createElement('div');

  private readonly warning = document.createElement('p');

  private readonly progressBar = document.createElement('div');

  private readonly progressFill = document.createElement('span');

  private readonly rows = new Map<Mission01HudSlotId, { row: HTMLElement; value: HTMLElement }>();

  private visible = false;

  constructor(parent: HTMLElement) {
    this.element.className = 'mission01-hud';
    this.element.setAttribute('aria-hidden', 'true');

    this.objective.className = 'mission01-hud__objective';
    this.keys.className = 'mission01-hud__keys';
    this.warning.className = 'mission01-hud__warning';
    this.progressBar.className = 'mission01-hud__progress';
    this.progressFill.className = 'mission01-hud__progress-fill';
    this.progressBar.append(this.progressFill);

    const readout = document.createElement('div');
    readout.className = 'mission01-hud__readout';
    // Built once, in canonical order, then shown or hidden per phase. Rebuilding
    // the strip on every phase change would churn DOM for no reason.
    for (const id of SLOT_ORDER) {
      const row = document.createElement('div');
      row.className = 'mission01-hud__slot';
      row.hidden = true;
      const label = document.createElement('span');
      const value = document.createElement('strong');
      label.textContent = SLOT_LABELS[id];
      value.textContent = '--';
      row.append(label, value);
      readout.append(row);
      this.rows.set(id, { row, value });
    }

    this.element.append(this.objective, this.keys, this.progressBar, readout, this.warning);
    parent.append(this.element);
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.element.classList.toggle('is-active', visible);
    this.element.setAttribute('aria-hidden', String(!visible));
  }

  get isVisible(): boolean {
    return this.visible;
  }

  update(model: Mission01HudModel): void {
    if (this.objective.textContent !== model.objective) {
      this.objective.textContent = model.objective;
    }

    const keyText = model.keys.join(' · ');
    if (this.keys.textContent !== keyText) {
      this.keys.textContent = keyText;
      this.keys.hidden = keyText.length === 0;
    }

    const warning = model.warning ?? '';
    if (this.warning.textContent !== warning) {
      this.warning.textContent = warning;
      this.warning.hidden = warning.length === 0;
    }

    const progress = model.progress;
    const showProgress = typeof progress === 'number' && progress > 0;
    this.progressBar.hidden = !showProgress;
    if (showProgress) {
      this.progressFill.style.width = `${Math.round(clamp(progress, 0, 1) * 100)}%`;
    }

    // Every slot is resolved every update: a slot the phase did not ask for is
    // hidden, so a value from a previous phase can never linger on screen.
    for (const id of SLOT_ORDER) {
      const entry = this.rows.get(id);
      if (!entry) continue;
      const wanted = model.slots.includes(id);
      if (entry.row.hidden === wanted) entry.row.hidden = !wanted;
      if (!wanted) continue;
      const text = model.values[id] ?? '--';
      if (entry.value.textContent !== text) entry.value.textContent = text;
    }
  }

  dispose(): void {
    this.element.remove();
    this.rows.clear();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
