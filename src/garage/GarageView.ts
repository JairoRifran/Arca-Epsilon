import * as THREE from 'three';
import { AssetLoader } from '../core/AssetLoader';
import { PlayerShip } from '../entities/PlayerShip';
import type { ShipDefinition } from '../ships/ShipCatalog';

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
  private raf = 0;
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
    this.scene.background = new THREE.Color(0x020608);
    this.scene.fog = new THREE.Fog(0x020608, 34, 78);
    this.buildHangar();
    this.scene.add(this.ship.group);
    this.camera.position.set(0, 5.8, 27);
    this.camera.lookAt(0, 0.8, 0);
    this.scene.add(this.camera);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(root);
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
      this.loadedDefinition = definition;
      this.diagnostics.loadState = 'ready';
    } catch {
      this.diagnostics.loadState = 'failed';
    }
  }

  private buildHangar(): void {
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x151b1e, roughness: 0.74, metalness: 0.56 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(54, 42), floorMaterial);
    floor.name = 'Garage service floor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.1;
    floor.receiveShadow = false;
    this.scene.add(floor);

    const recessMaterial = new THREE.MeshStandardMaterial({ color: 0x05090b, roughness: 0.42, metalness: 0.82 });
    const recess = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 0.28, 48), recessMaterial);
    recess.position.y = -2.96;
    this.scene.add(recess);

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

    const key = new THREE.DirectionalLight(0xd6f4ff, 4.4);
    key.position.set(-8, 12, 10);
    const rim = new THREE.DirectionalLight(0x62a9bd, 3.2);
    rim.position.set(10, 5, -12);
    const bounce = new THREE.HemisphereLight(0x89aeb8, 0x101315, 1.25);
    this.scene.add(key, rim, bounce);
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.root.clientWidth);
    const height = Math.max(1, this.root.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.ship.group.position.x = width > 620 && width <= 900 && height <= 520 ? -4 : 0;
    this.diagnostics.rendererWidth = width;
    this.diagnostics.rendererHeight = height;
  };

  private readonly render = (): void => {
    this.raf = 0;
    if (!this.diagnostics.visible) return;
    const delta = Math.min(this.clock.getDelta(), 0.05);
    if (!this.dragging && this.loadedDefinition) this.targetYaw += delta * 0.09;
    this.yaw += (this.targetYaw - this.yaw) * (1 - Math.exp(-delta * 8));
    this.pitch += (this.targetPitch - this.pitch) * (1 - Math.exp(-delta * 8));
    this.ship.group.position.x =
      this.diagnostics.rendererWidth > 620 &&
      this.diagnostics.rendererWidth <= 900 &&
      this.diagnostics.rendererHeight <= 520
        ? -4
        : 0;
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
