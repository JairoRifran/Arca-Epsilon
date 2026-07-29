import { Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';

export class CloakingField {
  readonly group = new Group();
  private readonly material: MeshStandardMaterial;
  private readonly mesh: Mesh;
  private isOnline = false;

  constructor(position: readonly [number, number, number], name: string) {
    this.group.name = name;
    this.group.position.set(...position);

    const radius = 350; // Covers Nereida base and projectors
    const geo = new SphereGeometry(radius, 32, 32);

    // Barely-there translucent lattice: technological, defensive, never a
    // solid dome and never arcade-bright.
    this.material = new MeshStandardMaterial({
      color: 0x1f3a34,
      emissive: 0x3f8f7c,
      emissiveIntensity: 0.0,
      transparent: true,
      opacity: 0.0,
      wireframe: true,
      depthWrite: false
    });

    this.mesh = new Mesh(geo, this.material);
    // Move up so it feels like a dome rather than a full sphere
    this.mesh.position.y = -50; 
    this.group.add(this.mesh);
  }

  activate(): void {
    if (this.isOnline) return;
    this.isOnline = true;
  }

  get online(): boolean {
    return this.isOnline;
  }

  restoreState(online: boolean): void {
    if (online) {
      this.activate();
      this.material.opacity = 0.035;
      this.material.emissiveIntensity = 0.16;
    }
  }

  update(delta: number): void {
    if (this.isOnline && this.material.opacity < 0.035) {
      this.material.opacity += delta * 0.02;
      this.material.emissiveIntensity = Math.min(0.16, this.material.emissiveIntensity + delta * 0.09);
    }

    if (this.isOnline) {
      // Subtle rotation
      this.mesh.rotation.y += delta * 0.02;
    }
  }
}
