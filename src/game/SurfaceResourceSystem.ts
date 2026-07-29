import * as THREE from 'three';
import {
  surfaceResources,
  type ResourceSiteStatus,
  type SurfaceResourceType
} from '../assets/surfaceResourceDefinitions';
import { ResourceNode } from '../entities/ResourceNode';
import type { ColonyManager } from './ColonyManager';
import type { ResourceInventory } from './ResourceInventory';

export type SurfaceResourceScanResult = {
  id: string;
  type: SurfaceResourceType;
  name: string;
  amount: number;
  status: ResourceSiteStatus;
};

export class SurfaceResourceSystem {
  readonly group = new THREE.Group();

  readonly nodes: ResourceNode[] = [];

  lastScanMessage = '';

  lastScannedResource?: SurfaceResourceScanResult;

  inactiveUpdateSkipped = 0;

  constructor() {
    this.group.name = 'SurfaceResourceSystem';
    this.group.visible = false;
  }

  setupNodes(getGroundHeight: (x: number, z: number) => number = () => 0): void {
    if (this.nodes.length > 0) return;

    for (const definition of surfaceResources) {
      const [x, z] = definition.position;
      const targetX = x + definition.sampleOffset[0];
      const targetZ = z + definition.sampleOffset[1];
      const node = new ResourceNode(
        definition,
        new THREE.Vector3(x, getGroundHeight(x, z), z),
        new THREE.Vector3(targetX, getGroundHeight(targetX, targetZ) + 0.18, targetZ)
      );
      this.nodes.push(node);
      this.group.add(node.group);
    }
  }

  activate(getGroundHeight?: (x: number, z: number) => number): void {
    this.setupNodes(getGroundHeight);
    if (getGroundHeight) {
      for (const node of this.nodes) node.anchorToTerrain(getGroundHeight);
    }
    this.group.visible = true;
  }

  syncFromColony(colonyManager: ColonyManager): void {
    this.setupNodes();
    for (const node of this.nodes) {
      node.setStatus(colonyManager.getResourceStatus(node.definition.type));
    }
  }

  scanNearby(
    playerPosition: THREE.Vector3,
    colonyManager: ColonyManager,
    inventory?: ResourceInventory,
    scanRange = 120,
    portableScanner = false
  ): boolean {
    if (!this.group.visible || !colonyManager.state.surfaceSitesRevealed) return false;

    const candidates = this.nodes
      .filter((node) => node.status !== 'unknown' && node.status !== 'analyzed')
      .map((node) => ({ node, distance: node.interactionPosition.distanceTo(playerPosition) }))
      .sort((a, b) => a.distance - b.distance);

    for (const { node, distance } of candidates) {
      const permittedRange = portableScanner
        ? Math.min(scanRange, node.definition.sampleRange)
        : Math.min(scanRange, node.definition.shipScanRange);
      if (distance > permittedRange) continue;

      const previousStatus = colonyManager.getResourceStatus(node.definition.type);
      if (portableScanner) {
        if (previousStatus === 'sampled') continue;
        colonyManager.locateResource(node.definition.type);
        colonyManager.sampleResource(node.definition.type);
        inventory?.addSurfaceResource(node.definition.type, node.definition.yieldAmount);
        node.setStatus('sampled');
        node.triggerSampleFeedback();
        this.lastScannedResource = {
          id: node.definition.id,
          type: node.definition.type,
          name: node.definition.name,
          amount: node.definition.yieldAmount,
          status: 'sampled'
        };
        this.lastScanMessage = `Muestra confirmada en ${node.definition.name}. Registra los datos y continúa el protocolo de campo.`;
        return true;
      }

      if (previousStatus === 'detected') {
        colonyManager.locateResource(node.definition.type);
        node.setStatus('located');
        this.lastScannedResource = {
          id: node.definition.id,
          type: node.definition.type,
          name: node.definition.name,
          amount: 0,
          status: 'located'
        };
        this.lastScanMessage = `${node.definition.name} localizada. Aterriza cerca, usa F para bajar y confirma una muestra con E.`;
        return true;
      }
    }

    return false;
  }

  getNearestUnscannedDistance(playerPosition: THREE.Vector3): { distance: number; name: string; status: ResourceSiteStatus } {
    let minDist = Number.POSITIVE_INFINITY;
    let nearestName = 'zona sin revelar';
    let nearestStatus: ResourceSiteStatus = 'unknown';

    for (const node of this.nodes) {
      if (node.status === 'unknown' || node.status === 'sampled' || node.status === 'analyzed') continue;
      const distance = node.interactionPosition.distanceTo(playerPosition);
      if (distance < minDist) {
        minDist = distance;
        nearestName = node.definition.name;
        nearestStatus = node.status;
      }
    }
    return { distance: minDist, name: nearestName, status: nearestStatus };
  }

  markAllScanned(colonyManager: ColonyManager, inventory?: ResourceInventory): void {
    this.setupNodes();
    colonyManager.revealSurfaceSites();
    for (const node of this.nodes) {
      const previousStatus = colonyManager.getResourceStatus(node.definition.type);
      if (previousStatus === 'sampled' || previousStatus === 'analyzed') continue;
      colonyManager.locateResource(node.definition.type);
      colonyManager.sampleResource(node.definition.type);
      inventory?.addSurfaceResource(node.definition.type, node.definition.yieldAmount);
      node.setStatus('sampled');
      node.triggerSampleFeedback();
      this.lastScannedResource = {
        id: node.definition.id,
        type: node.definition.type,
        name: node.definition.name,
        amount: node.definition.yieldAmount,
        status: 'sampled'
      };
    }
    this.lastScanMessage = 'Muestras de los tres sitios críticos registradas. Regresa al Hábitat Nereida-01 para analizarlas.';
  }

  analyzeSamples(colonyManager: ColonyManager): boolean {
    const analyzed = colonyManager.analyzeSamples();
    this.syncFromColony(colonyManager);
    if (analyzed) this.lastScanMessage = 'Análisis completado: agua, minerales y energía validados para Base Nereida.';
    return analyzed;
  }

  update(elapsed: number, observerPosition?: THREE.Vector3): void {
    if (!this.group.visible) return;
    for (const node of this.nodes) {
      if (
        observerPosition &&
        !node.hasActiveFeedback &&
        node.interactionPosition.distanceToSquared(observerPosition) > 280 * 280
      ) {
        this.inactiveUpdateSkipped += 1;
        continue;
      }
      node.update(elapsed);
    }
  }
}
