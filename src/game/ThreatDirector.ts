export class ThreatDirector {
  complicationActive = false;

  private complicationTimer = 0;

  private triggered = false;

  maybeTriggerHabitabilityComplication(scanProgress: number): boolean {
    if (!this.triggered && scanProgress >= 48) {
      this.triggered = true;
      this.complicationActive = true;
      this.complicationTimer = 12;
      return true;
    }

    return false;
  }

  update(delta: number): void {
    if (!this.complicationActive) return;
    this.complicationTimer -= delta;
    if (this.complicationTimer <= 0) {
      this.complicationActive = false;
    }
  }
}
