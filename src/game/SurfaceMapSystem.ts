import * as THREE from 'three';
import type { ColonyModule } from '../entities/ColonyModule';
import type { SurfaceResourceSystem } from './SurfaceResourceSystem';

export type SurfaceMapEntity = {
  id: string;
  name: string;
  type: 'player' | 'ship' | 'landing' | 'habitat' | 'resource' | 'hazard' | 'resonator' | 'relay' | 'communications' | 'projection' | 'defense' | 'threat' | 'atlas';
  position: THREE.Vector3;
  status: string;
  hint?: 'thermal';
  signalRange?: number;
  isCurrentTarget?: boolean;
  uncertain?: boolean;
};

export type Mission03MapState = {
  resonatorVisible: boolean;
  resonatorPosition: THREE.Vector3;
  relayPlaced: boolean;
  relayRange: number;
  signalStability: number;
  communicationsVisible: boolean;
  communicationsPosition: THREE.Vector3;
  projectionVisible: boolean;
  projectionPosition: THREE.Vector3;
};

export type Mission04MapState = {
  started: boolean;
  networkState: string;
  beaconSites: Array<{
    id: string;
    name: string;
    position: THREE.Vector3;
    placed: boolean;
  }>;
  synchronizationRange: number;
  synchronizationActive: boolean;
  defenseSyncProgress: number;
  threatSignatureDetected: boolean;
  threatSignaturePosition: THREE.Vector3;
};

export type Mission05MapState = {
  started: boolean;
  probeDetected: boolean;
  probeState: string;
  interferenceActive: boolean;
  probePosition: THREE.Vector3;
  echoPositions: THREE.Vector3[];
  activeEchoIndex: number;
  echoesResolved: number;
  counterSignalProgress: number;
};

export type Mission06MapState = {
  started: boolean;
  step: string;
  projectorSites: Array<{
    id: string;
    name: string;
    position: THREE.Vector3;
    placed: boolean;
    calibrated: boolean;
  }>;
  syncRange: number;
  syncProgress: number;
  syncActive: boolean;
  fieldOnline: boolean;
  signatureReduced: boolean;
};

export type Mission07MapState = {
  started: boolean;
  fractureRevealed: boolean;
  fracturePosition: THREE.Vector3;
  nodeSites: Array<{
    id: string;
    name: string;
    position: THREE.Vector3;
    scanned: boolean;
  }>;
  archiveUnlocked: boolean;
  archiveActivated: boolean;
  archivePosition: THREE.Vector3;
};

export class SurfaceMapSystem {
  active = false;

  generateEntities(
    playerPosition: THREE.Vector3,
    landingZonePosition: THREE.Vector3,
    colonyModule: ColonyModule,
    resourceSystem: SurfaceResourceSystem,
    currentTargetId?: string,
    playerMode: 'ship' | 'onFoot' = 'ship',
    shipPosition?: THREE.Vector3,
    habitatSitePosition?: THREE.Vector3,
    mission03?: Mission03MapState,
    mission04?: Mission04MapState,
    mission05?: Mission05MapState,
    mission06?: Mission06MapState,
    mission07?: Mission07MapState
  ): SurfaceMapEntity[] {
    const list: SurfaceMapEntity[] = [
      {
        id: 'player-surface',
        name: playerMode === 'onFoot' ? 'PILOTO ARCA' : 'NAVE (MODO SUPERFICIE)',
        type: 'player',
        position: playerPosition,
        status: playerMode === 'onFoot' ? 'Exploración a pie' : 'Exploración a Baja Altitud'
      },
      {
        id: 'nereida-landing',
        name: 'CUENCA NEREIDA (ATERRIZAJE)',
        type: 'landing',
        position: landingZonePosition,
        status: 'Punto de Retorno Seguro',
        isCurrentTarget: currentTargetId === 'nereida-landing'
      }
    ];

    if (shipPosition && (playerMode === 'onFoot' || currentTargetId === 'surface-scout-ship')) {
      list.push({
        id: 'surface-scout-ship',
        name: 'NAVE DE RECONOCIMIENTO',
        type: 'ship',
        position: shipPosition,
        status: playerMode === 'onFoot' ? 'Estacionada // Acceso disponible' : 'Elevador ventral // descenso con F',
        isCurrentTarget: currentTargetId === 'surface-scout-ship'
      });
    }

    if (colonyModule.group.visible) {
      list.push({
        id: 'habitat-mod',
        name: 'BASE NEREIDA / MÓDULO HÁBITAT NEREIDA-01',
        type: 'habitat',
        position: colonyModule.group.position,
        status: colonyModule.deployed ? 'Operativo (Soporte Vital)' : 'Desplegando...',
        isCurrentTarget: currentTargetId === 'habitat-mod'
      });
    } else if (habitatSitePosition) {
      list.push({
        id: 'habitat-mod',
        name: 'SITIO HÁBITAT NEREIDA-01',
        type: 'habitat',
        position: habitatSitePosition,
        status: 'Zona preparada // despliegue pendiente',
        isCurrentTarget: currentTargetId === 'habitat-mod'
      });
    }

    const statusLabels = {
      unknown: 'Sin revelar',
      detected: 'Zona aproximada detectada',
      located: 'Sitio localizado // requiere muestra',
      sampled: 'Muestra registrada // análisis pendiente',
      analyzed: 'Datos analizados'
    } as const;
    for (const node of resourceSystem.nodes) {
      if (node.status === 'unknown') continue;
      const thermalHint =
        node.definition.mapHint === 'thermal' && (node.status === 'detected' || node.status === 'located');
      list.push({
        id: node.definition.id,
        name: node.definition.name.toUpperCase(),
        type: 'resource',
        position: node.interactionPosition,
        status: thermalHint ? `Firma tÃ©rmica // ${statusLabels[node.status]}` : statusLabels[node.status],
        hint: thermalHint ? 'thermal' : undefined,
        isCurrentTarget: currentTargetId === node.definition.id
      });
    }

    if (mission03?.resonatorVisible) {
      list.push({
        id: 'resonador-atlas',
        name: 'RESONADOR ATLAS',
        type: 'resonator',
        position: mission03.resonatorPosition,
        status: mission03.relayPlaced ? 'Punto Atlas enlazado' : 'Punto de resonancia Atlas // enlace pendiente',
        isCurrentTarget: currentTargetId === 'resonador-atlas'
      });
    }

    if (mission03?.relayPlaced) {
      list.push({
        id: 'pleyadan-relay',
        name: 'BALIZA DE ENLACE PLEYADANA',
        type: 'relay',
        position: mission03.resonatorPosition,
        status: `Enlace activo // estabilidad ${Math.round(mission03.signalStability)}%`,
        isCurrentTarget: currentTargetId === 'pleyadan-relay'
      });
      list.push({
        id: 'signal-range',
        name: 'RANGO DE SEÑAL',
        type: 'relay',
        position: mission03.resonatorPosition,
        status: `${Math.round(mission03.relayRange)} m // permanezca dentro del área`,
        signalRange: mission03.relayRange,
        isCurrentTarget: currentTargetId === 'signal-range'
      });
    }

    if (mission03?.communicationsVisible) {
      list.push({
        id: 'communications-module',
        name: 'MÓDULO DE COMUNICACIONES',
        type: 'communications',
        position: mission03.communicationsPosition,
        status: 'Canal Atlas // interacción con E',
        isCurrentTarget: currentTargetId === 'communications-module'
      });
    }

    if (mission03?.projectionVisible) {
      list.push({
        id: 'pleyadan-projection',
        name: 'PROYECCIÓN PLEYADANA',
        type: 'projection',
        position: mission03.projectionPosition,
        status: 'Primer contacto // transmisión activa',
        isCurrentTarget: currentTargetId === 'pleyadan-projection'
      });
    }

    if (mission04?.started) {
      const basePosition = colonyModule.group.visible ? colonyModule.group.position : landingZonePosition;
      list.push({
        id: 'defense-network-status',
        name: 'RED DEFENSIVA ORBITAL',
        type: 'defense',
        position: basePosition,
        status: `Estado: ${mission04.networkState} // ${mission04.beaconSites.filter((beacon) => beacon.placed).length}/3 balizas`,
        isCurrentTarget: currentTargetId === 'defense-network-status'
      });
      for (const beacon of mission04.beaconSites) {
        list.push({
          id: beacon.id,
          name: beacon.name.toUpperCase(),
          type: 'defense',
          position: beacon.position,
          status: beacon.placed ? 'Enlazada a la red defensiva' : 'Sitio de despliegue pendiente',
          isCurrentTarget: currentTargetId === beacon.id
        });
      }
      if (mission04.synchronizationActive) {
        const activeBeacon = mission04.beaconSites.find((beacon) => beacon.id === currentTargetId)
          ?? mission04.beaconSites[mission04.beaconSites.length - 1];
        if (activeBeacon) {
          list.push({
            id: 'defense-sync-range',
            name: 'RANGO DE SINCRONIZACION DEFENSIVA',
            type: 'defense',
            position: activeBeacon.position,
            status: `${Math.round(mission04.synchronizationRange)} m // red ${Math.round(mission04.defenseSyncProgress)}%`,
            signalRange: mission04.synchronizationRange,
            isCurrentTarget: currentTargetId === 'defense-sync-range'
          });
        }
      }
      if (mission04.threatSignatureDetected && !mission05?.started) {
        list.push({
          id: 'coalition-signature',
          name: 'FIRMA ANOMALA DISTANTE',
          type: 'threat',
          position: mission04.threatSignaturePosition,
          status: 'Origen desconocido // posible Coalicion del Silencio',
          isCurrentTarget: currentTargetId === 'coalition-signature'
        });
      }
    }

    if (mission05?.started) {
      if (mission05.probeDetected && mission05.probeState !== 'escaped' && mission05.activeEchoIndex < 0) {
        list.push({
          id: 'silent-probe',
          name: 'SONDA SILENCIOSA',
          type: 'threat',
          position: mission05.probePosition,
          status: mission05.interferenceActive
            ? 'Posicion incierta // interferencia Atlas'
            : mission05.probeState === 'retreating'
              ? 'Retirada confirmada // enlace interrumpido'
              : `Seguimiento ${mission05.probeState} // sin ataque`,
          isCurrentTarget: currentTargetId === 'silent-probe',
          uncertain: mission05.interferenceActive
        });
      }

      if (mission05.activeEchoIndex >= 0) {
        mission05.echoPositions.forEach((position, index) => {
          const resolved = index < mission05.echoesResolved;
          list.push({
            id: `signal-echo-${index + 1}`,
            name: `ECO DE INTERFERENCIA ${index + 1}`,
            type: 'relay',
            position,
            status: resolved
              ? 'Resuelto // telemetria Atlas integrada'
              : index === mission05.activeEchoIndex
                ? 'Eco activo // analiza con E'
                : 'Posicion probable // lectura inestable',
            isCurrentTarget: currentTargetId === `signal-echo-${index + 1}`,
            uncertain: !resolved
          });
        });
      }

      if (mission05.counterSignalProgress > 0 && mission05.counterSignalProgress < 100) {
        list.push({
          id: 'counter-signal-status',
          name: 'CONTRASENAL DEFENSIVA',
          type: 'defense',
          position: mission05.probePosition,
          status: `Emision ${Math.round(mission05.counterSignalProgress)}% // permanezca en alcance`,
          isCurrentTarget: currentTargetId === 'counter-signal-status'
        });
      }
    }

    if (mission06?.started) {
      const basePosition = colonyModule.group.visible ? colonyModule.group.position : landingZonePosition;
      list.push({
        id: 'cloaking-matrix',
        name: 'MATRIZ DE OCULTAMIENTO',
        type: 'defense',
        position: basePosition,
        status: mission06.fieldOnline
          ? 'Campo online // firma reducida'
          : `Blindaje ${Math.round(mission06.syncProgress)}% // ${mission06.projectorSites.filter((site) => site.calibrated).length}/3 proyectores`,
        isCurrentTarget: currentTargetId === 'cloaking-matrix' || currentTargetId === 'habitat-mod'
      });

      for (const site of mission06.projectorSites) {
        list.push({
          id: site.id,
          name: site.name.toUpperCase(),
          type: 'defense',
          position: site.position,
          status: site.calibrated
            ? 'Calibrado // firma local atenuada'
            : site.placed
              ? 'Instalado // calibracion pendiente'
              : 'Sitio de proyector pendiente',
          isCurrentTarget: currentTargetId === site.id
        });
      }

      if (mission06.syncActive || mission06.step === 'syncMatrix') {
        list.push({
          id: 'cloaking-sync-range',
          name: 'RANGO DE SINCRONIZACION DE OCULTAMIENTO',
          type: 'defense',
          position: basePosition,
          status: `${Math.round(mission06.syncRange)} m // sincronizacion ${Math.round(mission06.syncProgress)}%`,
          signalRange: mission06.syncRange,
          isCurrentTarget: currentTargetId === 'cloaking-sync-range'
        });
      }

      if (mission06.fieldOnline) {
        list.push({
          id: 'cloaking-field',
          name: 'CAMPO DE OCULTAMIENTO NEREIDA',
          type: 'defense',
          position: basePosition,
          status: mission06.signatureReduced ? 'Firma de Base Nereida reducida' : 'Campo online',
          signalRange: mission06.syncRange,
          isCurrentTarget: currentTargetId === 'cloaking-field'
        });
      }
    }

    if (mission07?.started && mission07.fractureRevealed) {
      list.push({
        id: 'atlas-fracture',
        name: 'FRACTURA ATLAS',
        type: 'atlas',
        position: mission07.fracturePosition,
        status: 'Anomalía subterránea Atlas // baja emisión',
        isCurrentTarget: currentTargetId === 'atlas-fracture'
      });

      for (const node of mission07.nodeSites) {
        list.push({
          id: node.id,
          name: node.name.toUpperCase(),
          type: 'atlas',
          position: node.position,
          status: node.scanned ? 'Eco integrado al archivo semilla' : 'Nodo semienterrado // escaneo pendiente',
          isCurrentTarget: currentTargetId === node.id
        });
      }

      if (mission07.archiveUnlocked || mission07.archiveActivated) {
        list.push({
          id: 'atlas-seed-archive',
          name: 'ARCHIVO SEMILLA ATLAS',
          type: 'atlas',
          position: mission07.archivePosition,
          status: mission07.archiveActivated ? 'Mundo semilla confirmado' : 'Núcleo desbloqueado // activar con E',
          isCurrentTarget: currentTargetId === 'atlas-seed-archive'
        });
      }
    }

    list.push({
      id: 'hazard-rad',
      name: 'BOLSA DE RADIACIÓN INESTABLE',
      type: 'hazard',
      position: new THREE.Vector3(140, 5, -120),
      status: 'Peligro Ambiental - Mantener Distancia'
    });

    return list;
  }
}
