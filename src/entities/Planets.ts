import * as THREE from 'three';

export type PlanetVisualQuality = 'performance' | 'high' | 'ultra';

const ATMOSPHERE_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vObjectNormal;

void main() {
  vObjectNormal = normalize(normal);
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uLightDir;
uniform float uIntensity;
uniform float uPower;
uniform float uDensity;
uniform float uVariation;

varying vec3 vNormal;
varying vec3 vView;
varying vec3 vObjectNormal;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec3 n = normalize(vNormal);
  float facing = clamp(dot(vView, n), -1.0, 1.0);
  float fresnel = pow(clamp(1.0 - abs(facing), 0.0, 1.0), uPower);

  float lightDot = dot(n, normalize(uLightDir));
  float lightWrap = lightDot * 0.5 + 0.5;
  float forwardScatter = smoothstep(0.08, 0.95, lightWrap);
  float illuminatedLimb = mix(0.055, 1.0, smoothstep(-0.42, 0.24, lightDot));
  float noise = hash31(floor((vObjectNormal + 1.0) * 38.0));
  float breakup = mix(1.0, 0.82 + noise * 0.34, uVariation);

  float alpha = fresnel * uDensity * breakup * illuminatedLimb;
  vec3 color = uColor * uIntensity * mix(0.48, 1.12, forwardScatter);
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

const RING_VERTEX = /* glsl */ `
varying vec2 vLocal;

void main() {
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RING_FRAGMENT = /* glsl */ `
uniform float uInner;
uniform float uOuter;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;

varying vec2 vLocal;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  float radius = length(vLocal);
  float t = clamp((radius - uInner) / max(0.0001, uOuter - uInner), 0.0, 1.0);
  float angle = atan(vLocal.y, vLocal.x);

  float denseBands = 0.5 + 0.5 * sin(t * 260.0 + sin(t * 43.0) * 3.2);
  float broadBands = 0.5 + 0.5 * sin(t * 52.0 + 1.4);
  float dustNoise = hash21(vec2(floor(t * 410.0), floor((angle + 3.14159) * 11.0)));

  float cassini = smoothstep(0.0, 0.014, abs(t - 0.49));
  float innerGap = smoothstep(0.0, 0.01, abs(t - 0.18));
  float outerGap = smoothstep(0.0, 0.008, abs(t - 0.79));

  float density = mix(0.18, 0.88, denseBands * 0.58 + broadBands * 0.42);
  density *= mix(0.72, 1.0, dustNoise);
  density *= cassini * innerGap * outerGap;

  float edgeFade = smoothstep(0.0, 0.035, t) * smoothstep(0.0, 0.045, 1.0 - t);

  // Cheap planetary shadow painted directly into the ring shader.
  float shadowAxis = abs(angle - 2.62);
  shadowAxis = min(shadowAxis, 6.28318 - shadowAxis);
  float shadow = mix(0.26, 1.0, smoothstep(0.16, 0.72, shadowAxis));
  shadow = mix(shadow, 1.0, smoothstep(0.08, 0.32, abs(t - 0.5)));

  vec3 color = mix(uColorA, uColorB, broadBands * 0.62 + dustNoise * 0.16);
  float alpha = density * edgeFade * shadow * uOpacity;
  if (alpha < 0.006) discard;
  gl_FragColor = vec4(color, alpha);
}
`;

const FRACTURE_INTERIOR_VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRACTURE_INTERIOR_FRAGMENT = /* glsl */ `
uniform float uPulse;
uniform vec3 uRock;
uniform vec3 uHot;
uniform vec3 uWhiteHot;

varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float radial = length(p);
  if (radial > 1.0) discard;

  float n1 = noise2(p * 6.5 + 2.3);
  float n2 = noise2(p * 18.0 - 4.1);
  float veins = pow(1.0 - abs(n1 - 0.5) * 2.0, 8.0);
  veins += pow(1.0 - abs(n2 - 0.5) * 2.0, 12.0) * 0.45;
  veins *= smoothstep(1.0, 0.12, radial);

  float crust = smoothstep(0.16, 0.72, n1 + radial * 0.18);
  vec3 hotColor = mix(uHot, uWhiteHot, clamp(veins * 0.92 + uPulse * 0.12, 0.0, 1.0));
  vec3 color = mix(hotColor, uRock, crust * 0.82);
  color += hotColor * veins * (0.52 + uPulse * 0.42);

  gl_FragColor = vec4(color, 1.0);
}
`;

const CORE_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CORE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uPulse;
varying vec3 vNormal;
varying vec3 vPosition;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec3 p = normalize(vPosition) * 7.0;
  float n = hash31(floor(p * 5.0));
  float fissure = pow(1.0 - abs(n - 0.5) * 2.0, 7.0);
  float rim = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.2);
  float heat = clamp(0.5 + fissure * 1.35 + rim * 0.35 + sin(uTime * 0.8) * 0.04 + uPulse * 0.16, 0.0, 1.5);
  vec3 dark = vec3(0.12, 0.025, 0.012);
  vec3 orange = vec3(1.0, 0.14, 0.025);
  vec3 whiteHot = vec3(1.0, 0.66, 0.22);
  vec3 color = mix(dark, orange, smoothstep(0.18, 0.82, heat));
  color = mix(color, whiteHot, smoothstep(0.86, 1.28, heat));
  gl_FragColor = vec4(color, 1.0);
}
`;

type SurfaceTextureSet = {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  emissiveMap?: THREE.CanvasTexture;
};

type PlanetQualitySettings = {
  gasWidth: number;
  gasHeight: number;
  rockySize: number;
  atmosphereWidthSegments: number;
  atmosphereHeightSegments: number;
  giantSegments: [number, number];
  iceSegments: [number, number];
  fracturedSegments: [number, number];
  debrisCount: number;
};

const QUALITY: Record<PlanetVisualQuality, PlanetQualitySettings> = {
  performance: {
    gasWidth: 384,
    gasHeight: 192,
    rockySize: 384,
    atmosphereWidthSegments: 32,
    atmosphereHeightSegments: 20,
    giantSegments: [48, 30],
    iceSegments: [36, 24],
    fracturedSegments: [42, 26],
    debrisCount: 54
  },
  high: {
    gasWidth: 512,
    gasHeight: 256,
    rockySize: 512,
    atmosphereWidthSegments: 40,
    atmosphereHeightSegments: 26,
    giantSegments: [56, 36],
    iceSegments: [44, 28],
    fracturedSegments: [52, 30],
    debrisCount: 72
  },
  ultra: {
    gasWidth: 768,
    gasHeight: 384,
    rockySize: 640,
    atmosphereWidthSegments: 48,
    atmosphereHeightSegments: 30,
    giantSegments: [64, 42],
    iceSegments: [52, 34],
    fracturedSegments: [60, 36],
    debrisCount: 88
  }
};

function fract(value: number): number {
  return value - Math.floor(value);
}

function hash2(x: number, y: number, seed: number): number {
  return fract(Math.sin(x * 157.31 + y * 113.97 + seed * 41.13) * 43758.5453);
}

function noise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash2(xi, yi, seed), hash2(xi + 1, yi, seed), sx),
    THREE.MathUtils.lerp(hash2(xi, yi + 1, seed), hash2(xi + 1, yi + 1, seed), sx),
    sy
  );
}

export function fbm2(x: number, y: number, seed: number, octaves = 4): number {
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  let max = 0;
  for (let i = 0; i < octaves; i += 1) {
    total += noise2(x * frequency, y * frequency, seed + i * 7.77) * amplitude;
    max += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return max > 0 ? total / max : 0;
}

function createSeededRandom(seed: number): () => number {
  let state = (Math.floor(seed * 100000) ^ 0x9e3779b9) >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967295;
  };
}

function createCanvas(width: number, height = width): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create planet canvas texture.');
  return { canvas, context };
}

function textureFromCanvas(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 2;
  return texture;
}

function wrapDistance(a: number, b: number): number {
  const direct = Math.abs(a - b);
  return Math.min(direct, 1 - direct);
}

function createGasGiantTextureSet(
  seed: number,
  palette: number[],
  width: number,
  height: number
): SurfaceTextureSet {
  const colorCanvas = createCanvas(width, height);
  const bumpCanvas = createCanvas(width, height);
  const roughCanvas = createCanvas(width, height);
  const colorImage = colorCanvas.context.createImageData(width, height);
  const bumpImage = bumpCanvas.context.createImageData(width, height);
  const roughImage = roughCanvas.context.createImageData(width, height);
  const colors = palette.map((value) => new THREE.Color(value));
  const mixed = new THREE.Color();
  const stormHighlight = new THREE.Color(0xd3d8de);
  const random = createSeededRandom(seed + 91.7);

  const storms = Array.from({ length: 6 }, (_, index) => ({
    u: random(),
    v: 0.18 + random() * 0.64,
    radiusU: 0.035 + random() * 0.065,
    radiusV: 0.018 + random() * 0.04,
    strength: 0.45 + random() * 0.55,
    direction: index % 2 === 0 ? 1 : -1
  }));

  for (let y = 0; y < height; y += 1) {
    const v = y / Math.max(1, height - 1);
    const latitude = Math.abs(v - 0.5) * 2;
    for (let x = 0; x < width; x += 1) {
      const u = x / Math.max(1, width - 1);
      const lowTurbulence = fbm2(u * 5.2, v * 8.0, seed, 4);
      const fineTurbulence = fbm2(u * 18.0 + 3.1, v * 28.0, seed + 33, 3);
      let warp = (lowTurbulence - 0.5) * 2.15;
      let stormHeat = 0;

      for (const storm of storms) {
        const du = wrapDistance(u, storm.u) / storm.radiusU;
        const dv = (v - storm.v) / storm.radiusV;
        const distance = du * du + dv * dv;
        if (distance < 4.0) {
          const influence = Math.exp(-distance * 1.25) * storm.strength;
          const swirl = Math.sin((du * storm.direction + dv) * 5.5 + lowTurbulence * 4.0);
          warp += influence * swirl * 0.72;
          stormHeat += influence;
        }
      }

      const bandCoordinate = v * 18.0 + warp * 0.74 + Math.sin(u * Math.PI * 2.0 + lowTurbulence * 5.0) * 0.11;
      const baseBand = Math.floor(bandCoordinate);
      const bandIndex = ((baseBand % colors.length) + colors.length) % colors.length;
      const nextIndex = (bandIndex + 1) % colors.length;
      const blend = THREE.MathUtils.smootherstep(fract(bandCoordinate), 0.06, 0.94);

      mixed.copy(colors[bandIndex]).lerp(colors[nextIndex], blend);
      const polarDim = 1.0 - latitude * 0.14;
      const detail = 0.79 + lowTurbulence * 0.23 + fineTurbulence * 0.13 + stormHeat * 0.18;
      mixed.multiplyScalar(polarDim * detail);
      mixed.lerp(stormHighlight, THREE.MathUtils.clamp(stormHeat * 0.16, 0, 0.22));

      const bumpValue = THREE.MathUtils.clamp(
        0.42 + (lowTurbulence - 0.5) * 0.45 + (fineTurbulence - 0.5) * 0.23 + stormHeat * 0.12,
        0,
        1
      );
      const roughnessValue = THREE.MathUtils.clamp(
        0.72 - Math.abs(fract(bandCoordinate) - 0.5) * 0.18 + fineTurbulence * 0.15 - stormHeat * 0.12,
        0.42,
        0.96
      );

      const offset = (y * width + x) * 4;
      colorImage.data[offset] = Math.round(THREE.MathUtils.clamp(mixed.r, 0, 1) * 255);
      colorImage.data[offset + 1] = Math.round(THREE.MathUtils.clamp(mixed.g, 0, 1) * 255);
      colorImage.data[offset + 2] = Math.round(THREE.MathUtils.clamp(mixed.b, 0, 1) * 255);
      colorImage.data[offset + 3] = 255;

      const bumpByte = Math.round(bumpValue * 255);
      bumpImage.data[offset] = bumpByte;
      bumpImage.data[offset + 1] = bumpByte;
      bumpImage.data[offset + 2] = bumpByte;
      bumpImage.data[offset + 3] = 255;

      const roughByte = Math.round(roughnessValue * 255);
      roughImage.data[offset] = roughByte;
      roughImage.data[offset + 1] = roughByte;
      roughImage.data[offset + 2] = roughByte;
      roughImage.data[offset + 3] = 255;
    }
  }

  colorCanvas.context.putImageData(colorImage, 0, 0);
  bumpCanvas.context.putImageData(bumpImage, 0, 0);
  roughCanvas.context.putImageData(roughImage, 0, 0);

  return {
    map: textureFromCanvas(colorCanvas.canvas, true),
    bumpMap: textureFromCanvas(bumpCanvas.canvas, false),
    roughnessMap: textureFromCanvas(roughCanvas.canvas, false)
  };
}

function createRockyTextureSet(
  seed: number,
  base: number,
  low: number,
  size: number,
  mode: 'ice' | 'fractured'
): SurfaceTextureSet {
  const colorCanvas = createCanvas(size);
  const bumpCanvas = createCanvas(size);
  const roughCanvas = createCanvas(size);
  const emissiveCanvas = mode === 'fractured' ? createCanvas(size) : undefined;
  const colorImage = colorCanvas.context.createImageData(size, size);
  const bumpImage = bumpCanvas.context.createImageData(size, size);
  const roughImage = roughCanvas.context.createImageData(size, size);
  const emissiveImage = emissiveCanvas?.context.createImageData(size, size);
  const baseColor = new THREE.Color(base);
  const lowColor = new THREE.Color(low);
  const iceHighlight = new THREE.Color(0xe8f7fb);
  const fissureColor = new THREE.Color(0x173a52);
  const moltenRockColor = new THREE.Color(0x4a1c13);
  const mixed = new THREE.Color();

  for (let y = 0; y < size; y += 1) {
    const v01 = y / Math.max(1, size - 1);
    const latitude = Math.abs(v01 - 0.5) * 2;
    for (let x = 0; x < size; x += 1) {
      const u01 = x / Math.max(1, size - 1);
      const u = u01 * 7.4;
      const v = v01 * 7.4;
      const continental = fbm2(u * 0.72, v * 0.72, seed, 5);
      const terrain = fbm2(u * 1.55 + 2.3, v * 1.55 - 1.7, seed + 17, 4);
      const micro = fbm2(u * 5.2, v * 5.2, seed + 73, 3);
      const ridgeNoise = fbm2(u * 2.8, v * 2.8, seed + 41, 4);
      const cracks = Math.pow(1 - Math.abs(ridgeNoise - 0.5) * 2, mode === 'ice' ? 13 : 9);
      const craterField = Math.pow(Math.max(0, 0.62 - Math.abs(noise2(u * 3.1, v * 3.1, seed + 101) - 0.5) * 2), 5);

      let elevation = THREE.MathUtils.clamp(
        continental * 0.52 + terrain * 0.31 + micro * 0.17 - craterField * 0.2,
        0,
        1
      );
      const lowBlend = THREE.MathUtils.clamp(1 - elevation * 1.22 + cracks * 0.42, 0, 1);
      mixed.copy(baseColor).lerp(lowColor, lowBlend);

      let roughness = 0.82;
      let emissive = 0;
      if (mode === 'ice') {
        const polarIce = THREE.MathUtils.smoothstep(latitude, 0.35, 0.94);
        const cleanIce = THREE.MathUtils.smoothstep(elevation, 0.5, 0.92) * (1 - cracks);
        mixed.lerp(iceHighlight, polarIce * 0.34 + cleanIce * 0.22);
        mixed.lerp(fissureColor, cracks * 0.68);
        roughness = THREE.MathUtils.clamp(0.9 - cleanIce * 0.45 + cracks * 0.16 + micro * 0.08, 0.34, 0.96);
        elevation = THREE.MathUtils.clamp(elevation + cracks * 0.12, 0, 1);
      } else {
        const soot = fbm2(u * 3.5 + 7.2, v * 3.5 - 4.8, seed + 130, 3);
        mixed.multiplyScalar(0.7 + soot * 0.32);
        emissive = THREE.MathUtils.clamp(cracks * (0.32 + terrain * 0.78) - craterField * 0.1, 0, 1);
        mixed.lerp(moltenRockColor, emissive * 0.28);
        roughness = THREE.MathUtils.clamp(0.82 + micro * 0.12 - emissive * 0.2, 0.55, 0.98);
      }

      const offset = (y * size + x) * 4;
      colorImage.data[offset] = Math.round(THREE.MathUtils.clamp(mixed.r, 0, 1) * 255);
      colorImage.data[offset + 1] = Math.round(THREE.MathUtils.clamp(mixed.g, 0, 1) * 255);
      colorImage.data[offset + 2] = Math.round(THREE.MathUtils.clamp(mixed.b, 0, 1) * 255);
      colorImage.data[offset + 3] = 255;

      const bumpByte = Math.round(elevation * 255);
      bumpImage.data[offset] = bumpByte;
      bumpImage.data[offset + 1] = bumpByte;
      bumpImage.data[offset + 2] = bumpByte;
      bumpImage.data[offset + 3] = 255;

      const roughByte = Math.round(roughness * 255);
      roughImage.data[offset] = roughByte;
      roughImage.data[offset + 1] = roughByte;
      roughImage.data[offset + 2] = roughByte;
      roughImage.data[offset + 3] = 255;

      if (emissiveImage) {
        const e = Math.round(emissive * 255);
        emissiveImage.data[offset] = e;
        emissiveImage.data[offset + 1] = Math.round(e * 0.34);
        emissiveImage.data[offset + 2] = Math.round(e * 0.08);
        emissiveImage.data[offset + 3] = 255;
      }
    }
  }

  colorCanvas.context.putImageData(colorImage, 0, 0);
  bumpCanvas.context.putImageData(bumpImage, 0, 0);
  roughCanvas.context.putImageData(roughImage, 0, 0);
  if (emissiveCanvas && emissiveImage) emissiveCanvas.context.putImageData(emissiveImage, 0, 0);

  return {
    map: textureFromCanvas(colorCanvas.canvas, true),
    bumpMap: textureFromCanvas(bumpCanvas.canvas, false),
    roughnessMap: textureFromCanvas(roughCanvas.canvas, false),
    emissiveMap: emissiveCanvas ? textureFromCanvas(emissiveCanvas.canvas, true) : undefined
  };
}

/** Compatibility export: creates the color texture used by earlier callers. */
export function createRockyTexture(seed: number, base: number, low: number): THREE.CanvasTexture {
  const texture = createRockyTextureSet(seed, base, low, 512, 'fractured').map;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createAtmosphereShell(
  radius: number,
  color: number,
  intensity = 1.4,
  power = 3.2,
  widthSegments = 40,
  heightSegments = 26,
  density = 0.92,
  variation = 0.18
): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uLightDir: { value: new THREE.Vector3(0.38, 0.22, 0.9).normalize() },
      uIntensity: { value: intensity },
      uPower: { value: power },
      uDensity: { value: density },
      uVariation: { value: variation }
    },
    vertexShader: ATMOSPHERE_VERTEX,
    fragmentShader: ATMOSPHERE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(radius, widthSegments, heightSegments), material);
  shell.name = 'Premium Planet Atmosphere';
  shell.renderOrder = 2;
  shell.frustumCulled = true;
  return shell;
}

function createRingSystem(inner: number, outer: number): THREE.Mesh<THREE.RingGeometry, THREE.ShaderMaterial> {
  const geometry = new THREE.RingGeometry(inner, outer, 160, 1);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uInner: { value: inner },
      uOuter: { value: outer },
      uColorA: { value: new THREE.Color(0x6d8298) },
      uColorB: { value: new THREE.Color(0xb6c2cc) },
      uOpacity: { value: 0.24 }
    },
    vertexShader: RING_VERTEX,
    fragmentShader: RING_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    toneMapped: false,
    fog: false
  });
  const rings = new THREE.Mesh(geometry, material);
  rings.name = 'Tharsis-9 Physically Banded Ring System';
  rings.renderOrder = 1;
  return rings;
}

function createJaggedFractureDisc(radius: number, segments: number, seed: number): THREE.BufferGeometry {
  const random = createSeededRandom(seed);
  const positions: number[] = [0, 0, 0];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const r = radius * (0.86 + random() * 0.16 + Math.sin(angle * 7 + seed) * 0.035);
    const y = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    positions.push(0, y, z);
    uvs.push(0.5 + y / (radius * 2), 0.5 + z / (radius * 2));
    if (i < segments) indices.push(0, i + 1, i + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createRadialGlowTexture(size = 128): THREE.CanvasTexture {
  const { canvas, context } = createCanvas(size);
  const center = size * 0.5;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255,235,185,0.96)');
  gradient.addColorStop(0.16, 'rgba(255,113,38,0.72)');
  gradient.addColorStop(0.48, 'rgba(255,50,16,0.22)');
  gradient.addColorStop(1, 'rgba(255,20,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return textureFromCanvas(canvas, true);
}

export class PlanetGroup {
  readonly group = new THREE.Group();

  private readonly spinners: { object: THREE.Object3D; speed: number }[] = [];
  private readonly quality: PlanetVisualQuality;
  private readonly coreMaterial: THREE.ShaderMaterial;
  private readonly fractureInteriorMaterial: THREE.ShaderMaterial;
  private readonly coreGlowMaterial: THREE.SpriteMaterial;
  private debrisRing?: THREE.Group;

  constructor(quality: PlanetVisualQuality = 'high') {
    this.quality = quality;
    this.group.name = 'Distant Planets Premium Optimized';

    this.coreMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 }
      },
      vertexShader: CORE_VERTEX,
      fragmentShader: CORE_FRAGMENT,
      toneMapped: false,
      fog: false
    });

    this.fractureInteriorMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uPulse: { value: 0 },
        uRock: { value: new THREE.Color(0x1d1715) },
        uHot: { value: new THREE.Color(0xff3b18) },
        uWhiteHot: { value: new THREE.Color(0xffc05a) }
      },
      vertexShader: FRACTURE_INTERIOR_VERTEX,
      fragmentShader: FRACTURE_INTERIOR_FRAGMENT,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false
    });

    this.coreGlowMaterial = new THREE.SpriteMaterial({
      map: createRadialGlowTexture(),
      color: 0xff5724,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false
    });

    this.addGasGiant();
    this.addIceWorld();
    this.addFracturedPlanet();
  }

  update(delta: number, elapsed: number): void {
    if (!this.group.visible) return;

    for (const spinner of this.spinners) {
      spinner.object.rotation.y += delta * spinner.speed;
    }

    const pulse = 0.5 + Math.sin(elapsed * 0.9) * 0.5;
    this.coreMaterial.uniforms.uTime.value = elapsed;
    this.coreMaterial.uniforms.uPulse.value = pulse;
    this.fractureInteriorMaterial.uniforms.uPulse.value = pulse;
    this.coreGlowMaterial.opacity = 0.31 + pulse * 0.12;

    if (this.debrisRing) {
      this.debrisRing.rotation.y += delta * 0.018;
      this.debrisRing.rotation.z = Math.sin(elapsed * 0.08) * 0.035;
    }
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();

    this.group.traverse((object) => {
      const renderable = object as THREE.Object3D & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };
      if (renderable.geometry && !geometries.has(renderable.geometry)) {
        geometries.add(renderable.geometry);
        renderable.geometry.dispose();
      }
      const objectMaterials = renderable.material
        ? Array.isArray(renderable.material)
          ? renderable.material
          : [renderable.material]
        : [];
      for (const material of objectMaterials) {
        if (materials.has(material)) continue;
        materials.add(material);
        for (const value of Object.values(material as THREE.Material & Record<string, unknown>)) {
          if (value instanceof THREE.Texture && !textures.has(value)) {
            textures.add(value);
            value.dispose();
          }
        }
        material.dispose();
      }
    });
  }

  private addGasGiant(): void {
    const settings = QUALITY[this.quality];
    const giant = new THREE.Group();
    giant.name = 'Gas Giant Tharsis-9 Premium';

    const textureSet = createGasGiantTextureSet(
      4.2,
      [0x263549, 0x4c6079, 0x77879e, 0x32445c, 0xa1a9b7, 0x26394e, 0x64788f],
      settings.gasWidth,
      settings.gasHeight
    );

    const surfaceMaterial = new THREE.MeshStandardMaterial({
      map: textureSet.map,
      bumpMap: textureSet.bumpMap,
      bumpScale: 1.55,
      roughnessMap: textureSet.roughnessMap,
      roughness: 0.84,
      metalness: 0,
      envMapIntensity: 0.46,
      fog: false
    });
    const surface = new THREE.Mesh(
      new THREE.SphereGeometry(240, settings.giantSegments[0], settings.giantSegments[1]),
      surfaceMaterial
    );
    surface.name = 'Tharsis-9 Turbulent Cloud Surface';
    surface.rotation.z = -0.08;
    giant.add(surface);
    this.spinners.push({ object: surface, speed: 0.006 });

    const atmosphere = createAtmosphereShell(
      249,
      0x6f9fd8,
      1.12,
      3.35,
      settings.atmosphereWidthSegments,
      settings.atmosphereHeightSegments,
      0.88,
      0.12
    );
    atmosphere.rotation.z = -0.08;
    giant.add(atmosphere);

    const rings = createRingSystem(294, 438);
    rings.rotation.x = Math.PI / 2.22;
    rings.rotation.z = -0.09;
    giant.add(rings);

    giant.position.set(1750, 260, -3300);
    giant.rotation.y = 0.22;
    this.group.add(giant);
  }

  private addIceWorld(): void {
    const settings = QUALITY[this.quality];
    const world = new THREE.Group();
    world.name = 'Ice World Kaelen Premium';

    const textureSet = createRockyTextureSet(17.8, 0xb7d4df, 0x4f7189, settings.rockySize, 'ice');
    const materialParameters: THREE.MeshStandardMaterialParameters = {
      map: textureSet.map,
      bumpMap: textureSet.bumpMap,
      bumpScale: 1.35,
      roughnessMap: textureSet.roughnessMap,
      roughness: 0.58,
      metalness: 0.035,
      envMapIntensity: 0.88,
      fog: false
    };

    const surfaceMaterial = this.quality === 'ultra'
      ? new THREE.MeshPhysicalMaterial({
          ...materialParameters,
          clearcoat: 0.26,
          clearcoatRoughness: 0.34
        })
      : new THREE.MeshStandardMaterial(materialParameters);

    const surface = new THREE.Mesh(
      new THREE.SphereGeometry(88, settings.iceSegments[0], settings.iceSegments[1]),
      surfaceMaterial
    );
    surface.name = 'Kaelen Glacial Plate Surface';
    surface.rotation.z = 0.19;
    world.add(surface);
    this.spinners.push({ object: surface, speed: 0.0105 });

    const atmosphere = createAtmosphereShell(
      92.4,
      0x9fd4ff,
      1.18,
      3.05,
      settings.atmosphereWidthSegments,
      settings.atmosphereHeightSegments,
      0.84,
      0.1
    );
    atmosphere.rotation.z = 0.19;
    world.add(atmosphere);

    world.position.set(-2300, -420, -2600);
    world.rotation.y = -0.35;
    this.group.add(world);
  }

  private addFracturedPlanet(): void {
    const settings = QUALITY[this.quality];
    const planet = new THREE.Group();
    planet.name = 'Fractured Planet Veyra Premium';

    const textureSet = createRockyTextureSet(9.4, 0x58636d, 0x20262d, settings.rockySize, 'fractured');
    const rockMaterial = new THREE.MeshStandardMaterial({
      map: textureSet.map,
      bumpMap: textureSet.bumpMap,
      bumpScale: 1.1,
      roughnessMap: textureSet.roughnessMap,
      roughness: 0.91,
      metalness: 0.035,
      emissive: 0x2d0a04,
      emissiveMap: textureSet.emissiveMap,
      emissiveIntensity: 0.42,
      envMapIntensity: 0.38,
      fog: false
    });

    const halfAGeometry = new THREE.SphereGeometry(
      44,
      settings.fracturedSegments[0],
      settings.fracturedSegments[1],
      0,
      Math.PI
    );
    const halfBGeometry = new THREE.SphereGeometry(
      44,
      settings.fracturedSegments[0],
      settings.fracturedSegments[1],
      Math.PI,
      Math.PI
    );

    const halfA = new THREE.Mesh(halfAGeometry, rockMaterial);
    halfA.name = 'Veyra Fractured Hemisphere A';
    halfA.position.x = -14;
    halfA.rotation.set(0.08, -0.08, 0.43);
    planet.add(halfA);

    const halfB = new THREE.Mesh(halfBGeometry, rockMaterial);
    halfB.name = 'Veyra Fractured Hemisphere B';
    halfB.position.x = 18;
    halfB.rotation.set(-0.04, 0.11, -0.31);
    planet.add(halfB);

    const fractureGeometryA = createJaggedFractureDisc(42.2, 48, 11.4);
    const fractureGeometryB = createJaggedFractureDisc(42.2, 48, 31.8);
    const fractureA = new THREE.Mesh(fractureGeometryA, this.fractureInteriorMaterial);
    fractureA.name = 'Veyra Molten Fracture Face A';
    fractureA.position.x = -10.4;
    fractureA.rotation.set(0.08, -0.08, 0.43);
    planet.add(fractureA);

    const fractureB = new THREE.Mesh(fractureGeometryB, this.fractureInteriorMaterial);
    fractureB.name = 'Veyra Molten Fracture Face B';
    fractureB.position.x = 13.4;
    fractureB.rotation.set(-0.04, 0.11, -0.31);
    planet.add(fractureB);

    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(26, this.quality === 'performance' ? 1 : 2), this.coreMaterial);
    core.name = 'Veyra Exposed Convecting Core';
    core.scale.set(1.15, 0.56, 0.9);
    planet.add(core);

    const coreGlow = new THREE.Sprite(this.coreGlowMaterial);
    coreGlow.name = 'Veyra Core Optical Glow';
    coreGlow.scale.set(90, 90, 1);
    coreGlow.renderOrder = 3;
    planet.add(coreGlow);

    this.debrisRing = new THREE.Group();
    this.debrisRing.name = 'Veyra Fracture Debris Field';
    const random = createSeededRandom(94.7);
    const shardCountA = Math.floor(settings.debrisCount * 0.64);
    const shardCountB = settings.debrisCount - shardCountA;
    const materialA = rockMaterial;
    const materialB = new THREE.MeshStandardMaterial({
      color: 0x394149,
      roughness: 0.94,
      metalness: 0.02,
      emissive: 0x170400,
      emissiveIntensity: 0.22,
      fog: false
    });
    const shardA = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 1), materialA, shardCountA);
    const shardB = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), materialB, shardCountB);
    shardA.name = 'Veyra Sharp Debris Instances';
    shardB.name = 'Veyra Block Debris Instances';

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();

    const populate = (mesh: THREE.InstancedMesh, count: number, offset: number): void => {
      for (let i = 0; i < count; i += 1) {
        const angle = random() * Math.PI * 2;
        const radius = 57 + Math.pow(random(), 0.76) * 55;
        const vertical = (random() - 0.5) * (20 + random() * 18);
        euler.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
        quaternion.setFromEuler(euler);
        const s = 0.65 + Math.pow(random(), 1.7) * 4.2;
        scale.set(s * (0.65 + random() * 0.8), s * (0.45 + random() * 0.9), s * (0.72 + random() * 0.75));
        matrix.compose(
          new THREE.Vector3(
            Math.cos(angle) * radius,
            vertical + Math.sin(angle * 2.0 + offset) * 4.5,
            Math.sin(angle) * radius
          ),
          quaternion,
          scale
        );
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    };

    populate(shardA, shardCountA, 0.7);
    populate(shardB, shardCountB, 2.1);
    this.debrisRing.add(shardA, shardB);
    planet.add(this.debrisRing);

    planet.add(createAtmosphereShell(
      52,
      0xff7040,
      0.46,
      3.7,
      settings.atmosphereWidthSegments,
      settings.atmosphereHeightSegments,
      0.52,
      0.24
    ));

    planet.position.set(-560, 130, -1050);
    planet.scale.setScalar(1.9);
    planet.rotation.y = 0.18;
    this.group.add(planet);
  }
}
