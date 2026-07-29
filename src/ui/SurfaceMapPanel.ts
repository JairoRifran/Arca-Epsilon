import type { SurfaceMapEntity } from '../game/SurfaceMapSystem';

export class SurfaceMapPanel {
  renderToStarMap(entities: SurfaceMapEntity[], titleEl: HTMLElement | null, listEl: HTMLElement | null): void {
    if (titleEl) {
      titleEl.textContent = 'MAPA TÁCTICO LOCAL: CUENCA NEREIDA';
    }
    if (!listEl) return;

    listEl.innerHTML = entities
      .map(
        (ent) => `
        <li class="starmap-entity ${ent.type === 'player' ? 'is-player' : ent.type === 'hazard' || ent.type === 'threat' ? 'is-hazard' : ent.type === 'defense' ? 'is-defense' : ''} ${ent.hint === 'thermal' ? 'is-thermal' : ''} ${ent.isCurrentTarget ? 'is-target' : ''} ${ent.uncertain ? 'is-uncertain' : ''}">
          <div class="entity-info">
            <strong>${ent.name}${ent.hint === 'thermal' ? '<span class="entity-hint" title="Firma térmica">THERM</span>' : ''}</strong>
            <span>Posición: [${Math.round(ent.position.x)}, ${Math.round(ent.position.z)}] // ${ent.status}</span>
          </div>
        </li>
      `
      )
      .join('');
  }
}
