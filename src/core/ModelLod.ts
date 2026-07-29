import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AssetLoader } from './AssetLoader';

export type ModelLodPaths = {
  medium: string;
  low?: string;
  original: string;
};

export type LoadedModelSource = {
  gltf: GLTF;
  path: string;
  fallbackUsed: boolean;
};

export async function loadPreferredModel(
  assetLoader: AssetLoader,
  preferredPath: string,
  originalPath: string
): Promise<LoadedModelSource> {
  try {
    return { gltf: await assetLoader.loadGLTF(preferredPath), path: preferredPath, fallbackUsed: false };
  } catch (preferredError) {
    console.warn(`[ModelLOD] Optimized asset failed, loading original: ${preferredPath}`, preferredError);
    return { gltf: await assetLoader.loadGLTF(originalPath), path: originalPath, fallbackUsed: true };
  }
}

export async function loadOptionalModel(assetLoader: AssetLoader, modelPath?: string): Promise<GLTF | undefined> {
  if (!modelPath) return undefined;
  try {
    return await assetLoader.loadGLTF(modelPath);
  } catch (error) {
    console.warn(`[ModelLOD] Optional LOD failed; the nearest available level remains active: ${modelPath}`, error);
    return undefined;
  }
}
