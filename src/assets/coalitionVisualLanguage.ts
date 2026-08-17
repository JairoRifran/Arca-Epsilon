import * as THREE from 'three';

export const coalitionPalette = {
  hull: 0x151a1e,
  armor: 0x30373d,
  recessed: 0x080b0e,
  sensor: 0x8f241d,
  signal: 0xa53a2e,
  engine: 0x68aeb5,
  engineCore: 0xb8e5df
} as const;

export type CoalitionMaterialFamily = {
  hull: THREE.MeshStandardMaterial;
  armor: THREE.MeshStandardMaterial;
  recessed: THREE.MeshStandardMaterial;
  signal: THREE.MeshStandardMaterial;
};

export function createCoalitionMaterialFamily(): CoalitionMaterialFamily {
  return {
    hull: new THREE.MeshStandardMaterial({
      color: coalitionPalette.hull,
      metalness: 0.82,
      roughness: 0.54
    }),
    armor: new THREE.MeshStandardMaterial({
      color: coalitionPalette.armor,
      metalness: 0.76,
      roughness: 0.42
    }),
    recessed: new THREE.MeshStandardMaterial({
      color: coalitionPalette.recessed,
      metalness: 0.68,
      roughness: 0.7
    }),
    signal: new THREE.MeshStandardMaterial({
      color: 0x1d0d0c,
      emissive: coalitionPalette.signal,
      emissiveIntensity: 0.42,
      metalness: 0.38,
      roughness: 0.36
    })
  };
}

/** Four-sided section hull with an unmistakable nose and tapered engine end. */
export function createCoalitionFacetedHullGeometry(
  width: number,
  height: number,
  length: number
): THREE.BufferGeometry {
  const halfLength = length * 0.5;
  const sections: ReadonlyArray<readonly [z: number, halfWidth: number, halfHeight: number]> = [
    [-halfLength, width * 0.055, height * 0.12],
    [-length * 0.24, width * 0.38, height * 0.42],
    [length * 0.08, width * 0.5, height * 0.5],
    [halfLength, width * 0.24, height * 0.3]
  ];
  const positions: number[] = [];
  for (const [z, halfWidth, halfHeight] of sections) {
    positions.push(
      -halfWidth, halfHeight, z,
      halfWidth, halfHeight, z,
      halfWidth, -halfHeight, z,
      -halfWidth, -halfHeight, z
    );
  }
  const indices: number[] = [];
  for (let section = 0; section < sections.length - 1; section += 1) {
    const current = section * 4;
    const next = current + 4;
    for (let side = 0; side < 4; side += 1) {
      const sideNext = (side + 1) % 4;
      indices.push(current + side, next + side, next + sideNext, current + side, next + sideNext, current + sideNext);
    }
  }
  indices.push(0, 3, 2, 0, 2, 1);
  const last = (sections.length - 1) * 4;
  indices.push(last, last + 1, last + 2, last, last + 2, last + 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
/** Paired swept plates built as one shared geometry to preserve silhouette cheaply. */
export function createCoalitionSweptWingGeometry(
  span: number,
  chord: number,
  thickness: number,
  sweep: number
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const side of [-1, 1]) {
    const base = positions.length / 3;
    const rootX = side * span * 0.16;
    const tipX = side * span;
    const points: ReadonlyArray<readonly [number, number]> = [
      [rootX, -chord * 0.5],
      [tipX, -chord * 0.12 + sweep],
      [side * span * 0.82, chord * 0.5 + sweep],
      [rootX, chord * 0.34]
    ];
    for (const y of [thickness * 0.5, -thickness * 0.5]) {
      for (const [x, z] of points) positions.push(x, y, z);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    indices.push(base + 4, base + 6, base + 5, base + 4, base + 7, base + 6);
    for (let edge = 0; edge < 4; edge += 1) {
      const next = (edge + 1) % 4;
      indices.push(base + edge, base + 4 + edge, base + 4 + next, base + edge, base + 4 + next, base + next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
