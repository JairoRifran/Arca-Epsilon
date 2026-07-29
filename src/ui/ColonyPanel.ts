import type { ColonyState } from '../game/ColonyManager';

type RowState = 'pending' | 'warn' | 'ok';

/**
 * Base Nereida control panel: readiness bar, per-system status rows with
 * state dots and a "next required action" footer. Reads as a colonization
 * console, not a debug table.
 */
export class ColonyPanel {
  private element?: HTMLElement;

  mount(container: HTMLElement): void {
    if (this.element) return;

    this.element = document.createElement('aside');
    this.element.className = 'colony-panel';
    this.element.id = 'colony-panel';
    this.element.innerHTML = `
      <span class="label">Asentamiento E-01</span>
      <h2 id="colony-name-readout">Base Nereida</h2>
      <div class="colony-readiness">
        <div class="colony-readiness-track"><div class="colony-readiness-fill" id="colony-readiness-fill"></div></div>
        <strong id="colony-readiness">0%</strong>
      </div>
      <ul class="colony-status-list">
        <li id="colony-row-hab" data-state="pending"><i></i><span>Hábitat</span><strong id="colony-hab-status">Inactivo</strong></li>
        <li id="colony-row-en" data-state="pending"><i></i><span>Energía</span><strong id="colony-en-status">No detectada</strong></li>
        <li id="colony-row-ox" data-state="pending"><i></i><span>Oxígeno</span><strong id="colony-ox-status">Inactivo</strong></li>
        <li id="colony-row-wat" data-state="pending"><i></i><span>Agua</span><strong id="colony-wat-status">Pendiente</strong></li>
        <li id="colony-row-min" data-state="pending"><i></i><span>Minerales</span><strong id="colony-min-status">Pendiente</strong></li>
      </ul>
      <p class="colony-next" id="colony-next">Despliega el Módulo Hábitat Nereida-01 en la plataforma.</p>
    `;
    container.appendChild(this.element);
  }

  update(state: ColonyState): void {
    if (!this.element) return;
    this.element.classList.add('is-active');

    const setRow = (rowId: string, valueId: string, text: string, rowState: RowState): void => {
      const row = this.element?.querySelector<HTMLElement>(`#${rowId}`);
      const value = this.element?.querySelector<HTMLElement>(`#${valueId}`);
      if (row) row.dataset.state = rowState;
      if (value) value.textContent = text;
    };

    setRow('colony-row-hab', 'colony-hab-status', state.habitatOnline ? 'Online' : 'Inactivo', state.habitatOnline ? 'ok' : 'pending');
    setRow(
      'colony-row-en',
      'colony-en-status',
      state.energyOnline ? 'Estable' : state.energySourceFound ? 'Pendiente red' : 'No detectada',
      state.energyOnline ? 'ok' : state.energySourceFound ? 'warn' : 'pending'
    );
    setRow('colony-row-ox', 'colony-ox-status', state.oxygenOnline ? 'Estabilizando' : 'Inactivo', state.oxygenOnline ? 'ok' : 'pending');
    setRow('colony-row-wat', 'colony-wat-status', state.waterFound ? 'Conectada' : 'Pendiente', state.waterFound ? 'ok' : 'pending');
    setRow('colony-row-min', 'colony-min-status', state.mineralsFound ? 'Asegurados' : 'Pendiente', state.mineralsFound ? 'ok' : 'pending');

    const readiness = this.element.querySelector<HTMLElement>('#colony-readiness');
    if (readiness) readiness.textContent = `${state.colonizationReadiness}%`;
    const fill = this.element.querySelector<HTMLElement>('#colony-readiness-fill');
    if (fill) fill.style.width = `${state.colonizationReadiness}%`;

    const next = this.element.querySelector<HTMLElement>('#colony-next');
    if (next) {
      next.textContent = !state.habitatOnline
        ? 'Siguiente: despliega el Módulo Hábitat Nereida-01 (E en la plataforma).'
        : !state.waterFound
          ? 'Siguiente: localiza y escanea el acuífero subterráneo (señal azul).'
          : !state.mineralsFound
            ? 'Siguiente: localiza y escanea la veta mineral (afloramiento ámbar).'
            : !state.energySourceFound
              ? 'Siguiente: localiza y escanea la chimenea geotérmica (flujo cálido).'
              : 'Base Nereida operativa: red de soporte vital estable.';
      next.style.color = state.operational ? 'var(--accent-mission)' : '';
    }
  }

  hide(): void {
    this.element?.classList.remove('is-active');
  }
}
