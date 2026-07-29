export type OrbitalMarkerState = {
  decoded: boolean;
  scanning: boolean;
  progress: number;
};

export class OrbitalMarkerSystem {
  readonly scanRadius = 210;

  readonly state: OrbitalMarkerState = {
    decoded: false,
    scanning: false,
    progress: 0
  };

  startScan(): void {
    if (this.state.decoded) return;
    this.state.scanning = true;
  }

  update(delta: number, inRange: boolean): boolean {
    if (!this.state.scanning || this.state.decoded) return false;

    if (inRange) {
      this.state.progress = Math.min(100, this.state.progress + delta * 34);
    } else {
      this.state.progress = Math.max(0, this.state.progress - delta * 18);
    }

    if (this.state.progress >= 100) {
      this.state.scanning = false;
      this.state.decoded = true;
      return true;
    }

    return false;
  }

  forceDecoded(): void {
    this.state.scanning = false;
    this.state.progress = 100;
    this.state.decoded = true;
  }
}
