import * as THREE from 'three';

export type PremiumShipMaterials = {
  hull: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  engine: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
};

export function createPremiumShipMaterials(): PremiumShipMaterials {
  const hull = new THREE.MeshStandardMaterial({
    color: 0xd8e2e7,
    metalness: 0.82,
    roughness: 0.27,
    envMapIntensity: 1.12
  });

  // Plain transparency, not transmission: transmissive materials force
  // three.js to render the whole scene twice per frame.
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x8bdfff,
    emissive: 0x123a50,
    emissiveIntensity: 0.42,
    metalness: 0.05,
    roughness: 0.08,
    transparent: true,
    opacity: 0.72,
    envMapIntensity: 1.35
  });

  const engine = new THREE.MeshStandardMaterial({
    color: 0x7bcaff,
    emissive: 0x1689ff,
    emissiveIntensity: 2.25,
    metalness: 0.35,
    roughness: 0.2,
    envMapIntensity: 1.1
  });

  const trim = new THREE.MeshStandardMaterial({
    color: 0x202a31,
    metalness: 0.9,
    roughness: 0.34,
    envMapIntensity: 1.18
  });

  return { hull, glass, engine, trim };
}

export function createAnomalyMaterial(color = 0xff4964): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x161c23,
    emissive: color,
    emissiveIntensity: 0.88,
    metalness: 0.68,
    roughness: 0.31,
    envMapIntensity: 0.85
  });
}

export function createSoftParticleTexture(size = 128): THREE.CanvasTexture {
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;

  const context = sprite.getContext('2d');
  if (!context) {
    throw new Error('Could not create soft particle texture.');
  }

  const center = size / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.22, 'rgba(255,255,255,0.72)');
  gradient.addColorStop(0.58, 'rgba(255,255,255,0.16)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(sprite);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
