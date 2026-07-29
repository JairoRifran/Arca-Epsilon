import type { SurfaceMissionStep } from '../game/FirstFootholdMission';

export class SurfaceObjectivePanel {
  updateDOM(step: SurfaceMissionStep, distanceText: string): void {
    const missionNameEl = document.getElementById('mission-name');
    const objectiveTextEl = document.getElementById('objective-text');
    const nextActionEl = document.getElementById('next-action');
    const distanceEl = document.getElementById('objective-distance');
    const scannerEl = document.getElementById('scanner-status');

    if (missionNameEl) missionNameEl.textContent = step.title;
    if (objectiveTextEl) objectiveTextEl.textContent = step.objective;
    if (nextActionEl) nextActionEl.textContent = step.nextAction;
    if (distanceEl) distanceEl.textContent = distanceText;
    if (scannerEl) scannerEl.textContent = 'Modo Superficie';
  }
}
