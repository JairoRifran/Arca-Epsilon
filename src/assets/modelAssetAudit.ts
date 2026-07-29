export type ModelAssetAuditEntry = {
  id: string;
  path: string;
  bytes: number;
  meshCount: number;
  materialCount: number;
  triangleCount: number;
  textureCount: number;
  animationCount: number;
  loadedAtStartup: boolean;
  duplicated: boolean;
  optimizationRisk: 'low' | 'medium' | 'high';
  purpose: string;
};

/** Build-time audit of checked-in GLBs. Runtime helpers add activity and LOD state. */
export const MODEL_ASSET_AUDIT: readonly ModelAssetAuditEntry[] = [
  {
    id: 'atlas-marker-original', path: '/models/wayfinder-monument.glb', bytes: 22_564_208,
    meshCount: 1, materialCount: 1, triangleCount: 1_636_831, textureCount: 1, animationCount: 0,
    loadedAtStartup: false, duplicated: false, optimizationRisk: 'high', purpose: 'Atlas original conservado como fallback'
  },
  {
    id: 'atlas-marker-medium', path: '/models/optimized/atlas-marker.medium.glb', bytes: 4_186_732,
    meshCount: 1, materialCount: 1, triangleCount: 200_000, textureCount: 1, animationCount: 0,
    loadedAtStartup: true, duplicated: false, optimizationRisk: 'low', purpose: 'Atlas cercano y distancia media'
  },
  {
    id: 'atlas-marker-low', path: '/models/optimized/atlas-marker.low.glb', bytes: 2_094_880,
    meshCount: 1, materialCount: 1, triangleCount: 60_000, textureCount: 1, animationCount: 0,
    loadedAtStartup: true, duplicated: false, optimizationRisk: 'low', purpose: 'Atlas lejano'
  },
  {
    id: 'cockpit', path: '/models/cockpit-interior.glb', bytes: 16_177_896,
    meshCount: 1, materialCount: 1, triangleCount: 293_348, textureCount: 4, animationCount: 0,
    loadedAtStartup: true, duplicated: false, optimizationRisk: 'high', purpose: 'Cabina en primer plano; original preservado'
  },
  {
    id: 'mothership-original', path: '/models/arca-epsilon.glb', bytes: 9_740_680,
    meshCount: 1, materialCount: 1, triangleCount: 611_066, textureCount: 1, animationCount: 0,
    loadedAtStartup: false, duplicated: false, optimizationRisk: 'high', purpose: 'Arca original conservada como fallback'
  },
  {
    id: 'mothership-medium', path: '/models/optimized/arca-epsilon.medium.glb', bytes: 4_572_540,
    meshCount: 1, materialCount: 1, triangleCount: 219_982, textureCount: 1, animationCount: 0,
    loadedAtStartup: true, duplicated: false, optimizationRisk: 'low', purpose: 'Arca cercana y distancia media'
  },
  {
    id: 'mothership-low', path: '/models/optimized/arca-epsilon.low.glb', bytes: 2_500_676,
    meshCount: 1, materialCount: 1, triangleCount: 79_978, textureCount: 1, animationCount: 0,
    loadedAtStartup: true, duplicated: false, optimizationRisk: 'low', purpose: 'Arca lejana'
  },
  {
    id: 'player-ship-original', path: '/models/player-scout.glb', bytes: 7_611_040,
    meshCount: 1, materialCount: 1, triangleCount: 463_774, textureCount: 1, animationCount: 0,
    loadedAtStartup: false, duplicated: false, optimizationRisk: 'high', purpose: 'Scout original conservada como fallback'
  },
  {
    id: 'player-ship-medium', path: '/models/optimized/scout-ship.medium.glb', bytes: 3_150_096,
    meshCount: 1, materialCount: 1, triangleCount: 129_986, textureCount: 1, animationCount: 0,
    loadedAtStartup: true, duplicated: false, optimizationRisk: 'low', purpose: 'Scout controlada y cercana'
  },
  {
    id: 'player-ship-low', path: '/models/optimized/scout-ship.low.glb', bytes: 1_862_032,
    meshCount: 1, materialCount: 1, triangleCount: 44_984, textureCount: 1, animationCount: 0,
    loadedAtStartup: true, duplicated: false, optimizationRisk: 'low', purpose: 'Scout vista a distancia'
  },
  {
    id: 'pilot-walk', path: '/models/characters/arca-pilot-walk.glb', bytes: 4_339_384,
    meshCount: 1, materialCount: 1, triangleCount: 219_612, textureCount: 1, animationCount: 1,
    loadedAtStartup: true, duplicated: false, optimizationRisk: 'high', purpose: 'Piloto skinned; sin decimacion insegura'
  },
  {
    id: 'pilot-run-source', path: '/models/characters/arca-pilot-run.glb', bytes: 4_338_096,
    meshCount: 1, materialCount: 1, triangleCount: 219_612, textureCount: 1, animationCount: 1,
    loadedAtStartup: false, duplicated: true, optimizationRisk: 'high', purpose: 'Fuente de carrera; no se carga en runtime'
  },
  {
    id: 'pilot-run-animation', path: '/models/characters/arca-pilot-run-animation.glb', bytes: 13_668,
    meshCount: 0, materialCount: 0, triangleCount: 0, textureCount: 0, animationCount: 1,
    loadedAtStartup: true, duplicated: false, optimizationRisk: 'low', purpose: 'Clip de carrera sin malla ni textura duplicadas'
  }
];

export const MODEL_ASSET_TOTAL_BYTES = MODEL_ASSET_AUDIT.reduce((total, asset) => total + asset.bytes, 0);
