import * as THREE from 'three';

export type GpuPrewarmResult = {
  key: string;
  durationMs: number;
  objects: number;
  materials: number;
  texturesInitialized: number;
  programsBefore: number;
  programsAfter: number;
  geometriesBefore: number;
  geometriesAfter: number;
  texturesBefore: number;
  texturesAfter: number;
  offscreenRenders: number;
};

type ObjectState = {
  object: THREE.Object3D;
  visible: boolean;
  layerMask: number;
  frustumCulled: boolean;
  instancedCount?: number;
};

type GeometryState = {
  geometry: THREE.BufferGeometry;
  drawStart: number;
  drawCount: number;
};

const PREWARM_LAYER = 31;

/**
 * Materializes selected, already-owned resources without showing or cloning
 * gameplay entities. Work is keyed per mode and runs only during a transition.
 */
export class GpuResourcePrewarmer {
  private readonly prepared = new Map<string, Promise<GpuPrewarmResult>>();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene
  ) {}

  prepare(key: string, roots: readonly THREE.Object3D[]): Promise<GpuPrewarmResult> {
    const existing = this.prepared.get(key);
    if (existing) return existing;
    const pending = this.prepareOnce(key, roots);
    this.prepared.set(key, pending);
    return pending;
  }

  hasPrepared(key: string): boolean {
    return this.prepared.has(key);
  }

  private async prepareOnce(key: string, roots: readonly THREE.Object3D[]): Promise<GpuPrewarmResult> {
    const startedAt = performance.now();
    const programsBefore = this.renderer.info.programs?.length ?? 0;
    const geometriesBefore = this.renderer.info.memory.geometries;
    const texturesBefore = this.renderer.info.memory.textures;
    const states: ObjectState[] = [];
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    const lights: Array<{ light: THREE.Light; layerMask: number }> = [];
    const rootLights: THREE.Light[] = [];
    const geometryStates = new Map<string, GeometryState>();

    for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
      roots[rootIndex].traverse((object) => {
        const instanced = object as THREE.InstancedMesh;
        states.push({
          object,
          visible: object.visible,
          layerMask: object.layers.mask,
          frustumCulled: object.frustumCulled,
          instancedCount: instanced.isInstancedMesh ? instanced.count : undefined
        });
        object.layers.set(PREWARM_LAYER);
        object.frustumCulled = false;
        const objectLight = object as THREE.Light;
        if (objectLight.isLight) {
          rootLights.push(objectLight);
        } else {
          object.visible = true;
        }
        const renderable = object as THREE.Mesh | THREE.Points | THREE.Sprite;
        if ('geometry' in renderable && renderable.geometry) {
          const geometry = renderable.geometry;
          if (!geometryStates.has(geometry.uuid)) {
            geometryStates.set(geometry.uuid, {
              geometry,
              drawStart: geometry.drawRange.start,
              drawCount: geometry.drawRange.count
            });
          }
          if (geometry.drawRange.count === 0) {
            geometry.setDrawRange(0, geometry.getAttribute('position')?.count ?? 1);
          }
        }
        if (instanced.isInstancedMesh && instanced.count === 0) {
          instanced.count = Math.min(1, instanced.instanceMatrix.count);
        }
        if (!('material' in renderable) || !renderable.material) return;
        const objectMaterials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
        for (let index = 0; index < objectMaterials.length; index += 1) {
          const material = objectMaterials[index];
          materials.add(material);
          this.collectMaterialTextures(material, textures);
        }
      });
    }

    this.scene.traverse((object) => {
      const light = object as THREE.Light;
      if (!light.isLight) return;
      lights.push({ light, layerMask: light.layers.mask });
      light.layers.enable(PREWARM_LAYER);
    });

    try {
      textures.forEach((texture) => this.renderer.initTexture(texture));
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
      camera.layers.set(PREWARM_LAYER);
      camera.position.copy((this.scene.getObjectByName('Main Camera') as THREE.Camera | undefined)?.position ?? new THREE.Vector3(0, 0, 40));
      camera.quaternion.copy((this.scene.getObjectByName('Main Camera') as THREE.Camera | undefined)?.quaternion ?? new THREE.Quaternion());
      camera.updateMatrixWorld(true);
      const target = new THREE.WebGLRenderTarget(16, 16, { depthBuffer: true });
      const previousTarget = this.renderer.getRenderTarget();
      try {
        this.renderer.setRenderTarget(target);
        this.renderer.render(this.scene, camera);
        for (let index = 0; index < rootLights.length; index += 1) rootLights[index].visible = true;
        this.renderer.render(this.scene, camera);
      } finally {
        this.renderer.setRenderTarget(previousTarget);
        target.dispose();
      }
    } finally {
      for (let index = 0; index < states.length; index += 1) {
        const state = states[index];
        state.object.visible = state.visible;
        state.object.layers.mask = state.layerMask;
        state.object.frustumCulled = state.frustumCulled;
        const instanced = state.object as THREE.InstancedMesh;
        if (instanced.isInstancedMesh && state.instancedCount !== undefined) instanced.count = state.instancedCount;
      }
      geometryStates.forEach((state) => state.geometry.setDrawRange(state.drawStart, state.drawCount));
      for (let index = 0; index < lights.length; index += 1) {
        lights[index].light.layers.mask = lights[index].layerMask;
      }
    }

    return {
      key,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      objects: states.length,
      materials: materials.size,
      texturesInitialized: textures.size,
      programsBefore,
      programsAfter: this.renderer.info.programs?.length ?? 0,
      geometriesBefore,
      geometriesAfter: this.renderer.info.memory.geometries,
      texturesBefore,
      texturesAfter: this.renderer.info.memory.textures,
      offscreenRenders: 2
    };
  }

  private collectMaterialTextures(material: THREE.Material, target: Set<THREE.Texture>): void {
    const values = Object.values(material as unknown as Record<string, unknown>);
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index] as { isTexture?: boolean } | null;
      if (value?.isTexture) target.add(value as THREE.Texture);
    }
    const shader = material as THREE.ShaderMaterial;
    if (!shader.isShaderMaterial) return;
    const uniforms = shader.uniforms;
    for (const uniform of Object.values(uniforms)) {
      const value = uniform.value as { isTexture?: boolean } | null;
      if (value?.isTexture) target.add(value as THREE.Texture);
    }
  }
}
