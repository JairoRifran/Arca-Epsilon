import { LoadingManager, WebGLRenderer } from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export type AssetLoadStatus = 'idle' | 'loading' | 'loaded' | 'failed';

export type AssetLoadState = {
  status: AssetLoadStatus;
  activePath: string;
  progress: number;
  error: string;
};

export class AssetLoader {
  readonly manager: LoadingManager;

  private readonly gltfLoader: GLTFLoader;

  private ktx2Loader?: KTX2Loader;

  readonly state: AssetLoadState = {
    status: 'idle',
    activePath: '',
    progress: 0,
    error: ''
  };

  constructor(private readonly onStateChange?: (state: AssetLoadState) => void) {
    this.manager = new LoadingManager();
    this.gltfLoader = new GLTFLoader(this.manager);
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  }

  enableKTX2(renderer: WebGLRenderer, transcoderPath = '/basis/'): void {
    this.ktx2Loader?.dispose();
    this.ktx2Loader = new KTX2Loader(this.manager)
      .setTranscoderPath(transcoderPath)
      .detectSupport(renderer);
    this.gltfLoader.setKTX2Loader(this.ktx2Loader);
  }

  loadGLTF(path: string): Promise<GLTF> {
    this.state.status = 'loading';
    this.state.activePath = path;
    this.state.progress = 0;
    this.state.error = '';
    this.emit();

    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        path,
        (gltf) => {
          this.state.status = 'loaded';
          this.state.progress = 1;
          this.emit();
          resolve(gltf);
        },
        (event) => {
          if (event.total > 0) {
            this.state.progress = event.loaded / event.total;
            this.emit();
          }
        },
        (error) => {
          this.state.status = 'failed';
          this.state.error = error instanceof Error ? error.message : String(error);
          this.emit();
          reject(error);
        }
      );
    });
  }

  private emit(): void {
    this.onStateChange?.({ ...this.state });
  }
}
