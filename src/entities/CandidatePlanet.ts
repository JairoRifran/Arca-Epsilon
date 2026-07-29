import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';
import { createAtmosphereShell, fbm2 } from './Planets';
import type { CandidatePlanetDefinition } from '../assets/planetDefinitions';

const SCAN_SWEEP_VERTEX = /* glsl */ `
varying vec3 vLocal;
void main() {
  vLocal = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SCAN_SWEEP_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uSweep;
uniform float uIntensity;
varying vec3 vLocal;

void main() {
  // A thin luminous latitude band sweeping pole to pole while the
  // habitability scan runs: diegetic progress, not a debug shell.
  float band = smoothstep(0.085, 0.0, abs(vLocal.y - uSweep));
  // Faint longitudinal graticule fragments inside the band only.
  float lines = 0.55 + 0.45 * sin(atan(vLocal.z, vLocal.x) * 24.0);
  gl_FragColor = vec4(uColor, band * lines * uIntensity);
}
`;

const ORBITAL_LAYER_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const WATER_GLINT_FRAGMENT = /* glsl */ `
uniform sampler2D uSurfaceMask;
uniform vec3 uSunDirection;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  vec3 sunDirection = normalize(uSunDirection);
  float roughnessSample = texture2D(uSurfaceMask, vUv).r;
  float ocean = 1.0 - smoothstep(0.45, 0.72, roughnessSample);
  float daylight = smoothstep(-0.08, 0.22, dot(normal, sunDirection));
  vec3 halfVector = normalize(sunDirection + viewDirection);
  float reflection = max(dot(normal, halfVector), 0.0);
  float tightGlint = pow(reflection, 96.0);
  float broadGlint = pow(reflection, 26.0) * 0.16;
  float shimmer = 0.86 + 0.14 * sin(vUv.x * 180.0 + uTime * 1.7) * sin(vUv.y * 96.0 - uTime * 1.1);
  float energy = ocean * daylight * (tightGlint * 0.52 + broadGlint) * shimmer;
  gl_FragColor = vec4(vec3(0.72, 0.9, 1.0) * energy, clamp(energy, 0.0, 0.42));
}
`;

const TWILIGHT_FRAGMENT = /* glsl */ `
uniform vec3 uSunDirection;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float lightAmount = dot(normal, normalize(uSunDirection));
  float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 1.8);

  // A soft, colored transition where the star grazes the atmosphere.
  float terminator = exp(-pow(lightAmount / 0.17, 2.0));
  float twilight = terminator * (0.18 + fresnel * 0.82);
  vec3 twilightColor = mix(vec3(0.30, 0.54, 0.78), vec3(1.0, 0.48, 0.22), smoothstep(-0.12, 0.12, lightAmount));

  // Sparse non-human activity on the night side: polar aurora and rare
  // Atlas-like signal glimmers, never a city-light carpet.
  float night = 1.0 - smoothstep(-0.28, 0.05, lightAmount);
  float latitude = abs(normal.y);
  float auroraBand = exp(-pow((latitude - 0.72) / 0.075, 2.0));
  auroraBand *= 0.55 + 0.45 * sin(vUv.x * 78.0 + uTime * 0.32);
  float cell = hash(floor(vUv * vec2(76.0, 38.0)));
  float glimmer = smoothstep(0.993, 0.999, cell);
  glimmer *= 0.45 + 0.55 * sin(uTime * 0.8 + cell * 24.0);

  float twilightEnergy = twilight * 0.25;
  float auroraEnergy = auroraBand * night * fresnel * 0.055;
  float signalEnergy = glimmer * night * 0.045;
  vec3 color = twilightColor * twilightEnergy;
  color += vec3(0.20, 0.88, 0.72) * auroraEnergy;
  color += vec3(0.36, 0.74, 0.82) * signalEnergy;
  float alpha = clamp(twilightEnergy + auroraEnergy + signalEnergy, 0.0, 0.32);
  gl_FragColor = vec4(color, alpha);
}
`;

/**
 * Candidate habitable world E-01: the first-mission target. Fbm continents
 * with specular oceans and polar ice, wispy noise clouds, fresnel
 * atmosphere, survey-orbit arc traces and a shader scan sweep that runs
 * while the habitability analysis is locked on.
 */
export class CandidatePlanet {
  readonly group = new THREE.Group();

  private readonly auraMaterial: THREE.SpriteMaterial;

  private readonly clouds: THREE.Mesh;

  private readonly cirrus: THREE.Mesh;

  private readonly surface: THREE.Mesh;

  private readonly sweepMaterial: THREE.ShaderMaterial;

  private orbitalDust!: THREE.Points;

  private readonly waterGlint: THREE.Mesh;

  private readonly waterGlintMaterial: THREE.ShaderMaterial;

  private readonly twilightMaterial: THREE.ShaderMaterial;

  constructor(readonly definition: CandidatePlanetDefinition) {
    this.group.name = definition.name;
    this.group.position.set(...definition.position);

    const { map, roughnessMap } = this.bakeSurfaceTextures(1024, 512);
    this.surface = new THREE.Mesh(
      new THREE.SphereGeometry(definition.radius, 96, 48),
      new THREE.MeshStandardMaterial({
        map,
        roughnessMap,
        roughness: 0.92,
        metalness: 0.02,
        envMapIntensity: 0.58,
        fog: false
      })
    );
    this.group.add(this.surface);

    const sunDirection = new THREE.Vector3(-0.77, 0.53, 0.36).normalize();
    this.waterGlintMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uSurfaceMask: { value: roughnessMap },
        uSunDirection: { value: sunDirection.clone() },
        uTime: { value: 0 }
      },
      vertexShader: ORBITAL_LAYER_VERTEX,
      fragmentShader: WATER_GLINT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.waterGlint = new THREE.Mesh(
      new THREE.SphereGeometry(definition.radius * 1.004, 64, 32),
      this.waterGlintMaterial
    );
    this.waterGlint.name = 'E-01 Water Sun Glint';
    this.waterGlint.renderOrder = 1;
    this.group.add(this.waterGlint);

    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(definition.radius * 1.016, 64, 32),
      new THREE.MeshStandardMaterial({
        color: 0xf4fbff,
        alphaMap: this.bakeCloudAlpha(512, 256),
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        roughness: 1,
        metalness: 0,
        fog: false
      })
    );
    this.group.add(this.clouds);

    // High cirrus veil above the main deck: two cloud layers rotating at
    // different rates give the atmosphere visible parallax from orbit.
    this.cirrus = new THREE.Mesh(
      new THREE.SphereGeometry(definition.radius * 1.032, 48, 24),
      new THREE.MeshStandardMaterial({
        color: 0xeef8ff,
        alphaMap: this.bakeCloudAlpha(512, 256, 271.3, 0.55),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        roughness: 1,
        metalness: 0,
        fog: false
      })
    );
    this.group.add(this.cirrus);

    // Double atmosphere: a thin bright inner limb hugging the surface plus
    // the wide soft outer halo — the two-band rim real planets show.
    this.group.add(createAtmosphereShell(definition.radius * 1.018, 0xbfe9ff, 0.55, 6));
    this.group.add(createAtmosphereShell(definition.radius * 1.055, 0x7fd4ff, 1.35, 3));

    this.twilightMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uSunDirection: { value: sunDirection.clone() },
        uTime: { value: 0 }
      },
      vertexShader: ORBITAL_LAYER_VERTEX,
      fragmentShader: TWILIGHT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const twilightShell = new THREE.Mesh(
      new THREE.SphereGeometry(definition.radius * 1.023, 64, 32),
      this.twilightMaterial
    );
    twilightShell.name = 'E-01 Twilight Terminator Shell';
    twilightShell.renderOrder = 2;
    this.group.add(twilightShell);

    // Scan sweep shell: invisible until the habitability lock runs.
    this.sweepMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x7dffd2) },
        uSweep: { value: -1 },
        uIntensity: { value: 0 }
      },
      vertexShader: SCAN_SWEEP_VERTEX,
      fragmentShader: SCAN_SWEEP_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const sweepShell = new THREE.Mesh(new THREE.SphereGeometry(definition.radius * 1.03, 64, 32), this.sweepMaterial);
    this.group.add(sweepShell);

    // Thin inclined dust band in low orbit: micrometeorite debris catching
    // the key light. Orbital context and parallax, never a toy ring.
    const dustCount = 340;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const orbitRadius = definition.radius * (1.5 + Math.pow(Math.random(), 1.7) * 0.85);
      dustPositions[i * 3] = Math.cos(angle) * orbitRadius;
      dustPositions[i * 3 + 1] = (Math.random() - 0.5) * definition.radius * 0.07;
      dustPositions[i * 3 + 2] = Math.sin(angle) * orbitRadius;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    this.orbitalDust = new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({
        color: 0xb8c8c2,
        size: 1.6,
        map: createSoftParticleTexture(48),
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
      })
    );
    this.orbitalDust.name = 'E-01 Orbital Dust Band';
    this.orbitalDust.rotation.x = 0.34;
    this.orbitalDust.frustumCulled = false;
    this.group.add(this.orbitalDust);

    this.auraMaterial = new THREE.SpriteMaterial({
      map: createSoftParticleTexture(128),
      color: 0x72f5bf,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });
    const aura = new THREE.Sprite(this.auraMaterial);
    aura.scale.setScalar(definition.radius * 2.1);
    this.group.add(aura);
  }

  update(delta: number, elapsed: number, signalStrength: number, scanning: boolean): void {
    this.surface.rotation.y += delta * 0.012;
    this.waterGlint.rotation.y = this.surface.rotation.y;
    this.clouds.rotation.y += delta * 0.021;
    this.cirrus.rotation.y += delta * 0.009;
    this.orbitalDust.rotation.y += delta * 0.005;
    this.waterGlintMaterial.uniforms.uTime.value = elapsed;
    this.twilightMaterial.uniforms.uTime.value = elapsed;

    // Faint signal halo only: the planet's own presence carries the frame.
    this.auraMaterial.opacity = 0.05 + signalStrength * 0.1;

    // Pole-to-pole sweep on a 6 s cycle while scanning; fades out otherwise.
    const targetIntensity = scanning ? 0.5 : 0;
    this.sweepMaterial.uniforms.uIntensity.value = THREE.MathUtils.lerp(
      this.sweepMaterial.uniforms.uIntensity.value,
      targetIntensity,
      1 - Math.pow(0.05, delta)
    );
    this.sweepMaterial.uniforms.uSweep.value = Math.sin(elapsed * (Math.PI * 2) / 6) * 0.95;
  }

  distanceTo(position: THREE.Vector3): number {
    return this.group.position.distanceTo(position);
  }

  signalStrengthFrom(position: THREE.Vector3): number {
    const distance = this.distanceTo(position);
    return THREE.MathUtils.clamp(1 - distance / 1700, 0.08, 1);
  }

  inScanRange(position: THREE.Vector3): boolean {
    return this.distanceTo(position) <= this.definition.scanRadius;
  }

  /** Continents, oceans and polar ice baked once from layered fbm noise. */
  private bakeSurfaceTextures(width: number, height: number): { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = width;
    colorCanvas.height = height;
    const colorContext = colorCanvas.getContext('2d');
    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = width;
    roughCanvas.height = height;
    const roughContext = roughCanvas.getContext('2d');
    if (!colorContext || !roughContext) {
      throw new Error('Could not create candidate planet textures.');
    }

    const colorImage = colorContext.createImageData(width, height);
    const roughImage = roughContext.createImageData(width, height);

    const deepOcean = new THREE.Color(0x14304e);
    const shallowOcean = new THREE.Color(0x1f5f74);
    const lowland = new THREE.Color(0x3d6b40);
    const highland = new THREE.Color(0x7a7a52);
    const ice = new THREE.Color(0xdfeef2);
    const mixed = new THREE.Color();

    for (let y = 0; y < height; y += 1) {
      const v = y / height;
      const latitude = Math.abs(v - 0.5) * 2;
      for (let x = 0; x < width; x += 1) {
        const u = x / width;
        // Wrap-friendly sampling: noise domain uses cos/sin of longitude so
        // the texture seam at u=0/1 stays continuous.
        const angle = u * Math.PI * 2;
        const nx = Math.cos(angle) * 2.4 + 4;
        const nz = Math.sin(angle) * 2.4 + 4;
        const elevation = fbm2(nx + v * 5.2, nz + v * 3.1, 91.7, 5);
        const detail = fbm2(nx * 3 + v * 12, nz * 3, 47.3, 3);

        const isIce = latitude > 0.82 - detail * 0.06;
        const seaLevel = 0.52;

        if (isIce) {
          mixed.copy(ice).offsetHSL(0, 0, (detail - 0.5) * 0.06);
        } else if (elevation < seaLevel) {
          const depth = THREE.MathUtils.clamp((seaLevel - elevation) / seaLevel, 0, 1);
          mixed.copy(shallowOcean).lerp(deepOcean, Math.pow(depth, 0.6));
        } else {
          const relief = THREE.MathUtils.clamp((elevation - seaLevel) / (1 - seaLevel), 0, 1);
          mixed.copy(lowland).lerp(highland, Math.pow(relief, 1.2));
          mixed.offsetHSL(0, 0, (detail - 0.5) * 0.08);
        }

        const offset = (y * width + x) * 4;
        colorImage.data[offset] = mixed.r * 255;
        colorImage.data[offset + 1] = mixed.g * 255;
        colorImage.data[offset + 2] = mixed.b * 255;
        colorImage.data[offset + 3] = 255;

        // Oceans read glossy under the key star; land and ice stay matte.
        const roughness = isIce ? 200 : elevation < seaLevel ? 90 : 235;
        roughImage.data[offset] = roughness;
        roughImage.data[offset + 1] = roughness;
        roughImage.data[offset + 2] = roughness;
        roughImage.data[offset + 3] = 255;
      }
    }

    colorContext.putImageData(colorImage, 0, 0);
    roughContext.putImageData(roughImage, 0, 0);

    const map = new THREE.CanvasTexture(colorCanvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const roughnessMap = new THREE.CanvasTexture(roughCanvas);
    return { map, roughnessMap };
  }

  /** Wispy cloud alpha from domain-shifted fbm. */
  private bakeCloudAlpha(width: number, height: number, seed = 133.1, threshold = 0.42): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not create candidate planet cloud texture.');
    }

    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y += 1) {
      const v = y / height;
      for (let x = 0; x < width; x += 1) {
        const u = x / width;
        const angle = u * Math.PI * 2;
        const nx = Math.cos(angle) * 2 + 8;
        const nz = Math.sin(angle) * 2 + 8;
        let density = fbm2(nx + v * 4.4, nz + v * 2.2, seed, 4);
        density = Math.pow(Math.max(0, density - threshold) / (1 - threshold), 1.7);

        const offset = (y * width + x) * 4;
        const value = Math.min(255, density * 300);
        image.data[offset] = value;
        image.data[offset + 1] = value;
        image.data[offset + 2] = value;
        image.data[offset + 3] = 255;
      }
    }

    context.putImageData(image, 0, 0);
    return new THREE.CanvasTexture(canvas);
  }
}
