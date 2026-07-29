export type SurfaceArrivalState = {
  secured: boolean;
  colonyHookReady: boolean;
  message: string;
};

export class SurfaceArrivalSystem {
  readonly state: SurfaceArrivalState = {
    secured: false,
    colonyHookReady: false,
    message: ''
  };

  secureFoothold(zoneName: string): void {
    if (this.state.secured) return;
    this.state.secured = true;
    this.state.colonyHookReady = true;
    this.state.message = `Superficie asegurada en ${zoneName}. Siguiente: desplegar el primer modulo colonial.`;
  }
}
