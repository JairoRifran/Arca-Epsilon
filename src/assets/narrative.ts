export type ExplorationReward = {
  hull?: number;
  energy?: number;
  oxygen?: number;
  memory?: number;
};

export type SiteArchetype = 'ring' | 'cryo' | 'lighthouse' | 'monolith' | 'antenna' | 'vault' | 'wreck';

export type ExplorationSite = {
  id: string;
  name: string;
  sector: string;
  scannerLead: string;
  discovery: string;
  reward: ExplorationReward;
  visualBrief: string;
  archetype: SiteArchetype;
  position: [number, number, number];
  scale: number;
};

export const explorationSites: ExplorationSite[] = [
  {
    id: 'namar-kai-vault',
    name: 'Ruinas de Namar-Kai',
    sector: 'Cinturon de Namar-Kai',
    scannerLead: 'Firma arquitectonica no humana. La geometria se alinea con el rumbo de la Arca.',
    discovery:
      'Los pilares no transmiten coordenadas: transmiten recuerdos. La Arca recupera un mapa parcial de la diaspora humana.',
    reward: { memory: 14, energy: 6 },
    visualBrief:
      'Anillo de monolitos fracturados, luz fria rasante, polvo lento y reflejos metalicos suaves.',
    archetype: 'ring',
    position: [180, 22, -310],
    scale: 1.2
  },
  {
    id: 'lost-cryo-garden',
    name: 'Jardin Criogenico Perdido',
    sector: 'Jardin Criogenico',
    scannerLead: 'Lecturas biologicas suspendidas. No hay propulsion, solo deriva orbital estable.',
    discovery:
      'Capsulas botanicas humanas flotan intactas. El oxigeno vuelve a subir y la colonia respira un poco mas.',
    reward: { oxygen: 18, hull: 4 },
    visualBrief:
      'Capsulas de vidrio con condensacion, verdes tenues, microcristales y luces medicas aun activas.',
    archetype: 'cryo',
    position: [-330, -80, -290],
    scale: 0.9
  },
  {
    id: 'dead-star-lighthouse',
    name: 'Faro de una Estrella Muerta',
    sector: 'Corona de Estrellas Muertas',
    scannerLead: 'Pulso gravitacional regular. Parece una advertencia, no una llamada.',
    discovery:
      'El faro predice rutas peligrosas. La Arca aprende a esconder su firma energetica entre ecos solares.',
    reward: { energy: 20, memory: 5 },
    visualBrief:
      'Estructura vertical contra una estrella roja muerta, halo volumetrico y destellos ritmicos.',
    archetype: 'lighthouse',
    position: [330, -62, -430],
    scale: 1
  },
  {
    id: 'epsilon-silence',
    name: 'El Silencio de Epsilon',
    sector: 'Umbral Ciego',
    scannerLead: 'Zona sin ruido cosmico. Los instrumentos bajan su ganancia como si escucharan algo.',
    discovery:
      'No hay enemigo aqui. Solo una region de espacio que recuerda haber sido atravesada por demasiadas naves.',
    reward: { memory: 8, oxygen: 6 },
    visualBrief:
      'Vacio oscuro y premium: pocas particulas, lente suave, estrellas lejanas muy nitidas.',
    archetype: 'monolith',
    position: [-40, 96, -560],
    scale: 1.1
  },
  {
    id: 'meridian-freighter',
    name: 'Carguero Meridian',
    sector: 'Ruta de los Restos',
    scannerLead: 'Transpondedor humano intermitente. El casco esta partido pero la baliza sigue viva.',
    discovery:
      'El Meridian cayo protegiendo a otra nave del exodo. Sus bodegas conservan celdas de energia y placas utilizables.',
    reward: { hull: 12, energy: 10 },
    visualBrief:
      'Carguero partido en dos, costillas expuestas, chispas intermitentes y carga a la deriva.',
    archetype: 'wreck',
    position: [-280, -10, -340],
    scale: 1.15
  },
  {
    id: 'belt-crystal-vault',
    name: 'Boveda del Cinturon',
    sector: 'Cinturon Fracturado',
    scannerLead: 'Resonancia cristalina dentro del campo de asteroides. El eco devuelve dos firmas.',
    discovery:
      'Dentro de la roca crece un cristal que almacena luz estelar. Los reactores de la Arca aprenden a imitarlo.',
    reward: { energy: 16, memory: 7 },
    visualBrief:
      'Asteroide madre abierto con vetas cristalinas azules, brillo interior y fragmentos orbitando.',
    archetype: 'vault',
    position: [430, -44, -690],
    scale: 1
  },
  {
    id: 'diaspora-antenna',
    name: 'Antena de la Diaspora',
    sector: 'Umbral Ciego',
    scannerLead: 'Restos humanos cerca de la Arca. Un plato de comunicaciones sigue orientado hacia la Tierra.',
    discovery:
      'La antena guardo el ultimo mensaje enviado a la Tierra. Nadie respondio, pero la colonia decide conservarlo.',
    reward: { memory: 12, hull: 5 },
    visualBrief:
      'Plato de antena caido, mastiles doblados, placas flotando y una luz roja de posicion.',
    archetype: 'antenna',
    position: [96, -78, -60],
    scale: 1
  },
  {
    id: 'gravity-k-186',
    name: 'Observatorio K-186',
    sector: 'Pozo de Mareas K-186',
    scannerLead: 'La luz dobla alrededor de un nucleo invisible. Los restos cercanos orbitan sin motor.',
    discovery:
      'La anomalia conserva una coordenada imposible: Kepler-186f aparece como recuerdo, no como destino.',
    reward: { memory: 12, energy: 8 },
    visualBrief:
      'Monolito de observacion al borde del pozo gravitacional, anillos lensados y particulas en espiral.',
    archetype: 'monolith',
    position: [-352, 44, -498],
    scale: 0.85
  }
];

export const ambientLogEntries = [
  'Bitacora: reducir velocidad cerca de estructuras antiguas mejora la lectura de superficie.',
  'Navegacion: los restos luminosos marcan rutas, no objetivos. La exploracion debe sentirse abierta.',
  'Sistema: conservar energia durante maniobras largas mantiene activos los sensores profundos.',
  'Tripulacion: cada hallazgo cambia el tono de la colonia; la Arca no gana puntos, gana futuro.'
];

export const directionNotes = [
  'Priorizar descubrimiento, escala y silencio cinematografico por encima de combate repetitivo.',
  'Tratar las amenazas como fenomenos raros o territoriales, no como oleadas.',
  'Usar recompensas narrativas y de supervivencia para guiar exploracion sin convertirla en shooter.',
  'Mantener UI diegetica sobria: datos utiles, poco texto instructivo, mucha presencia visual.'
];
