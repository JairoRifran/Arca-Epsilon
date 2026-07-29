import { Group, Mesh, MeshStandardMaterial, CylinderGeometry, SphereGeometry, PointLight, BoxGeometry } from 'three';

export class CloakingProjector {
  readonly group = new Group();
  private readonly coreLight: PointLight;
  private readonly coreMaterial: MeshStandardMaterial;
  
  private isCalibrated = false;

  constructor(position: readonly [number, number, number], name: string) {
    this.group.name = name;
    this.group.position.set(...position);

    // Base
    const baseGeo = new CylinderGeometry(1.5, 2.0, 0.5, 8);
    const baseMat = new MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8, metalness: 0.6 });
    const baseMesh = new Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.25;
    this.group.add(baseMesh);

    // Pillar
    const pillarGeo = new BoxGeometry(0.8, 3.0, 0.8);
    const pillarMat = new MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.7, metalness: 0.5 });
    const pillarMesh = new Mesh(pillarGeo, pillarMat);
    pillarMesh.position.y = 2.0;
    this.group.add(pillarMesh);

    // Antennas
    const antennaGeo = new CylinderGeometry(0.05, 0.05, 1.5, 4);
    const antennaMat = new MeshStandardMaterial({ color: 0x111111 });
    
    for (let i = 0; i < 3; i++) {
      const antenna = new Mesh(antennaGeo, antennaMat);
      antenna.position.set(
        Math.cos((i * Math.PI * 2) / 3) * 0.6,
        3.8,
        Math.sin((i * Math.PI * 2) / 3) * 0.6
      );
      antenna.rotation.x = Math.PI / 8;
      this.group.add(antenna);
    }

    // Energy Core
    const coreGeo = new SphereGeometry(0.5, 16, 16);
    // Muted blue-green service glow — field hardware, not neon.
    this.coreMaterial = new MeshStandardMaterial({
      color: 0x5fd0b2,
      emissive: 0x4fbfa4,
      emissiveIntensity: 0.08,
      transparent: true,
      opacity: 0.72
    });
    const coreMesh = new Mesh(coreGeo, this.coreMaterial);
    coreMesh.position.y = 4.0;
    this.group.add(coreMesh);

    // Light
    this.coreLight = new PointLight(0x5fd0b2, 0, 10);
    this.coreLight.position.y = 4.0;
    this.group.add(this.coreLight);
  }

  calibrate(): void {
    if (this.isCalibrated) return;
    this.isCalibrated = true;
    this.coreMaterial.emissiveIntensity = 1.05;
    this.coreLight.intensity = 0.85;
  }

  get calibrated(): boolean {
    return this.isCalibrated;
  }

  restoreState(calibrated: boolean): void {
    if (calibrated) {
      this.calibrate();
    }
  }
}
