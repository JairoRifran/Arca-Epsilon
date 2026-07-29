import * as THREE from 'three';

export class SurfaceProbe {
  readonly group = new THREE.Group();
  private readonly beamMaterial: THREE.MeshBasicMaterial;

  constructor() {
    this.group.name = 'SurfaceProbe';
    this.group.visible = false;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xddffff,
      roughness: 0.3,
      metalness: 0.8
    });

    const core = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12), bodyMat);
    this.group.add(core);

    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffaa,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending
    });

    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 1.8, 8, 12), this.beamMaterial);
    beam.position.y = -4;
    this.group.add(beam);
  }

  launchAt(position: THREE.Vector3): void {
    this.group.position.copy(position);
    this.group.position.y += 12;
    this.group.visible = true;
  }

  update(delta: number, elapsed: number): void {
    if (!this.group.visible) return;
    this.group.position.y = 8 + Math.sin(elapsed * 3.0) * 1.5;
    this.group.rotation.y += delta * 2.0;
    this.beamMaterial.opacity = 0.3 + Math.sin(elapsed * 6.0) * 0.2;
  }
}
