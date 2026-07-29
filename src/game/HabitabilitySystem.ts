import type { CandidatePlanetDefinition, HabitabilityMetric } from '../assets/planetDefinitions';

export type HabitabilityReport = {
  planetName: string;
  metrics: HabitabilityMetric[];
  viability: number;
  status: string;
  colonizationPotential: string;
};

export type OrbitalScanDatum =
  | 'atmosphere'
  | 'liquidWater'
  | 'temperature'
  | 'radiation'
  | 'gravity'
  | 'biologicalActivity';

const ORBITAL_DATA: OrbitalScanDatum[] = [
  'atmosphere',
  'liquidWater',
  'temperature',
  'radiation',
  'gravity',
  'biologicalActivity'
];

export class HabitabilitySystem {
  progress = 0;

  scanning = false;

  complete = false;

  report?: HabitabilityReport;

  constructor(private readonly planet: CandidatePlanetDefinition) {}

  start(): void {
    if (this.complete) return;
    this.scanning = true;
  }

  forceComplete(): HabitabilityReport {
    this.progress = 100;
    this.scanning = false;
    this.complete = true;
    this.report = this.createReport();
    return this.report;
  }

  update(delta: number, locked: boolean, complicationActive: boolean): void {
    if (!this.scanning || this.complete) return;

    if (locked) {
      const rate = complicationActive ? 8 : 16;
      this.progress = Math.min(100, this.progress + delta * rate);
    } else {
      this.progress = Math.max(0, this.progress - delta * 9);
    }

    if (this.progress >= 100) {
      this.complete = true;
      this.scanning = false;
      this.report = this.createReport();
    }
  }

  get orbitalData(): Record<OrbitalScanDatum, boolean> {
    const result = {} as Record<OrbitalScanDatum, boolean>;
    for (const [index, datum] of ORBITAL_DATA.entries()) {
      const threshold = ((index + 1) / ORBITAL_DATA.length) * 100;
      result[datum] = this.complete || this.progress >= threshold;
    }
    return result;
  }

  get completedOrbitalData(): OrbitalScanDatum[] {
    const data = this.orbitalData;
    return ORBITAL_DATA.filter((datum) => data[datum]);
  }

  private createReport(): HabitabilityReport {
    const viability = Math.round(
      this.planet.metrics.reduce((total, metric) => total + metric.score, 0) / this.planet.metrics.length
    );

    return {
      planetName: this.planet.name,
      metrics: this.planet.metrics,
      viability,
      status: viability >= 70 ? 'Minimum colonization viability confirmed' : 'Marginal candidate',
      colonizationPotential:
        viability >= 70
          ? 'Deploy orbital survey and prepare first colony module.'
          : 'Continue scouting before committing colony resources.'
    };
  }
}
