export type LandingZoneDefinition = {
  id: string;
  name: string;
  planetId: string;
  radius: number;
  assistRadius: number;
  touchdownSpeed: number;
  lore: string;
};

export const firstLandingZone: LandingZoneDefinition = {
  id: 'nereid-basin',
  name: 'Cuenca Nereida',
  planetId: 'candidate-world-e01',
  radius: 46,
  assistRadius: 145,
  touchdownSpeed: 9,
  lore:
    'Una cuenca ecuatorial estable, con baja actividad electrica y suelo compacto. El Marcador Atlas la identifica como el primer punto seguro para una colonia humana.'
};
