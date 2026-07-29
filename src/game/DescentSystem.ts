export type DescentPhase = 'idle' | 'corridorLocked' | 'entry' | 'cloudBreak' | 'landingApproach' | 'landed';

export type DescentState = {
  phase: DescentPhase;
  entryProgress: number;
  heat: number;
  stability: number;
  altitude: number;
  stress: number;
  message: string;
};

export class DescentSystem {
  readonly state: DescentState = {
    phase: 'idle',
    entryProgress: 0,
    heat: 0,
    stability: 100,
    altitude: 0,
    stress: 0,
    message: ''
  };

  lockCorridor(): void {
    if (this.state.phase === 'idle') {
      this.state.phase = 'corridorLocked';
      this.state.message = 'Corredor Atlas bloqueado.';
    }
  }

  beginEntry(): void {
    if (this.state.phase === 'corridorLocked') {
      this.state.phase = 'entry';
      this.state.entryProgress = 0;
      this.state.heat = 12;
      this.state.stability = Math.max(this.state.stability, 76);
      this.state.message = 'Entrada atmosferica iniciada.';
    }
  }

  updateEntry(delta: number, speed: number, aligned: boolean, braking: boolean): boolean {
    if (this.state.phase !== 'entry') return false;

    const speedStress = Math.max(0, speed - 18) * 1.45;
    const alignmentStress = aligned ? 0 : 24;
    const brakingRelief = braking ? 14 : 0;
    const stress = Math.max(0, speedStress + alignmentStress - brakingRelief);

    this.state.stress = Math.min(100, stress);
    this.state.heat = Math.min(100, this.state.entryProgress * 0.72 + stress * 0.34);
    this.state.stability = Math.max(34, Math.min(100, this.state.stability + delta * (aligned ? 7 : -10) - stress * delta * 0.22));
    this.state.entryProgress = Math.min(100, this.state.entryProgress + delta * (aligned ? 11 : 6));
    this.state.altitude = Math.max(1200, 8200 - this.state.entryProgress * 70);
    this.state.message =
      stress > 42
        ? 'Cizalla atmosferica: reduce velocidad y corrige vector.'
        : 'Entrada estable: mantiene vector de descenso.';

    if (this.state.entryProgress >= 100) {
      this.state.phase = 'cloudBreak';
      this.state.heat = 38;
      this.state.altitude = 980;
      this.state.message = 'Capa de nubes superada.';
      return true;
    }

    return false;
  }

  beginLandingApproach(): void {
    if (this.state.phase === 'cloudBreak') {
      this.state.phase = 'landingApproach';
      this.state.message = 'Baliza de aterrizaje adquirida.';
    }
  }

  completeLanding(): void {
    this.state.phase = 'landed';
    this.state.entryProgress = 100;
    this.state.heat = 0;
    this.state.stability = 100;
    this.state.altitude = 0;
    this.state.stress = 0;
    this.state.message = 'Aterrizaje confirmado.';
  }
}
