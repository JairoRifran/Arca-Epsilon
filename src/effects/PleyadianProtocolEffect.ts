import * as THREE from 'three';

const WAVE_COUNT = 4;
const ROUTE_COUNT = 4;

/**
 * The harmonic layer of M16's Pleyadian protocol.
 *
 * A single centred emitter: concentric harmonic waves that rise and fade in an
 * ordered loop, plus a set of approach-route holograms that only appear during
 * the defensive simulation. Pale cyan and white, clean and ordered — signal,
 * not spectacle. `setIntensity` rides the protocol's progress; `setSimulation`
 * toggles the route lines. Every mesh is built once: nothing here allocates
 * geometry, materials or vectors during update, and there is no postprocessing.
 */
export class PleyadianProtocolEffect {
  readonly group = new THREE.Group();

  private readonly waves: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly routes: THREE.Line[] = [];
  private readonly routeMaterial: THREE.LineBasicMaterial;
  private readonly origin = new THREE.Vector3();
  private intensity = 0;
  private simulationLevel = 0;
  private simulationActive = false;

  constructor() {
    this.group.name = 'Protocolo Pleyadiano';
    this.group.visible = false;

    // Flat harmonic rings, additively blended, one shared geometry.
    const waveGeometry = new THREE.RingGeometry(0.86, 1, 48);
    for (let i = 0; i < WAVE_COUNT; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x9fe6f4 : 0xeaf4f8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const wave = new THREE.Mesh(waveGeometry, material);
      wave.rotation.x = -Math.PI / 2;
      wave.frustumCulled = false;
      this.waves.push(wave);
      this.group.add(wave);
    }

    // Approach-route holograms: thin lines radiating outward, shown only in the
    // simulation. Built once with fixed deterministic bearings.
    this.routeMaterial = new THREE.LineBasicMaterial({
      color: 0xb79a5e,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    for (let i = 0; i < ROUTE_COUNT; i += 1) {
      const angle = (i / ROUTE_COUNT) * Math.PI * 2 + 0.35;
      const far = 44 + (i % 2) * 18;
      const points = [
        new THREE.Vector3(0, 0.4, 0),
        new THREE.Vector3(Math.cos(angle) * far * 0.45, 0.8 + (i % 2) * 0.6, Math.sin(angle) * far * 0.45),
        new THREE.Vector3(Math.cos(angle) * far, 0.4, Math.sin(angle) * far)
      ];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, this.routeMaterial);
      line.frustumCulled = false;
      line.visible = false;
      this.routes.push(line);
      this.group.add(line);
    }
  }

  /** Centre the emitter on the settlement. Called on sync, never per frame. */
  setOrigin(x: number, y: number, z: number): void {
    this.origin.set(x, y + 0.08, z);
    this.group.position.copy(this.origin);
  }

  /** 0 = protocol dormant, 1 = fully active. */
  setIntensity(value: number): void {
    this.intensity = THREE.MathUtils.clamp(value, 0, 1);
  }

  setSimulationActive(active: boolean): void {
    this.simulationActive = active;
  }

  update(delta: number, elapsed: number): void {
    const visible = this.intensity > 0.01 || this.simulationLevel > 0.01;
    this.group.visible = visible;
    if (!visible) return;

    // Harmonic waves: each rises from the centre on its own offset phase so the
    // set reads as an ordered pulse rather than noise.
    for (let i = 0; i < this.waves.length; i += 1) {
      const phase = (elapsed * 0.35 + i / this.waves.length) % 1;
      const radius = 2 + phase * 26 * (0.4 + this.intensity * 0.6);
      const wave = this.waves[i];
      wave.scale.setScalar(radius);
      // Bright at birth, gone at the rim.
      wave.material.opacity = (1 - phase) * 0.5 * this.intensity;
    }

    // Route holograms ease in and out with the simulation, and crawl outward.
    this.simulationLevel += ((this.simulationActive ? 1 : 0) - this.simulationLevel) * Math.min(1, delta * 2.5);
    const routesShown = this.simulationLevel > 0.01;
    this.routeMaterial.opacity = this.simulationLevel * (0.4 + Math.sin(elapsed * 1.6) * 0.12);
    for (let i = 0; i < this.routes.length; i += 1) {
      this.routes[i].visible = routesShown;
    }
  }

  dispose(): void {
    for (const wave of this.waves) {
      wave.geometry.dispose();
      wave.material.dispose();
    }
    for (const route of this.routes) route.geometry.dispose();
    this.routeMaterial.dispose();
  }
}
