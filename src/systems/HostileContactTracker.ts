import * as THREE from 'three';

/**
 * Screen-space tracking for hostile contacts.
 *
 * The reason this exists: a breach drone is 1.9 m across, so at the ~600 m
 * engagement range M19 opens at it projects to roughly three pixels. No amount
 * of contrast or emissive trim makes a three-pixel object findable — the fix
 * has to be a marker, and the marker has to carry the information the model
 * cannot at that size.
 *
 * One projection pass per frame for every contact, feeding a fixed pool of DOM
 * elements. Nothing here allocates per frame and nothing creates elements after
 * construction.
 */

/** What the rest of the game already exposes for each hostile. */
export type HostileSource = {
  readonly targets: { object: THREE.Object3D; radius: number; health: number; hostile: boolean }[];
  readonly activeCount: number;
};

export type ContactVisibility = 'visible' | 'sensor';

export type HostileContact = {
  id: string;
  type: string;
  world: THREE.Vector3;
  distance: number;
  screenX: number;
  screenY: number;
  onScreen: boolean;
  behindCamera: boolean;
  visibility: ContactVisibility;
  health: number;
  maxHealth: number;
  selected: boolean;
  angle: number;
};

type MarkerElement = {
  root: HTMLDivElement;
  label: HTMLElement;
  distance: HTMLElement;
  arrow: HTMLElement;
  health: HTMLElement;
  healthFill: HTMLElement;
  inUse: boolean;
};

const MAX_CONTACTS = 24;
/** Off-screen arrows are capped so a swarm cannot ring the whole viewport. */
const MAX_OFFSCREEN_MARKERS = 6;
/** Terrain samples along the sight line. Eight is enough for a hill. */
const LOS_SAMPLES = 8;
/** Frames a contact marker stays lit after taking damage. */
const HIT_FLASH_FRAMES = 12;

/**
 * Safe area for edge indicators, as viewport fractions.
 *
 * A uniform margin put arrows underneath the mission panel on the left and the
 * settlement panel on the right, where they are unreadable. These insets clear
 * the standing HUD chrome instead. Fractions rather than pixels so the layout
 * holds at other resolutions.
 */
const SAFE_AREA = { left: 0.34, right: 0.71, top: 0.15, bottom: 0.88 };

/** True when the object and every ancestor are visible. */
function isRenderable(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (!node.visible) return false;
    node = node.parent;
  }
  return true;
}

export class HostileContactTracker {
  private readonly container: HTMLDivElement;
  private readonly pool: MarkerElement[] = [];
  private readonly contactList: HostileContact[] = [];

  // Scratch: the update path must not allocate.
  private readonly worldScratch = new THREE.Vector3();
  private readonly projectedScratch = new THREE.Vector3();
  private readonly cameraLocalScratch = new THREE.Vector3();
  private readonly losScratch = new THREE.Vector3();

  /**
   * Last seen health per contact, and how recently each one was hit.
   *
   * Hit confirmation has to work at any angle and any range: the drones orbit
   * the player, so most of the time the one being shot is off to the side or
   * behind, and its model is a few pixels even when it is in frame. Measured
   * kills were landing with nothing on screen at all. Flashing the marker is
   * the only feedback that reaches the player wherever the target happens to
   * be, and it costs one number per contact.
   */
  private readonly lastHealth = new Map<string, number>();
  private readonly hitAt = new Map<string, number>();
  private clock = 0;

  private selectedId: string | null = null;
  private groundSampler?: (x: number, z: number) => number;
  private lastRenderedCount = 0;
  private lastCulledCount = 0;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'contact-layer';
    this.container.id = 'contact-layer';
    this.container.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.container);

    // Whole pool built once. Creating elements while contacts appear is how a
    // marker system turns into a per-frame DOM churn problem.
    for (let i = 0; i < MAX_CONTACTS; i += 1) {
      const root = document.createElement('div');
      root.className = 'contact-marker';
      root.style.display = 'none';

      const arrow = document.createElement('i');
      arrow.className = 'contact-marker__arrow';
      root.appendChild(arrow);

      const bracket = document.createElement('span');
      bracket.className = 'contact-marker__bracket';
      root.appendChild(bracket);

      const label = document.createElement('span');
      label.className = 'contact-marker__label';
      root.appendChild(label);

      const distance = document.createElement('strong');
      distance.className = 'contact-marker__distance';
      root.appendChild(distance);

      const health = document.createElement('span');
      health.className = 'contact-marker__health';
      const healthFill = document.createElement('i');
      health.appendChild(healthFill);
      root.appendChild(health);

      this.container.appendChild(root);
      this.pool.push({ root, label, distance, arrow, health, healthFill, inUse: false });
    }
  }

  /** Terrain probe, used for line-of-sight only. */
  setGroundSampler(sampler: (x: number, z: number) => number): void {
    this.groundSampler = sampler;
  }

  get contacts(): readonly HostileContact[] {
    return this.contactList;
  }
  get renderedCount(): number {
    return this.lastRenderedCount;
  }
  get culledCount(): number {
    return this.lastCulledCount;
  }
  get currentTargetId(): string | null {
    return this.selectedId;
  }

  /** Clears every marker without tearing down the pool. */
  hideAll(): void {
    for (const marker of this.pool) {
      if (!marker.inUse) continue;
      marker.root.style.display = 'none';
      marker.inUse = false;
    }
    this.contactList.length = 0;
    this.lastRenderedCount = 0;
    this.selectedId = null;
  }

  /**
   * Selects the closest hostile in front of the ship.
   *
   * "In front" is deliberate: cycling onto something behind the player while a
   * visible threat is ahead reads as the game fighting the player.
   */
  selectNearestAhead(shipForward: THREE.Vector3): string | null {
    let best: HostileContact | undefined;
    for (const contact of this.contactList) {
      if (contact.behindCamera) continue;
      this.losScratch.copy(contact.world).normalize();
      if (this.losScratch.dot(shipForward) < 0) continue;
      if (!best || contact.distance < best.distance) best = contact;
    }
    this.selectedId = best ? best.id : null;
    return this.selectedId;
  }

  /** Advances to the next contact by distance, wrapping around. */
  cycleTarget(): string | null {
    if (this.contactList.length === 0) {
      this.selectedId = null;
      return null;
    }
    const ordered = [...this.contactList].sort((a, b) => a.distance - b.distance);
    const index = ordered.findIndex((c) => c.id === this.selectedId);
    this.selectedId = ordered[(index + 1) % ordered.length].id;
    return this.selectedId;
  }

  /**
   * Rebuilds the contact list and lays out the markers.
   *
   * Called once per frame from one place. Any other system that needs contact
   * screen positions reads `contacts` rather than projecting again.
   */
  update(
    sources: readonly { source: HostileSource; type: string; maxHealth: number }[],
    camera: THREE.Camera,
    viewer: THREE.Vector3,
    width: number,
    height: number
  ): void {
    this.contactList.length = 0;
    let culled = 0;
    this.clock += 1;

    for (const entry of sources) {
      const { targets } = entry.source;
      for (let i = 0; i < targets.length; i += 1) {
        const target = targets[i];
        if (!target.hostile || target.health <= 0) continue;
        // Ancestor visibility, not just the node's own flag: a fleet clears by
        // hiding its whole group, and `Object3D.visible` does not inherit.
        if (!isRenderable(target.object)) continue;
        if (this.contactList.length >= MAX_CONTACTS) { culled += 1; continue; }

        target.object.getWorldPosition(this.worldScratch);
        const distance = this.worldScratch.distanceTo(viewer);

        this.cameraLocalScratch.copy(this.worldScratch);
        camera.worldToLocal(this.cameraLocalScratch);
        const behindCamera = this.cameraLocalScratch.z > 0;

        this.projectedScratch.copy(this.worldScratch).project(camera);
        const screenX = (this.projectedScratch.x * 0.5 + 0.5) * width;
        const screenY = (-this.projectedScratch.y * 0.5 + 0.5) * height;
        const onScreen = !behindCamera &&
          screenX >= 0 && screenX <= width && screenY >= 0 && screenY <= height;

        this.contactList.push({
          id: `${entry.type}-${i}`,
          type: entry.type,
          world: this.worldScratch.clone(),
          distance,
          screenX,
          screenY,
          onScreen,
          behindCamera,
          visibility: this.hasLineOfSight(viewer, this.worldScratch) ? 'visible' : 'sensor',
          health: target.health,
          maxHealth: entry.maxHealth,
          selected: false,
          angle: Math.atan2(screenY - height * 0.5, screenX - width * 0.5) + Math.PI / 2
        });

        // Damage detection: a drop since the last frame means this contact was
        // just hit, whether or not the player can see it.
        const id = `${entry.type}-${i}`;
        const previous = this.lastHealth.get(id);
        if (previous !== undefined && target.health < previous) this.hitAt.set(id, this.clock);
        this.lastHealth.set(id, target.health);
      }
    }

    // Drop a stale selection rather than pointing at a destroyed contact.
    if (this.selectedId && !this.contactList.some((c) => c.id === this.selectedId)) {
      this.selectedId = null;
    }
    for (const contact of this.contactList) {
      contact.selected = contact.id === this.selectedId;
    }

    this.lastCulledCount = culled;
    this.layout(width, height);
  }

  /**
   * Samples the terrain between viewer and contact.
   *
   * Cheap by design: eight height samples, no raycast. It answers "is there a
   * hill in the way", which is the only occlusion that matters on a surface.
   */
  private hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    if (!this.groundSampler) return true;
    for (let step = 1; step < LOS_SAMPLES; step += 1) {
      const t = step / LOS_SAMPLES;
      this.losScratch.lerpVectors(from, to, t);
      const ground = this.groundSampler(this.losScratch.x, this.losScratch.z);
      // A small bias stops gentle ground the sight line grazes from counting.
      if (ground > this.losScratch.y + 0.6) return false;
    }
    return true;
  }

  private layout(width: number, height: number): void {
    // Selected first, then nearest: when the off-screen budget runs out the
    // contacts that get dropped are the ones the player cares about least.
    const ordered = [...this.contactList].sort((a, b) => {
      if (a.selected !== b.selected) return a.selected ? -1 : 1;
      return a.distance - b.distance;
    });

    let used = 0;
    let offscreenUsed = 0;
    const safeLeft = width * SAFE_AREA.left;
    const safeRight = width * SAFE_AREA.right;
    const safeTop = height * SAFE_AREA.top;
    const safeBottom = height * SAFE_AREA.bottom;

    for (const contact of ordered) {
      if (used >= this.pool.length) break;
      const offscreen = !contact.onScreen;
      if (offscreen && offscreenUsed >= MAX_OFFSCREEN_MARKERS && !contact.selected) continue;

      const marker = this.pool[used];
      used += 1;
      if (offscreen) offscreenUsed += 1;

      let x = contact.screenX;
      let y = contact.screenY;
      let angle = contact.angle;
      if (offscreen) {
        if (contact.behindCamera) {
          // Behind the camera the projection mirrors, so derive the direction
          // from the camera-local vector instead of the projected point.
          x = width - x;
          y = height - y;
          angle = Math.atan2(y - height * 0.5, x - width * 0.5) + Math.PI / 2;
        }
        x = THREE.MathUtils.clamp(x, safeLeft, safeRight);
        y = THREE.MathUtils.clamp(y, safeTop, safeBottom);
      }

      const root = marker.root;
      root.style.display = 'grid';
      root.style.left = `${Math.round(x)}px`;
      root.style.top = `${Math.round(y)}px`;
      root.classList.toggle('is-offscreen', offscreen);
      root.classList.toggle('is-selected', contact.selected);
      root.classList.toggle('is-sensor', contact.visibility === 'sensor');
      root.classList.toggle('is-near', contact.distance < 180);
      // Brief flash on the frames just after a hit registers.
      const hitFrame = this.hitAt.get(contact.id);
      root.classList.toggle('is-hit', hitFrame !== undefined && this.clock - hitFrame < HIT_FLASH_FRAMES);
      if (offscreen) marker.arrow.style.transform = `rotate(${angle}rad)`;

      // Distance always; type only close in or when selected; health only for
      // the selected contact. Showing everything at once is how a contact
      // layer turns into noise.
      marker.distance.textContent = contact.distance >= 1000
        ? `${(contact.distance / 1000).toFixed(1)} km`
        : `${Math.round(contact.distance)} m`;
      const showLabel = contact.selected || contact.distance < 180;
      marker.label.textContent = showLabel
        ? (contact.visibility === 'sensor' ? `${contact.type} ??` : contact.type)
        : '';
      const showHealth = contact.selected && contact.visibility === 'visible';
      marker.health.style.display = showHealth ? 'block' : 'none';
      if (showHealth) {
        const ratio = THREE.MathUtils.clamp(contact.health / Math.max(1, contact.maxHealth), 0, 1);
        marker.healthFill.style.width = `${Math.round(ratio * 100)}%`;
      }
      marker.inUse = true;
    }

    for (let i = used; i < this.pool.length; i += 1) {
      if (!this.pool[i].inUse) continue;
      this.pool[i].root.style.display = 'none';
      this.pool[i].inUse = false;
    }
    this.lastRenderedCount = used;
  }
}
