import * as THREE from 'three';

export const materialLibrary = {
  darkMetal: new THREE.MeshStandardMaterial({
    color: 0x182029,
    metalness: 0.82,
    roughness: 0.38,
    envMapIntensity: 0.35
  }),
  wornMetal: new THREE.MeshStandardMaterial({
    color: 0x6f7b83,
    metalness: 0.68,
    roughness: 0.58,
    envMapIntensity: 0.42
  }),
  damagedPanel: new THREE.MeshStandardMaterial({
    color: 0x303942,
    metalness: 0.55,
    roughness: 0.84,
    emissive: 0x120604,
    emissiveIntensity: 0.08
  }),
  alienStone: new THREE.MeshStandardMaterial({
    color: 0x5f6c70,
    metalness: 0.18,
    roughness: 0.86,
    emissive: 0x051015,
    emissiveIntensity: 0.12
  }),
  asteroidRock: new THREE.MeshStandardMaterial({
    color: 0x3f3c38,
    metalness: 0.05,
    roughness: 0.96
  }),
  energyBlue: new THREE.MeshStandardMaterial({
    color: 0x8ee7ff,
    emissive: 0x2fa9ff,
    emissiveIntensity: 1.8,
    roughness: 0.28
  }),
  warningRed: new THREE.MeshStandardMaterial({
    color: 0xff6370,
    emissive: 0xff2348,
    emissiveIntensity: 2.2,
    roughness: 0.25
  }),
  // Plain transparency, not transmission: transmissive materials force
  // three.js to render the whole scene twice per frame.
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x83d9ff,
    emissive: 0x0b516c,
    emissiveIntensity: 0.42,
    metalness: 0.18,
    roughness: 0.08,
    transparent: true,
    opacity: 0.72
  })
};

/**
 * Soft radial sprite textures, one per size for the whole application.
 *
 * Eighty-odd call sites ask for this and only five distinct sizes are ever
 * requested, so building a fresh canvas each time uploaded the same handful of
 * gradients to the GPU dozens of times over. Sharing them collapses that to one
 * upload per size and lets materials that differ only by their sprite map merge.
 *
 * Because the result is shared process-wide, it must never be disposed by an
 * individual owner; `isSharedTexture` lets a `dispose()` skip it.
 */
const softParticleTextures = new Map<number, THREE.CanvasTexture>();

/** True for textures owned by this module, which no single entity may free. */
export function isSharedTexture(texture: THREE.Texture | null | undefined): boolean {
  return Boolean(texture && texture.userData.sharedByFactory === true);
}

export function createSoftParticleTexture(size = 96): THREE.CanvasTexture {
  const cached = softParticleTextures.get(size);
  if (cached) return cached;
  const created = buildSoftParticleTexture(size);
  created.userData.sharedByFactory = true;
  softParticleTextures.set(size, created);
  return created;
}

function buildSoftParticleTexture(size: number): THREE.CanvasTexture {
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const context = sprite.getContext('2d');
  if (!context) {
    throw new Error('Could not create particle texture.');
  }

  const center = size / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.72)');
  gradient.addColorStop(0.56, 'rgba(255,255,255,0.18)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(sprite);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Tileable water-ripple normal map baked once from layered sines. Animated
 * by scrolling `offset` at runtime — far cheaper than a real water shader
 * while still catching the sun as moving micro-facets.
 */
export function createWaterNormalTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create water normal texture.');
  }

  const heightAt = (x: number, y: number): number => {
    const u = (x / size) * Math.PI * 2;
    const v = (y / size) * Math.PI * 2;
    return (
      Math.sin(u * 3 + Math.sin(v * 2) * 0.9) * 0.5 +
      Math.sin(v * 4 + Math.sin(u * 3) * 0.7) * 0.35 +
      Math.sin((u + v) * 5) * 0.2 +
      Math.sin(u * 2 - v * 3) * 0.25
    );
  };

  const image = context.createImageData(size, size);
  const strength = 1.35;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (heightAt(x - 1, y) - heightAt(x + 1, y)) * strength;
      const dy = (heightAt(x, y - 1) - heightAt(x, y + 1)) * strength;
      const invLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const offset = (y * size + x) * 4;
      image.data[offset] = Math.round((dx * invLength * 0.5 + 0.5) * 255);
      image.data[offset + 1] = Math.round((dy * invLength * 0.5 + 0.5) * 255);
      image.data[offset + 2] = Math.round((invLength * 0.5 + 0.5) * 255);
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Normal data is linear — no SRGB conversion.
  return texture;
}

export function createNoiseCanvasTexture(size = 256, opacity = 0.18): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create noise texture.');
  }

  const image = context.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = 120 + Math.random() * 135;
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = Math.random() * 255 * opacity;
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
