import * as THREE from 'three';
import { createSoftParticleTexture } from '../assets/materials';
import type { AtmosphericAscentMetrics } from '../game/AtmosphericAscentController';

/** Lightweight M24 atmosphere seen while the real ship transform climbs. */
export class AtmosphericAscentEffect {
  readonly group = new THREE.Group();

  private readonly origin = new THREE.Vector3();
  private cloudMaterial?: THREE.SpriteMaterial;
  private dustMaterial?: THREE.SpriteMaterial;
  private starMaterial?: THREE.PointsMaterial;
  private limbMaterial?: THREE.MeshBasicMaterial;
  private planetMaterial?: THREE.MeshStandardMaterial;
  private clouds?: THREE.Group;
  private dust?: THREE.Group;
  private stars?: THREE.Points;
  private planet?: THREE.Mesh;
  private limb?: THREE.Mesh;
  private built = false;

  constructor() {
    this.group.name = 'M24 Atmospheric Ascent';
    this.group.visible = false;
  }

  get isBuilt(): boolean { return this.built; }
  get cloudLayerVisible(): boolean { return Boolean(this.clouds?.visible); }
  get planetLimbVisible(): boolean { return Boolean(this.limb?.visible); }
  get starOpacity(): number { return this.starMaterial?.opacity ?? 0; }

  activate(origin: THREE.Vector3): void {
    this.ensureBuilt();
    this.origin.copy(origin);
    this.group.position.set(origin.x, 0, origin.z);
    this.group.visible = true;
  }

  update(elapsed: number, metrics: AtmosphericAscentMetrics): void {
    if (!this.group.visible || !this.built) return;
    if (this.cloudMaterial && this.clouds) {
      this.cloudMaterial.opacity = 0.12 + metrics.cloudOpacity * 0.76;
      this.clouds.visible = metrics.worldClearance < 104 && this.cloudMaterial.opacity > 0.03;
      this.clouds.rotation.y = elapsed * 0.0025;
    }
    if (this.dustMaterial && this.dust) {
      const launchDust = THREE.MathUtils.clamp(1 - metrics.worldClearance / 20, 0, 1);
      this.dustMaterial.opacity = launchDust * Math.min(0.5, metrics.enginePower / 150);
      this.dust.visible = this.dustMaterial.opacity > 0.01;
      const dustScale = 1 + (1 - launchDust) * 1.8;
      this.dust.scale.set(dustScale, 1, dustScale);
    }
    if (this.starMaterial && this.stars) {
      this.starMaterial.opacity = metrics.starOpacity * 0.92;
      this.stars.visible = this.starMaterial.opacity > 0.01;
      this.stars.rotation.y = elapsed * 0.001;
    }
    if (this.planetMaterial && this.planet) {
      this.planetMaterial.opacity = 0.42 + metrics.curvature * 0.48;
      this.planet.visible = metrics.worldClearance > 58;
    }
    if (this.limbMaterial && this.limb) {
      this.limbMaterial.opacity = metrics.curvature * 0.62;
      this.limb.visible = this.limbMaterial.opacity > 0.01;
    }
  }

  hideAtmosphere(): void {
    if (this.clouds) this.clouds.visible = false;
    if (this.dust) this.dust.visible = false;
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible && this.built;
  }

  dispose(): void {
    if (!this.built) return;
    this.group.visible = false;
    const geometries = new Set<THREE.BufferGeometry>();
    this.group.traverse((object) => {
      const renderable = object as THREE.Mesh | THREE.Points;
      if (renderable.geometry) geometries.add(renderable.geometry);
    });
    for (const geometry of geometries) geometry.dispose();
    this.cloudMaterial?.map?.dispose();
    this.dustMaterial?.map?.dispose();
    this.cloudMaterial?.dispose();
    this.dustMaterial?.dispose();
    this.starMaterial?.dispose();
    this.limbMaterial?.dispose();
    this.planetMaterial?.dispose();
    this.group.clear();
    this.cloudMaterial = undefined;
    this.dustMaterial = undefined;
    this.starMaterial = undefined;
    this.limbMaterial = undefined;
    this.planetMaterial = undefined;
    this.clouds = undefined;
    this.dust = undefined;
    this.stars = undefined;
    this.planet = undefined;
    this.limb = undefined;
    this.built = false;
  }

  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;

    const cloudTexture = createSoftParticleTexture(96);
    this.cloudMaterial = new THREE.SpriteMaterial({
      map: cloudTexture,
      color: 0xd9e2df,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: true
    });
    this.clouds = new THREE.Group();
    this.clouds.name = 'M24 Physical Cloud Layer';
    for (let index = 0; index < 28; index += 1) {
      const angle = index / 28 * Math.PI * 2;
      const ring = 48 + (index % 4) * 26;
      const cloud = new THREE.Sprite(this.cloudMaterial);
      cloud.position.set(Math.cos(angle) * ring, 47 + (index % 5) * 2.1, Math.sin(angle) * ring);
      cloud.scale.set(42 + (index % 3) * 16, 19 + (index % 4) * 4, 1);
      this.clouds.add(cloud);
    }

    const dustTexture = createSoftParticleTexture(64);
    this.dustMaterial = new THREE.SpriteMaterial({
      map: dustTexture,
      color: 0x8f8b79,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.dust = new THREE.Group();
    this.dust.name = 'M24 Launch Dust';
    for (let index = 0; index < 12; index += 1) {
      const angle = index / 12 * Math.PI * 2;
      const sprite = new THREE.Sprite(this.dustMaterial);
      sprite.position.set(Math.cos(angle) * 8, 2.2 + (index % 3), Math.sin(angle) * 8);
      sprite.scale.setScalar(9 + (index % 4) * 2);
      this.dust.add(sprite);
    }

    const starCount = 520;
    const starPositions = new Float32Array(starCount * 3);
    for (let index = 0; index < starCount; index += 1) {
      const theta = index * 2.399963;
      const y = 0.08 + (index % 97) / 96 * 0.92;
      const radial = Math.sqrt(Math.max(0, 1 - y * y));
      const radius = 760 + (index % 11) * 22;
      starPositions[index * 3] = Math.cos(theta) * radial * radius;
      starPositions[index * 3 + 1] = y * radius;
      starPositions[index * 3 + 2] = Math.sin(theta) * radial * radius;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.starMaterial = new THREE.PointsMaterial({
      color: 0xdcecff,
      size: 2.4,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true
    });
    this.stars = new THREE.Points(starGeometry, this.starMaterial);
    this.stars.name = 'M24 Progressive Stars';
    this.stars.frustumCulled = false;

    this.planetMaterial = new THREE.MeshStandardMaterial({
      color: 0x395f53,
      emissive: 0x10221f,
      emissiveIntensity: 0.25,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.42,
      side: THREE.FrontSide
    });
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(430, 48, 24), this.planetMaterial);
    this.planet.name = 'E-01 Surface Curvature M24';
    this.planet.position.y = -427;
    this.planet.scale.z = 1.08;

    this.limbMaterial = new THREE.MeshBasicMaterial({
      color: 0x7fc9c6,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    this.limb = new THREE.Mesh(new THREE.TorusGeometry(432, 1.7, 8, 96), this.limbMaterial);
    this.limb.name = 'E-01 Atmospheric Limb M24';
    this.limb.position.y = -427;
    this.limb.rotation.x = Math.PI / 2;
    this.limb.scale.z = 1.08;

    this.group.add(this.clouds, this.dust, this.stars, this.planet, this.limb);
  }
}
