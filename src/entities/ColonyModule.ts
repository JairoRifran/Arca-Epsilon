import * as THREE from 'three';
import { habitatModuleNereida01 } from '../assets/colonyDefinitions';
import { createSoftParticleTexture } from '../assets/materials';
import { freezeStaticChildren, mergeStaticDecoration } from '../assets/materialCache';
import {
  NereidaBaseInfrastructure,
  type NereidaBaseDetailProfile,
  type NereidaBaseInfrastructureDiagnostics
} from './NereidaBaseInfrastructure';

const OXYGEN_WARNING_COLOR = new THREE.Color(0x5a2a1d);
const OXYGEN_ONLINE_COLOR = new THREE.Color(0x72d9b0);
const OXYGEN_WARNING_EMISSIVE = new THREE.Color(0xff6a32);
const OXYGEN_ONLINE_EMISSIVE = new THREE.Color(0x36d99a);
const ACCESS_WARNING_COLOR = new THREE.Color(0xff9a2e);
const ACCESS_ONLINE_COLOR = new THREE.Color(0x55e8ac);

function fract(value: number): number {
  return value - Math.floor(value);
}

function hash3(x: number, y: number, z: number, seed: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 53.13) * 43758.5453123);
}

function createSeededRandom(seed: number): () => number {
  let state = (Math.floor(seed * 10_000) ^ 0x9e3779b9) >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

function easeOutBack(value: number, overshoot = 1.18): number {
  const x = value - 1;
  return 1 + (overshoot + 1) * x * x * x + overshoot * x * x;
}

function createCanvasTexture(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void,
  colorTexture = true
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create canvas texture.');
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (colorTexture) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createHullAlbedoTexture(seed: number): THREE.CanvasTexture {
  const random = createSeededRandom(seed + 7.1);
  const texture = createCanvasTexture(512, 256, (context, width, height) => {
    context.fillStyle = '#c6cdd0';
    context.fillRect(0, 0, width, height);

    const columns = 12;
    const rows = 5;
    const cellW = width / columns;
    const cellH = height / rows;

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const variation = Math.floor((random() - 0.5) * 16);
        const base = 198 + variation;
        context.fillStyle = `rgb(${base}, ${base + 5}, ${base + 7})`;
        context.fillRect(column * cellW + 2, row * cellH + 2, cellW - 4, cellH - 4);
      }
    }

    context.strokeStyle = 'rgba(56, 66, 70, 0.68)';
    context.lineWidth = 2;
    for (let column = 0; column <= columns; column += 1) {
      const x = Math.round(column * cellW);
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let row = 0; row <= rows; row += 1) {
      const y = Math.round(row * cellH);
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    // Subtle directional dust and servicing marks.
    for (let i = 0; i < 90; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const length = 8 + random() * 46;
      const alpha = 0.015 + random() * 0.035;
      context.strokeStyle = `rgba(74, 68, 55, ${alpha})`;
      context.lineWidth = 1 + random() * 2;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + (random() - 0.5) * 4, Math.min(height, y + length));
      context.stroke();
    }

    // Lower-body dust gradient.
    const lowerDust = context.createLinearGradient(0, height * 0.58, 0, height);
    lowerDust.addColorStop(0, 'rgba(99, 85, 64, 0)');
    lowerDust.addColorStop(1, 'rgba(87, 73, 54, 0.28)');
    context.fillStyle = lowerDust;
    context.fillRect(0, height * 0.55, width, height * 0.45);

    // Small fasteners painted into the atlas.
    context.fillStyle = 'rgba(43, 48, 50, 0.72)';
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        for (const inset of [5, cellW - 5]) {
          context.beginPath();
          context.arc(column * cellW + inset, row * cellH + 7, 1.4, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
  });
  texture.repeat.set(1.5, 1);
  return texture;
}

function createHullRoughnessTexture(seed: number): THREE.CanvasTexture {
  const random = createSeededRandom(seed + 17.4);
  const texture = createCanvasTexture(256, 256, (context, width, height) => {
    context.fillStyle = '#a8a8a8';
    context.fillRect(0, 0, width, height);
    for (let i = 0; i < 2600; i += 1) {
      const value = 115 + Math.floor(random() * 95);
      context.fillStyle = `rgb(${value}, ${value}, ${value})`;
      const size = 1 + random() * 3;
      context.fillRect(random() * width, random() * height, size, size);
    }
    const dust = context.createLinearGradient(0, height * 0.5, 0, height);
    dust.addColorStop(0, 'rgba(255,255,255,0)');
    dust.addColorStop(1, 'rgba(245,245,245,0.45)');
    context.fillStyle = dust;
    context.fillRect(0, height * 0.45, width, height * 0.55);
  }, false);
  texture.repeat.set(2.5, 2);
  return texture;
}

function createHullBumpTexture(seed: number): THREE.CanvasTexture {
  const random = createSeededRandom(seed + 27.8);
  const texture = createCanvasTexture(256, 256, (context, width, height) => {
    context.fillStyle = '#808080';
    context.fillRect(0, 0, width, height);

    context.strokeStyle = '#565656';
    context.lineWidth = 2;
    for (let x = 0; x <= width; x += 32) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 0; y <= height; y += 51.2) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    for (let i = 0; i < 500; i += 1) {
      const value = 105 + Math.floor(random() * 50);
      context.fillStyle = `rgb(${value}, ${value}, ${value})`;
      context.fillRect(random() * width, random() * height, 1 + random() * 2, 1 + random() * 2);
    }
  }, false);
  texture.repeat.set(2.5, 2);
  return texture;
}

function createSolarTexture(seed: number): THREE.CanvasTexture {
  const random = createSeededRandom(seed + 33.6);
  return createCanvasTexture(512, 256, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#061a2c');
    gradient.addColorStop(0.5, '#123f66');
    gradient.addColorStop(1, '#071b32');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    const columns = 12;
    const rows = 6;
    const cellW = width / columns;
    const cellH = height / rows;

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = column * cellW;
        const y = row * cellH;
        const light = 31 + Math.floor(random() * 20);
        const cellGradient = context.createLinearGradient(x, y, x + cellW, y + cellH);
        cellGradient.addColorStop(0, `rgb(7, ${light}, ${light + 28})`);
        cellGradient.addColorStop(0.5, `rgb(13, ${light + 12}, ${light + 45})`);
        cellGradient.addColorStop(1, `rgb(5, ${light - 5}, ${light + 20})`);
        context.fillStyle = cellGradient;
        context.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
      }
    }

    context.strokeStyle = 'rgba(77, 139, 181, 0.9)';
    context.lineWidth = 2;
    for (let column = 0; column <= columns; column += 1) {
      context.beginPath();
      context.moveTo(column * cellW, 0);
      context.lineTo(column * cellW, height);
      context.stroke();
    }
    for (let row = 0; row <= rows; row += 1) {
      context.beginPath();
      context.moveTo(0, row * cellH);
      context.lineTo(width, row * cellH);
      context.stroke();
    }

    // Conductive bus bars.
    context.strokeStyle = 'rgba(177, 201, 213, 0.72)';
    context.lineWidth = 3;
    for (let column = 1; column < columns; column += 3) {
      context.beginPath();
      context.moveTo(column * cellW, 0);
      context.lineTo(column * cellW, height);
      context.stroke();
    }

    // Uneven dust veil.
    for (let i = 0; i < 150; i += 1) {
      const alpha = random() * 0.035;
      context.fillStyle = `rgba(190, 170, 130, ${alpha})`;
      context.beginPath();
      context.arc(random() * width, random() * height, 2 + random() * 18, 0, Math.PI * 2);
      context.fill();
    }
  });
}

function createGroundScarTexture(seed: number): THREE.CanvasTexture {
  const random = createSeededRandom(seed + 91.2);
  const texture = createCanvasTexture(512, 512, (context, width, height) => {
    context.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;

    const shadow = context.createRadialGradient(cx, cy, width * 0.06, cx, cy, width * 0.48);
    shadow.addColorStop(0, 'rgba(18, 16, 13, 0.68)');
    shadow.addColorStop(0.3, 'rgba(28, 24, 18, 0.46)');
    shadow.addColorStop(0.72, 'rgba(70, 55, 38, 0.2)');
    shadow.addColorStop(1, 'rgba(85, 65, 42, 0)');
    context.fillStyle = shadow;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate(cx, cy);
    for (let i = 0; i < 26; i += 1) {
      const angle = (i / 26) * Math.PI * 2 + (random() - 0.5) * 0.09;
      const inner = width * (0.17 + random() * 0.04);
      const outer = width * (0.36 + random() * 0.1);
      context.strokeStyle = `rgba(110, 86, 55, ${0.035 + random() * 0.055})`;
      context.lineWidth = 1 + random() * 3;
      context.beginPath();
      context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      context.stroke();
    }
    context.restore();
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function createLabelTexture(): THREE.CanvasTexture {
  return createCanvasTexture(512, 128, (context, width, height) => {
    context.clearRect(0, 0, width, height);
    context.fillStyle = 'rgba(20, 27, 30, 0.88)';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = 'rgba(139, 178, 184, 0.85)';
    context.lineWidth = 5;
    context.strokeRect(6, 6, width - 12, height - 12);
    context.fillStyle = '#d9e5e7';
    context.font = '700 52px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('NEREIDA-01', width / 2, height * 0.48);
    context.fillStyle = '#6dd1c2';
    context.font = '600 20px Arial, sans-serif';
    context.fillText('HABITAT · E-01', width / 2, height * 0.78);
  });
}

function createPressureHullGeometry(seed: number): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(3.72, 3.92, 4.35, 32, 7, false);
  const positions = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();

  for (let i = 0; i < positions.count; i += 1) {
    vertex.fromBufferAttribute(positions, i);
    const angle = Math.atan2(vertex.z, vertex.x);
    const heightT = THREE.MathUtils.clamp((vertex.y + 2.175) / 4.35, 0, 1);
    const panelFacet = Math.cos(angle * 12 + 0.22) * 0.035;
    const broadShape = Math.sin(angle * 3 + seed * 0.01) * 0.035;
    const beltInset = Math.exp(-Math.pow((heightT - 0.48) * 8, 2)) * -0.06;
    const topShoulder = THREE.MathUtils.smoothstep(heightT, 0.72, 1) * -0.08;
    const lowerWeight = (1 - heightT) * 0.08;
    const radius = Math.hypot(vertex.x, vertex.z);
    const newRadius = radius + panelFacet + broadShape + beltInset + topShoulder + lowerWeight;
    const ratio = newRadius / Math.max(radius, 0.0001);
    vertex.x *= ratio;
    vertex.z *= ratio;

    // Very slight manufactured asymmetry, kept subtle.
    vertex.x += (hash3(Math.round(vertex.x * 2), Math.round(vertex.y * 2), Math.round(vertex.z * 2), seed) - 0.5) * 0.025;
    positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createDomeGeometry(seed: number): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(3.72, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const positions = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();

  for (let i = 0; i < positions.count; i += 1) {
    vertex.fromBufferAttribute(positions, i);
    const angle = Math.atan2(vertex.z, vertex.x);
    const radial = Math.hypot(vertex.x, vertex.z);
    const heightT = THREE.MathUtils.clamp(vertex.y / 3.72, 0, 1);
    const structuralFacet = Math.cos(angle * 10 + seed * 0.02) * 0.028 * (1 - heightT * 0.65);
    const ratio = (radial + structuralFacet) / Math.max(radial, 0.0001);
    vertex.x *= ratio;
    vertex.z *= ratio;
    vertex.y *= 0.92 + heightT * 0.03;
    positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createBeaconMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color(0x73efb8) }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPosition;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPosition;
      void main() {
        float vertical = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.68, 1.0, vUv.y));
        float fresnel = pow(1.0 - abs(dot(normalize(vNormalView), normalize(vViewPosition))), 1.8);
        float pulse = 0.72 + sin(vUv.y * 34.0 - uTime * 4.2) * 0.12;
        float core = 0.35 + fresnel * 0.9;
        float alpha = vertical * pulse * core * uOpacity;
        if (alpha < 0.006) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `
  });
}

type LandingLeg = {
  pivot: THREE.Group;
  lower: THREE.Group;
  piston: THREE.Mesh;
  foot: THREE.Group;
  angle: number;
  phase: number;
};

type SolarWing = {
  rootPivot: THREE.Group;
  outerPivot: THREE.Group;
  sign: number;
  lockLight: THREE.MeshStandardMaterial;
};

/**
 * Habitat Module Nereida-01: premium authored visual pass while preserving the
 * existing deployment and activation API. The module remains procedural and
 * efficient, but now reads as a manufactured, weathered, pressure-rated first
 * shelter rather than a stack of simple primitives.
 */
export class ColonyModule {
  readonly group = new THREE.Group();
  deployed = false;
  deploymentProgress = 0;

  private readonly seed: number;
  private readonly random: () => number;

  private readonly hullMaterial: THREE.MeshStandardMaterial;
  private readonly darkMetalMaterial: THREE.MeshStandardMaterial;
  private readonly trimMaterial: THREE.MeshStandardMaterial;
  private readonly solarMaterial: THREE.MeshStandardMaterial;
  private readonly glassMaterial: THREE.MeshStandardMaterial;
  private readonly statusLightMaterial: THREE.MeshStandardMaterial;
  private readonly accessStatusMaterial: THREE.MeshStandardMaterial;
  private readonly oxygenStatusMaterial: THREE.MeshStandardMaterial;
  private readonly emissiveStripMaterial: THREE.MeshStandardMaterial;
  private readonly beaconLight: THREE.PointLight;
  private readonly beaconBeamMaterial: THREE.ShaderMaterial;
  private readonly beaconBeam: THREE.Mesh;

  private readonly legs: LandingLeg[] = [];
  private readonly solarWings: SolarWing[] = [];
  private readonly mast: THREE.Group;
  private readonly mastSegments: THREE.Mesh[] = [];
  private readonly body: THREE.Group;
  private readonly groundContact: THREE.Group;
  private readonly infrastructure: NereidaBaseInfrastructure;
  private readonly impactScarMaterial: THREE.MeshBasicMaterial;
  private readonly accessDoor: THREE.Group;
  private readonly entryRamp: THREE.Group;

  private readonly staticDrawCallsSaved: number;

  private readonly coarseDust: THREE.Points;
  private readonly coarseDustMaterial: THREE.PointsMaterial;
  private readonly coarseDustVelocities: Float32Array;
  private readonly fineDust: THREE.Points;
  private readonly fineDustMaterial: THREE.PointsMaterial;
  private readonly fineDustVelocities: Float32Array;
  private coarseDustLife = 0;
  private fineDustLife = 0;
  private dustStartedAt = -1;
  private impactStartedAt = -1;

  private settleY = 0;
  private deploymentStartedAt = -1;
  private activationStartedAt = -1;
  private activationElapsed = 0;
  private activationComplete = false;
  private onlineAnnouncementPending = false;

  constructor(seed = 410.7) {
    this.seed = seed;
    this.random = createSeededRandom(seed);

    this.group.name = habitatModuleNereida01.name;
    this.group.visible = false;

    const hullAlbedo = createHullAlbedoTexture(seed);
    const hullRoughness = createHullRoughnessTexture(seed);
    const hullBump = createHullBumpTexture(seed);
    const solarTexture = createSolarTexture(seed);

    this.hullMaterial = new THREE.MeshStandardMaterial({
      color: 0xe0e5e6,
      map: hullAlbedo,
      roughnessMap: hullRoughness,
      bumpMap: hullBump,
      bumpScale: 0.045,
      roughness: 0.58,
      metalness: 0.26
    });

    this.darkMetalMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d353a,
      roughness: 0.6,
      metalness: 0.76
    });

    this.trimMaterial = new THREE.MeshStandardMaterial({
      color: 0x68747a,
      roughness: 0.42,
      metalness: 0.82
    });

    this.solarMaterial = new THREE.MeshStandardMaterial({
      map: solarTexture,
      roughness: 0.27,
      metalness: 0.72,
      emissive: 0x061728,
      emissiveIntensity: 0.14
    });

    this.glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x0c2530,
      emissive: 0x123e48,
      emissiveIntensity: 0.13,
      roughness: 0.12,
      metalness: 0.55,
      transparent: true,
      opacity: 0.86
    });

    this.statusLightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xff9100,
      emissiveIntensity: 1.6,
      roughness: 0.18,
      metalness: 0.05
    });

    this.accessStatusMaterial = new THREE.MeshStandardMaterial({
      color: ACCESS_WARNING_COLOR.clone(),
      emissive: ACCESS_WARNING_COLOR.clone(),
      emissiveIntensity: 0.18,
      roughness: 0.2,
      metalness: 0.05
    });

    this.emissiveStripMaterial = new THREE.MeshStandardMaterial({
      color: 0x203038,
      emissive: 0x35b8d8,
      emissiveIntensity: 0,
      roughness: 0.38,
      metalness: 0.28
    });

    this.oxygenStatusMaterial = new THREE.MeshStandardMaterial({
      color: 0x40251b,
      emissive: 0xff6a32,
      emissiveIntensity: 0.08,
      roughness: 0.35,
      metalness: 0.2
    });

    // Terrain integration remains grounded while the deployed body descends.
    this.groundContact = new THREE.Group();
    this.groundContact.name = 'Nereida Ground Contact';
    this.group.add(this.groundContact);

    const impactScar = new THREE.Mesh(
      new THREE.PlaneGeometry(15.5, 15.5),
      new THREE.MeshBasicMaterial({
        map: createGroundScarTexture(seed),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      })
    );
    this.impactScarMaterial = impactScar.material as THREE.MeshBasicMaterial;
    impactScar.rotation.x = -Math.PI / 2;
    impactScar.position.y = 0.018;
    this.groundContact.add(impactScar);

    // Low-cost displaced stones around the touchdown footprint.
    const debrisGeometry = new THREE.IcosahedronGeometry(0.22, 1);
    const debrisMaterial = new THREE.MeshStandardMaterial({
      color: 0x6d6254,
      roughness: 0.94,
      metalness: 0.02
    });
    const debris = new THREE.InstancedMesh(debrisGeometry, debrisMaterial, 22);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    for (let i = 0; i < 22; i += 1) {
      const angle = this.random() * Math.PI * 2;
      const radius = 5.7 + Math.pow(this.random(), 0.7) * 2.2;
      position.set(Math.cos(angle) * radius, 0.08, Math.sin(angle) * radius);
      euler.set(this.random() * 0.6, this.random() * Math.PI * 2, this.random() * 0.6);
      quaternion.setFromEuler(euler);
      const baseScale = 0.45 + Math.pow(this.random(), 2) * 1.25;
      scale.set(baseScale * (0.75 + this.random() * 0.55), baseScale * (0.45 + this.random() * 0.45), baseScale);
      matrix.compose(position, quaternion, scale);
      debris.setMatrixAt(i, matrix);
    }
    debris.instanceMatrix.needsUpdate = true;
    debris.castShadow = true;
    debris.receiveShadow = true;
    debris.visible = false;
    this.groundContact.add(debris);

    // Body: everything that drops and settles as one authored structure.
    this.body = new THREE.Group();
    this.body.name = 'Nereida Habitat Body';
    this.group.add(this.body);

    this.infrastructure = new NereidaBaseInfrastructure();
    this.body.add(this.infrastructure.group);

    const underbody = new THREE.Mesh(new THREE.CylinderGeometry(4.65, 5.25, 0.46, 24), this.darkMetalMaterial);
    underbody.position.y = 0.3;
    this.configureSolidMesh(underbody);
    this.body.add(underbody);

    const basePad = new THREE.Mesh(new THREE.CylinderGeometry(5.05, 5.62, 0.72, 24), this.trimMaterial);
    basePad.position.y = 0.72;
    this.configureSolidMesh(basePad);
    this.body.add(basePad);

    const pressureRingLower = new THREE.Mesh(new THREE.TorusGeometry(4.04, 0.16, 8, 48), this.darkMetalMaterial);
    pressureRingLower.rotation.x = Math.PI / 2;
    pressureRingLower.position.y = 1.18;
    this.configureSolidMesh(pressureRingLower);
    this.body.add(pressureRingLower);

    const coreHab = new THREE.Mesh(createPressureHullGeometry(seed), this.hullMaterial);
    coreHab.position.y = 3.18;
    this.configureSolidMesh(coreHab);
    this.body.add(coreHab);

    // Structural ribs around the pressure drum, instanced to retain performance.
    const ribGeometry = new THREE.BoxGeometry(0.13, 3.75, 0.22);
    const ribs = new THREE.InstancedMesh(ribGeometry, this.trimMaterial, 12);
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2;
      position.set(Math.cos(angle) * 3.86, 3.18, Math.sin(angle) * 3.86);
      euler.set(0, -angle + Math.PI / 2, 0);
      quaternion.setFromEuler(euler);
      matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
      ribs.setMatrixAt(i, matrix);
    }
    ribs.instanceMatrix.needsUpdate = true;
    ribs.castShadow = true;
    ribs.receiveShadow = true;
    this.body.add(ribs);

    // Horizontal pressure belts and inset light strip.
    for (const [y, radius, thickness] of [
      [1.32, 3.93, 0.13],
      [3.5, 3.82, 0.14],
      [5.08, 3.74, 0.12]
    ] as [number, number, number][]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 8, 48), this.darkMetalMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      this.configureSolidMesh(ring);
      this.body.add(ring);
    }

    const strip = new THREE.Mesh(new THREE.CylinderGeometry(3.79, 3.79, 0.22, 32, 1, true), this.emissiveStripMaterial);
    strip.position.y = 3.54;
    strip.castShadow = false;
    strip.receiveShadow = false;
    this.body.add(strip);

    // Dome with inset crown and radial structure.
    const dome = new THREE.Mesh(createDomeGeometry(seed), this.hullMaterial);
    dome.position.y = 5.36;
    this.configureSolidMesh(dome);
    this.body.add(dome);

    const domeCollar = new THREE.Mesh(new THREE.TorusGeometry(3.72, 0.18, 8, 48), this.darkMetalMaterial);
    domeCollar.rotation.x = Math.PI / 2;
    domeCollar.position.y = 5.38;
    this.configureSolidMesh(domeCollar);
    this.body.add(domeCollar);

    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1.08, 0.32, 16), this.trimMaterial);
    crown.position.y = 8.75;
    this.configureSolidMesh(crown);
    this.body.add(crown);

    // Reinforced observation ports, deliberately sparse.
    for (const angle of [-1.03, -0.36, 0.36, 1.03]) {
      const windowGroup = new THREE.Group();
      const radius = 3.8;
      windowGroup.position.set(Math.sin(angle) * radius, 4.26, Math.cos(angle) * radius);
      windowGroup.rotation.y = angle;

      const frame = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.08, 8, 24), this.darkMetalMaterial);
      windowGroup.add(frame);

      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.46, 24), this.glassMaterial);
      glass.position.z = 0.005;
      windowGroup.add(glass);
      this.body.add(windowGroup);
    }

    // Main pressure airlock: clear focal point and gameplay-readable entrance.
    this.accessDoor = new THREE.Group();
    this.accessDoor.name = 'Nereida Main Airlock';
    this.accessDoor.position.set(0, 2.58, 3.88);

    const doorHousing = new THREE.Mesh(new THREE.BoxGeometry(3.15, 3.25, 0.62), this.darkMetalMaterial);
    doorHousing.position.z = 0.05;
    this.configureSolidMesh(doorHousing);
    this.accessDoor.add(doorHousing);

    const doorFrame = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.16, 10, 40), this.trimMaterial);
    doorFrame.position.z = 0.38;
    this.configureSolidMesh(doorFrame);
    this.accessDoor.add(doorFrame);

    const door = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.22, 32), this.hullMaterial);
    door.rotation.x = Math.PI / 2;
    door.position.z = 0.45;
    this.configureSolidMesh(door);
    this.accessDoor.add(door);

    const doorHub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.28, 12), this.darkMetalMaterial);
    doorHub.rotation.x = Math.PI / 2;
    doorHub.position.z = 0.61;
    this.configureSolidMesh(doorHub);
    this.accessDoor.add(doorHub);

    for (let i = 0; i < 6; i += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.88, 0.06), this.trimMaterial);
      bar.rotation.z = (i / 6) * Math.PI;
      bar.position.z = 0.62;
      this.accessDoor.add(bar);
    }

    const accessPanel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.72, 0.18), this.darkMetalMaterial);
    accessPanel.position.set(1.45, 0.2, 0.45);
    this.configureSolidMesh(accessPanel);
    this.accessDoor.add(accessPanel);

    const accessLight = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.05), this.accessStatusMaterial);
    accessLight.position.set(1.45, 0.45, 0.57);
    this.accessDoor.add(accessLight);

    const porchLight = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.08), this.emissiveStripMaterial);
    porchLight.position.set(0, 1.76, 0.48);
    this.accessDoor.add(porchLight);
    this.body.add(this.accessDoor);

    // Entry ramp and steps deploy with the module.
    this.entryRamp = new THREE.Group();
    this.entryRamp.position.set(0, 0.95, 4.96);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.18, 2.4), this.darkMetalMaterial);
    ramp.rotation.x = -0.18;
    this.configureSolidMesh(ramp);
    this.entryRamp.add(ramp);
    for (let i = 0; i < 5; i += 1) {
      const tread = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.08, 0.12), this.trimMaterial);
      tread.position.set(0, 0.15 - i * 0.06, -0.92 + i * 0.43);
      this.entryRamp.add(tread);
    }
    this.body.add(this.entryRamp);

    // Signage plate on the front quarter.
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 0.62),
      new THREE.MeshBasicMaterial({
        map: createLabelTexture(),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1
      })
    );
    label.position.set(-2.38, 4.45, 3.03);
    label.rotation.y = -0.67;
    this.body.add(label);

    // Oxygen processor: layered housing, fans, ducts and curved supply line.
    const oxygenGroup = new THREE.Group();
    oxygenGroup.name = 'Nereida Oxygen Processor';
    oxygenGroup.position.set(3.55, 2.25, 1.78);
    oxygenGroup.rotation.y = 0.18;

    const oxyHousing = new THREE.Mesh(new THREE.BoxGeometry(1.95, 2.05, 1.45), this.darkMetalMaterial);
    this.configureSolidMesh(oxyHousing);
    oxygenGroup.add(oxyHousing);

    const oxyPanel = new THREE.Mesh(new THREE.BoxGeometry(1.72, 1.68, 0.1), this.trimMaterial);
    oxyPanel.position.z = 0.78;
    this.configureSolidMesh(oxyPanel);
    oxygenGroup.add(oxyPanel);

    for (let i = 0; i < 3; i += 1) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.12, 0.08), this.hullMaterial);
      vent.position.set(0, -0.52 + i * 0.47, 0.86);
      oxygenGroup.add(vent);
    }

    for (const x of [-0.5, 0.5]) {
      const fanFrame = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 7, 20), this.darkMetalMaterial);
      fanFrame.position.set(x, 0.62, 0.87);
      oxygenGroup.add(fanFrame);
      const fan = new THREE.Mesh(new THREE.CircleGeometry(0.23, 18), this.glassMaterial);
      fan.position.set(x, 0.62, 0.89);
      oxygenGroup.add(fan);
    }

    const oxygenStatus = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), this.oxygenStatusMaterial);
    oxygenStatus.position.set(0.72, 0.82, 0.88);
    oxygenGroup.add(oxygenStatus);
    this.body.add(oxygenGroup);

    const cablePath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(4.1, 2.0, 2.5),
      new THREE.Vector3(4.7, 1.55, 2.7),
      new THREE.Vector3(5.0, 0.85, 2.86),
      new THREE.Vector3(5.15, 0.22, 3.05)
    ]);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(cablePath, 18, 0.085, 7, false), this.darkMetalMaterial);
    this.configureSolidMesh(cable);
    this.body.add(cable);

    // Landing legs: telescopic struts, visible pistons and broad anchored feet.
    for (let i = 0; i < 4; i += 1) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(angle) * 3.65, 1.65, Math.sin(angle) * 3.65);
      pivot.rotation.y = -angle;

      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.74, 12), this.darkMetalMaterial);
      hinge.rotation.z = Math.PI / 2;
      this.configureSolidMesh(hinge);
      pivot.add(hinge);

      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.56, 2.35, 0.62), this.trimMaterial);
      upper.position.set(0.72, -0.85, 0);
      upper.rotation.z = -0.42;
      this.configureSolidMesh(upper);
      pivot.add(upper);

      const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.05, 10), this.darkMetalMaterial);
      piston.position.set(0.98, -1.05, 0.34);
      piston.rotation.z = -0.42;
      this.configureSolidMesh(piston);
      pivot.add(piston);

      const lower = new THREE.Group();
      lower.position.set(1.55, -1.65, 0);
      const lowerStrut = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.62, 0.5), this.darkMetalMaterial);
      lowerStrut.rotation.z = -0.18;
      this.configureSolidMesh(lowerStrut);
      lower.add(lowerStrut);

      const foot = new THREE.Group();
      foot.position.set(0.2, -0.95, 0);
      const footPad = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 1.14, 0.3, 12), this.darkMetalMaterial);
      this.configureSolidMesh(footPad);
      foot.add(footPad);
      for (let claw = 0; claw < 4; claw += 1) {
        const clawAngle = (claw / 4) * Math.PI * 2;
        const anchor = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.46, 6), this.trimMaterial);
        anchor.position.set(Math.cos(clawAngle) * 0.75, -0.3, Math.sin(clawAngle) * 0.75);
        anchor.rotation.z = Math.PI;
        foot.add(anchor);
      }
      lower.add(foot);
      pivot.add(lower);
      this.body.add(pivot);
      this.legs.push({ pivot, lower, piston, foot, angle, phase: this.random() * Math.PI * 2 });
    }

    // Solar wings: framed, segmented arrays with delayed outer-panel deployment.
    for (const sign of [-1, 1]) {
      const rootPivot = new THREE.Group();
      rootPivot.position.set(sign * 3.62, 4.24, -0.15);

      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.68, 12), this.darkMetalMaterial);
      hinge.rotation.z = Math.PI / 2;
      rootPivot.add(hinge);

      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.26, 0.36), this.trimMaterial);
      arm.position.x = sign * 0.88;
      this.configureSolidMesh(arm);
      rootPivot.add(arm);

      const rootPanel = this.createSolarPanelAssembly(3.0, 2.25);
      rootPanel.position.x = sign * 2.62;
      rootPivot.add(rootPanel);

      const outerPivot = new THREE.Group();
      outerPivot.position.x = sign * 4.15;
      const outerPanel = this.createSolarPanelAssembly(2.8, 2.25);
      outerPanel.position.x = sign * 1.45;
      outerPivot.add(outerPanel);
      rootPivot.add(outerPivot);

      const lockLight = new THREE.MeshStandardMaterial({
        color: 0x6b3c1f,
        emissive: 0xff7a25,
        emissiveIntensity: 0.05,
        roughness: 0.2,
        metalness: 0.1
      });
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.12), lockLight);
      lock.position.set(sign * 1.55, 0.18, 0.24);
      rootPivot.add(lock);

      this.body.add(rootPivot);
      this.solarWings.push({ rootPivot, outerPivot, sign, lockLight });
    }

    // Telescopic mast with dish and protected beacon.
    this.mast = new THREE.Group();
    this.mast.name = 'Nereida Communications Mast';
    this.mast.position.y = 8.55;

    const mastBase = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.68, 0.4, 14), this.darkMetalMaterial);
    this.configureSolidMesh(mastBase);
    this.mast.add(mastBase);

    const mastSpecs: [number, number, number][] = [
      [0.19, 0.25, 1.45],
      [0.14, 0.19, 1.35],
      [0.09, 0.14, 1.2]
    ];
    let mastY = 0.44;
    for (const [topRadius, bottomRadius, height] of mastSpecs) {
      const segment = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, bottomRadius, height, 10), this.trimMaterial);
      segment.position.y = mastY + height / 2;
      this.configureSolidMesh(segment);
      this.mast.add(segment);
      this.mastSegments.push(segment);
      mastY += height * 0.83;
    }

    const dishSupport = new THREE.Group();
    dishSupport.position.y = 3.78;
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.72, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      this.hullMaterial
    );
    dish.scale.y = 0.24;
    dish.rotation.z = -0.38;
    this.configureSolidMesh(dish);
    dishSupport.add(dish);
    const dishReceiver = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.62, 8), this.darkMetalMaterial);
    dishReceiver.rotation.z = -0.38;
    dishReceiver.position.set(0.18, 0.18, 0);
    dishSupport.add(dishReceiver);
    this.mast.add(dishSupport);

    const beaconCage = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.48, 10, 1, true), this.darkMetalMaterial);
    beaconCage.position.y = 4.35;
    this.mast.add(beaconCage);

    const statusLight = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), this.statusLightMaterial);
    statusLight.position.y = 4.35;
    this.mast.add(statusLight);
    this.body.add(this.mast);

    this.beaconLight = new THREE.PointLight(0xffaa00, 0, 45, 1.8);
    this.beaconLight.position.set(0, 13.0, 0);
    this.group.add(this.beaconLight);

    this.beaconBeamMaterial = createBeaconMaterial();
    this.beaconBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 1.25, 34, 24, 1, true),
      this.beaconBeamMaterial
    );
    this.beaconBeam.name = 'Nereida Habitat Beacon';
    this.beaconBeam.position.y = 27.5;
    this.beaconBeam.visible = false;
    this.group.add(this.beaconBeam);

    // Touchdown dust: coarse ballistic particles and persistent fine haze.
    const coarseCount = 54;
    const coarsePositions = new Float32Array(coarseCount * 3);
    this.coarseDustVelocities = new Float32Array(coarseCount * 3);
    const coarseGeometry = new THREE.BufferGeometry();
    coarseGeometry.setAttribute('position', new THREE.BufferAttribute(coarsePositions, 3));
    this.coarseDustMaterial = new THREE.PointsMaterial({
      color: 0xa79070,
      size: 1.45,
      map: createSoftParticleTexture(48),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true
    });
    this.coarseDust = new THREE.Points(coarseGeometry, this.coarseDustMaterial);
    this.coarseDust.frustumCulled = false;
    this.group.add(this.coarseDust);

    const fineCount = 84;
    const finePositions = new Float32Array(fineCount * 3);
    this.fineDustVelocities = new Float32Array(fineCount * 3);
    const fineGeometry = new THREE.BufferGeometry();
    fineGeometry.setAttribute('position', new THREE.BufferAttribute(finePositions, 3));
    this.fineDustMaterial = new THREE.PointsMaterial({
      color: 0xb8a487,
      size: 2.85,
      map: createSoftParticleTexture(64),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true
    });
    this.fineDust = new THREE.Points(fineGeometry, this.fineDustMaterial);
    this.fineDust.frustumCulled = false;
    this.group.add(this.fineDust);

    // Batch only the compact, immutable habitat shell. Articulated landing
    // gear, solar wings, mast, airlock and the independently culled Base
    // infrastructure remain separate roots with their original lifecycle.
    this.infrastructure.group.userData.dynamic = true;
    this.accessDoor.userData.noMerge = true;
    this.entryRamp.userData.dynamic = true;
    this.mast.userData.dynamic = true;
    for (const leg of this.legs) leg.pivot.userData.dynamic = true;
    for (const wing of this.solarWings) wing.rootPivot.userData.dynamic = true;
    freezeStaticChildren(this.body);
    this.staticDrawCallsSaved = mergeStaticDecoration(this.body, 'Nereida Habitat Static');

    this.setStagePose(0);
  }

  deployAt(position: THREE.Vector3): void {
    if (this.deployed) return;
    this.group.position.copy(position);
    this.group.visible = true;
    this.deploymentProgress = 0.01;
    this.settleY = 7;
    this.deploymentStartedAt = -1;
    this.activationStartedAt = -1;
    this.activationElapsed = 0;
    this.activationComplete = false;
    this.onlineAnnouncementPending = false;
    this.impactStartedAt = -1;
    this.coarseDustLife = 0;
    this.fineDustLife = 0;
    this.impactScarMaterial.opacity = 0;
    for (const child of this.groundContact.children) {
      if (child instanceof THREE.InstancedMesh) child.visible = false;
    }
    this.setStagePose(0);
  }

  setOnline(elapsed = -1): void {
    this.deployed = true;
    this.deploymentProgress = 1.0;
    this.setStagePose(1);
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.statusLightMaterial.color.setHex(0xffaa00);
    this.statusLightMaterial.emissive.setHex(0xff9100);
    this.statusLightMaterial.emissiveIntensity = 0.25;
    this.accessStatusMaterial.color.copy(ACCESS_WARNING_COLOR);
    this.accessStatusMaterial.emissive.copy(ACCESS_WARNING_COLOR);
    this.accessStatusMaterial.emissiveIntensity = 0.14;
    this.oxygenStatusMaterial.color.setHex(0x40251b);
    this.oxygenStatusMaterial.emissive.setHex(0xff6a32);
    this.oxygenStatusMaterial.emissiveIntensity = 0.08;
    this.beaconLight.color.setHex(0xffaa00);
    this.beaconLight.intensity = 0.1;
    this.beaconBeamMaterial.uniforms.uOpacity.value = 0;
    this.beaconBeam.visible = false;
    this.emissiveStripMaterial.emissiveIntensity = 0.08;
    this.activationStartedAt = elapsed;
    this.activationElapsed = 0.001;
    this.activationComplete = false;
    this.onlineAnnouncementPending = false;
  }

  get activationStage(): 'offline' | 'deploying' | 'power' | 'antenna' | 'oxygen' | 'beacon' | 'online' {
    if (!this.group.visible) return 'offline';
    if (!this.deployed) return 'deploying';
    if (this.activationComplete) return 'online';
    if (this.activationElapsed < 0.8) return 'power';
    if (this.activationElapsed < 1.55) return 'antenna';
    if (this.activationElapsed < 2.45) return 'oxygen';
    return 'beacon';
  }

  get activationInProgress(): boolean {
    return this.group.visible && !this.activationComplete;
  }

  get activeParticleCount(): number {
    let count = 0;
    if (this.coarseDustLife > 0) count += 54;
    if (this.fineDustLife > 0) count += 84;
    return count;
  }

  setDetailProfile(profile: NereidaBaseDetailProfile): void {
    this.infrastructure.setDetailProfile(profile);
  }

  setInfrastructureDiagnosticVisible(visible: boolean): void {
    this.infrastructure.setDiagnosticVisible(visible);
  }

  getInfrastructureDiagnostics(): NereidaBaseInfrastructureDiagnostics {
    return this.infrastructure.getDiagnostics();
  }

  get habitatStaticDrawCallsSaved(): number {
    return this.staticDrawCallsSaved;
  }

  consumeOnlineAnnouncement(): boolean {
    if (!this.onlineAnnouncementPending) return false;
    this.onlineAnnouncementPending = false;
    return true;
  }

  /** Pose every articulated part for a 0..1 deployment progress value. */
  private setStagePose(progress: number): void {
    // Landing legs deploy and compress before the body reaches full weight.
    const legDeployT = THREE.MathUtils.smoothstep(progress, 0.03, 0.24);
    for (const leg of this.legs) {
      leg.pivot.rotation.z = -0.68 * (1 - legDeployT);
      leg.lower.position.y = -0.35 - legDeployT * 1.3;
      leg.piston.scale.y = 0.55 + legDeployT * 0.45;
      leg.foot.rotation.z = (1 - legDeployT) * 0.2;
    }

    // Root solar arrays unlock, then the outer panels follow with a slight mechanical overshoot.
    const wingRootRaw = THREE.MathUtils.smoothstep(progress, 0.31, 0.61);
    const wingOuterRaw = THREE.MathUtils.smoothstep(progress, 0.51, 0.76);
    const wingRootT = THREE.MathUtils.clamp(easeOutBack(wingRootRaw, 0.55), 0, 1.035);
    const wingOuterT = THREE.MathUtils.clamp(easeOutBack(wingOuterRaw, 0.45), 0, 1.03);
    for (const wing of this.solarWings) {
      wing.rootPivot.rotation.z = wing.sign * (Math.PI / 2) * (1 - wingRootT);
      wing.outerPivot.rotation.z = wing.sign * (Math.PI / 2) * (1 - wingOuterT);
      wing.lockLight.emissiveIntensity = progress > 0.75 ? 0.55 : progress > 0.3 ? 0.18 : 0.04;
      if (progress > 0.75) {
        wing.lockLight.color.setHex(0x4f9d79);
        wing.lockLight.emissive.setHex(0x4be09f);
      }
    }

    // Ramp lowers after touchdown and before the habitat is fully active.
    const rampT = THREE.MathUtils.smoothstep(progress, 0.24, 0.48);
    this.entryRamp.rotation.x = -1.08 * (1 - rampT);
    this.entryRamp.position.y = 1.45 - rampT * 0.5;

    // Telescopic mast extends in three sequential stages.
    const mastT = THREE.MathUtils.smoothstep(progress, 0.62, 0.92);
    for (let i = 0; i < this.mastSegments.length; i += 1) {
      const segmentT = THREE.MathUtils.smoothstep(mastT, i * 0.22, 0.42 + i * 0.22);
      this.mastSegments[i].scale.y = 0.08 + segmentT * 0.92;
    }
    this.mast.scale.y = 0.38 + mastT * 0.62;
  }

  private fireDustBurst(elapsed: number): void {
    this.coarseDustLife = 1;
    this.fineDustLife = 1;
    this.dustStartedAt = elapsed;
    this.impactStartedAt = elapsed;
    this.impactScarMaterial.opacity = 0.58;

    for (const child of this.groundContact.children) {
      if (child instanceof THREE.InstancedMesh) child.visible = true;
    }

    const coarsePositions = this.coarseDust.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < coarsePositions.count; i += 1) {
      const angle = this.random() * Math.PI * 2;
      const radius = 3.7 + this.random() * 1.8;
      coarsePositions.setXYZ(i, Math.cos(angle) * radius, 0.28 + this.random() * 0.22, Math.sin(angle) * radius);
      const speed = 5.8 + this.random() * 10.5;
      this.coarseDustVelocities[i * 3] = Math.cos(angle) * speed;
      this.coarseDustVelocities[i * 3 + 1] = 0.8 + this.random() * 2.3;
      this.coarseDustVelocities[i * 3 + 2] = Math.sin(angle) * speed;
    }
    coarsePositions.needsUpdate = true;

    const finePositions = this.fineDust.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < finePositions.count; i += 1) {
      const angle = this.random() * Math.PI * 2;
      const radius = 2.8 + this.random() * 2.6;
      finePositions.setXYZ(i, Math.cos(angle) * radius, 0.22 + this.random() * 0.5, Math.sin(angle) * radius);
      const speed = 1.4 + this.random() * 4.8;
      this.fineDustVelocities[i * 3] = Math.cos(angle) * speed + 0.35;
      this.fineDustVelocities[i * 3 + 1] = 0.22 + this.random() * 1.1;
      this.fineDustVelocities[i * 3 + 2] = Math.sin(angle) * speed - 0.12;
    }
    finePositions.needsUpdate = true;
  }

  update(delta: number, elapsed: number, observerPosition?: THREE.Vector3): void {
    if (!this.group.visible) return;

    this.infrastructure.update(elapsed, observerPosition, this.group.position);

    if (this.deploymentProgress > 0 && this.deploymentProgress < 1.0) {
      const previous = this.deploymentProgress;
      if (this.deploymentStartedAt < 0) this.deploymentStartedAt = elapsed;
      this.deploymentProgress = Math.min(1.0, 0.01 + (elapsed - this.deploymentStartedAt) * 0.31);

      // Heavy final descent with a controlled flare and damped touchdown.
      const dropT = THREE.MathUtils.smoothstep(this.deploymentProgress, 0, 0.28);
      const descent = this.settleY * (1 - dropT);
      this.body.position.y = descent;
      this.body.rotation.x = Math.sin(dropT * Math.PI) * 0.018;
      this.body.rotation.z = Math.sin(dropT * Math.PI * 1.25) * 0.012;

      if (previous < 0.28 && this.deploymentProgress >= 0.28) {
        this.fireDustBurst(elapsed);
      }

      this.setStagePose(this.deploymentProgress);

      if (this.impactStartedAt >= 0) {
        const impactAge = elapsed - this.impactStartedAt;
        const impactEnvelope = Math.exp(-impactAge * 5.2);
        const compression = Math.sin(impactAge * 18) * impactEnvelope;
        this.body.position.y += compression * 0.12;
        this.body.rotation.z += Math.sin(impactAge * 14.7) * impactEnvelope * 0.006;
        for (const leg of this.legs) {
          leg.lower.position.y -= Math.max(0, compression) * 0.08;
          leg.foot.rotation.x = Math.sin(impactAge * 11 + leg.phase) * impactEnvelope * 0.018;
        }
      }
      this.emissiveStripMaterial.emissiveIntensity = this.deploymentProgress * 0.62;
      this.accessStatusMaterial.emissiveIntensity = 0.08 + this.deploymentProgress * 0.24;

      if (this.deploymentProgress >= 1.0) {
        this.setOnline(elapsed);
      }
    }

    // Coarse dust: fast, low, ballistic and short lived.
    if (this.coarseDustLife > 0) {
      this.coarseDustLife = Math.max(0, 1 - (elapsed - this.dustStartedAt) / 1.35);
      const positions = this.coarseDust.geometry.getAttribute('position') as THREE.BufferAttribute;
      const array = positions.array as Float32Array;
      for (let i = 0; i < array.length; i += 3) {
        this.coarseDustVelocities[i] *= Math.pow(0.28, delta);
        this.coarseDustVelocities[i + 2] *= Math.pow(0.28, delta);
        this.coarseDustVelocities[i + 1] -= 5.2 * delta;
        array[i] += this.coarseDustVelocities[i] * delta;
        array[i + 1] = Math.max(0.08, array[i + 1] + this.coarseDustVelocities[i + 1] * delta);
        array[i + 2] += this.coarseDustVelocities[i + 2] * delta;
      }
      positions.needsUpdate = true;
      this.coarseDustMaterial.opacity = this.coarseDustLife * 0.56;
    }

    // Fine dust: slower atmospheric veil with mild directional drift.
    if (this.fineDustLife > 0) {
      this.fineDustLife = Math.max(0, 1 - (elapsed - this.dustStartedAt) / 3.8);
      const positions = this.fineDust.geometry.getAttribute('position') as THREE.BufferAttribute;
      const array = positions.array as Float32Array;
      for (let i = 0; i < array.length; i += 3) {
        this.fineDustVelocities[i] *= Math.pow(0.74, delta);
        this.fineDustVelocities[i + 2] *= Math.pow(0.74, delta);
        this.fineDustVelocities[i + 1] -= 0.55 * delta;
        array[i] += this.fineDustVelocities[i] * delta;
        array[i + 1] = Math.max(0.12, array[i + 1] + this.fineDustVelocities[i + 1] * delta);
        array[i + 2] += this.fineDustVelocities[i + 2] * delta;
      }
      positions.needsUpdate = true;
      this.fineDustMaterial.opacity = this.fineDustLife * 0.28;
      this.fineDustMaterial.size = 2.4 + (1 - this.fineDustLife) * 1.7;
    }

    // Scar remains as a grounded contact cue after the initial dust clears.
    if (this.deployed || this.deploymentProgress > 0.28) {
      this.impactScarMaterial.opacity = THREE.MathUtils.lerp(this.impactScarMaterial.opacity, 0.34, 1 - Math.exp(-delta * 1.8));
    }

    if (this.deployed) {
      if (this.activationStartedAt < 0) this.activationStartedAt = elapsed;
      this.activationElapsed = Math.max(0.001, elapsed - this.activationStartedAt);

      if (this.activationElapsed < 0.8) {
        const on = Math.sin(elapsed * 34) > -0.25 && Math.sin(elapsed * 21.3) > -0.5;
        this.emissiveStripMaterial.emissiveIntensity = on ? 0.92 : 0.06;
        this.statusLightMaterial.emissiveIntensity = 0.18;
        this.accessStatusMaterial.emissiveIntensity = on ? 0.32 : 0.08;
        this.beaconLight.intensity = 0.08;
      } else if (this.activationElapsed < 1.55) {
        const cycle = (this.activationElapsed - 0.8) % 0.42;
        const blink = cycle < 0.08 || (cycle > 0.17 && cycle < 0.24);
        this.emissiveStripMaterial.emissiveIntensity = 0.52;
        this.statusLightMaterial.emissiveIntensity = blink ? 2.0 : 0.16;
        this.accessStatusMaterial.emissiveIntensity = blink ? 1.2 : 0.18;
        this.beaconLight.intensity = 0.12;
      } else if (this.activationElapsed < 2.45) {
        const oxygenT = THREE.MathUtils.smoothstep(this.activationElapsed, 1.55, 2.45);
        this.oxygenStatusMaterial.color.lerpColors(OXYGEN_WARNING_COLOR, OXYGEN_ONLINE_COLOR, oxygenT);
        this.oxygenStatusMaterial.emissive.lerpColors(OXYGEN_WARNING_EMISSIVE, OXYGEN_ONLINE_EMISSIVE, oxygenT);
        this.oxygenStatusMaterial.emissiveIntensity = 0.18 + oxygenT * 1.05;
        this.emissiveStripMaterial.emissiveIntensity = 0.55 + oxygenT * 0.22;
        this.statusLightMaterial.emissiveIntensity = 0.5;
        this.accessStatusMaterial.color.lerpColors(ACCESS_WARNING_COLOR, ACCESS_ONLINE_COLOR, oxygenT);
        this.accessStatusMaterial.emissive.lerpColors(ACCESS_WARNING_COLOR, ACCESS_ONLINE_COLOR, oxygenT);
        this.accessStatusMaterial.emissiveIntensity = 0.28 + oxygenT * 0.65;
      } else if (!this.activationComplete) {
        const beaconT = THREE.MathUtils.smoothstep(this.activationElapsed, 2.45, 3.35);
        this.statusLightMaterial.color.setHex(0x58d9a4);
        this.statusLightMaterial.emissive.setHex(0x26c98a);
        this.statusLightMaterial.emissiveIntensity = 0.7 + beaconT * 0.55;
        this.accessStatusMaterial.color.copy(ACCESS_ONLINE_COLOR);
        this.accessStatusMaterial.emissive.copy(ACCESS_ONLINE_COLOR);
        this.accessStatusMaterial.emissiveIntensity = 0.68 + beaconT * 0.42;
        this.beaconLight.color.setHex(0x55e8ac);
        this.beaconLight.intensity = beaconT * 1.7;
        this.beaconBeam.visible = beaconT > 0.02;
        this.beaconBeamMaterial.uniforms.uTime.value = elapsed;
        this.beaconBeamMaterial.uniforms.uOpacity.value = beaconT * 0.11;
        this.emissiveStripMaterial.emissiveIntensity = 0.75 + beaconT * 0.12;
        if (this.activationElapsed >= 3.35) {
          this.activationComplete = true;
          this.onlineAnnouncementPending = true;
        }
      } else {
        const pulse = 1.35 + Math.sin(elapsed * 2.4) * 0.42;
        this.beaconLight.intensity = pulse;
        this.beaconBeam.visible = true;
        this.beaconBeamMaterial.uniforms.uTime.value = elapsed;
        this.beaconBeamMaterial.uniforms.uOpacity.value = 0.075 + Math.sin(elapsed * 1.35) * 0.018;
        this.statusLightMaterial.emissiveIntensity = 1.05 + Math.sin(elapsed * 2.4) * 0.32;
        this.accessStatusMaterial.emissiveIntensity = 0.9 + Math.sin(elapsed * 1.6) * 0.14;
        this.oxygenStatusMaterial.emissiveIntensity = 0.95 + Math.sin(elapsed * 1.2) * 0.12;
        this.emissiveStripMaterial.emissiveIntensity = 0.74 + Math.sin(elapsed * 1.0) * 0.1;
      }
    }
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();

    this.group.traverse((object) => {
      const renderable = object as unknown as {
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

        const materialWithResources = material as THREE.Material & {
          map?: THREE.Texture | null;
          roughnessMap?: THREE.Texture | null;
          bumpMap?: THREE.Texture | null;
          normalMap?: THREE.Texture | null;
          uniforms?: Record<string, { value: unknown }>;
        };

        for (const texture of [
          materialWithResources.map,
          materialWithResources.roughnessMap,
          materialWithResources.bumpMap,
          materialWithResources.normalMap
        ]) {
          if (texture && !textures.has(texture)) {
            textures.add(texture);
            texture.dispose();
          }
        }

        if (materialWithResources.uniforms) {
          for (const uniform of Object.values(materialWithResources.uniforms)) {
            if (uniform.value instanceof THREE.Texture && !textures.has(uniform.value)) {
              textures.add(uniform.value);
              uniform.value.dispose();
            }
          }
        }

        material.dispose();
      }
    });
  }

  private createSolarPanelAssembly(width: number, height: number): THREE.Group {
    const group = new THREE.Group();

    const back = new THREE.Mesh(new THREE.BoxGeometry(width + 0.16, 0.12, height + 0.16), this.darkMetalMaterial);
    this.configureSolidMesh(back);
    group.add(back);

    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.solarMaterial);
    panel.rotation.x = -Math.PI / 2;
    panel.position.y = 0.071;
    panel.castShadow = true;
    panel.receiveShadow = true;
    group.add(panel);

    for (const x of [-width / 2, 0, width / 2]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.075, height + 0.06), this.trimMaterial);
      rail.position.set(x, 0.11, 0);
      group.add(rail);
    }
    for (const z of [-height / 2, height / 2]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, 0.075, 0.055), this.trimMaterial);
      rail.position.set(0, 0.11, z);
      group.add(rail);
    }

    return group;
  }

  private configureSolidMesh(mesh: THREE.Mesh): void {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
}
