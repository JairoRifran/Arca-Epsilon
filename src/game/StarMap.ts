import * as THREE from 'three';

export type StarMapEntity = {
  id: string;
  name: string;
  type: 'mothership' | 'player' | 'ship' | 'marker' | 'biosphere' | 'poi' | 'landing' | 'habitat' | 'resource' | 'hazard' | 'resonator' | 'relay' | 'communications' | 'projection' | 'defense' | 'threat';
  position: THREE.Vector3;
  status?: string;
  signalRange?: number;
  isCurrentTarget?: boolean;
};

export class StarMap {
  private overlay: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private infoPanel: HTMLElement;
  private isOpen = false;
  private entities: StarMapEntity[] = [];

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'starmap-overlay';
    this.overlay.className = 'starmap-overlay is-hidden';
    this.overlay.innerHTML = `
      <div class="starmap-panel">
        <header class="starmap-header">
          <div class="starmap-title">SISTEMA DE NAVEGACION TACTICA // MAPA ESTELAR</div>
          <div class="starmap-subtitle">SECTOR EPSILON - RUTA DE COLONIZACION</div>
          <button id="starmap-close" class="starmap-close-btn">[M] CERRAR</button>
        </header>
        <div class="starmap-content">
          <div class="starmap-viewport">
            <canvas id="starmap-canvas" width="800" height="600"></canvas>
            <div class="starmap-hud-lines"></div>
          </div>
          <aside class="starmap-sidebar">
            <div class="starmap-section">
              <h3>TELEMETRIA DE RUTA</h3>
              <div id="starmap-target-info" class="starmap-readout">Sin objetivo seleccionado</div>
            </div>
            <div class="starmap-section">
              <h3>PUNTOS CLAVE DEL SECTOR</h3>
              <ul id="starmap-poi-list" class="starmap-list"></ul>
            </div>
            <div class="starmap-section">
              <h3>LEYENDA TACTICA</h3>
              <div class="starmap-legend" id="starmap-legend">
                <div><span class="legend-dot dot-player"></span> Nave de Manejo (Posicion Actual)</div>
                <div><span class="legend-dot dot-mothership"></span> Arca Epsilon (Zona Segura)</div>
                <div><span class="legend-dot dot-marker"></span> Marcador Atlas (Baliza Orbital)</div>
                <div><span class="legend-dot dot-biosphere"></span> Biosfera E-01 (Objetivo Primario)</div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.canvas = this.overlay.querySelector('#starmap-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.infoPanel = this.overlay.querySelector('#starmap-target-info') as HTMLElement;

    const closeBtn = this.overlay.querySelector('#starmap-close');
    closeBtn?.addEventListener('click', () => this.close());
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    this.isOpen = true;
    this.overlay.classList.remove('is-hidden');
    this.render();
  }

  close(): void {
    this.isOpen = false;
    this.overlay.classList.add('is-hidden');
  }

  get active(): boolean {
    return this.isOpen;
  }

  updateEntities(entities: StarMapEntity[]): void {
    this.entities = entities;
    if (this.isOpen) {
      this.render();
    }
  }

  private render(): void {
    if (!this.ctx || !this.canvas) return;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, width, height);

    const isSurfaceMap = this.entities.some(
      (e) => e.type === 'habitat' || e.type === 'landing' || e.id === 'player-surface'
    );

    // Background grid
    ctx.strokeStyle = isSurfaceMap ? 'rgba(113, 243, 194, 0.14)' : 'rgba(113, 243, 194, 0.08)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x <= width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const surfaceExtent = this.entities.reduce(
      (largest, entity) => Math.max(largest, Math.hypot(entity.position.x, entity.position.z) + 80),
      260
    );
    const bounds = isSurfaceMap ? Math.ceil(surfaceExtent / 100) * 100 : 3200;
    const scale = Math.min(width, height) / (bounds * 2);
    const centerX = width / 2;
    const centerY = height / 2;

    // Radar rings
    ctx.strokeStyle = isSurfaceMap ? 'rgba(113, 243, 194, 0.22)' : 'rgba(113, 243, 194, 0.15)';
    const ringSteps = isSurfaceMap
      ? [0.25, 0.5, 0.75, 1].map((ratio) => Math.round((bounds * ratio) / 10) * 10)
      : [800, 1600, 2400];
    for (const r of ringSteps) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, r * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(113, 243, 194, 0.45)';
      ctx.font = '9px monospace';
      ctx.fillText(`${r}m`, centerX + 6, centerY - r * scale + 10);
    }

    const player = this.entities.find((e) => e.type === 'player');

    if (!isSurfaceMap) {
      const mothership = this.entities.find((e) => e.type === 'mothership');
      const marker = this.entities.find((e) => e.type === 'marker');
      const biosphere = this.entities.find((e) => e.type === 'biosphere');

      if (mothership && marker) {
        ctx.strokeStyle = 'rgba(120, 255, 216, 0.35)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(centerX + mothership.position.x * scale, centerY + mothership.position.z * scale);
        ctx.lineTo(centerX + marker.position.x * scale, centerY + marker.position.z * scale);
        ctx.stroke();
      }
      if (marker && biosphere) {
        ctx.strokeStyle = 'rgba(114, 245, 191, 0.35)';
        ctx.beginPath();
        ctx.moveTo(centerX + marker.position.x * scale, centerY + marker.position.z * scale);
        ctx.lineTo(centerX + biosphere.position.x * scale, centerY + biosphere.position.z * scale);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    } else if (player) {
      // Draw subtle link to habitat if deployed
      const habitat = this.entities.find((e) => e.type === 'habitat');
      if (habitat) {
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(centerX + player.position.x * scale, centerY + player.position.z * scale);
        ctx.lineTo(centerX + habitat.position.x * scale, centerY + habitat.position.z * scale);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    const formatDistance = (meters: number): string =>
      meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;

    const poiList = this.overlay.querySelector('#starmap-poi-list');
    if (poiList && !isSurfaceMap) {
      poiList.innerHTML = this.entities
        .map((e) => {
          const dist = player ? player.position.distanceTo(e.position) : 0;
          return `<li class="poi-item ${e.isCurrentTarget ? 'is-target' : ''}">
            <span class="poi-name">${e.name}</span>
            <span class="poi-dist">${formatDistance(dist)}</span>
          </li>`;
        })
        .join('');
    }

    // La leyenda cambia con el modo: sector orbital vs cuenca local.
    const legend = this.overlay.querySelector('#starmap-legend');
    if (legend) {
      legend.innerHTML = isSurfaceMap
        ? `
          <div><span class="legend-dot dot-player"></span> Piloto / Posición controlada</div>
          <div><span class="legend-dot dot-mothership"></span> Nave de reconocimiento</div>
          <div><span class="legend-dot dot-landing"></span> Plataforma de Aterrizaje</div>
          <div><span class="legend-dot dot-habitat"></span> Módulo Hábitat Nereida-01</div>
          <div><span class="legend-dot dot-resource"></span> Nodo de Recurso</div>
          <div><span class="legend-dot dot-marker"></span> Resonador / Baliza Atlas</div>
          <div><span class="legend-dot dot-hazard"></span> Peligro Ambiental</div>
        `
        : `
          <div><span class="legend-dot dot-player"></span> Nave de Manejo (Posicion Actual)</div>
          <div><span class="legend-dot dot-mothership"></span> Arca Epsilon (Zona Segura)</div>
          <div><span class="legend-dot dot-marker"></span> Marcador Atlas (Baliza Orbital)</div>
          <div><span class="legend-dot dot-biosphere"></span> Biosfera E-01 (Objetivo Primario)</div>
        `;
    }

    const currentTarget = this.entities.find((e) => e.isCurrentTarget);
    if (this.infoPanel) {
      if (isSurfaceMap) {
        const habitat = this.entities.find((e) => e.type === 'habitat');
        const surfaceTarget = this.entities.find((e) => e.isCurrentTarget);
        const targetDistance = surfaceTarget && player ? player.position.distanceTo(surfaceTarget.position) : 0;
        this.infoPanel.innerHTML = `
          <div class="target-name">MODO: EXPLORACIÓN SUPERFICIAL</div>
          <div class="target-dist">ZONA: CUENCA NEREIDA (E-01)</div>
          <div class="target-status">OBJETIVO: ${surfaceTarget ? `${surfaceTarget.name} // ${formatDistance(targetDistance)}` : habitat?.status ?? 'Despliegue colonial en curso'}</div>
        `;
      } else if (currentTarget && player) {
        const dist = player.position.distanceTo(currentTarget.position);
        this.infoPanel.innerHTML = `
          <div class="target-name">OBJETIVO: ${currentTarget.name.toUpperCase()}</div>
          <div class="target-dist">DISTANCIA: ${formatDistance(dist)}</div>
          <div class="target-status">ESTADO: ${currentTarget.status || 'Activo'}</div>
        `;
      } else {
        this.infoPanel.innerHTML = '<div>Sin objetivo activo en curso</div>';
      }
    }

    for (const [entityIndex, e] of this.entities.entries()) {
      const ex = centerX + e.position.x * scale;
      const ey = centerY + e.position.z * scale;

      ctx.save();
      ctx.translate(ex, ey);

      if ((e.type === 'relay' || e.type === 'defense') && e.signalRange) {
        ctx.strokeStyle = 'rgba(140, 235, 215, 0.42)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(12, e.signalRange * scale), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (e.type === 'player') {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#71f3c2';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (e.type === 'ship') {
        ctx.fillStyle = '#5aa7ff';
        ctx.strokeStyle = '#d9edff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(7, 7);
        ctx.lineTo(0, 4);
        ctx.lineTo(-7, 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (e.type === 'mothership') {
        ctx.fillStyle = '#5aa7ff';
        ctx.beginPath();
        ctx.rect(-7, -7, 14, 14);
        ctx.fill();
      } else if (e.type === 'marker') {
        ctx.fillStyle = '#78ffd8';
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(7, 7);
        ctx.lineTo(-7, 7);
        ctx.closePath();
        ctx.fill();
      } else if (e.type === 'biosphere') {
        ctx.fillStyle = '#72f5bf';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === 'landing') {
        ctx.fillStyle = '#00ffaa';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.fillRect(-7, -7, 14, 14);
        ctx.strokeRect(-7, -7, 14, 14);
      } else if (e.type === 'habitat') {
        ctx.fillStyle = '#00ff88';
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (e.type === 'resource') {
        ctx.fillStyle = '#00d8ff';
        ctx.beginPath();
        ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === 'resonator' || e.type === 'relay') {
        ctx.fillStyle = e.type === 'relay' ? '#8cebd7' : '#78ffd8';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(7, 6);
        ctx.lineTo(0, 3);
        ctx.lineTo(-7, 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (e.type === 'communications' || e.type === 'projection') {
        ctx.fillStyle = e.type === 'projection' ? '#8cebd7' : '#5aa7ff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, e.type === 'projection' ? 7 : 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (e.type === 'defense') {
        ctx.fillStyle = '#a9d9ea';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.fillRect(-5, -7, 10, 14);
        ctx.strokeRect(-5, -7, 10, 14);
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.stroke();
      } else if (e.type === 'threat') {
        ctx.fillStyle = '#d66a4f';
        ctx.strokeStyle = '#ffb36b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(7, 6);
        ctx.lineTo(-7, 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (e.type === 'hazard') {
        ctx.fillStyle = '#ff3344';
        ctx.beginPath();
        ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(113, 243, 194, 0.6)';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      if (e.isCurrentTarget) {
        ctx.strokeStyle = '#ff3b60';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = '10px monospace';
      // Escalonar las etiquetas evita que entidades co-ubicadas (pad y
      // hábitat comparten el centro) pinten sus nombres uno sobre otro.
      ctx.fillText(e.name, 12, 4 + (entityIndex % 3) * 11);
      ctx.restore();
    }
  }
}
