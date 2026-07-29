export type ColonyModuleDefinition = {
  id: string;
  name: string;
  type: 'habitat' | 'power' | 'water' | 'minerals';
  powerRequirement: number;
  oxygenOutput: number;
  description: string;
};

export const habitatModuleNereida01: ColonyModuleDefinition = {
  id: 'mod-habitat-nereida-01',
  name: 'Módulo Hábitat Nereida-01',
  type: 'habitat',
  powerRequirement: 25,
  oxygenOutput: 100,
  description: 'Unidad presurizada de despliegue rápido con soporte vital, retransmisor energético y esclusa térmica para la Cuenca Nereida.'
};
