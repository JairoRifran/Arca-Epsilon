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

/**
 * What the pilot is told, and what to do about it.
 *
 * The labels above name a system state; these name a cause and an action. The
 * refusal used to print the whole missing list — "faltan análisis orbital
 * completo, escaneo del Marcador Atlas, corredor Atlas decodificado" — which is
 * accurate, unreadable, and gives no first move. Only the first pending
 * requirement is ever shown, because only one of them can be worked on next.
 */
const REQUIREMENT_BRIEFING: Record<DescentRequirementId, { reason: string; objective: string }> = {
  e01Detected: {
    reason: 'Sin candidato confirmado',
    objective: 'Activá el escáner de largo alcance.'
  },
  orbitalScanComplete: {
    reason: 'Datos atmosféricos incompletos',
    objective: 'Recuperá los datos de la baliza de reconocimiento.'
  },
  habitabilityMinimum: {
    reason: 'Viabilidad por debajo del mínimo',
    objective: 'Completá el barrido de habitabilidad de E-01.'
  },
  atlasMarkerScanned: {
    reason: 'Sin corredor de entrada calculado',
    objective: 'Escaneá el Marcador Atlas.'
  },
  atlasCorridorDecoded: {
    reason: 'Corredor de entrada sin decodificar',
    objective: 'Mantenete en rango del Marcador Atlas hasta decodificar el corredor.'
  }
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
    const blocker = this.primaryBlocker;
    if (!blocker) {
      this.blockedReason = '';
      return true;
    }
    // One cause, not the whole list. See REQUIREMENT_BRIEFING.
    this.blockedReason = blocker.reason;
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

  /**
   * The one thing standing between the pilot and the atmosphere.
   *
   * Returns the first unmet requirement with a cause and a next action, or
   * undefined when the descent is authorized. The banner and the objective both
   * read from here, so they can never disagree about why the descent was
   * refused.
   */
  get primaryBlocker(): { id: DescentRequirementId; reason: string; objective: string } | undefined {
    const id = this.missingRequirementIds[0];
    if (!id) return undefined;
    return { id, ...REQUIREMENT_BRIEFING[id] };
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
