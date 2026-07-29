import fs from 'node:fs';
import path from 'node:path';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from '../node_modules/.pnpm/node_modules/meshoptimizer/index.js';

const DEFAULT_JOBS = [
  ['public/models/wayfinder-monument.glb', 'public/models/optimized/atlas-marker.medium.glb', 200_000],
  ['public/models/wayfinder-monument.glb', 'public/models/optimized/atlas-marker.low.glb', 60_000],
  ['public/models/player-scout.glb', 'public/models/optimized/scout-ship.medium.glb', 130_000],
  ['public/models/player-scout.glb', 'public/models/optimized/scout-ship.low.glb', 45_000],
  ['public/models/arca-epsilon.glb', 'public/models/optimized/arca-epsilon.medium.glb', 220_000],
  ['public/models/arca-epsilon.glb', 'public/models/optimized/arca-epsilon.low.glb', 80_000]
];

function readGlb(filePath) {
  const data = fs.readFileSync(filePath);
  if (data.readUInt32LE(0) !== 0x46546c67 || data.readUInt32LE(4) !== 2) {
    throw new Error(`${filePath} is not a GLB 2.0 asset.`);
  }

  let json;
  let binary;
  for (let offset = 12; offset < data.length; ) {
    const length = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    if (type === 0x004e4942) binary = chunk;
    offset += 8 + length;
  }
  if (!json || !binary) throw new Error(`${filePath} is missing its JSON or BIN chunk.`);
  return { json, binary, bytes: data.length };
}

function padToFour(buffer, padByte = 0) {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(padding, padByte)]);
}

function decodeView(source, viewIndex) {
  const view = source.json.bufferViews[viewIndex];
  const meshopt = view.extensions?.EXT_meshopt_compression;
  if (!meshopt) {
    if (view.buffer !== 0) throw new Error(`Unsupported uncompressed virtual bufferView ${viewIndex}.`);
    return Buffer.from(source.binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
  }

  const compressed = source.binary.subarray(
    meshopt.byteOffset ?? 0,
    (meshopt.byteOffset ?? 0) + meshopt.byteLength
  );
  const decoded = Buffer.alloc(meshopt.count * meshopt.byteStride);
  MeshoptDecoder.decodeGltfBuffer(
    decoded,
    meshopt.count,
    meshopt.byteStride,
    compressed,
    meshopt.mode,
    meshopt.filter
  );
  return decoded;
}

function typedAccessor(source, accessorIndex, ArrayType, components) {
  const accessor = source.json.accessors[accessorIndex];
  const view = source.json.bufferViews[accessor.bufferView];
  const bytes = decodeView(source, accessor.bufferView);
  const componentBytes = ArrayType.BYTES_PER_ELEMENT;
  const strideBytes = view.byteStride ?? componentBytes * components;
  if (strideBytes !== componentBytes * components) {
    throw new Error(`Interleaved accessor ${accessorIndex} is not supported by the Arca LOD pipeline.`);
  }
  const byteOffset = accessor.byteOffset ?? 0;
  return new ArrayType(
    bytes.buffer.slice(bytes.byteOffset + byteOffset, bytes.byteOffset + byteOffset + accessor.count * strideBytes)
  );
}

function validateRigidSinglePrimitive(json, inputPath) {
  if (json.skins?.length || json.animations?.length) {
    throw new Error(`${inputPath} is skinned or animated; refusing unsafe rigid-mesh simplification.`);
  }
  if (json.meshes?.length !== 1 || json.meshes[0].primitives?.length !== 1) {
    throw new Error(`${inputPath} must contain exactly one mesh with one primitive.`);
  }
  const primitive = json.meshes[0].primitives[0];
  const attributes = primitive.attributes ?? {};
  if (attributes.POSITION === undefined || attributes.NORMAL === undefined || attributes.TEXCOORD_0 === undefined) {
    throw new Error(`${inputPath} must provide POSITION, NORMAL and TEXCOORD_0.`);
  }
  if (primitive.indices === undefined) throw new Error(`${inputPath} must use indexed geometry.`);
  const position = json.accessors[attributes.POSITION];
  const normal = json.accessors[attributes.NORMAL];
  const uv = json.accessors[attributes.TEXCOORD_0];
  const indices = json.accessors[primitive.indices];
  if (position.componentType !== 5126 || normal.componentType !== 5126 || uv.componentType !== 5126) {
    throw new Error(`${inputPath} uses unsupported non-Float32 vertex attributes.`);
  }
  if (indices.componentType !== 5125) throw new Error(`${inputPath} uses unsupported non-Uint32 indices.`);
}

function compactAttributes(indices, positions, normals, uvs) {
  const compactedIndices = new Uint32Array(indices);
  const [remap, vertexCount] = MeshoptSimplifier.compactMesh(compactedIndices);
  const compactedPositions = new Float32Array(vertexCount * 3);
  const compactedNormals = new Float32Array(vertexCount * 3);
  const compactedUvs = new Float32Array(vertexCount * 2);
  const missing = 0xffffffff;

  for (let oldIndex = 0; oldIndex < remap.length; oldIndex += 1) {
    const newIndex = remap[oldIndex];
    if (newIndex === missing) continue;
    compactedPositions.set(positions.subarray(oldIndex * 3, oldIndex * 3 + 3), newIndex * 3);
    compactedNormals.set(normals.subarray(oldIndex * 3, oldIndex * 3 + 3), newIndex * 3);
    compactedUvs.set(uvs.subarray(oldIndex * 2, oldIndex * 2 + 2), newIndex * 2);
  }

  return { indices: compactedIndices, positions: compactedPositions, normals: compactedNormals, uvs: compactedUvs };
}

function bounds(values, components) {
  const min = Array.from({ length: components }, () => Number.POSITIVE_INFINITY);
  const max = Array.from({ length: components }, () => Number.NEGATIVE_INFINITY);
  for (let i = 0; i < values.length; i += components) {
    for (let component = 0; component < components; component += 1) {
      min[component] = Math.min(min[component], values[i + component]);
      max[component] = Math.max(max[component], values[i + component]);
    }
  }
  return { min, max };
}

function appendAligned(chunks, buffer, state) {
  const aligned = padToFour(Buffer.from(buffer));
  const byteOffset = state.offset;
  chunks.push(aligned);
  state.offset += aligned.length;
  return { byteOffset, byteLength: buffer.length };
}

function buildOptimizedJson(source, geometry, targetTriangles, simplificationError) {
  const json = source.json;
  const primitive = json.meshes[0].primitives[0];
  const binaryChunks = [];
  const binaryState = { offset: 0 };
  const outputViews = [];
  const imageViewMap = new Map();

  for (const image of json.images ?? []) {
    if (image.bufferView === undefined || imageViewMap.has(image.bufferView)) continue;
    const imageBytes = decodeView(source, image.bufferView);
    const appended = appendAligned(binaryChunks, imageBytes, binaryState);
    imageViewMap.set(image.bufferView, outputViews.length);
    outputViews.push({ buffer: 0, ...appended });
  }

  let virtualOffset = 0;
  const addMeshoptView = (array, count, byteStride, mode, target) => {
    const raw = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const encoded = MeshoptEncoder.encodeGltfBuffer(raw, count, byteStride, mode);
    const compressed = appendAligned(binaryChunks, encoded, binaryState);
    const viewIndex = outputViews.length;
    outputViews.push({
      buffer: 1,
      byteOffset: virtualOffset,
      byteLength: raw.byteLength,
      ...(mode === 'ATTRIBUTES' ? { byteStride } : {}),
      target,
      extensions: {
        EXT_meshopt_compression: {
          buffer: 0,
          ...compressed,
          byteStride,
          mode,
          count
        }
      }
    });
    virtualOffset += raw.byteLength;
    return viewIndex;
  };

  const positionView = addMeshoptView(geometry.positions, geometry.positions.length / 3, 12, 'ATTRIBUTES', 34962);
  const normalView = addMeshoptView(geometry.normals, geometry.normals.length / 3, 12, 'ATTRIBUTES', 34962);
  const uvView = addMeshoptView(geometry.uvs, geometry.uvs.length / 2, 8, 'ATTRIBUTES', 34962);
  const indexView = addMeshoptView(geometry.indices, geometry.indices.length, 4, 'TRIANGLES', 34963);
  const positionBounds = bounds(geometry.positions, 3);

  const outputAccessors = [
    { bufferView: positionView, byteOffset: 0, componentType: 5126, count: geometry.positions.length / 3, type: 'VEC3', ...positionBounds },
    { bufferView: normalView, byteOffset: 0, componentType: 5126, count: geometry.normals.length / 3, type: 'VEC3' },
    { bufferView: uvView, byteOffset: 0, componentType: 5126, count: geometry.uvs.length / 2, type: 'VEC2' },
    { bufferView: indexView, byteOffset: 0, componentType: 5125, count: geometry.indices.length, type: 'SCALAR' }
  ];

  const outputMeshes = structuredClone(json.meshes);
  outputMeshes[0].primitives[0] = {
    ...structuredClone(primitive),
    attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
    indices: 3
  };
  const outputImages = structuredClone(json.images ?? []);
  for (const image of outputImages) {
    if (image.bufferView !== undefined) image.bufferView = imageViewMap.get(image.bufferView);
  }

  const outputJson = {
    ...structuredClone(json),
    asset: {
      ...structuredClone(json.asset),
      generator: 'Arca Epsilon meshoptimizer LOD pipeline',
      extras: {
        ...(structuredClone(json.asset?.extras) ?? {}),
        targetTriangles,
        actualTriangles: geometry.indices.length / 3,
        simplificationError
      }
    },
    meshes: outputMeshes,
    images: outputImages,
    accessors: outputAccessors,
    bufferViews: outputViews,
    buffers: [
      { byteLength: binaryState.offset },
      { byteLength: virtualOffset, extensions: { EXT_meshopt_compression: { fallback: true } } }
    ]
  };

  return { json: outputJson, binary: Buffer.concat(binaryChunks), positionBounds };
}

function writeGlb(outputPath, json, binary) {
  const jsonChunk = padToFour(Buffer.from(JSON.stringify(json)), 0x20);
  const binaryChunk = padToFour(binary);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binaryChunk.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binaryChunk.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.concat([header, jsonHeader, jsonChunk, binaryHeader, binaryChunk]));
  return totalLength;
}

async function optimize(inputPath, outputPath, targetTriangles) {
  const source = readGlb(inputPath);
  validateRigidSinglePrimitive(source.json, inputPath);
  const primitive = source.json.meshes[0].primitives[0];
  const positions = typedAccessor(source, primitive.attributes.POSITION, Float32Array, 3);
  const normals = typedAccessor(source, primitive.attributes.NORMAL, Float32Array, 3);
  const uvs = typedAccessor(source, primitive.attributes.TEXCOORD_0, Float32Array, 2);
  const indices = typedAccessor(source, primitive.indices, Uint32Array, 1);
  const originalTriangles = indices.length / 3;
  if (targetTriangles >= originalTriangles) throw new Error(`Target ${targetTriangles} must be below ${originalTriangles}.`);

  const attributes = new Float32Array((positions.length / 3) * 5);
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    attributes.set(normals.subarray(vertex * 3, vertex * 3 + 3), vertex * 5);
    attributes.set(uvs.subarray(vertex * 2, vertex * 2 + 2), vertex * 5 + 3);
  }

  const [simplified, simplificationError] = MeshoptSimplifier.simplifyWithAttributes(
    indices,
    positions,
    3,
    attributes,
    5,
    [0.18, 0.18, 0.18, 0.04, 0.04],
    null,
    targetTriangles * 3,
    1,
    ['Regularize']
  );
  const geometry = compactAttributes(simplified, positions, normals, uvs);
  const output = buildOptimizedJson(source, geometry, targetTriangles, simplificationError);
  const outputBytes = writeGlb(outputPath, output.json, output.binary);
  return {
    inputPath,
    outputPath,
    originalBytes: source.bytes,
    outputBytes,
    originalTriangles,
    outputTriangles: geometry.indices.length / 3,
    originalVertices: positions.length / 3,
    outputVertices: geometry.positions.length / 3,
    simplificationError
  };
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const args = process.argv.slice(2);
const jobs = args.length === 3 ? [[args[0], args[1], Number(args[2])]] : DEFAULT_JOBS;
if (args.length !== 0 && args.length !== 3) {
  throw new Error('Usage: node scripts/optimize-glb-lod.mjs [input.glb output.glb targetTriangles]');
}

const report = [];
for (const [inputPath, outputPath, targetTriangles] of jobs) {
  const result = await optimize(inputPath, outputPath, targetTriangles);
  report.push(result);
  console.log(
    `${inputPath} -> ${outputPath}: ${result.originalTriangles.toLocaleString()} -> ` +
      `${result.outputTriangles.toLocaleString()} tris, ${result.originalBytes.toLocaleString()} -> ` +
      `${result.outputBytes.toLocaleString()} bytes, error=${result.simplificationError.toFixed(6)}`
  );
}

fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/model-optimization-report.json', `${JSON.stringify(report, null, 2)}\n`);
