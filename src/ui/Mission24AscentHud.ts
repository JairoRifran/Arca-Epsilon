import type { AtmosphericAscentMetrics } from '../game/AtmosphericAscentController';

export class Mission24AscentHud {
  readonly element = document.createElement('section');
  private readonly values: HTMLElement[] = [];

  constructor(parent: HTMLElement) {
    this.element.className = 'mission24-ascent-hud';
    this.element.setAttribute('aria-hidden', 'true');
    const labels = ['ALT', 'V.VERT', 'V.HORIZ', 'V.TOTAL', 'PRES', 'TEMP', 'POT', 'RUMBO', 'INCL', 'FASE', 'ESTAB'];
    for (let index = 0; index < labels.length; index += 1) {
      const row = document.createElement('div');
      const label = document.createElement('span');
      const value = document.createElement('strong');
      label.textContent = labels[index];
      value.textContent = '--';
      row.append(label, value);
      this.values.push(value);
      this.element.append(row);
    }
    parent.append(this.element);
  }

  setVisible(visible: boolean): void {
    this.element.classList.toggle('is-active', visible);
    this.element.setAttribute('aria-hidden', String(!visible));
  }

  update(metrics: AtmosphericAscentMetrics): void {
    this.values[0].textContent = `${metrics.altitude.toLocaleString('es-UY')} m`;
    this.values[1].textContent = `${metrics.verticalSpeed.toFixed(0)} m/s`;
    this.values[2].textContent = `${metrics.horizontalSpeed.toFixed(0)} m/s`;
    this.values[3].textContent = `${metrics.totalSpeed.toFixed(0)} m/s`;
    this.values[4].textContent = `${metrics.pressure.toFixed(1)} kPa`;
    this.values[5].textContent = `${metrics.temperature.toFixed(0)} C`;
    this.values[6].textContent = `${metrics.enginePower}%`;
    this.values[7].textContent = `${metrics.heading} deg`;
    this.values[8].textContent = `${metrics.pitch.toFixed(0)} deg`;
    this.values[9].textContent = metrics.phase;
    this.values[10].textContent = `${metrics.orbitalStability}%`;
  }

  dispose(): void {
    this.element.remove();
    this.values.length = 0;
  }
}
