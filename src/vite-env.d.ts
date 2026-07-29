declare module 'three/examples/jsm/libs/meshopt_decoder.module.js' {
  export const MeshoptDecoder: {
    supported: boolean;
    ready: Promise<void>;
    decodeVertexBuffer: (...args: unknown[]) => Uint8Array | Promise<Uint8Array>;
    decodeIndexBuffer: (...args: unknown[]) => Uint8Array | Promise<Uint8Array>;
    decodeIndexSequence: (...args: unknown[]) => Uint8Array | Promise<Uint8Array>;
    decodeGltfBuffer: (...args: unknown[]) => Uint8Array | Promise<Uint8Array>;
  };
}
