export type HabitabilityMetric = {
  label: string;
  value: string;
  score: number;
};

export type CandidatePlanetDefinition = {
  id: string;
  name: string;
  codename: string;
  position: [number, number, number];
  radius: number;
  scanRadius: number;
  metrics: HabitabilityMetric[];
};

export const candidatePlanetE01: CandidatePlanetDefinition = {
  id: 'candidate-world-e01',
  name: 'Candidate World E-01',
  codename: 'E-01 / Umbral Verde',
  position: [680, -120, -1420],
  radius: 185,
  scanRadius: 360,
  metrics: [
    { label: 'Atmosfera', value: 'Oxigeno bajo pero respirable tras filtrado', score: 78 },
    { label: 'Agua', value: 'Oceanos superficiales y hielo polar', score: 86 },
    { label: 'Temperatura', value: 'Rango templado en zona ecuatorial', score: 74 },
    { label: 'Radiacion', value: 'Elevada durante tormentas orbitales', score: 61 },
    { label: 'Gravedad', value: '0.93 g, compatible con fisiologia humana', score: 89 },
    { label: 'Actividad biologica', value: 'Biosfera microbiana probable', score: 67 }
  ]
};
