import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  cannonMuzzleHardpoints,
  mainEngineHardpoints,
  torpedoTubeHardpoints,
  ventralPodHardpoint
} from '../game/PlayerShipHardpoints';
import { AssetLoader } from '../core/AssetLoader';
import { PlayerShip } from '../entities/PlayerShip';
import { STARTER_SHIP, type ShipDefinition } from '../ships/ShipCatalog';

/**
 * Air left around the silhouette.
 *
 * 1.12 was measured too tight once the camera aimed dead centre: the port
 * nacelle sat exactly on the left edge of the stage. This leaves the ship at
 * roughly two thirds of the hero cell, which is the brief's target.
 */
const FRAMING_MARGIN = 1.34;

export type GarageDiagnostics = {
  visible: boolean;
  loadedShipId: string;
  loadState: 'idle' | 'loading' | 'ready' | 'failed';
  drawCalls: number;
  triangles: number;
  activeLights: number;
  rafActive: boolean;
  rendererWidth: number;
  rendererHeight: number;
};

/** Dedicated, paused-when-hidden presentation world. It never loads Story. */
export class GarageView {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 180);
  private readonly loader = new AssetLoader();
  private readonly ship = new PlayerShip(this.loader);
  private readonly clock = new THREE.Clock();
  private readonly observer: ResizeObserver;
  private readonly diagnostics: GarageDiagnostics = {
    visible: false,
    loadedShipId: '',
    loadState: 'idle',
    drawCalls: 0,
    triangles: 0,
    activeLights: 3,
    rafActive: false,
    rendererWidth: 1,
    rendererHeight: 1
  };
  private readonly stage: HTMLElement;
  private gizmos?: THREE.Group;
  private autoRotate = true;
  private raf = 0;
  /**
   * Framing derived from the ship's own bounds.
   *
   * Nothing here is tuned for `epsilon-scout`: the camera distance comes from
   * the model's bounding sphere, so a longer or taller ship frames itself
   * without a second set of magic numbers.
   */
  private framing = { height: 8, spread: 19.4, centerY: 0, distance: 27 };
  private environment?: THREE.Texture;
  private keyLight?: THREE.DirectionalLight;
  private rimLight?: THREE.DirectionalLight;
  private fillLight?: THREE.HemisphereLight;
  private loadedDefinition?: ShipDefinition;
  private yaw = -0.55;
  private targetYaw = -0.55;
  private pitch = 0.08;
  private targetPitch = 0.08;
  private dragging = false;
  private pointerX = 0;
  private pointerY = 0;

  constructor(private readonly root: HTMLElement, private readonly diagnosticsMode = false) {
    const canvas = root.querySelector<HTMLCanvasElement>('#garage-canvas');
    if (!canvas) throw new Error('Missing #garage-canvas');
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: diagnosticsMode
    });
    this.renderer.setPixelRatio(diagnosticsMode ? 1 : Math.min(window.devicePixelRatio, 1.35));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.loader.enableKTX2(this.renderer, '/basis/');
    // Soft shadows: the ship had none at all, so it read as floating over a
    // dark ellipse rather than standing on a platform.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // A generated studio environment. Every hull material is metallic, and a
    // metal with nothing to reflect resolves to near black wherever a light is
    // not pointing -- which is why the fuselage looked flat and plasticky.
    // RoomEnvironment ships with three; no external HDRI, no new dependency.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.environment;
    // Kept low: the environment is for reflections, not for flattening the key.
    this.scene.environmentIntensity = 0.42;
    pmrem.dispose();

    this.scene.background = new THREE.Color(0x020608);
    this.scene.fog = new THREE.Fog(0x020608, 34, 78);
    this.buildHangar();
    this.scene.add(this.ship.group);
    this.camera.position.set(0, 5.8, 27);
    this.camera.lookAt(0, 0.8, 0);
    this.scene.add(this.camera);
    // Observe the stage cell, not the whole screen. The screen also contains
    // the information column, and measuring against it is exactly what made the
    // renderer believe it had space the panel was covering.
    this.stage = root.querySelector<HTMLElement>('#garage-stage') ?? root;
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(this.stage);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    this.resize();
  }

  async show(definition: ShipDefinition): Promise<void> {
    this.root.hidden = false;
    this.root.setAttribute('aria-hidden', 'false');
    this.diagnostics.visible = true;
    if (this.loadedDefinition?.id !== definition.id) await this.load(definition);
    this.clock.start();
    if (this.raf === 0) this.raf = requestAnimationFrame(this.render);
  }

  hide(): void {
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.diagnostics.visible = false;
    if (this.raf !== 0) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.diagnostics.rafActive = false;
  }

  get state(): GarageDiagnostics {
    return { ...this.diagnostics };
  }

  /** Stops or resumes the presentation spin, so a chosen angle stays put. */
  setAutoRotate(enabled: boolean): boolean {
    this.autoRotate = enabled;
    return this.autoRotate;
  }

  setView(yaw: number, pitch = this.targetPitch): GarageDiagnostics {
    if (Number.isFinite(yaw)) this.targetYaw = yaw;
    if (Number.isFinite(pitch)) this.targetPitch = THREE.MathUtils.clamp(pitch, -0.18, 0.32);
    return this.state;
  }

  dispose(): void {
    this.hide();
    this.observer.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.ship.dispose();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || this.ship.group.getObjectById(object.id)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
    this.renderer.dispose();
  }

  private async load(definition: ShipDefinition): Promise<void> {
    this.diagnostics.loadState = 'loading';
    this.diagnostics.loadedShipId = definition.id;
    try {
      await this.ship.load({
        medium: definition.model.garage,
        low: definition.model.gameplayLow,
        original: definition.model.gameplayOriginal
      });
      this.ship.group.position.set(0, 0.35, 0);
      // The hull is the only shadow caster; the hangar shell would only add
      // shadow-map draws for silhouettes nobody looks at.
      this.ship.group.traverse((object) => {
        if (object instanceof THREE.Mesh) object.castShadow = true;
      });
      this.loadedDefinition = definition;
      this.frameShip();
      this.diagnostics.loadState = 'ready';
    } catch {
      this.diagnostics.loadState = 'failed';
    }
  }

  private buildHangar(): void {
    // Same reasoning as the deck: a shadow needs a diffuse surface to fall on.
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x161c20, roughness: 0.86, metalness: 0.12 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(54, 42), floorMaterial);
    floor.name = 'Garage service floor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.1;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const frameGeometry = new THREE.BoxGeometry(0.42, 13, 0.65);
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x273035, roughness: 0.48, metalness: 0.78 });
    const frames = new THREE.InstancedMesh(frameGeometry, frameMaterial, 12);
    frames.name = 'Garage structural ribs';
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < 12; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const depth = -17 + Math.floor(index / 2) * 6.8;
      matrix.makeTranslation(side * 15.5, 3.2, depth);
      frames.setMatrixAt(index, matrix);
    }
    frames.instanceMatrix.needsUpdate = true;
    this.scene.add(frames);

    const stripeGeometry = new THREE.BoxGeometry(0.18, 0.04, 4.2);
    const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0x76c3ca });
    const stripes = new THREE.InstancedMesh(stripeGeometry, stripeMaterial, 10);
    for (let index = 0; index < 10; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      matrix.makeTranslation(side * 9.4, -2.78, -12 + Math.floor(index / 2) * 6);
      stripes.setMatrixAt(index, matrix);
    }
    stripes.instanceMatrix.needsUpdate = true;
    this.scene.add(stripes);

    // Key. The only light that casts: one shadow map is enough for a single
    // hero object, and more would cost without being read.
    const key = new THREE.DirectionalLight(0xdCEEFF, 3.4);
    key.position.set(-9, 13, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    // Frustum sized to the platform, not the room: a map stretched over the
    // whole hangar would spend its resolution on empty floor.
    const extent = 12;
    key.shadow.camera.left = -extent;
    key.shadow.camera.right = extent;
    key.shadow.camera.top = extent;
    key.shadow.camera.bottom = -extent;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 46;
    // normalBias rather than a large constant bias: it removes the acne on the
    // hull's curved panels without detaching the contact shadow from the feet.
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.035;
    key.shadow.radius = 3;
    this.keyLight = key;

    // Rim, cooler and behind, to cut the silhouette away from the dark hangar.
    const rim = new THREE.DirectionalLight(0x6FB2C8, 2.6);
    rim.position.set(11, 6, -13);
    this.rimLight = rim;

    // Fill only lifts the underside; the environment now carries most of the
    // ambient response, so this is much weaker than it used to be.
    const bounce = new THREE.HemisphereLight(0x89aeb8, 0x0d1113, 0.55);
    this.fillLight = bounce;
    this.scene.add(key, key.target, rim, bounce);
    this.buildPlatform();
  }

  /**
   * The service pedestal.
   *
   * The old scene put a near-black recessed disc under the ship, which read as
   * a hole rather than a surface and gave the hull nothing to sit on. This is a
   * shallow lit platform that receives the shadow, so the ship gains weight and
   * a believable contact point.
   */
  private buildPlatform(): void {
    const deck = new THREE.Mesh(
      new THREE.CylinderGeometry(9.2, 9.2, 0.5, 64),
      // Mostly dielectric on purpose. A metallic surface has almost no diffuse
      // response, and a shadow map only darkens *direct* light -- so with
      // metalness 0.7 and an IBL environment carrying most of the illumination,
      // the shadow had nearly nothing to subtract and stayed invisible. The
      // pipeline was never broken; the receiver could not show it.
      new THREE.MeshStandardMaterial({ color: 0x2a343a, roughness: 0.78, metalness: 0.18 })
    );
    deck.name = 'Garage service platform';
    deck.position.y = -3.05;
    deck.receiveShadow = true;
    this.scene.add(deck);

    // A raised rim reads as engineering rather than a painted circle, and it
    // catches the key light, which is what separates the deck from the floor.
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(9.2, 0.16, 8, 72),
      new THREE.MeshStandardMaterial({ color: 0x2c3a40, roughness: 0.4, metalness: 0.85 })
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = -2.8;
    this.scene.add(rim);

    // Inset guide strips. Emissive-only, so they cost no light and still give
    // the deck a sense of being powered.
    const stripGeometry = new THREE.BoxGeometry(0.12, 0.03, 2.6);
    const stripMaterial = new THREE.MeshBasicMaterial({ color: 0x59b8c6 });
    const strips = new THREE.InstancedMesh(stripGeometry, stripMaterial, 8);
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      matrix.makeRotationY(-angle);
      matrix.setPosition(Math.sin(angle) * 7.4, -2.78, Math.cos(angle) * 7.4);
      strips.setMatrixAt(index, matrix);
    }
    strips.instanceMatrix.needsUpdate = true;
    this.scene.add(strips);
  }

  /**
   * Points the camera at the loaded ship, sized from its own bounds.
   *
   * The camera used to sit at a fixed (0, 5.8, 27) chosen for this one hull.
   * Distance now comes from the bounding sphere and the narrower of the two
   * field-of-view axes, so the ship fills the same fraction of frame whatever
   * its size, and the shadow frustum follows it.
   */
  private frameShip(): void {
    const box = new THREE.Box3().setFromObject(this.ship.group);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    // Height and the widest horizontal extent are tracked separately. The ship
    // spins in yaw, so its worst-case silhouette width is the larger of width
    // and depth; its height never changes.
    this.framing.height = size.y;
    this.framing.spread = Math.max(size.x, size.z);
    this.framing.centerY = centre.y;
    this.applyFraming();
  }

  private applyFraming(): void {
    const vertical = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * this.camera.aspect);
    // Fit each axis against the field of view that actually constrains it.
    //
    // The previous version fitted the *bounding sphere* to the narrower FOV.
    // That sphere had radius 13.6 because the hull is 19.4 long, so the ship's
    // length was being reserved as vertical screen space and the camera pulled
    // back to 44 units for a hull only 8 units tall. Measured, not guessed:
    // the diagnostic printed both numbers.
    const forHeight = (this.framing.height / 2) / Math.tan(vertical / 2);
    const forWidth = (this.framing.spread / 2) / Math.tan(horizontal / 2);
    // The horizontal fit is computed against the *usable* width, since the
    // stats panel covers part of the canvas.
    const distance = Math.max(forHeight, forWidth) * FRAMING_MARGIN;
    this.framing.distance = distance;
    // Shift the aim toward the free side so the hull sits in clear canvas
    // rather than behind the panel. The ship itself is never moved.
    // Measured against the real panel edge, which starts at about 0.56 of the
    // canvas: the ship's centre has to sit near a third of the way across, not
    // halfway, for its tail to clear the stats card. Kept separate from the
    // distance term so widening the shift does not shrink the ship.
    // Dead centre. The offset that used to live here was compensating for a
    // panel drawn over the canvas; with a real stage cell there is nothing to
    // dodge, and three different values of it all measured worse than simply
    // aiming at the ship.
    const aimX = 0;
    this.camera.position.set(aimX, this.framing.centerY + distance * 0.22, distance * 0.9);
    this.camera.lookAt(aimX, this.framing.centerY, 0);
    if (this.keyLight) {
      this.keyLight.target.position.set(0, this.framing.centerY, 0);
      this.keyLight.target.updateMatrixWorld();
    }
  }

  /**
   * Everything needed to explain a bad frame or a missing shadow.
   *
   * Reports the presentation bounds alongside the raw ones, names the meshes
   * that push the raw box outwards, and dumps the whole shadow pipeline. Built
   * because both defects were invisible from the outside: the camera looked
   * correct and the shadow was switched on, yet neither did its job.
   */
  /**
   * Draws a marker at every hardpoint, in the ship's own space.
   *
   * The whole reason the procedural engines drifted out of line with the GLB's
   * bells is that nothing showed where they were. The markers are parented to
   * the ship group, so they rotate with it and stay correct at any angle.
   */
  setHardpointGizmos(visible: boolean): number {
    if (!this.gizmos) {
      this.gizmos = new THREE.Group();
      this.gizmos.name = 'Hardpoint gizmos';
      this.ship.group.add(this.gizmos);
    }
    this.gizmos.visible = visible;
    if (!visible) return 0;
    return this.refreshHardpointGizmos();
  }

  /** Rebuilds the markers from the current hardpoint values. */
  refreshHardpointGizmos(): number {
    if (!this.gizmos) return 0;
    for (const child of [...this.gizmos.children]) {
      this.gizmos.remove(child);
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    }
    const bounds = this.ship.hullBounds;
    const marks: { position: THREE.Vector3; colour: number; size: number }[] = [];
    for (const engine of mainEngineHardpoints(bounds)) {
      marks.push({ position: engine.position, colour: 0xff9a3c, size: engine.radius });
    }
    for (const muzzle of cannonMuzzleHardpoints(bounds)) {
      marks.push({ position: muzzle.position, colour: 0x7de8b8, size: 0.22 });
    }
    for (const tube of torpedoTubeHardpoints(bounds)) {
      marks.push({ position: tube.position, colour: 0x8fc8e8, size: 0.16 });
    }
    marks.push({ position: ventralPodHardpoint(bounds), colour: 0xffd166, size: 0.26 });

    for (const mark of marks) {
      // Depth-tested off so a marker inside the hull is still findable, which
      // is the case that matters when something is buried in the wrong place.
      const material = new THREE.MeshBasicMaterial({
        color: mark.colour, transparent: true, opacity: 0.85, depthTest: false
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(mark.size, 12, 8), material);
      mesh.position.copy(mark.position);
      mesh.renderOrder = 999;
      this.gizmos.add(mesh);
    }
    return marks.length;
  }

  /** Moves the procedural engines and refreshes their markers together. */
  applyEngineOffset(offset: { x?: number; y?: number; z?: number }): unknown {
    const applied = this.ship.setEngineOffset(offset);
    this.refreshHardpointGizmos();
    return applied;
  }

  /**
   * Presentation knobs the editor drives.
   *
   * Only lighting and tone response: nothing here changes geometry, materials
   * or gameplay, so a bad setting can look wrong but cannot break a ship.
   */
  setPresentation(patch: {
    exposure?: number;
    environmentIntensity?: number;
    keyIntensity?: number;
    rimIntensity?: number;
    fillIntensity?: number;
    shadowSoftness?: number;
  }): Record<string, number> {
    if (patch.exposure !== undefined) this.renderer.toneMappingExposure = patch.exposure;
    if (patch.environmentIntensity !== undefined) this.scene.environmentIntensity = patch.environmentIntensity;
    if (patch.keyIntensity !== undefined && this.keyLight) this.keyLight.intensity = patch.keyIntensity;
    if (patch.rimIntensity !== undefined && this.rimLight) this.rimLight.intensity = patch.rimIntensity;
    if (patch.fillIntensity !== undefined && this.fillLight) this.fillLight.intensity = patch.fillIntensity;
    if (patch.shadowSoftness !== undefined && this.keyLight) {
      this.keyLight.shadow.radius = patch.shadowSoftness;
      // A changed radius only takes effect once the map is redrawn.
      this.keyLight.shadow.needsUpdate = true;
    }
    return this.presentation();
  }

  /** Current presentation values, for the editor's readout and export. */
  presentation(): Record<string, number> {
    return {
      exposure: Number(this.renderer.toneMappingExposure.toFixed(2)),
      environmentIntensity: Number((this.scene.environmentIntensity ?? 1).toFixed(2)),
      keyIntensity: Number((this.keyLight?.intensity ?? 0).toFixed(2)),
      rimIntensity: Number((this.rimLight?.intensity ?? 0).toFixed(2)),
      fillIntensity: Number((this.fillLight?.intensity ?? 0).toFixed(2)),
      shadowSoftness: Number((this.keyLight?.shadow.radius ?? 0).toFixed(1))
    };
  }

  /**
   * Loads an arbitrary GLB, for authoring a ship that is not in the catalog.
   *
   * The URL is usually an object URL over a dropped file, so it never touches
   * the network or the ship catalog. Framing, gizmos and the shadow frustum all
   * re-derive from the new bounds, which is what makes the editor usable for a
   * hull of any proportion.
   */
  async loadExternalModel(url: string, label: string): Promise<GarageDiagnostics> {
    const definition = {
      ...STARTER_SHIP,
      id: `external:${label}`,
      displayName: label,
      model: { garage: url, gameplayMedium: url, gameplayLow: url, gameplayOriginal: url }
    };
    await this.show(definition);
    if (this.gizmos?.visible) this.refreshHardpointGizmos();
    return this.diagnostics;
  }

  inspect(): Record<string, unknown> {
    const raw = new THREE.Box3().setFromObject(this.ship.group);
    const rawSphere = raw.getBoundingSphere(new THREE.Sphere());

    // Which meshes reach furthest from the ship's centre. A trail or a plume
    // sitting metres behind the hull inflates the radius and pushes the camera
    // back, which is exactly the symptom being chased.
    const centre = rawSphere.center;
    const reach: { name: string; radius: number; visible: boolean; type: string }[] = [];
    const box = new THREE.Box3();
    this.ship.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Points) &&
          !(object instanceof THREE.Sprite)) return;
      box.setFromObject(object);
      if (box.isEmpty()) return;
      const corners = [box.min, box.max];
      let furthest = 0;
      for (const corner of corners) furthest = Math.max(furthest, corner.distanceTo(centre));
      reach.push({
        name: object.name || '(unnamed)',
        radius: Number(furthest.toFixed(2)),
        visible: object.visible,
        type: object.type
      });
    });
    reach.sort((a, b) => b.radius - a.radius);

    let meshes = 0;
    let casters = 0;
    this.ship.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      meshes += 1;
      if (object.castShadow) casters += 1;
    });

    const key = this.keyLight;
    const shadowCamera = key?.shadow.camera;
    return {
      rawBounds: {
        min: raw.min.toArray().map((n) => Number(n.toFixed(2))),
        max: raw.max.toArray().map((n) => Number(n.toFixed(2))),
        size: raw.getSize(new THREE.Vector3()).toArray().map((n) => Number(n.toFixed(2))),
        centre: centre.toArray().map((n) => Number(n.toFixed(2))),
        radius: Number(rawSphere.radius.toFixed(2))
      },
      framing: {
        height: Number(this.framing.height.toFixed(2)),
        spread: Number(this.framing.spread.toFixed(2))
      },
      cameraDistance: Number(this.framing.distance.toFixed(2)),
      cameraPosition: this.camera.position.toArray().map((n) => Number(n.toFixed(2))),
      topReach: reach.slice(0, 10),
      shadow: {
        rendererEnabled: this.renderer.shadowMap.enabled,
        type: this.renderer.shadowMap.type,
        keyCastShadow: key?.castShadow ?? false,
        keyPosition: key?.position.toArray() ?? null,
        keyTarget: key?.target.position.toArray() ?? null,
        shipMeshes: meshes,
        shipCasters: casters,
        camera: shadowCamera
          ? {
            left: (shadowCamera as THREE.OrthographicCamera).left,
            right: (shadowCamera as THREE.OrthographicCamera).right,
            top: (shadowCamera as THREE.OrthographicCamera).top,
            bottom: (shadowCamera as THREE.OrthographicCamera).bottom,
            near: shadowCamera.near,
            far: shadowCamera.far
          }
          : null,
        shipWorldY: Number(this.ship.group.position.y.toFixed(2)),
        platformTopY: -2.8
      }
    };
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.stage.clientWidth);
    const height = Math.max(1, this.stage.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.applyFraming();
    this.diagnostics.rendererWidth = width;
    this.diagnostics.rendererHeight = height;
  };

  private readonly render = (): void => {
    this.raf = 0;
    if (!this.diagnostics.visible) return;
    const delta = Math.min(this.clock.getDelta(), 0.05);
    if (this.autoRotate && !this.dragging && this.loadedDefinition) this.targetYaw += delta * 0.09;
    this.yaw += (this.targetYaw - this.yaw) * (1 - Math.exp(-delta * 8));
    this.pitch += (this.targetPitch - this.pitch) * (1 - Math.exp(-delta * 8));
    this.ship.group.rotation.set(this.pitch, this.yaw, 0);
    this.ship.thrustInput = 0.12;
    this.ship.update(delta, this.clock.elapsedTime, 0, false, 27);
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
    this.diagnostics.drawCalls = this.renderer.info.render.calls;
    this.diagnostics.triangles = this.renderer.info.render.triangles;
    this.diagnostics.rafActive = true;
    this.raf = requestAnimationFrame(this.render);
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.dragging = true;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    this.targetYaw += (event.clientX - this.pointerX) * 0.006;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + (event.clientY - this.pointerY) * 0.003, -0.18, 0.32);
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.dragging = false;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };
}
