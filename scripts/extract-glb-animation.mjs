import fs from 'node:fs';
import path from 'node:path';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const [, , inputPath, outputPath, ...flags] = process.argv;
if (!inputPath || !outputPath) {
  throw new Error(
    'Usage: node scripts/extract-glb-animation.mjs <input.glb> <output.glb> [--only=<clip>] [--name=<clip>]'
  );
}

/**
 * `--only` keeps a single clip. Authoring tools routinely export a real take
 * alongside a near-empty stub -- `personaje-parado` ships a 3.03 s `rigify_clip`
 * next to a 0.07 s `Armature|clip0|baselayer` -- and shipping both leaves the
 * runtime to guess which one is the animation.
 *
 * `--name` renames the surviving clip. SurfaceCharacter maps clips to states by
 * matching their names, so a clip called `rigify_clip` is invisible to it no
 * matter what it contains. Renaming here, once, beats teaching the runtime
 * every name an exporter might invent.
 */
const flagValue = (flag) => {
  const match = flags.find((entry) => entry.startsWith(`${flag}=`));
  return match ? match.slice(flag.length + 1) : undefined;
};
const onlyClip = flagValue('--only');
const renameTo = flagValue('--name');

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
  return { json, binary };
}

function padToFour(buffer, padByte) {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(padding, padByte)]);
}

await MeshoptDecoder.ready;
const source = readGlb(inputPath);
const allClips = source.json.animations ?? [];
const selectedClips = onlyClip ? allClips.filter((animation) => animation.name === onlyClip) : allClips;
if (onlyClip && selectedClips.length === 0) {
  throw new Error(
    `${inputPath} has no clip named "${onlyClip}". Available: ${allClips.map((a) => a.name).join(', ') || 'none'}`
  );
}
if (renameTo && selectedClips.length !== 1) {
  throw new Error(`--name needs exactly one clip; ${selectedClips.length} selected. Narrow it with --only.`);
}
const usedAccessorIndices = [...new Set(
  selectedClips.flatMap((animation) =>
    animation.samplers.flatMap((sampler) => [sampler.input, sampler.output])
  )
)];
if (usedAccessorIndices.length === 0) throw new Error(`${inputPath} contains no animation accessors.`);

const usedViewIndices = [...new Set(
  usedAccessorIndices.map((index) => source.json.accessors[index].bufferView)
)];
const viewIndexMap = new Map(usedViewIndices.map((index, nextIndex) => [index, nextIndex]));
const accessorIndexMap = new Map(usedAccessorIndices.map((index, nextIndex) => [index, nextIndex]));
const decodedViews = [];
const outputViews = [];
let binaryOffset = 0;

for (const viewIndex of usedViewIndices) {
  const view = source.json.bufferViews[viewIndex];
  const meshopt = view.extensions?.EXT_meshopt_compression;
  let decoded;
  if (meshopt) {
    const compressed = source.binary.subarray(meshopt.byteOffset, meshopt.byteOffset + meshopt.byteLength);
    decoded = Buffer.alloc(meshopt.count * meshopt.byteStride);
    MeshoptDecoder.decodeGltfBuffer(
      decoded,
      meshopt.count,
      meshopt.byteStride,
      compressed,
      meshopt.mode,
      meshopt.filter
    );
  } else {
    decoded = Buffer.from(source.binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
  }

  const padded = padToFour(decoded, 0);
  decodedViews.push(padded);
  outputViews.push({ buffer: 0, byteOffset: binaryOffset, byteLength: decoded.length });
  binaryOffset += padded.length;
}

const outputAccessors = usedAccessorIndices.map((index) => {
  const accessor = structuredClone(source.json.accessors[index]);
  accessor.bufferView = viewIndexMap.get(accessor.bufferView);
  return accessor;
});
const outputAnimations = structuredClone(selectedClips);
if (renameTo) outputAnimations[0].name = renameTo;
for (const animation of outputAnimations) {
  for (const sampler of animation.samplers) {
    sampler.input = accessorIndexMap.get(sampler.input);
    sampler.output = accessorIndexMap.get(sampler.output);
  }
}

const outputJson = {
  asset: {
    version: '2.0',
    generator: 'Arca Epsilon animation-source extractor'
  },
  scene: source.json.scene ?? 0,
  scenes: structuredClone(source.json.scenes ?? [{ nodes: [0] }]),
  nodes: structuredClone(source.json.nodes ?? []).map((node) => {
    delete node.mesh;
    delete node.skin;
    return node;
  }),
  animations: outputAnimations,
  accessors: outputAccessors,
  bufferViews: outputViews,
  buffers: [{ byteLength: binaryOffset }]
};

const jsonChunk = padToFour(Buffer.from(JSON.stringify(outputJson)), 0x20);
const binaryChunk = Buffer.concat(decodedViews);
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
console.log(
  `${inputPath} -> ${outputPath} (${totalLength} bytes, ` +
  `${outputAnimations.length} clip: ${outputAnimations.map((a) => a.name).join(', ')})`
);
