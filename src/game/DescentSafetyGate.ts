export type DescentRequirementId =
  | 'e01Detected'
  | 'orbitalScanComplete'
  | 'habitabilityMinimum'
  | 'atlasMarkerScanned'
  | 'atlasCorridorDecoded';

export type DescentSafetySnapshot = {
  e01Detected: boolean;
  orbitalScanComplete: boolean;
  habitabilityScore: number;
  atlasMarkerScanned: boolean;
  atlasCorridorDecoded: boolean;
  descentAuthorized: boolean;
  missingDescentRequirements: string[];
  descentBlockedReason: string;
};

const REQUIREMENT_LABELS: Record<DescentRequirementId, string> = {
  e01Detected: 'detección de E-01',
  orbitalScanComplete: 'análisis orbital completo',
  habitabilityMinimum: 'viabilidad mínima de habitabilidad',
  atlasMarkerScanned: 'escaneo del Marcador Atlas',
  atlasCorridorDecoded: 'corredor Atlas decodificado'
};

/** Explicit safety interlock between orbital survey and atmospheric entry. */
export class DescentSafetyGate {
  readonly minimumHabitabilityScore = 70;

  private e01Detected = false;

  private orbitalScanComplete = false;

  private habitabilityScore = 0;

  private atlasMarkerScanned = false;

  private atlasCorridorDecoded = false;

  private blockedReason = '';

  markE01Detected(): void {
    this.e01Detected = true;
    this.blockedReason = '';
    this.refreshBlock();
  }

  completeOrbitalScan(score: number): void {
    this.orbitalScanComplete = true;
    this.habitabilityScore = Math.max(0, Math.min(100, Math.round(score)));
    this.blockedReason = '';
    this.refreshBlock();
  }

  markAtlasScanned(): void {
    this.atlasMarkerScanned = true;
    this.blockedReason = '';
    this.refreshBlock();
  }

  markCorridorDecoded(): void {
    this.atlasMarkerScanned = true;
    this.atlasCorridorDecoded = true;
    this.blockedReason = '';
    this.refreshBlock();
  }

  requestDescent(): boolean {
    const missing = this.missingRequirementLabels;
    if (missing.length === 0) {
      this.blockedReason = '';
      return true;
    }
    this.blockedReason = `Descenso denegado: faltan ${missing.join(', ')}.`;
    return false;
  }

  restore(snapshot: Partial<DescentSafetySnapshot>): void {
    this.e01Detected = snapshot.e01Detected ?? this.e01Detected;
    this.orbitalScanComplete = snapshot.orbitalScanComplete ?? this.orbitalScanComplete;
    this.habitabilityScore = snapshot.habitabilityScore ?? this.habitabilityScore;
    this.atlasMarkerScanned = snapshot.atlasMarkerScanned ?? this.atlasMarkerScanned;
    this.atlasCorridorDecoded = snapshot.atlasCorridorDecoded ?? this.atlasCorridorDecoded;
    this.blockedReason = snapshot.descentBlockedReason ?? '';
    this.refreshBlock();
  }

  get descentAuthorized(): boolean {
    return this.missingRequirementIds.length === 0;
  }

  get missingRequirementLabels(): string[] {
    return this.missingRequirementIds.map((id) => REQUIREMENT_LABELS[id]);
  }

  get state(): DescentSafetySnapshot {
    return {
      e01Detected: this.e01Detected,
      orbitalScanComplete: this.orbitalScanComplete,
      habitabilityScore: this.habitabilityScore,
      atlasMarkerScanned: this.atlasMarkerScanned,
      atlasCorridorDecoded: this.atlasCorridorDecoded,
      descentAuthorized: this.descentAuthorized,
      missingDescentRequirements: this.missingRequirementLabels,
      descentBlockedReason: this.blockedReason
    };
  }

  private get missingRequirementIds(): DescentRequirementId[] {
    const missing: DescentRequirementId[] = [];
    if (!this.e01Detected) missing.push('e01Detected');
    if (!this.orbitalScanComplete) missing.push('orbitalScanComplete');
    if (this.habitabilityScore < this.minimumHabitabilityScore) missing.push('habitabilityMinimum');
    if (!this.atlasMarkerScanned) missing.push('atlasMarkerScanned');
    if (!this.atlasCorridorDecoded) missing.push('atlasCorridorDecoded');
    return missing;
  }

  private refreshBlock(): void {
    if (this.descentAuthorized) this.blockedReason = '';
  }
}
