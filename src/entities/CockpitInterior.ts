import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AssetLoader } from '../core/AssetLoader';

export type CockpitAlertSeverity = 'info' | 'caution' | 'critical';

export type CockpitRadarContact = {
  id: string;
  label: string;
  kind: 'objective' | 'mothership' | 'planet' | 'marker' | 'resource' | 'hazard' | 'unknown';
  localX: number;
  localZ: number;
  distance: number;
};

export type CockpitTelemetry = {
  phase: 'space' | 'descent' | 'surface' | 'colonization';
  phaseLabel: string;
  missionName: string;
  missionStep: string;
  objective: string;
  nextAction: string;
  targetDistance: number;
  speed: number;
  altitude: number;
  heat: number;
  stability: number;
  hull: number;
  shield: number;
  energy: number;
  oxygen: number;
  scannerStatus: string;
  signalStrength: number;
  scanProgress: number;
  atlasDecoded: boolean;
  landingZoneActive: boolean;
  habitatOnline: boolean;
  colonyReadiness: number;
  colonyStage: number;
  waterFound: boolean;
  mineralsFound: boolean;
  energyFound: boolean;
  baseOperational: boolean;
  turbulence: number;
  radarRange: number;
  radarContacts: CockpitRadarContact[];
  alert?: { message: string; severity: CockpitAlertSeverity };
};

type FadableMaterial = {
  material: THREE.Material & { opacity: number };
  opacity: number;
};

type CockpitDisplay = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  material: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
};

type DisplayMount = {
  position: [number, number, number];
  rotation: [number, number, number];
  role: 'center' | 'left' | 'right' | 'lower';
};

export type CockpitGlbStatus = 'loading' | 'loaded' | 'fallback' | 'error';

export type CockpitGlbDiagnostics = {
  status: CockpitGlbStatus;
  path: string;
  meshCount: number;
  materialCount: number;
  triangles: number;
  scale: number;
  error: string;
};

const COLOR = {
  background: '#03080d',
  panel: '#07141b',
  grid: 'rgba(74, 137, 157, 0.18)',
  cyan: '#8fdbe6',
  cyanBright: '#d7faff',
  green: '#8de3aa',
  amber: '#f3bd66',
  red: '#ff6b68',
  muted: '#6b8791',
  white: '#eaf4f2'
} as const;

const SCREEN_UPDATE_RATE = 8;

export const COCKPIT_GLB_PATH = '/models/cockpit-interior.glb';

// Meshy exported this cockpit as one unnamed mesh. Keep the installation and
// display transforms explicit so a later authored cockpit can be tuned here.
const COCKPIT_GLB_LAYOUT = {
  targetMaxDimension: 5.7,
  position: new THREE.Vector3(0, -0.52, -0.12),
  rotation: new THREE.Euler(0, Math.PI, 0)
};

const COCKPIT_SCREEN_MOUNTS = {
  center: {
    position: [0, -0.44, -1.42],
    rotation: [-0.17, 0, 0],
    role: 'center'
  },
  left: {
    position: [-1.08, -0.52, -1.26],
    rotation: [-0.13, 0.31, 0.018],
    role: 'left'
  },
  right: {
    position: [1.08, -0.51, -1.26],
    rotation: [-0.13, -0.31, -0.018],
    role: 'right'
  },
  lower: {
    position: [0, -0.7, -1.34],
    rotation: [-0.24, 0, 0],
    role: 'lower'
  }
} satisfies Record<string, DisplayMount>;

/**
 * Camera-local scout cockpit. It is deliberately independent from flight
 * state: main.ts feeds it a compact telemetry snapshot at a throttled rate.
 */
export class CockpitInterior {
  readonly group = new THREE.Group();

  readonly screenUpdateRate = SCREEN_UPDATE_RATE;

  readonly glbDiagnostics: CockpitGlbDiagnostics = {
    status: 'loading',
    path: COCKPIT_GLB_PATH,
    meshCount: 0,
    materialCount: 0,
    triangles: 0,
    scale: 1,
    error: ''
  };

  private readonly frameGroup = new THREE.Group();

  private readonly proceduralShellGroup = new THREE.Group();

  private readonly importedShellGroup = new THREE.Group();

  private readonly displayGroup = new THREE.Group();

  private readonly runtimeEffectsGroup = new THREE.Group();

  private readonly screenAnchorsGroup = new THREE.Group();

  private readonly materials: FadableMaterial[] = [];

  private readonly displays: CockpitDisplay[] = [];

  private readonly radarDisplay: CockpitDisplay;

  private readonly statusDisplay: CockpitDisplay;

  private readonly missionDisplay: CockpitDisplay;

  private readonly colonyDisplay: CockpitDisplay;

  private readonly warningLight: THREE.PointLight;

  private readonly instrumentLight: THREE.PointLight;

  private readonly targetPhaseColor = new THREE.Color();

  private readonly canopyReflectionMaterial: THREE.MeshBasicMaterial;

  private panelMaterial!: THREE.MeshStandardMaterial;

  private trimMaterial!: THREE.MeshStandardMaterial;

  private rubberMaterial!: THREE.MeshStandardMaterial;

  private phaseAccentMaterial!: THREE.MeshStandardMaterial;

  private warningLedMaterial!: THREE.MeshBasicMaterial;

  private confirmationLedMaterial!: THREE.MeshBasicMaterial;

  private visibilityBlend = 0;

  private visibilityEased = 0;

  private screenAnimationTime = 0;

  private lastScreenUpdate = Number.NEGATIVE_INFINITY;

  private alertMessage = '';

  private alertSeverity: CockpitAlertSeverity = 'info';

  private alertExpiresAt = -1;

  private renderableCount = 0;

  private importedRoot?: THREE.Object3D;

  private loadGeneration = 0;

  private lastSpeed = 0;

  private accelerationLean = 0;

  private canopyDustParticleCount = 0;

  private inactiveUpdateSkipped = 0;

  private screenTextureUpdates = 0;

  constructor(private readonly assetLoader: AssetLoader) {
    this.group.name = 'Cockpit Interior';
    this.group.visible = false;
    this.frameGroup.name = 'Cockpit Structural Frame';
    this.proceduralShellGroup.name = 'Cockpit Procedural Fallback';
    this.importedShellGroup.name = 'Cockpit GLB Physical Shell';
    this.displayGroup.name = 'Cockpit Dynamic Displays';
    this.runtimeEffectsGroup.name = 'Cockpit Runtime Phase Effects';
    this.screenAnchorsGroup.name = 'Cockpit Screen Placement Anchors';
    this.screenAnchorsGroup.visible = false;
    this.frameGroup.add(
      this.proceduralShellGroup,
      this.importedShellGroup,
      this.displayGroup,
      this.runtimeEffectsGroup,
      this.screenAnchorsGroup
    );
    this.group.add(this.frameGroup);

    this.buildCanopyAndFrame();
    this.buildDashboard();

    this.canopyReflectionMaterial = this.buildRuntimeCanopyEffects();

    this.radarDisplay = this.createDisplay('Cockpit Radar Navigation', 420, 250, 0.9, 0.46, COCKPIT_SCREEN_MOUNTS.center);
    this.statusDisplay = this.createDisplay('Cockpit Ship Status', 320, 230, 0.7, 0.48, COCKPIT_SCREEN_MOUNTS.left);
    this.missionDisplay = this.createDisplay('Cockpit Mission Scanner', 420, 250, 0.78, 0.5, COCKPIT_SCREEN_MOUNTS.right);
    this.colonyDisplay = this.createDisplay('Cockpit Colony Surface', 360, 160, 0.64, 0.24, COCKPIT_SCREEN_MOUNTS.lower);

    this.instrumentLight = new THREE.PointLight(0x8fcbd7, 0, 4.8, 2.1);
    this.instrumentLight.name = 'Cockpit Instrument Fill';
    this.instrumentLight.position.set(0, -0.5, -0.55);
    this.group.add(this.instrumentLight);

    this.warningLight = new THREE.PointLight(0xff4c47, 0, 4.2, 2);
    this.warningLight.name = 'Cockpit Warning Light';
    this.warningLight.position.set(0, 0.7, -0.95);
    this.group.add(this.warningLight);

    this.refreshRenderableCount();
  }

  get estimatedDrawCalls(): number {
    return this.visibilityBlend > 0.02 ? this.renderableCount : 0;
  }

  get screenAnchorsVisible(): boolean {
    return this.screenAnchorsGroup.visible;
  }

  get dynamicScreenCount(): number {
    return this.displays.length;
  }

  get dustParticleCount(): number {
    return this.canopyDustParticleCount;
  }

  get activeDustParticleCount(): number {
    return this.group.visible ? this.canopyDustParticleCount : 0;
  }

  get canopyReflectionOpacity(): number {
    return this.canopyReflectionMaterial.opacity;
  }

  get active(): boolean {
    return this.group.visible && this.visibilityBlend > 0.015;
  }

  get updateSkippedWhenInactive(): number {
    return this.inactiveUpdateSkipped;
  }

  get textureUpdateCount(): number {
    return this.screenTextureUpdates;
  }

  get lodLevel(): 'hidden' | 'high' {
    return this.active ? 'high' : 'hidden';
  }

  get visibleMeshCount(): number {
    if (!this.active) return 0;
    return this.glbDiagnostics.status === 'loaded' ? this.glbDiagnostics.meshCount : this.renderableCount;
  }

  noteInactiveFrame(): void {
    if (!this.active) this.inactiveUpdateSkipped += 1;
  }

  async load(path = COCKPIT_GLB_PATH): Promise<CockpitGlbStatus> {
    const generation = ++this.loadGeneration;
    this.glbDiagnostics.status = 'loading';
    this.glbDiagnostics.path = path;
    this.glbDiagnostics.meshCount = 0;
    this.glbDiagnostics.materialCount = 0;
    this.glbDiagnostics.triangles = 0;
    this.glbDiagnostics.scale = 1;
    this.glbDiagnostics.error = '';
    this.proceduralShellGroup.visible = true;

    try {
      const gltf = await this.assetLoader.loadGLTF(path);
      if (generation !== this.loadGeneration) {
        this.disposeObject(gltf.scene);
        return this.glbDiagnostics.status;
      }
      this.installImportedCockpit(gltf);
      this.glbDiagnostics.status = 'loaded';
      this.proceduralShellGroup.visible = false;
    } catch (error) {
      if (generation !== this.loadGeneration) return this.glbDiagnostics.status;
      this.clearImportedCockpit();
      this.glbDiagnostics.status = 'fallback';
      this.glbDiagnostics.error = error instanceof Error ? error.message : String(error);
      this.proceduralShellGroup.visible = true;
      console.warn('Cockpit GLB failed to load; procedural fallback remains active.', this.glbDiagnostics);
    }

    this.refreshRenderableCount();
    return this.glbDiagnostics.status;
  }

  reload(): Promise<CockpitGlbStatus> {
    return this.load(this.glbDiagnostics.path || COCKPIT_GLB_PATH);
  }

  showScreenAnchors(visible: boolean): boolean {
    this.screenAnchorsGroup.visible = visible;
    this.refreshRenderableCount();
    return this.screenAnchorsGroup.visible;
  }

  private installImportedCockpit(gltf: GLTF): void {
    this.clearImportedCockpit();

    const source = gltf.scene;
    source.name = 'Cockpit Interior GLB Source';
    source.updateMatrixWorld(true);

    let meshCount = 0;
    let triangles = 0;
    const sourceMaterials = new Set<THREE.Material>();
    source.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      meshCount += 1;
      const geometry = object.geometry;
      triangles += geometry.index
        ? geometry.index.count / 3
        : (geometry.attributes.position?.count ?? 0) / 3;

      object.castShadow = false;
      object.receiveShadow = false;
      object.frustumCulled = false;
      object.renderOrder = 2;

      const prepare = (material: THREE.Material): THREE.Material => {
        sourceMaterials.add(material);
        const prepared = material.clone();
        prepared.name = material.name || 'Cockpit GLB Monolithic Material';
        prepared.side = THREE.DoubleSide;
        prepared.depthWrite = true;
        prepared.transparent = false;
        if (prepared instanceof THREE.MeshStandardMaterial || prepared instanceof THREE.MeshPhysicalMaterial) {
          prepared.roughness = Math.max(0.38, prepared.roughness);
          prepared.metalness = Math.min(0.78, Math.max(0.18, prepared.metalness));
          // The generated source bakes screen-like emissive pixels into its
          // only material. Keep them subdued under the real CanvasTextures.
          prepared.emissiveIntensity = 0.18;
          // Let the shared IBL environment give the monolithic material real
          // specular response: metal edges pick up light, composites stay flat.
          prepared.envMapIntensity = 0.55;
        }
        return prepared;
      };

      object.material = Array.isArray(object.material)
        ? object.material.map(prepare)
        : prepare(object.material);
    });
    for (const sourceMaterial of sourceMaterials) sourceMaterial.dispose();

    const bounds = new THREE.Box3().setFromObject(source);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);
    const maxDimension = Math.max(size.x, size.y, size.z);
    const scale = maxDimension > 0 ? COCKPIT_GLB_LAYOUT.targetMaxDimension / maxDimension : 1;
    source.position.sub(center);

    const installed = new THREE.Group();
    installed.name = 'Cockpit Interior GLB Model';
    installed.position.copy(COCKPIT_GLB_LAYOUT.position);
    installed.rotation.copy(COCKPIT_GLB_LAYOUT.rotation);
    installed.scale.setScalar(scale);
    installed.add(source);
    this.importedRoot = installed;
    this.importedShellGroup.add(installed);

    this.glbDiagnostics.meshCount = meshCount;
    this.glbDiagnostics.materialCount = sourceMaterials.size;
    this.glbDiagnostics.triangles = Math.round(triangles);
    this.glbDiagnostics.scale = scale;
  }

  private clearImportedCockpit(): void {
    if (!this.importedRoot) return;
    this.importedShellGroup.remove(this.importedRoot);
    this.disposeObject(this.importedRoot);
    this.importedRoot = undefined;
  }

  private disposeObject(root: THREE.Object3D): void {
    const textures = new Set<THREE.Texture>();
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
        material.dispose();
      }
    });
    for (const texture of textures) texture.dispose();
  }

  private refreshRenderableCount(): void {
    let count = 0;
    const countRenderables = (root: THREE.Object3D): void => {
      root.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Points) count += 1;
      });
    };
    if (this.glbDiagnostics.status === 'loaded') countRenderables(this.importedShellGroup);
    else countRenderables(this.proceduralShellGroup);
    countRenderables(this.displayGroup);
    countRenderables(this.runtimeEffectsGroup);
    if (this.screenAnchorsGroup.visible) countRenderables(this.screenAnchorsGroup);
    this.renderableCount = count;
  }

  setVisibilityBlend(blend: number): void {
    const nextBlend = THREE.MathUtils.clamp(blend, 0, 1);
    if (Math.abs(nextBlend - this.visibilityBlend) < 0.0001) return;
    this.visibilityBlend = nextBlend;
    this.group.visible = this.visibilityBlend > 0.015;

    const eased = THREE.MathUtils.smoothstep(this.visibilityBlend, 0.04, 0.72);
    this.visibilityEased = eased;
    this.importedShellGroup.visible = this.glbDiagnostics.status === 'loaded' && eased > 0.16;
    this.proceduralShellGroup.visible = this.glbDiagnostics.status !== 'loaded' && eased > 0.005;
    for (const entry of this.materials) {
      entry.material.opacity = entry.opacity * eased;
      entry.material.visible = eased > 0.005;
    }
    for (const display of this.displays) {
      display.material.opacity = eased;
      display.material.visible = eased > 0.02;
    }
  }

  triggerAlert(message: string, severity: CockpitAlertSeverity, elapsed: number, duration = 4.8): void {
    this.alertMessage = message;
    this.alertSeverity = severity;
    this.alertExpiresAt = elapsed + duration;
    this.lastScreenUpdate = Number.NEGATIVE_INFINITY;
  }

  update(delta: number, elapsed: number, telemetry: CockpitTelemetry): void {
    if (!this.active) {
      this.inactiveUpdateSkipped += 1;
      return;
    }

    this.screenAnimationTime = elapsed;

    const turbulence = THREE.MathUtils.clamp(telemetry.turbulence, 0, 1);
    const acceleration = delta > 0 ? THREE.MathUtils.clamp((telemetry.speed - this.lastSpeed) / delta / 85, -1, 1) : 0;
    this.lastSpeed = telemetry.speed;
    this.accelerationLean = THREE.MathUtils.lerp(this.accelerationLean, acceleration, 1 - Math.pow(0.04, delta));
    const hoverSteadiness = telemetry.phase === 'surface' || telemetry.phase === 'colonization' ? 0.48 : 1;
    this.frameGroup.position.x = Math.sin(elapsed * 23.7) * turbulence * 0.008 * hoverSteadiness;
    this.frameGroup.position.y = Math.sin(elapsed * 31.1 + 0.8) * turbulence * 0.006 * hoverSteadiness;
    this.frameGroup.position.z = this.accelerationLean * 0.008;
    this.frameGroup.rotation.x = this.accelerationLean * -0.0035;
    this.frameGroup.rotation.z = Math.sin(elapsed * 18.3) * turbulence * 0.0015 * hoverSteadiness;

    const liveAlert = telemetry.alert ?? (elapsed < this.alertExpiresAt
      ? { message: this.alertMessage, severity: this.alertSeverity }
      : undefined);
    const severity = liveAlert?.severity;
    const warningPulse = severity === 'critical'
      ? 0.72 + Math.sin(elapsed * 12) * 0.28
      : severity === 'caution'
        ? 0.46 + Math.sin(elapsed * 5) * 0.14
        : 0;
    this.warningLight.intensity = warningPulse * this.visibilityBlend * 1.45;
    const phaseColor = this.targetPhaseColor.set(
      telemetry.phase === 'descent'
        ? 0xff8a55
        : telemetry.phase === 'surface' || telemetry.phase === 'colonization'
          ? 0x9ed6ad
          : 0x8fcbd7
    );
    const lightResponse = 1 - Math.pow(0.025, delta);
    this.instrumentLight.color.lerp(phaseColor, lightResponse);
    this.instrumentLight.intensity = (0.3 + (telemetry.phase === 'descent' ? 0.18 : 0.04)) * this.visibilityBlend;

    this.phaseAccentMaterial.emissive.lerp(phaseColor, lightResponse);
    this.phaseAccentMaterial.color.copy(this.phaseAccentMaterial.emissive).multiplyScalar(0.62);
    this.phaseAccentMaterial.emissiveIntensity = telemetry.phase === 'descent' ? 1.8 : 1.15;
    this.canopyReflectionMaterial.color.set(
      telemetry.phase === 'descent'
        ? 0xff9a62
        : telemetry.phase === 'surface' || telemetry.phase === 'colonization'
          ? 0xb9e4c2
          : 0x8fcfe4
    );
    this.canopyReflectionMaterial.opacity = this.visibilityEased * (
      telemetry.phase === 'descent' ? 0.065 + turbulence * 0.035 : 0.022
    );

    const warningOpacity = severity ? warningPulse : telemetry.phase === 'descent' ? 0.24 : 0.055;
    this.warningLedMaterial.opacity = this.visibilityEased * warningOpacity;
    this.warningLedMaterial.color.set(severity === 'critical' ? 0xff554d : 0xffa75a);
    const confirmationPulse = telemetry.baseOperational ? 0.82 + Math.sin(elapsed * 4.5) * 0.12 : 0.09;
    this.confirmationLedMaterial.opacity = this.visibilityEased * confirmationPulse;

    const displayFlicker = telemetry.phase === 'descent'
      ? THREE.MathUtils.clamp(0.9 + Math.sin(elapsed * 34) * turbulence * 0.08, 0.72, 1)
      : 1;
    for (const display of this.displays) {
      display.material.opacity = this.visibilityEased * displayFlicker;
      if (telemetry.phase === 'descent') display.material.color.setRGB(1, 0.94, 0.87);
      else if (telemetry.phase === 'surface' || telemetry.phase === 'colonization') display.material.color.setRGB(0.94, 1, 0.95);
      else display.material.color.setRGB(1, 1, 1);
    }

    const updateInterval = 1 / SCREEN_UPDATE_RATE;
    if (elapsed - this.lastScreenUpdate >= updateInterval) {
      this.lastScreenUpdate = elapsed;
      const snapshot = liveAlert ? { ...telemetry, alert: liveAlert } : telemetry;
      this.drawRadar(snapshot);
      this.drawShipStatus(snapshot);
      this.drawMission(snapshot);
      this.drawColony(snapshot);
      this.screenTextureUpdates += this.displays.length;
    }

    void delta;
  }

  dispose(): void {
    const disposedGeometries = new Set<THREE.BufferGeometry>();
    for (const display of this.displays) {
      display.texture.dispose();
      display.material.dispose();
      display.mesh.geometry.dispose();
      disposedGeometries.add(display.mesh.geometry);
    }
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
      if (!disposedGeometries.has(object.geometry)) {
        object.geometry.dispose();
        disposedGeometries.add(object.geometry);
      }
    });
    for (const { material } of this.materials) material.dispose();
    this.clearImportedCockpit();
  }

  private buildRuntimeCanopyEffects(): THREE.MeshBasicMaterial {
    const glass = this.registerMaterial(new THREE.MeshPhysicalMaterial({
      color: 0x9bcbd4,
      roughness: 0.08,
      metalness: 0.04,
      transparent: true,
      opacity: 0.026,
      depthWrite: false,
      side: THREE.DoubleSide
    }), 0.026);
    const pane = new THREE.Mesh(
      new THREE.CylinderGeometry(3.08, 3.08, 1.78, 28, 1, true, Math.PI * 0.72, Math.PI * 0.56),
      glass
    );
    pane.name = 'Cockpit GLB Clear Canopy Layer';
    pane.position.y = 0.18;
    pane.renderOrder = 5;
    this.runtimeEffectsGroup.add(pane);

    const reflection = this.registerMaterial(new THREE.MeshBasicMaterial({
      color: 0x8fcfe4,
      transparent: true,
      opacity: 0.022,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide
    }), 0.022);
    for (const side of [-1, 1]) {
      const streak = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 1.12), reflection);
      streak.name = 'Cockpit GLB Canopy Phase Reflection';
      streak.position.set(side * 0.94, 0.2, -3.01);
      streak.rotation.z = side * 0.12;
      streak.renderOrder = 7;
      this.runtimeEffectsGroup.add(streak);
    }

    const scratchPositions: number[] = [];
    for (let index = 0; index < 14; index += 1) {
      const x = -1.58 + (index / 13) * 3.16;
      const y = -0.38 + ((index * 31) % 11) / 11 * 1.18;
      const z = -Math.sqrt(Math.max(0.24, 3 * 3 - x * x));
      const length = 0.025 + ((index * 7) % 5) * 0.009;
      scratchPositions.push(x, y, z + 0.012, x + length, y + length * 0.3, z + 0.014);
    }
    const scratchGeometry = new THREE.BufferGeometry();
    scratchGeometry.setAttribute('position', new THREE.Float32BufferAttribute(scratchPositions, 3));
    const scratchMaterial = this.registerMaterial(new THREE.LineBasicMaterial({
      color: 0xd5e4e5,
      transparent: true,
      opacity: 0.035,
      depthWrite: false
    }), 0.035);
    const scratches = new THREE.LineSegments(scratchGeometry, scratchMaterial);
    scratches.name = 'Cockpit GLB Canopy Micro Scratches';
    scratches.renderOrder = 7;
    this.runtimeEffectsGroup.add(scratches);

    // Dust specks settled on the inside of the glass: the detail that most
    // sells "this canopy is a physical surface". Deterministic layout.
    const dustPositions: number[] = [];
    for (let index = 0; index < 26; index += 1) {
      const x = -1.66 + ((index * 53) % 17) / 17 * 3.32;
      const y = -0.46 + ((index * 29) % 13) / 13 * 1.3;
      const z = -Math.sqrt(Math.max(0.24, 3 * 3 - x * x));
      dustPositions.push(x, y, z + 0.01);
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3));
    this.canopyDustParticleCount = dustPositions.length / 3;
    const dustMaterial = this.registerMaterial(new THREE.PointsMaterial({
      color: 0xcfdadb,
      size: 0.011,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      sizeAttenuation: true
    }), 0.16);
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    dust.name = 'Cockpit GLB Canopy Dust Specks';
    dust.renderOrder = 7;
    this.runtimeEffectsGroup.add(dust);

    return reflection;
  }

  private buildCanopyAndFrame(): void {
    const frame = this.registerMaterial(new THREE.MeshStandardMaterial({
      color: 0x171d21,
      metalness: 0.86,
      roughness: 0.34,
      emissive: 0x050b0d,
      emissiveIntensity: 0.12,
      transparent: true
    }), 1);
    const worn = this.registerMaterial(new THREE.MeshStandardMaterial({
      color: 0x536067,
      metalness: 0.72,
      roughness: 0.54,
      transparent: true
    }), 0.94);
    const liner = this.registerMaterial(new THREE.MeshStandardMaterial({
      color: 0x090d10,
      metalness: 0.22,
      roughness: 0.9,
      transparent: true
    }), 1);
    const glass = this.registerMaterial(new THREE.MeshPhysicalMaterial({
      color: 0x9bc9d0,
      emissive: 0x061218,
      emissiveIntensity: 0.12,
      roughness: 0.11,
      metalness: 0.08,
      transparent: true,
      opacity: 0.072,
      depthWrite: false,
      side: THREE.DoubleSide
    }), 0.072);

    // A real curved shell surrounds the camera instead of three flat panes.
    const curvedGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(3.18, 3.18, 1.86, 32, 1, true, Math.PI * 0.71, Math.PI * 0.58),
      glass
    );
    curvedGlass.name = 'Cockpit Curved Forward Canopy';
    curvedGlass.position.y = 0.2;
    curvedGlass.renderOrder = 4;
    this.proceduralShellGroup.add(curvedGlass);

    for (const side of [-1, 1]) {
      const sideGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.55, 2, 2), glass);
      sideGlass.name = side < 0 ? 'Cockpit Port Canopy Glass' : 'Cockpit Starboard Canopy Glass';
      sideGlass.position.set(side * 2.52, 0.15, -1.08);
      sideGlass.rotation.set(-0.02, -side * 1.08, side * 0.015);
      sideGlass.renderOrder = 4;
      this.proceduralShellGroup.add(sideGlass);
    }

    const struts: [THREE.Vector3, THREE.Vector3, number, THREE.Material][] = [
      [new THREE.Vector3(-2.48, -0.63, -1.98), new THREE.Vector3(-2.16, 1.05, -2.22), 0.095, frame],
      [new THREE.Vector3(2.48, -0.63, -1.98), new THREE.Vector3(2.16, 1.05, -2.22), 0.095, frame],
      [new THREE.Vector3(-2.62, -0.7, -0.2), new THREE.Vector3(-2.48, -0.63, -1.98), 0.12, frame],
      [new THREE.Vector3(2.62, -0.7, -0.2), new THREE.Vector3(2.48, -0.63, -1.98), 0.12, frame],
      [new THREE.Vector3(-2.62, 0.82, -0.32), new THREE.Vector3(-2.16, 1.05, -2.22), 0.11, frame],
      [new THREE.Vector3(2.62, 0.82, -0.32), new THREE.Vector3(2.16, 1.05, -2.22), 0.11, frame],
      [new THREE.Vector3(-2.16, 1.05, -2.22), new THREE.Vector3(0, 1.31, -1.82), 0.075, worn],
      [new THREE.Vector3(2.16, 1.05, -2.22), new THREE.Vector3(0, 1.31, -1.82), 0.075, worn],
      [new THREE.Vector3(-2.48, -0.63, -1.98), new THREE.Vector3(2.48, -0.63, -1.98), 0.105, frame]
    ];
    for (const [start, end, radius, material] of struts) {
      this.proceduralShellGroup.add(this.createStrut(start, end, radius, material));
    }

    const overhead = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.24, 1.08, 4, 2, 3), liner);
    overhead.name = 'Cockpit Overhead Liner';
    overhead.position.set(0, 1.24, -0.62);
    overhead.rotation.x = -0.035;
    this.proceduralShellGroup.add(overhead);

    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.15, 2.05, 2, 3, 4), liner);
      wall.name = side < 0 ? 'Cockpit Port Interior Wall' : 'Cockpit Starboard Interior Wall';
      wall.position.set(side * 2.52, -0.66, -0.66);
      wall.rotation.y = side * -0.075;
      this.proceduralShellGroup.add(wall);

      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 1.8, 2, 2, 4), worn);
      sill.name = side < 0 ? 'Cockpit Port Canopy Sill' : 'Cockpit Starboard Canopy Sill';
      sill.position.set(side * 2.34, -0.48, -1.05);
      sill.rotation.y = side * -0.1;
      this.proceduralShellGroup.add(sill);
    }

    const scratchPositions: number[] = [];
    for (let index = 0; index < 18; index += 1) {
      const x = -1.72 + (index / 17) * 3.44;
      const y = -0.4 + ((index * 37) % 13) / 13 * 1.22;
      const z = -Math.sqrt(Math.max(0.2, 3.08 * 3.08 - x * x));
      const length = 0.025 + ((index * 11) % 7) * 0.008;
      scratchPositions.push(x, y, z + 0.018, x + length, y + length * 0.34, z + 0.02);
    }
    const scratchGeometry = new THREE.BufferGeometry();
    scratchGeometry.setAttribute('position', new THREE.Float32BufferAttribute(scratchPositions, 3));
    const scratchMaterial = this.registerMaterial(new THREE.LineBasicMaterial({
      color: 0xc8d8d9,
      transparent: true,
      opacity: 0.045,
      depthWrite: false
    }), 0.045);
    const scratches = new THREE.LineSegments(scratchGeometry, scratchMaterial);
    scratches.name = 'Cockpit Canopy Micro Scratches';
    scratches.renderOrder = 6;
    this.proceduralShellGroup.add(scratches);

    const reflectionMaterial = this.registerMaterial(new THREE.MeshBasicMaterial({
      color: 0xb8e8ef,
      transparent: true,
      opacity: 0.022,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false
    }), 0.022);
    for (const side of [-1, 1]) {
      const reflection = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 1.05), reflectionMaterial);
      reflection.name = 'Cockpit Canopy Reflection Streak';
      reflection.position.set(side * 0.92, 0.18, -3.02);
      reflection.rotation.z = side * 0.12;
      reflection.renderOrder = 6;
      this.proceduralShellGroup.add(reflection);
    }
  }

  private buildDashboard(): void {
    this.panelMaterial = this.registerMaterial(new THREE.MeshStandardMaterial({
      color: 0x12171a,
      metalness: 0.58,
      roughness: 0.66,
      emissive: 0x04090b,
      emissiveIntensity: 0.12,
      transparent: true
    }), 1);
    this.trimMaterial = this.registerMaterial(new THREE.MeshStandardMaterial({
      color: 0x374147,
      metalness: 0.8,
      roughness: 0.4,
      transparent: true
    }), 0.8);
    this.rubberMaterial = this.registerMaterial(new THREE.MeshStandardMaterial({
      color: 0x080b0d,
      metalness: 0.08,
      roughness: 0.92,
      transparent: true
    }), 1);
    this.phaseAccentMaterial = this.registerMaterial(new THREE.MeshStandardMaterial({
      color: 0x3d8996,
      emissive: 0x63c7d6,
      emissiveIntensity: 1.15,
      metalness: 0.2,
      roughness: 0.3,
      transparent: true
    }), 0.86);
    this.warningLedMaterial = this.registerMaterial(new THREE.MeshBasicMaterial({
      color: 0xff9c55,
      transparent: true,
      toneMapped: false,
      opacity: 0.06
    }), 0.95);
    this.confirmationLedMaterial = this.registerMaterial(new THREE.MeshBasicMaterial({
      color: 0x79e79c,
      transparent: true,
      toneMapped: false,
      opacity: 0.08
    }), 0.95);

    const shell = new THREE.Mesh(new THREE.BoxGeometry(4.65, 0.48, 0.42, 5, 2, 3), this.panelMaterial);
    shell.name = 'Cockpit Dashboard Shell';
    shell.position.set(0, -0.7, -1.7);
    shell.rotation.x = -0.15;
    this.proceduralShellGroup.add(shell);

    const lowerNose = new THREE.Mesh(new THREE.BoxGeometry(4.86, 0.7, 0.72, 6, 3, 4), this.panelMaterial);
    lowerNose.name = 'Cockpit Lower Nose Silhouette';
    lowerNose.position.set(0, -1.13, -1.48);
    lowerNose.rotation.x = -0.08;
    this.proceduralShellGroup.add(lowerNose);

    const upperBrow = new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.13, 0.24, 6, 2, 2), this.trimMaterial);
    upperBrow.name = 'Cockpit Dashboard Upper Brow';
    upperBrow.position.set(0, -0.31, -1.6);
    upperBrow.rotation.x = -0.12;
    this.proceduralShellGroup.add(upperBrow);

    const centerPedestal = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.5, 0.44, 3, 2, 3), this.panelMaterial);
    centerPedestal.name = 'Cockpit Center Instrument Pedestal';
    centerPedestal.position.set(0, -1.02, -1.3);
    centerPedestal.rotation.x = -0.24;
    this.proceduralShellGroup.add(centerPedestal);

    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.72, 0.44, 3, 3, 3), this.panelMaterial);
      wing.name = side < 0 ? 'Cockpit Port Console' : 'Cockpit Starboard Console';
      wing.position.set(side * 1.12, -0.66, -1.48);
      wing.rotation.set(-0.13, side * -0.31, side * -0.015);
      this.proceduralShellGroup.add(wing);

      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.32, 1.32, 3, 2, 4), this.panelMaterial);
      arm.name = side < 0 ? 'Cockpit Port Arm Console' : 'Cockpit Starboard Arm Console';
      arm.position.set(side * 1.82, -0.94, -0.62);
      arm.rotation.y = side * -0.06;
      this.proceduralShellGroup.add(arm);
    }

    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.028, 0.045, 4, 1, 1), this.phaseAccentMaterial);
      strip.name = side < 0 ? 'Cockpit Port Phase Light Strip' : 'Cockpit Starboard Phase Light Strip';
      strip.position.set(side * 1.18, -0.29, -1.56);
      strip.rotation.y = side * -0.27;
      this.runtimeEffectsGroup.add(strip);
    }

    this.addInstancedPanelDetails();
    this.addPilotControls();
  }

  private addInstancedPanelDetails(): void {
    const buttonGeometry = new THREE.BoxGeometry(0.095, 0.035, 0.075, 1, 1, 1);
    const buttons = new THREE.InstancedMesh(buttonGeometry, this.phaseAccentMaterial, 16);
    buttons.name = 'Cockpit Instanced Console Buttons';
    const matrix = new THREE.Matrix4();
    let buttonIndex = 0;
    for (const side of [-1, 1]) {
      for (let row = 0; row < 2; row += 1) {
        for (let column = 0; column < 4; column += 1) {
          matrix.makeTranslation(side * (1.67 + column * 0.105), -0.76 - row * 0.075, -0.94);
          buttons.setMatrixAt(buttonIndex, matrix);
          buttonIndex += 1;
        }
      }
    }
    buttons.instanceMatrix.needsUpdate = true;
    this.proceduralShellGroup.add(buttons);

    const ledGeometry = new THREE.CylinderGeometry(0.032, 0.032, 0.025, 8);
    const ledRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    const warningLeds = new THREE.InstancedMesh(ledGeometry, this.warningLedMaterial, 6);
    warningLeds.name = 'Cockpit Physical Warning LEDs';
    for (let index = 0; index < 6; index += 1) {
      matrix.compose(new THREE.Vector3(-0.32 + index * 0.128, 1.08, -1.12), ledRotation, new THREE.Vector3(1, 1, 1));
      warningLeds.setMatrixAt(index, matrix);
    }
    warningLeds.instanceMatrix.needsUpdate = true;
    this.runtimeEffectsGroup.add(warningLeds);

    const confirmationLeds = new THREE.InstancedMesh(ledGeometry, this.confirmationLedMaterial, 4);
    confirmationLeds.name = 'Cockpit Physical Confirmation LEDs';
    for (let index = 0; index < 4; index += 1) {
      matrix.compose(new THREE.Vector3(-0.18 + index * 0.12, -0.76, -1.03), ledRotation, new THREE.Vector3(0.82, 0.82, 0.82));
      confirmationLeds.setMatrixAt(index, matrix);
    }
    confirmationLeds.instanceMatrix.needsUpdate = true;
    this.runtimeEffectsGroup.add(confirmationLeds);

    const boltGeometry = new THREE.CylinderGeometry(0.024, 0.024, 0.014, 8);
    const bolts = new THREE.InstancedMesh(boltGeometry, this.trimMaterial, 18);
    bolts.name = 'Cockpit Instanced Panel Bolts';
    for (let index = 0; index < 18; index += 1) {
      const side = index < 9 ? -1 : 1;
      const local = index % 9;
      matrix.compose(
        new THREE.Vector3(side * (0.54 + (local % 3) * 0.54), -0.33 - Math.floor(local / 3) * 0.23, -1.29),
        ledRotation,
        new THREE.Vector3(0.9, 0.9, 0.9)
      );
      bolts.setMatrixAt(index, matrix);
    }
    bolts.instanceMatrix.needsUpdate = true;
    this.proceduralShellGroup.add(bolts);
  }

  private addPilotControls(): void {
    const seat = new THREE.Group();
    seat.name = 'Cockpit Pilot Seat';
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.16, 0.72, 3, 2, 3), this.rubberMaterial);
    cushion.name = 'Cockpit Seat Cushion';
    cushion.position.set(0, -1.29, -0.36);
    seat.add(cushion);
    for (const side of [-1, 1]) {
      const bolster = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.72, 2, 3, 3), this.rubberMaterial);
      bolster.name = 'Cockpit Seat Bolster';
      bolster.position.set(side * 0.5, -1.14, -0.38);
      bolster.rotation.z = side * -0.08;
      seat.add(bolster);
    }
    this.proceduralShellGroup.add(seat);

    const yoke = new THREE.Group();
    yoke.name = 'Cockpit Flight Yoke';
    yoke.add(this.createStrut(new THREE.Vector3(0, -1.16, -0.58), new THREE.Vector3(0, -0.8, -0.95), 0.045, this.trimMaterial));
    yoke.add(this.createStrut(new THREE.Vector3(-0.34, -0.78, -0.96), new THREE.Vector3(0.34, -0.78, -0.96), 0.038, this.trimMaterial));
    yoke.add(this.createStrut(new THREE.Vector3(-0.34, -0.92, -0.94), new THREE.Vector3(-0.34, -0.69, -0.97), 0.055, this.rubberMaterial));
    yoke.add(this.createStrut(new THREE.Vector3(0.34, -0.92, -0.94), new THREE.Vector3(0.34, -0.69, -0.97), 0.055, this.rubberMaterial));
    this.proceduralShellGroup.add(yoke);

    const throttle = new THREE.Group();
    throttle.name = 'Cockpit Throttle Assembly';
    const throttleBase = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.11, 0.34, 2, 2, 2), this.panelMaterial);
    throttleBase.position.set(-1.72, -0.72, -0.57);
    throttle.add(throttleBase);
    throttle.add(this.createStrut(new THREE.Vector3(-1.72, -0.7, -0.58), new THREE.Vector3(-1.66, -0.46, -0.7), 0.035, this.trimMaterial));
    const throttleGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.19, 8), this.rubberMaterial);
    throttleGrip.position.set(-1.65, -0.44, -0.71);
    throttleGrip.rotation.z = Math.PI / 2;
    throttle.add(throttleGrip);
    this.proceduralShellGroup.add(throttle);

    for (const side of [-1, 1]) {
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.34, 2, 1, 2), this.rubberMaterial);
      pedal.name = side < 0 ? 'Cockpit Port Pedal' : 'Cockpit Starboard Pedal';
      pedal.position.set(side * 0.22, -1.23, -1.25);
      pedal.rotation.x = -0.55;
      this.proceduralShellGroup.add(pedal);

      const cableCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 1.94, -1.08, -0.12),
        new THREE.Vector3(side * 1.76, -1.14, -0.52),
        new THREE.Vector3(side * 1.58, -1.03, -0.94)
      ]);
      const cable = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 8, 0.022, 5, false), this.rubberMaterial);
      cable.name = 'Cockpit Side Console Cable';
      this.proceduralShellGroup.add(cable);
    }
  }

  private createDisplay(
    name: string,
    width: number,
    height: number,
    worldWidth: number,
    worldHeight: number,
    mountDefinition: DisplayMount
  ): CockpitDisplay {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error(`Could not create cockpit display context: ${name}`);

    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `${name} CanvasTexture`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldWidth, worldHeight), material);
    mesh.name = name;
    mesh.position.z = 0.044;
    mesh.renderOrder = 14;

    const mount = new THREE.Group();
    mount.name = `Cockpit Embedded Display Mount ${mountDefinition.role}`;
    mount.position.set(...mountDefinition.position);
    mount.rotation.set(...mountDefinition.rotation);

    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(worldWidth + 0.2, worldHeight + 0.18, 0.13, 3, 2, 2),
      this.panelMaterial
    );
    housing.name = 'Cockpit Display Housing';
    housing.position.z = -0.05;
    mount.add(housing);

    const recess = new THREE.Mesh(
      new THREE.BoxGeometry(worldWidth + 0.055, worldHeight + 0.055, 0.038, 2, 2, 1),
      this.rubberMaterial
    );
    recess.name = 'Cockpit Screen Recess';
    recess.position.z = 0.018;
    mount.add(recess);

    const bezelDepth = 0.04;
    const bezelThickness = 0.052;
    const horizontalGeometry = new THREE.BoxGeometry(worldWidth + 0.09, bezelThickness, bezelDepth, 3, 1, 1);
    const verticalGeometry = new THREE.BoxGeometry(bezelThickness, worldHeight + 0.09, bezelDepth, 1, 3, 1);
    for (const side of [-1, 1]) {
      const horizontal = new THREE.Mesh(horizontalGeometry, this.trimMaterial);
      horizontal.name = 'Cockpit Screen Bezel';
      horizontal.position.set(0, side * (worldHeight * 0.5 + bezelThickness * 0.45), 0.05);
      mount.add(horizontal);

      const vertical = new THREE.Mesh(verticalGeometry, this.trimMaterial);
      vertical.name = 'Cockpit Screen Bezel';
      vertical.position.set(side * (worldWidth * 0.5 + bezelThickness * 0.45), 0, 0.05);
      mount.add(vertical);
    }

    const screwGeometry = new THREE.CylinderGeometry(0.018, 0.018, 0.012, 8);
    const screws = new THREE.InstancedMesh(screwGeometry, this.trimMaterial, 4);
    screws.name = 'Cockpit Display Mount Screws';
    const screwRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    const screwMatrix = new THREE.Matrix4();
    const screwPositions = [
      [-worldWidth * 0.5 - 0.064, -worldHeight * 0.5 - 0.055],
      [worldWidth * 0.5 + 0.064, -worldHeight * 0.5 - 0.055],
      [-worldWidth * 0.5 - 0.064, worldHeight * 0.5 + 0.055],
      [worldWidth * 0.5 + 0.064, worldHeight * 0.5 + 0.055]
    ];
    screwPositions.forEach(([x, y], index) => {
      screwMatrix.compose(new THREE.Vector3(x, y, 0.074), screwRotation, new THREE.Vector3(1, 1, 1));
      screws.setMatrixAt(index, screwMatrix);
    });
    screws.instanceMatrix.needsUpdate = true;
    mount.add(screws);

    if (mountDefinition.role === 'center') {
      const hood = new THREE.Mesh(new THREE.BoxGeometry(worldWidth + 0.26, 0.12, 0.3, 3, 2, 2), this.panelMaterial);
      hood.name = 'Cockpit Radar Glare Hood';
      hood.position.set(0, worldHeight * 0.5 + 0.1, -0.08);
      hood.rotation.x = -0.08;
      mount.add(hood);
    }

    // Thin glass sheet floating just over the phosphor: a whisper of cool
    // sheen that makes the screen read as inset behind real glass. No
    // CanvasTexture, so it never counts as an extra "screen".
    const glassOverlay = new THREE.Mesh(
      new THREE.PlaneGeometry(worldWidth + 0.02, worldHeight + 0.02),
      this.registerMaterial(new THREE.MeshBasicMaterial({
        color: 0x9fd4e0,
        transparent: true,
        opacity: 0.03,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      }), 0.03)
    );
    glassOverlay.name = 'Cockpit Screen Glass Overlay';
    glassOverlay.position.z = 0.052;
    glassOverlay.renderOrder = 15;
    mount.add(glassOverlay);

    mount.add(mesh);
    this.displayGroup.add(mount);

    const anchor = new THREE.Group();
    anchor.name = `Cockpit Screen Anchor ${mountDefinition.role}`;
    anchor.position.copy(mount.position);
    anchor.rotation.copy(mount.rotation);
    const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-worldWidth * 0.5, -worldHeight * 0.5, 0.09),
      new THREE.Vector3(worldWidth * 0.5, -worldHeight * 0.5, 0.09),
      new THREE.Vector3(worldWidth * 0.5, worldHeight * 0.5, 0.09),
      new THREE.Vector3(-worldWidth * 0.5, worldHeight * 0.5, 0.09)
    ]);
    const outline = new THREE.LineLoop(outlineGeometry, new THREE.LineBasicMaterial({
      color: mountDefinition.role === 'center' ? 0x58efff : 0xffc568,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
      toneMapped: false
    }));
    outline.renderOrder = 100;
    anchor.add(outline, new THREE.AxesHelper(0.16));
    this.screenAnchorsGroup.add(anchor);

    const display = { canvas, context, texture, material, mesh };
    this.displays.push(display);
    return display;
  }

  private drawRadar(state: CockpitTelemetry): void {
    const display = this.radarDisplay;
    const { context: ctx, canvas } = display;
    this.beginScreen(ctx, canvas, state.phase === 'surface' || state.phase === 'colonization' ? 'SURFACE NAV' : 'ORBITAL NAV');

    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.57;
    const radius = Math.min(canvas.width, canvas.height) * 0.34;
    ctx.strokeStyle = 'rgba(117, 205, 218, 0.28)';
    ctx.lineWidth = 1.5;
    for (const ring of [0.33, 0.66, 1]) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * ring, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    const sweepAngle = (this.screenAnimationTime * 0.9) % (Math.PI * 2) - Math.PI / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(118, 220, 214, 0.075)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, sweepAngle - 0.24, sweepAngle);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(163, 247, 233, 0.62)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweepAngle) * radius, cy + Math.sin(sweepAngle) * radius);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = COLOR.white;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7);
    ctx.lineTo(cx - 5, cy + 6);
    ctx.lineTo(cx + 5, cy + 6);
    ctx.closePath();
    ctx.fill();

    const range = Math.max(1, state.radarRange);
    const contactColors: Record<CockpitRadarContact['kind'], string> = {
      objective: COLOR.amber,
      mothership: COLOR.green,
      planet: COLOR.cyanBright,
      marker: '#b7a6ff',
      resource: COLOR.green,
      hazard: COLOR.red,
      unknown: COLOR.muted
    };
    let labelsDrawn = 0;
    for (const [contactIndex, contact] of state.radarContacts.slice(0, 18).entries()) {
      const scale = Math.min(1, contact.distance / range);
      const angle = Math.atan2(contact.localX, -contact.localZ);
      const px = cx + Math.sin(angle) * radius * scale;
      const py = cy - Math.cos(angle) * radius * scale;
      const pulse = 0.72 + Math.sin(this.screenAnimationTime * 4.4 + contactIndex * 1.7) * 0.28;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = contactColors[contact.kind];
      ctx.beginPath();
      if (contact.kind === 'objective') {
        ctx.moveTo(px, py - 6);
        ctx.lineTo(px + 6, py);
        ctx.lineTo(px, py + 6);
        ctx.lineTo(px - 6, py);
        ctx.closePath();
      } else {
        ctx.arc(px, py, contact.kind === 'hazard' ? 4.5 : 3.2, 0, Math.PI * 2);
      }
      ctx.fill();
      if (contact.kind === 'objective' || (labelsDrawn < 4 && contact.distance < range * 0.38)) {
        ctx.font = '600 12px "Segoe UI", sans-serif';
        ctx.fillText(this.clipLabel(contact.label, 16), px + 8, py + 4);
        labelsDrawn += 1;
      }
      ctx.globalAlpha = 1;
    }

    ctx.font = '600 13px "Segoe UI", sans-serif';
    ctx.fillStyle = COLOR.muted;
    ctx.fillText(`RNG ${this.formatDistance(range)}`, 15, canvas.height - 14);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLOR.cyan;
    ctx.fillText(`${Math.round(state.speed)} M/S`, canvas.width - 15, canvas.height - 14);
    ctx.textAlign = 'left';
    display.texture.needsUpdate = true;
  }

  private drawShipStatus(state: CockpitTelemetry): void {
    const display = this.statusDisplay;
    const { context: ctx, canvas } = display;
    this.beginScreen(ctx, canvas, 'SCOUT // SYS');

    const metrics: [string, number, string][] = [
      ['CASCO', state.hull, state.hull < 40 ? COLOR.red : COLOR.green],
      ['ESCUDO', state.shield, state.shield < 30 ? COLOR.red : COLOR.cyan],
      ['ENERGIA', state.energy, state.energy < 25 ? COLOR.red : COLOR.amber],
      ['OXIGENO', state.oxygen, state.oxygen < 25 ? COLOR.red : COLOR.cyan]
    ];
    metrics.forEach(([label, value, color], index) => {
      const y = 54 + index * 35;
      ctx.font = '600 13px "Segoe UI", sans-serif';
      ctx.fillStyle = COLOR.muted;
      ctx.fillText(label, 14, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = color;
      ctx.fillText(`${Math.round(value)}%`, canvas.width - 14, y);
      ctx.textAlign = 'left';
      this.drawBar(ctx, 14, y + 9, canvas.width - 28, 8, value, color);
    });

    ctx.fillStyle = state.stability < 55 ? COLOR.red : COLOR.white;
    ctx.font = '700 14px "Segoe UI", sans-serif';
    ctx.fillText(`ESTABILIDAD ${Math.round(state.stability)}%`, 14, canvas.height - 28);
    ctx.textAlign = 'right';
    ctx.fillStyle = state.heat > 70 ? COLOR.red : COLOR.amber;
    ctx.fillText(`TERM ${Math.round(state.heat)}%`, canvas.width - 14, canvas.height - 28);
    ctx.textAlign = 'left';
    display.texture.needsUpdate = true;
  }

  private drawMission(state: CockpitTelemetry): void {
    const display = this.missionDisplay;
    const { context: ctx, canvas } = display;
    this.beginScreen(ctx, canvas, state.phaseLabel.toUpperCase());

    ctx.fillStyle = COLOR.white;
    ctx.font = '700 15px "Segoe UI", sans-serif';
    ctx.fillText(this.clipLabel(state.missionName, 34), 15, 52);
    ctx.font = '600 13px "Segoe UI", sans-serif';
    this.drawWrappedText(ctx, state.objective, 15, 76, canvas.width - 30, 18, 2, COLOR.cyanBright);

    ctx.fillStyle = COLOR.muted;
    ctx.font = '600 12px "Segoe UI", sans-serif';
    ctx.fillText('SIGUIENTE', 15, 121);
    this.drawWrappedText(ctx, state.nextAction, 15, 140, canvas.width - 30, 16, 2, COLOR.white);

    ctx.fillStyle = COLOR.muted;
    ctx.fillText(`SCAN ${state.scannerStatus.toUpperCase()}`, 15, 190);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLOR.cyan;
    ctx.fillText(`SIG ${Math.round(state.signalStrength)}%`, canvas.width - 15, 190);
    ctx.textAlign = 'left';
    this.drawBar(ctx, 15, 201, canvas.width - 30, 7, state.scanProgress, COLOR.cyan);

    if (state.alert) {
      const color = state.alert.severity === 'critical' ? COLOR.red : state.alert.severity === 'caution' ? COLOR.amber : COLOR.cyan;
      ctx.fillStyle = `${color}26`;
      ctx.fillRect(8, canvas.height - 31, canvas.width - 16, 23);
      ctx.strokeStyle = color;
      ctx.strokeRect(8.5, canvas.height - 30.5, canvas.width - 17, 22);
      ctx.fillStyle = color;
      ctx.font = '700 12px "Segoe UI", sans-serif';
      ctx.fillText(this.clipLabel(state.alert.message.toUpperCase(), 47), 15, canvas.height - 14);
    } else {
      ctx.fillStyle = state.atlasDecoded ? '#b7a6ff' : COLOR.muted;
      ctx.font = '600 12px "Segoe UI", sans-serif';
      ctx.fillText(state.atlasDecoded ? 'ATLAS LINK // DECODED' : 'ATLAS LINK // STANDBY', 15, canvas.height - 14);
      ctx.textAlign = 'right';
      ctx.fillStyle = COLOR.amber;
      ctx.fillText(this.formatDistance(state.targetDistance), canvas.width - 15, canvas.height - 14);
      ctx.textAlign = 'left';
    }
    display.texture.needsUpdate = true;
  }

  private drawColony(state: CockpitTelemetry): void {
    const display = this.colonyDisplay;
    const { context: ctx, canvas } = display;
    this.beginScreen(ctx, canvas, 'NEREIDA // COLONY');

    const surface = state.phase === 'surface' || state.phase === 'colonization';
    if (!surface) {
      ctx.font = '700 20px "Segoe UI", sans-serif';
      ctx.fillStyle = state.landingZoneActive ? COLOR.amber : COLOR.muted;
      ctx.fillText(state.landingZoneActive ? 'LANDING TELEMETRY LINKED' : 'SURFACE LINK STANDBY', 16, 76);
      ctx.font = '600 13px "Segoe UI", sans-serif';
      ctx.fillStyle = COLOR.muted;
      ctx.fillText(`ALT ${Math.round(state.altitude)} M // VECTOR ${Math.round(state.stability)}%`, 16, 108);
      display.texture.needsUpdate = true;
      return;
    }

    const flags: [string, boolean][] = [
      ['HAB', state.habitatOnline],
      ['H2O', state.waterFound],
      ['MIN', state.mineralsFound],
      ['PWR', state.energyFound]
    ];
    flags.forEach(([label, online], index) => {
      const x = 16 + index * 81;
      ctx.fillStyle = online ? COLOR.green : '#253239';
      ctx.fillRect(x, 53, 68, 26);
      ctx.fillStyle = online ? COLOR.background : COLOR.muted;
      ctx.font = '700 13px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + 34, 71);
    });
    ctx.textAlign = 'left';
    ctx.fillStyle = state.baseOperational ? COLOR.green : COLOR.white;
    ctx.font = '700 15px "Segoe UI", sans-serif';
    ctx.fillText(state.baseOperational ? 'BASE NEREIDA OPERATIVA' : `ETAPA ${state.colonyStage} // PREPARACION`, 16, 106);
    this.drawBar(ctx, 16, 117, canvas.width - 32, 9, state.colonyReadiness, state.baseOperational ? COLOR.green : COLOR.amber);
    display.texture.needsUpdate = true;
  }

  private beginScreen(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, title: string): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, COLOR.panel);
    gradient.addColorStop(1, COLOR.background);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = COLOR.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(7, 20, 27, 0.94)';
    ctx.fillRect(0, 0, canvas.width, 35);
    ctx.strokeStyle = 'rgba(143, 219, 230, 0.56)';
    ctx.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
    ctx.fillStyle = COLOR.cyan;
    ctx.font = '700 14px "Segoe UI", sans-serif';
    ctx.fillText(title, 14, 23);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLOR.muted;
    ctx.fillText('AE // 2189', canvas.width - 14, 23);
    ctx.textAlign = 'left';

    // CRT character: faint scanlines plus a corner falloff so the panel
    // reads as an emissive instrument, not a flat web page.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.055)';
    for (let y = 37; y < canvas.height; y += 3) {
      ctx.fillRect(2, y, canvas.width - 4, 1);
    }
    const vignette = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.36,
      canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.74
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.24)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  private drawBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    value: number,
    color: string
  ): void {
    const normalized = THREE.MathUtils.clamp(value / 100, 0, 1);
    ctx.fillStyle = '#17252b';
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width * normalized, height);
  }

  private drawWrappedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    maxLines: number,
    color: string
  ): void {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        lines.push(line);
        line = word;
        if (lines.length >= maxLines) break;
      } else {
        line = candidate;
      }
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
      lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -3)}...`;
    }
    ctx.fillStyle = color;
    lines.forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight));
  }

  private createStrut(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
    const direction = end.clone().sub(start);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.92, direction.length(), 8), material);
    mesh.name = 'Cockpit Structural Strut';
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return mesh;
  }

  private registerMaterial<T extends THREE.Material & { opacity: number }>(material: T, opacity: number): T {
    material.opacity = 0;
    material.transparent = true;
    this.materials.push({ material, opacity });
    return material;
  }

  private formatDistance(meters: number): string {
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} KM` : `${Math.max(0, Math.round(meters))} M`;
  }

  private clipLabel(value: string, maxLength: number): string {
    return value.length > maxLength ? `${value.slice(0, Math.max(1, maxLength - 3))}...` : value;
  }
}
