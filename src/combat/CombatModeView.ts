import type { CombatSessionSnapshot } from './CombatSession';
import type { CombatScenarioDefinition } from './CombatScenarioCatalog';
import type { ShipDefinition } from '../ships/ShipCatalog';

type CombatModeViewCallbacks = {
  onStart: () => void;
  onBack: () => void;
  onReturnToMenu: () => void;
  onReplay: () => void;
};

/** Owns Combat setup, live readout and Results DOM; no match authority lives here. */
export class CombatModeView {
  private readonly setup: HTMLElement;
  private readonly live: HTMLElement;
  private readonly results: HTMLElement;
  private readonly wave: HTMLElement;
  private readonly enemies: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly hull: HTMLProgressElement;
  private readonly state: HTMLElement;
  private readonly resultTitle: HTMLElement;
  private readonly resultKills: HTMLElement;
  private readonly resultWaves: HTMLElement;
  private readonly resultTime: HTMLElement;
  private displayedWave = -1;
  private displayedCountdown = -1;
  private displayedEnemies = -1;
  private displayedSecond = -1;
  private displayedHull = -1;
  private displayedState = '';

  constructor(private readonly root: HTMLElement, callbacks: CombatModeViewCallbacks) {
    this.setup = this.get('#combat-setup');
    this.live = this.get('#combat-live-hud');
    this.results = this.get('#combat-results');
    this.wave = this.get('#combat-wave');
    this.enemies = this.get('#combat-enemies');
    this.timer = this.get('#combat-timer');
    this.hull = this.get<HTMLProgressElement>('#combat-hull');
    this.state = this.get('#combat-state');
    this.resultTitle = this.get('#combat-result-title');
    this.resultKills = this.get('#combat-result-kills');
    this.resultWaves = this.get('#combat-result-waves');
    this.resultTime = this.get('#combat-result-time');
    this.get<HTMLButtonElement>('#combat-start-button').addEventListener('click', callbacks.onStart);
    this.get<HTMLButtonElement>('#combat-back-button').addEventListener('click', callbacks.onBack);
    this.get<HTMLButtonElement>('#combat-return-button').addEventListener('click', callbacks.onReturnToMenu);
    this.get<HTMLButtonElement>('#combat-replay-button').addEventListener('click', callbacks.onReplay);
  }

  showSetup(scenario: CombatScenarioDefinition, ship: ShipDefinition): void {
    this.root.hidden = false;
    this.root.setAttribute('aria-hidden', 'false');
    this.setup.hidden = false;
    this.live.hidden = true;
    this.results.hidden = true;
    this.get('#combat-scenario-name').textContent = scenario.name;
    this.get('#combat-scenario-description').textContent = scenario.description;
    this.get('#combat-selected-ship').textContent = ship.displayName;
  }

  showLive(): void {
    this.root.hidden = false;
    this.root.setAttribute('aria-hidden', 'false');
    this.setup.hidden = true;
    this.live.hidden = false;
    this.results.hidden = true;
  }

  update(snapshot: CombatSessionSnapshot, hull: number): void {
    const countdown = Math.max(1, Math.ceil(snapshot.countdownRemaining));
    if (snapshot.state === 'starting') {
      if (countdown !== this.displayedCountdown || this.displayedState !== snapshot.state) {
        this.wave.textContent = `INICIO EN ${countdown}`;
        this.displayedCountdown = countdown;
      }
    } else if (snapshot.wave !== this.displayedWave || this.displayedState !== snapshot.state) {
      this.wave.textContent = `OLEADA ${snapshot.wave}/${snapshot.totalWaves}`;
      this.displayedWave = snapshot.wave;
    }
    if (snapshot.enemiesRemaining !== this.displayedEnemies) {
      this.enemies.textContent = `${snapshot.enemiesRemaining} CONTACTOS`;
      this.displayedEnemies = snapshot.enemiesRemaining;
    }
    const second = Math.floor(snapshot.timeElapsed);
    if (second !== this.displayedSecond) {
      this.timer.textContent = this.formatTime(second);
      this.displayedSecond = second;
    }
    const hullValue = Math.max(0, Math.round(hull));
    if (hullValue !== this.displayedHull) {
      this.hull.value = hullValue;
      this.displayedHull = hullValue;
    }
    if (snapshot.state !== this.displayedState) {
      this.state.textContent = snapshot.state === 'active'
        ? 'DEFENSA ACTIVA'
        : snapshot.state === 'starting'
          ? 'SISTEMAS ARMADOS'
          : snapshot.result === 'victory' ? 'SECTOR ASEGURADO' : 'CASCO CRÍTICO';
      this.displayedState = snapshot.state;
    }
  }

  showResults(snapshot: CombatSessionSnapshot): void {
    this.root.hidden = false;
    this.root.setAttribute('aria-hidden', 'false');
    this.setup.hidden = true;
    this.live.hidden = true;
    this.results.hidden = false;
    this.resultTitle.textContent = snapshot.result === 'victory' ? 'VICTORIA' : 'DERROTA';
    this.results.dataset.result = snapshot.result;
    this.resultKills.textContent = String(snapshot.kills);
    this.resultWaves.textContent = `${snapshot.wave}/${snapshot.totalWaves}`;
    this.resultTime.textContent = this.formatTime(snapshot.timeElapsed);
  }

  hide(): void {
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.setup.hidden = true;
    this.live.hidden = true;
    this.results.hidden = true;
  }

  private formatTime(seconds: number): string {
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60).toString().padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`;
  }

  private get<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing combat UI element: ${selector}`);
    return element;
  }
}
