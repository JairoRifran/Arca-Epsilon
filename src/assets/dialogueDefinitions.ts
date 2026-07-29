import type { DialogueSpeakerId } from './commanderDefinitions';

export type DialoguePriority = 'low' | 'normal' | 'important' | 'critical';

export type DialogueDefinition = {
  id: string;
  speakerId: DialogueSpeakerId;
  text: string;
  priority: DialoguePriority;
  missionId: string;
  triggerId: string;
  pausesGameplay?: boolean;
  autoDismissSeconds?: number;
  requiresConfirmation?: boolean;
  repeatable?: boolean;
  delaySeconds?: number;
  subtitleMode?: boolean;
  audioCue?: string;
};

const commander = 'commander-soren' as const;

export const dialogueDefinitions: readonly DialogueDefinition[] = [
  {
    id: 'm01_start_commander', speakerId: commander, missionId: 'mission-01-search-home', triggerId: 'mission-start',
    priority: 'normal', autoDismissSeconds: 5.8,
    text: 'Piloto, Arca Epsilon queda en espera. Inicie barrido de largo alcance.'
  },
  {
    id: 'm01_e01_detected', speakerId: commander, missionId: 'mission-01-search-home', triggerId: 'e01-detected',
    priority: 'normal', autoDismissSeconds: 5.5,
    text: 'Tenemos un candidato. Designación provisional: E-01. Acérquese con cautela.'
  },
  {
    id: 'm01_orbital_scan', speakerId: commander, missionId: 'mission-01-search-home', triggerId: 'orbital-scan-started',
    priority: 'normal', autoDismissSeconds: 6.5,
    text: 'Necesitamos atmósfera, agua, radiación, gravedad y actividad biológica antes de autorizar descenso.'
  },
  {
    id: 'm01_habitability_promising', speakerId: commander, missionId: 'mission-01-search-home', triggerId: 'habitability-sufficient',
    priority: 'normal', autoDismissSeconds: 5.8,
    text: 'Los datos son prometedores, pero aún falta confirmar un corredor seguro.'
  },
  {
    id: 'm01_descent_blocked', speakerId: commander, missionId: 'mission-01-search-home', triggerId: 'descent-blocked',
    priority: 'important', requiresConfirmation: true,
    text: 'Descenso denegado. No voy a autorizar una entrada atmosférica con datos incompletos.'
  },
  {
    id: 'm01_atlas_detected', speakerId: commander, missionId: 'mission-01-search-home', triggerId: 'atlas-detected',
    priority: 'important', autoDismissSeconds: 6.5, delaySeconds: 1.2,
    text: 'Piloto, esa estructura no es natural. Prioridad máxima: escanéela.'
  },
  {
    id: 'm01_descent_authorized', speakerId: commander, missionId: 'mission-01-search-home', triggerId: 'atlas-decoded',
    priority: 'important', autoDismissSeconds: 6.2,
    text: 'Corredor Atlas confirmado. Ahora sí tenemos una ventana segura de descenso.'
  },
  {
    id: 'm01_atmospheric_entry', speakerId: commander, missionId: 'mission-01-search-home', triggerId: 'atmospheric-entry',
    priority: 'important', autoDismissSeconds: 6.5,
    text: 'Entrada autorizada. Mantenga estabilidad. Arca Epsilon seguirá su telemetría.'
  },
  {
    id: 'm01_landing_complete', speakerId: commander, missionId: 'mission-01-search-home', triggerId: 'landing-complete',
    priority: 'important', autoDismissSeconds: 6.2,
    text: 'Contacto con superficie confirmado. Bienvenido a E-01.'
  },
  {
    id: 'm02_surface_start', speakerId: commander, missionId: 'mission-02-first-foothold', triggerId: 'surface-phase-start',
    priority: 'normal', autoDismissSeconds: 5.8,
    text: 'Ahora necesitamos convertir este punto de aterrizaje en una base real.'
  },
  {
    id: 'm02_habitat_deployed', speakerId: commander, missionId: 'mission-02-first-foothold', triggerId: 'habitat-deployed',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Hábitat Nereida-01 desplegado. Necesitamos agua, minerales y energía.'
  },
  {
    id: 'm02_sites_revealed', speakerId: commander, missionId: 'mission-02-first-foothold', triggerId: 'resource-sites-revealed',
    priority: 'normal', autoDismissSeconds: 6.5,
    text: 'El barrido geológico detectó tres zonas viables. No están cerca. Use la nave para desplazarse.'
  },
  {
    id: 'm02_water_located', speakerId: commander, missionId: 'mission-02-first-foothold', triggerId: 'water-located',
    priority: 'low', autoDismissSeconds: 5.2,
    text: 'Lecturas de humedad confirmadas. Si esa laguna es estable, tenemos una oportunidad.'
  },
  {
    id: 'm02_water_sampled', speakerId: commander, missionId: 'mission-02-first-foothold', triggerId: 'water-sampled',
    priority: 'normal', autoDismissSeconds: 5.5,
    text: 'Muestra de agua recibida. Regrese al hábitat para análisis completo.'
  },
  {
    id: 'm02_minerals_sampled', speakerId: commander, missionId: 'mission-02-first-foothold', triggerId: 'minerals-sampled',
    priority: 'normal', autoDismissSeconds: 5.5,
    text: 'Minerales estructurales confirmados. Esto puede sostener la expansión inicial.'
  },
  {
    id: 'm02_energy_sampled', speakerId: commander, missionId: 'mission-02-first-foothold', triggerId: 'energy-sampled',
    priority: 'important', autoDismissSeconds: 6,
    text: 'Energía térmica detectada. Precaución: esa zona puede ser inestable.'
  },
  {
    id: 'm02_all_samples', speakerId: commander, missionId: 'mission-02-first-foothold', triggerId: 'all-samples-collected',
    priority: 'important', autoDismissSeconds: 6.2, delaySeconds: 0.8,
    text: 'Piloto, vuelva a Base Nereida. Necesitamos procesar las muestras antes de activar la base.'
  },
  {
    id: 'm02_samples_analyzed', speakerId: 'base-nereida', missionId: 'mission-02-first-foothold', triggerId: 'samples-analyzed',
    priority: 'normal', autoDismissSeconds: 5.5,
    text: 'Análisis completado. Agua, minerales y energía dentro de parámetros coloniales.'
  },
  {
    id: 'm02_base_operational', speakerId: commander, missionId: 'mission-02-first-foothold', triggerId: 'base-operational',
    priority: 'important', requiresConfirmation: true,
    text: 'Base Nereida está operativa. Por primera vez desde la Tierra, humanidad vuelve a tener suelo bajo sus pies.'
  },

  // Mission 03: a remote, non-combat first contact through the Atlas network.
  {
    id: 'm03_signal_detected', speakerId: commander, missionId: 'mission-03-first-contact', triggerId: 'signal-detected',
    priority: 'important', autoDismissSeconds: 6,
    text: 'Piloto, revise la señal en el módulo de comunicaciones de Base Nereida.'
  },
  {
    id: 'm03_signal_reviewed', speakerId: commander, missionId: 'mission-03-first-contact', triggerId: 'signal-reviewed',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Esto no viene del subsuelo. Está usando la Red Atlas como repetidor.'
  },
  {
    id: 'm03_calibrate_comms', speakerId: commander, missionId: 'mission-03-first-contact', triggerId: 'communications-calibration',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Calibre la antena. Necesitamos separar ruido geológico de señal inteligente.'
  },
  {
    id: 'm03_resonator_revealed', speakerId: commander, missionId: 'mission-03-first-contact', triggerId: 'resonator-revealed',
    priority: 'normal', autoDismissSeconds: 5.8,
    text: 'Diríjase al Resonador Atlas. La guía y el mapa local fueron actualizados.'
  },
  {
    id: 'm03_relay_deploy', speakerId: commander, missionId: 'mission-03-first-contact', triggerId: 'relay-deploy',
    priority: 'normal', autoDismissSeconds: 5.8,
    text: 'Descienda con F y coloque la baliza con E.'
  },
  {
    id: 'm03_relay_placed', speakerId: commander, missionId: 'mission-03-first-contact', triggerId: 'relay-placed',
    priority: 'normal', autoDismissSeconds: 5.8,
    text: 'Baliza enlazada. Manténgase dentro del rango hasta completar sincronización.'
  },
  {
    id: 'm03_signal_unstable', speakerId: commander, missionId: 'mission-03-first-contact', triggerId: 'signal-unstable',
    priority: 'important', autoDismissSeconds: 5.5,
    text: 'La señal se degrada. No se aleje del área de enlace.'
  },
  {
    id: 'm03_signal_synchronized', speakerId: commander, missionId: 'mission-03-first-contact', triggerId: 'signal-synchronized',
    priority: 'normal', autoDismissSeconds: 5.8,
    text: 'Sincronización completa. Regrese a Base Nereida para traducir.'
  },
  {
    id: 'm03_translation_started', speakerId: commander, missionId: 'mission-03-first-contact', triggerId: 'translation-started',
    priority: 'important', requiresConfirmation: true,
    text: 'Estoy recibiendo patrones lingüísticos. Esto... esto es una transmisión.'
  },
  {
    id: 'm03_pleyadan_contact', speakerId: commander, missionId: 'mission-03-first-contact', triggerId: 'pleyadan-contact',
    priority: 'critical', requiresConfirmation: true,
    text: 'Piloto, registre todo. Estamos ante el primer contacto inteligente de la humanidad.'
  },
  {
    id: 'm03_pleyadan_transmission', speakerId: 'pleyadan', missionId: 'mission-03-first-contact', triggerId: 'pleyadan-transmission',
    priority: 'critical', requiresConfirmation: true, subtitleMode: true,
    text: 'Humanidad de Arca Epsilon, recibimos la activación del corredor Atlas. No venimos a reclamar E-01.'
  },
  {
    id: 'm03_pleyadan_identity', speakerId: 'pleyadan', missionId: 'mission-03-first-contact', triggerId: 'pleyadan-identity',
    priority: 'important', requiresConfirmation: true, subtitleMode: true,
    text: 'El Atlas fue construido para advertir. Cada civilización que alcanza las estrellas se vuelve visible.'
  },
  {
    id: 'm03_threat_warning', speakerId: 'pleyadan', missionId: 'mission-03-first-contact', triggerId: 'hostile-races-warning',
    priority: 'critical', requiresConfirmation: true, subtitleMode: true,
    text: 'La Coalición del Silencio no permite que otros mundos despierten. No teman, pero preparen su base y fortalezcan su órbita.'
  },
  {
    id: 'm03_complete', speakerId: commander, missionId: 'mission-03-first-contact', triggerId: 'mission-complete',
    priority: 'important', requiresConfirmation: true,
    text: 'Arca Epsilon entra en protocolo de alerta. Preparemos la base. No podemos asumir que estamos solos.'
  },

  // Mission 04: orbital early warning without combat escalation.
  {
    id: 'm04_protocol_start', speakerId: commander, missionId: 'mission-04-orbital-defense', triggerId: 'defense-protocol-start',
    priority: 'important', requiresConfirmation: true,
    text: 'Piloto, la advertencia Pleyadana cambia nuestras prioridades. Regrese a Base Nereida.'
  },
  {
    id: 'm04_defense_context', speakerId: commander, missionId: 'mission-04-orbital-defense', triggerId: 'defense-context',
    priority: 'normal', autoDismissSeconds: 6.4, delaySeconds: 1.3,
    text: 'No vamos a militarizar este mundo, pero necesitamos ver venir cualquier amenaza.'
  },
  {
    id: 'm04_calibrate_link', speakerId: commander, missionId: 'mission-04-orbital-defense', triggerId: 'defense-link-calibration',
    priority: 'normal', autoDismissSeconds: 5.8,
    text: 'Active el enlace defensivo desde Base Nereida con E.'
  },
  {
    id: 'm04_sensor_ready', speakerId: commander, missionId: 'mission-04-orbital-defense', triggerId: 'orbital-sensor-ready',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Sensor orbital disponible. Despliegue las tres balizas marcadas en el mapa local.'
  },
  {
    id: 'm04_pleyadan_principle', speakerId: 'pleyadan', missionId: 'mission-04-orbital-defense', triggerId: 'pleyadan-defense-principle',
    priority: 'normal', autoDismissSeconds: 5.8, subtitleMode: true,
    text: 'La defensa no comienza con armas. Comienza con vision.'
  },
  {
    id: 'm04_deploy_beacon', speakerId: commander, missionId: 'mission-04-orbital-defense', triggerId: 'defense-beacon-deploy',
    priority: 'normal', autoDismissSeconds: 5.6,
    text: 'Detenga la nave, descienda con F y active la baliza con E.'
  },
  {
    id: 'm04_beacon_linked', speakerId: commander, missionId: 'mission-04-orbital-defense', triggerId: 'defense-beacon-linked',
    priority: 'normal', autoDismissSeconds: 5.5,
    text: 'Baliza defensiva enlazada. Continue con el siguiente punto.'
  },
  {
    id: 'm04_network_sync', speakerId: commander, missionId: 'mission-04-orbital-defense', triggerId: 'defense-network-sync',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'La red empieza a formar una malla sobre la cuenca. Permanezca dentro del rango.'
  },
  {
    id: 'm04_orbital_scan', speakerId: commander, missionId: 'mission-04-orbital-defense', triggerId: 'orbital-scan',
    priority: 'important', autoDismissSeconds: 6,
    text: 'Malla sincronizada. Regrese a la nave, gane altura y realice el barrido orbital con E.'
  },
  {
    id: 'm04_signature_detected', speakerId: commander, missionId: 'mission-04-orbital-defense', triggerId: 'threat-signature',
    priority: 'critical', requiresConfirmation: true,
    text: 'Estoy recibiendo una firma lejana. No es Pleyadana. No es humana.'
  },
  {
    id: 'm04_complete', speakerId: commander, missionId: 'mission-04-orbital-defense', triggerId: 'mission-complete',
    priority: 'important', requiresConfirmation: true,
    text: 'Protocolo defensivo inicial activo. E-01 ya no esta indefenso.'
  },

  // Mission 05: investigation and defensive response without combat.
  {
    id: 'm05_signature_moving', speakerId: commander, missionId: 'mission-05-shadow-in-orbit', triggerId: 'signature-moving',
    priority: 'critical', requiresConfirmation: true,
    text: 'Piloto, la firma anomala acaba de moverse.'
  },
  {
    id: 'm05_observer_confirmed', speakerId: commander, missionId: 'mission-05-shadow-in-orbit', triggerId: 'observer-confirmed',
    priority: 'important', autoDismissSeconds: 5.8,
    text: 'No es ruido. Algo esta observando E-01. Ascienda y realice un barrido orbital.'
  },
  {
    id: 'm05_probe_detected', speakerId: commander, missionId: 'mission-05-shadow-in-orbit', triggerId: 'probe-detected',
    priority: 'critical', requiresConfirmation: true,
    text: 'Sonda Silenciosa confirmada. No dispare todavia. Necesitamos saber que es.'
  },
  {
    id: 'm05_interference', speakerId: commander, missionId: 'mission-05-shadow-in-orbit', triggerId: 'interference-active',
    priority: 'important', autoDismissSeconds: 6.2,
    text: 'La senal desaparecio. Esta interfiriendo nuestros sensores.'
  },
  {
    id: 'm05_atlas_frequency', speakerId: commander, missionId: 'mission-05-shadow-in-orbit', triggerId: 'atlas-frequency',
    priority: 'important', autoDismissSeconds: 6,
    text: 'Use la frecuencia Atlas. Tal vez podamos verla a traves del ruido.'
  },
  {
    id: 'm05_pleyadan_warning', speakerId: 'pleyadan', missionId: 'mission-05-shadow-in-orbit', triggerId: 'pleyadan-warning',
    priority: 'important', autoDismissSeconds: 6, subtitleMode: true,
    text: 'Los silenciosos observan antes de borrar. Interrumpan la marca.'
  },
  {
    id: 'm05_echo_resolved', speakerId: commander, missionId: 'mission-05-shadow-in-orbit', triggerId: 'echo-resolved',
    priority: 'normal', autoDismissSeconds: 4.8,
    text: 'Eco validado. Continue siguiendo la distorsion Atlas.'
  },
  {
    id: 'm05_counter_signal', speakerId: commander, missionId: 'mission-05-shadow-in-orbit', triggerId: 'counter-signal',
    priority: 'important', autoDismissSeconds: 5.8,
    text: 'Contrasenal emitida. La sonda esta perdiendo enlace.'
  },
  {
    id: 'm05_probe_retreat', speakerId: commander, missionId: 'mission-05-shadow-in-orbit', triggerId: 'probe-retreat',
    priority: 'important', autoDismissSeconds: 6.2,
    text: 'La marca fallo. La sonda se retira sin transmitir una confirmacion valida.'
  },
  {
    id: 'm05_complete', speakerId: commander, missionId: 'mission-05-shadow-in-orbit', triggerId: 'mission-complete',
    priority: 'critical', requiresConfirmation: true,
    text: 'Confirmado: primer contacto hostil indirecto. E-01 fue marcado, pero no confirmado.'
  },
  {
    id: 'm06_start', speakerId: commander, missionId: 'mission-06-nereida-shield', triggerId: 'mission-start',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Piloto, la sonda se retiró, pero dejó rastros de escaneo sobre Nereida. No podemos asumir que estamos ocultos.'
  },
  {
    id: 'm06_analyze', speakerId: commander, missionId: 'mission-06-nereida-shield', triggerId: 'analyze-residue',
    priority: 'important', autoDismissSeconds: 5,
    text: 'Analice los residuos de interferencia desde la consola de Base.'
  },
  {
    id: 'm06_pleyadan_warning', speakerId: 'pleyadan', missionId: 'mission-06-nereida-shield', triggerId: 'pleyadan-warning',
    priority: 'important', autoDismissSeconds: 6, subtitleMode: true,
    text: 'Los silenciosos buscan patrones. Rompan el patrón y vivirán un ciclo más.'
  },
  {
    id: 'm06_commander_reaction', speakerId: commander, missionId: 'mission-06-nereida-shield', triggerId: 'commander-reaction',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Los Pleyadanos tenían razón. La Coalición observa antes de borrar. Despliegue los proyectores de ocultamiento alrededor del perímetro.'
  },
  {
    id: 'm06_deploy_hint', speakerId: commander, missionId: 'mission-06-nereida-shield', triggerId: 'deploy-hint',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Cada proyector reducirá nuestra firma térmica, electromagnética y Atlas.'
  },
  {
    id: 'm06_syncing', speakerId: commander, missionId: 'mission-06-nereida-shield', triggerId: 'sync-started',
    priority: 'normal', autoDismissSeconds: 5,
    text: 'Campo de ocultamiento en sincronización.'
  },
  {
    id: 'm06_complete', speakerId: commander, missionId: 'mission-06-nereida-shield', triggerId: 'mission-complete',
    priority: 'critical', requiresConfirmation: true,
    text: 'Firma de Base Nereida reducida. No somos invisibles, pero dejamos de brillar en la oscuridad.'
  },
  {
    id: 'm07_start', speakerId: commander, missionId: 'mission-07-subsurface-echoes', triggerId: 'mission-start',
    priority: 'important', autoDismissSeconds: 6,
    text: 'Piloto, la Matriz de Ocultamiento está captando una señal bajo la corteza.'
  },
  {
    id: 'm07_signal_unknown', speakerId: commander, missionId: 'mission-07-subsurface-echoes', triggerId: 'signal-unknown',
    priority: 'normal', autoDismissSeconds: 5.6,
    text: 'No coincide con la Coalición. Es más antigua.'
  },
  {
    id: 'm07_analyze_base', speakerId: commander, missionId: 'mission-07-subsurface-echoes', triggerId: 'analyze-base',
    priority: 'normal', autoDismissSeconds: 5.6,
    text: 'Analice la señal desde la consola de Base Nereida.'
  },
  {
    id: 'm07_atlas_below', speakerId: commander, missionId: 'mission-07-subsurface-echoes', triggerId: 'atlas-below',
    priority: 'important', autoDismissSeconds: 6,
    text: 'La red Atlas parece extenderse debajo de nuestros pies.'
  },
  {
    id: 'm07_travel_fracture', speakerId: commander, missionId: 'mission-07-subsurface-echoes', triggerId: 'travel-fracture',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Viaje a la zona marcada. Mantenga los sensores en baja emisión.'
  },
  {
    id: 'm07_three_echoes', speakerId: commander, missionId: 'mission-07-subsurface-echoes', triggerId: 'three-echoes',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Estoy recibiendo tres ecos. Necesitamos escanearlos por separado.'
  },
  {
    id: 'm07_nodes_awake', speakerId: commander, missionId: 'mission-07-subsurface-echoes', triggerId: 'nodes-awake',
    priority: 'important', autoDismissSeconds: 6,
    text: 'Los nodos están respondiendo. Algo está despertando bajo la superficie.'
  },
  {
    id: 'm07_archive_active', speakerId: commander, missionId: 'mission-07-subsurface-echoes', triggerId: 'archive-active',
    priority: 'critical', autoDismissSeconds: 6.2,
    text: 'Archivo Semilla activo. Piloto, esto cambia lo que sabemos de E-01.'
  },
  {
    id: 'm07_pleyadan_guarded', speakerId: 'pleyadan', missionId: 'mission-07-subsurface-echoes', triggerId: 'pleyadan-guarded',
    priority: 'important', autoDismissSeconds: 6.2, subtitleMode: true,
    text: 'Este mundo fue guardado, no abandonado.'
  },
  {
    id: 'm07_seed_worlds', speakerId: 'pleyadan', missionId: 'mission-07-subsurface-echoes', triggerId: 'seed-worlds',
    priority: 'important', autoDismissSeconds: 6.2, subtitleMode: true,
    text: 'Los mundos semilla sostienen aquello que aún puede crecer.'
  },
  {
    id: 'm07_silent_fear', speakerId: 'pleyadan', missionId: 'mission-07-subsurface-echoes', triggerId: 'silent-fear',
    priority: 'important', autoDismissSeconds: 6.2, subtitleMode: true,
    text: 'Ahora entienden por qué los silenciosos temen a los comienzos.'
  },
  {
    id: 'm07_complete', speakerId: commander, missionId: 'mission-07-subsurface-echoes', triggerId: 'mission-complete',
    priority: 'critical', requiresConfirmation: true,
    text: 'E-01 no era solo habitable. Fue preparado.'
  },
  {
    id: 'm08_start', speakerId: commander, missionId: 'mission-08-signal-fracture', triggerId: 'mission-start',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Piloto, la Sonda Silenciosa se retiró, pero dejó un rastro de escaneo sobre E-01. Ese rastro abrió una grieta de señal.'
  },
  {
    id: 'm08_analyze', speakerId: commander, missionId: 'mission-08-signal-fracture', triggerId: 'analyze-trace',
    priority: 'important', autoDismissSeconds: 5,
    text: 'Analiza el rastro desde la consola de Base. Necesito saber cuánto vio la Coalición.'
  },
  {
    id: 'm08_fracture_revealed', speakerId: commander, missionId: 'mission-08-signal-fracture', triggerId: 'fracture-revealed',
    priority: 'important', autoDismissSeconds: 6,
    text: 'Hay una grieta de señal fuera del perímetro. Estabiliza sus tres focos antes de que el patrón se complete.'
  },
  {
    id: 'm08_pleyadan_warning', speakerId: 'pleyadan', missionId: 'mission-08-signal-fracture', triggerId: 'pleyadan-warning',
    priority: 'important', autoDismissSeconds: 6, subtitleMode: true,
    text: 'Cierren la grieta antes de que el patrón sea completo.'
  },
  {
    id: 'm08_return_base', speakerId: commander, missionId: 'mission-08-signal-fracture', triggerId: 'return-base',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Focos estabilizados. Vuelva a Base. Vamos a purgar la señal desde el núcleo.'
  },
  {
    id: 'm08_purging', speakerId: commander, missionId: 'mission-08-signal-fracture', triggerId: 'purge-started',
    priority: 'normal', autoDismissSeconds: 5,
    text: 'Purga de señal en progreso. Mantén el núcleo enlazado.'
  },
  {
    id: 'm08_complete', speakerId: commander, missionId: 'mission-08-signal-fracture', triggerId: 'mission-complete',
    priority: 'critical', requiresConfirmation: true,
    text: 'Grieta contenida. Nereida sigue oculta, pero quedó una firma residual apuntando lejos.'
  },
  {
    id: 'm09_start', speakerId: commander, missionId: 'mission-09-aurora-expedition', triggerId: 'mission-start',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Piloto, la firma residual no apunta a Nereida. Está señalando algo mucho más lejos.'
  },
  {
    id: 'm09_route_rebuilding', speakerId: commander, missionId: 'mission-09-aurora-expedition', triggerId: 'route-rebuilding',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'La Red Atlas está reconstruyendo una ruta planetaria. No son coordenadas completas, pero es suficiente para empezar.'
  },
  {
    id: 'm09_analyze_base', speakerId: commander, missionId: 'mission-09-aurora-expedition', triggerId: 'analyze-base',
    priority: 'important', autoDismissSeconds: 5,
    text: 'Analice la firma residual desde la consola de Base Nereida.'
  },
  {
    id: 'm09_route_decoded', speakerId: commander, missionId: 'mission-09-aurora-expedition', triggerId: 'route-decoded',
    priority: 'important', autoDismissSeconds: 6,
    text: 'Prepárese para un vuelo largo. Vamos a salir del perímetro seguro de Base Nereida.'
  },
  {
    id: 'm09_pleyadan_seed', speakerId: 'pleyadan', missionId: 'mission-09-aurora-expedition', triggerId: 'pleyadan-seed',
    priority: 'normal', autoDismissSeconds: 6, subtitleMode: true,
    text: 'Los mundos semilla no revelan sus jardines al primer visitante.'
  },
  {
    id: 'm09_signal_weak', speakerId: commander, missionId: 'mission-09-aurora-expedition', triggerId: 'signal-weak',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Señal con Base degradándose. Mantenga la Ruta Aurora en el centro de navegación.'
  },
  {
    id: 'm09_water_question', speakerId: commander, missionId: 'mission-09-aurora-expedition', triggerId: 'water-question',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Estoy viendo cambios atmosféricos en sus sensores. Menor radiación. Más humedad. Piloto… confirme esa lectura.'
  },
  {
    id: 'm09_aurora_reveal', speakerId: commander, missionId: 'mission-09-aurora-expedition', triggerId: 'aurora-reveal',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Arca Epsilon a Base Nereida… encontramos una región donde la humanidad podría volver a respirar.'
  },
  {
    id: 'm09_pleyadan_route', speakerId: 'pleyadan', missionId: 'mission-09-aurora-expedition', triggerId: 'pleyadan-route',
    priority: 'normal', autoDismissSeconds: 7, subtitleMode: true,
    text: 'La ruta se abre cuando la especie aprende a caminar sin quemar el suelo bajo sus pies.'
  },
  {
    id: 'm09_complete', speakerId: commander, missionId: 'mission-09-aurora-expedition', triggerId: 'mission-complete',
    priority: 'critical', requiresConfirmation: true,
    text: 'Sector Aurora confirmado. Que quede en el registro: hoy la Arca encontró un jardín.'
  },
  // --- Expedition legs: one line per stretch of the journey. Text only for
  // now; the voice pipeline will pick these ids up on its next manual run.
  {
    id: 'm09_leg_departure', speakerId: commander, missionId: 'mission-09-aurora-expedition', triggerId: 'leg-departure',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Piloto, está saliendo del perímetro seguro de Nereida. A partir de ahora, la Ruta Aurora es nuestra única referencia.'
  },
  {
    id: 'm09_leg_ash_plains', speakerId: commander, missionId: 'mission-09-aurora-expedition', triggerId: 'leg-ash-plains',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Viento lateral aumentando. Compense trayectoria, pero no abandone la ruta.'
  },
  {
    id: 'm09_leg_canyons', speakerId: commander, missionId: 'mission-09-aurora-expedition', triggerId: 'leg-canyons',
    priority: 'normal', autoDismissSeconds: 7,
    text: 'Esas formaciones no son naturales del todo. La Red Atlas pasó por aquí mucho antes que nosotros.'
  },
  {
    id: 'm09_leg_storm', speakerId: commander, missionId: 'mission-09-aurora-expedition', triggerId: 'leg-storm',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Estamos perdiendo telemetría directa. Arca Epsilon mantiene enlace parcial. Mantenga la nave dentro del corredor Atlas.'
  },
  {
    id: 'm09_leg_pre_reveal', speakerId: commander, missionId: 'mission-09-aurora-expedition', triggerId: 'leg-pre-reveal',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Piloto… los sensores muestran humedad atmosférica creciente. Confirme esa lectura. ¿Estoy viendo agua superficial?'
  },
  {
    id: 'm09_pleyadan_gardens', speakerId: 'pleyadan', missionId: 'mission-09-aurora-expedition', triggerId: 'pleyadan-gardens',
    priority: 'normal', autoDismissSeconds: 7, subtitleMode: true,
    text: 'Los jardines de los mundos semilla no se muestran al miedo. Se abren al cuidado.'
  },
  {
    id: 'm09_pleyadan_trial', speakerId: 'pleyadan', missionId: 'mission-09-aurora-expedition', triggerId: 'pleyadan-trial',
    priority: 'normal', autoDismissSeconds: 7, subtitleMode: true,
    text: 'La ruta no prueba su fuerza. Prueba si aún saben avanzar sin destruir.'
  },
  // --- Misión 10: Primer Módulo Aurora. Texto solamente; las voces se
  // generan después con el pipeline manual existente.
  {
    id: 'm10_start', speakerId: commander, missionId: 'mission-10-aurora-foothold', triggerId: 'mission-start',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Piloto, las lecturas iniciales son mejores que cualquier cosa que vimos en Nereida.'
  },
  {
    id: 'm10_measure_first', speakerId: commander, missionId: 'mission-10-aurora-foothold', triggerId: 'measure-first',
    priority: 'normal', autoDismissSeconds: 7,
    text: 'No declaremos este lugar seguro todavía. Primero agua, suelo, atmósfera y bioseguridad.'
  },
  {
    id: 'm10_pleyadan_listen', speakerId: 'pleyadan', missionId: 'mission-10-aurora-foothold', triggerId: 'pleyadan-listen',
    priority: 'normal', autoDismissSeconds: 6, subtitleMode: true,
    text: 'Un mundo semilla no se toma. Se escucha.'
  },
  {
    id: 'm10_survey_positive', speakerId: commander, missionId: 'mission-10-aurora-foothold', triggerId: 'survey-positive',
    priority: 'normal', autoDismissSeconds: 7,
    text: 'Si estas muestras confirman lo que vemos, Aurora podría ser nuestro primer verdadero hogar.'
  },
  {
    id: 'm10_on_foot', speakerId: commander, missionId: 'mission-10-aurora-foothold', triggerId: 'on-foot',
    priority: 'normal', autoDismissSeconds: 7,
    text: 'Proceda con cuidado. Este valle no es una conquista, es una oportunidad.'
  },
  {
    id: 'm10_reading_water', speakerId: commander, missionId: 'mission-10-aurora-foothold', triggerId: 'reading-water',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Agua superficial confirmada. Baja salinidad y trazas biológicas simples. No la declare potable todavía.'
  },
  {
    id: 'm10_reading_soil', speakerId: commander, missionId: 'mission-10-aurora-foothold', triggerId: 'reading-soil',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Suelo estable y con humedad retenida. Este claro aguanta una estructura.'
  },
  {
    id: 'm10_reading_atmosphere', speakerId: commander, missionId: 'mission-10-aurora-foothold', triggerId: 'reading-atmosphere',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Presión estable, radiación baja, vientos regulares. Aurora respira mejor que Nereida.'
  },
  {
    id: 'm10_reading_biosafety', speakerId: commander, missionId: 'mission-10-aurora-foothold', triggerId: 'reading-biosafety',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Protoformas simples, sin patógenos detectados. Compatible con precaución: no vamos a asumir nada.'
  },
  {
    id: 'm10_pleyadan_shelter', speakerId: 'pleyadan', missionId: 'mission-10-aurora-foothold', triggerId: 'pleyadan-shelter',
    priority: 'normal', autoDismissSeconds: 7, subtitleMode: true,
    text: 'El primer refugio debe tocar el suelo con cuidado, no con hambre.'
  },
  {
    id: 'm10_mark_clearing', speakerId: commander, missionId: 'mission-10-aurora-foothold', triggerId: 'mark-clearing',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Marque el claro. Vamos a desplegar un módulo mínimo, nada más.'
  },
  {
    id: 'm10_site_marked', speakerId: commander, missionId: 'mission-10-aurora-foothold', triggerId: 'site-marked',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Sitio registrado. Que quede claro en el acta: este mundo puede recibirnos, pero no nos pertenece.'
  },
  {
    id: 'm10_module_deployed', speakerId: commander, missionId: 'mission-10-aurora-foothold', triggerId: 'module-deployed',
    priority: 'important', autoDismissSeconds: 6,
    text: 'Módulo Aurora-01 en superficie. Estabilizando soporte vital.'
  },
  {
    id: 'm10_module_online', speakerId: commander, missionId: 'mission-10-aurora-foothold', triggerId: 'module-online',
    priority: 'important', autoDismissSeconds: 6,
    text: 'Módulo Aurora-01 operativo. Energía mínima estable.'
  },
  {
    id: 'm10_complete', speakerId: commander, missionId: 'mission-10-aurora-foothold', triggerId: 'mission-complete',
    priority: 'critical', requiresConfirmation: true,
    text: 'Arca Epsilon a todos los equipos: por primera vez desde la Tierra, tenemos un lugar donde empezar.'
  },
  // --- Misión 11: Expansión Aurora. Texto solamente; las voces se generan
  // después con el pipeline manual existente.
  {
    id: 'm11_start', speakerId: commander, missionId: 'mission-11-aurora-expansion', triggerId: 'mission-start',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Piloto, Aurora-01 está estable, pero sigue siendo un refugio aislado.'
  },
  {
    id: 'm11_measured_growth', speakerId: commander, missionId: 'mission-11-aurora-expansion', triggerId: 'measured-growth',
    priority: 'normal', autoDismissSeconds: 7,
    text: 'Si vamos a crecer aquí, tiene que ser de forma medida. Nada de expansión ciega.'
  },
  {
    id: 'm11_pleyadan_garden', speakerId: 'pleyadan', missionId: 'mission-11-aurora-expansion', triggerId: 'pleyadan-garden',
    priority: 'normal', autoDismissSeconds: 6, subtitleMode: true,
    text: 'Un jardín no se conquista al plantar la primera semilla.'
  },
  {
    id: 'm11_diagnostic_ok', speakerId: commander, missionId: 'mission-11-aurora-expansion', triggerId: 'diagnostic-ok',
    priority: 'normal', autoDismissSeconds: 7,
    text: 'Seleccione un punto cercano para Aurora-02. Manténgalo fuera de la línea de agua y lejos de la protoflora.'
  },
  {
    id: 'm11_site_selected', speakerId: commander, missionId: 'mission-11-aurora-expansion', triggerId: 'site-selected',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Sitio registrado. Suelo estable, sin drenaje comprometido. Proceda con el despliegue.'
  },
  {
    id: 'm11_module_deployed', speakerId: commander, missionId: 'mission-11-aurora-expansion', triggerId: 'module-deployed',
    priority: 'important', autoDismissSeconds: 6,
    text: 'Aurora-02 en superficie. Energía, almacenamiento y control ambiental listos para acoplar.'
  },
  {
    id: 'm11_link_online', speakerId: commander, missionId: 'mission-11-aurora-expansion', triggerId: 'link-online',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Enlace energético listo. Por primera vez, Aurora tiene más de un punto vivo.'
  },
  {
    id: 'm11_filter_installed', speakerId: commander, missionId: 'mission-11-aurora-expansion', triggerId: 'filter-installed',
    priority: 'normal', autoDismissSeconds: 7,
    text: 'Instale el microfiltro. Solo flujo mínimo, solo lectura controlada.'
  },
  {
    id: 'm11_flow_calibrated', speakerId: commander, missionId: 'mission-11-aurora-expansion', triggerId: 'flow-calibrated',
    priority: 'normal', autoDismissSeconds: 7,
    text: 'Caudal mínimo estable. No vinimos a repetir la Tierra: cada decisión acá tiene que dejar menos cicatriz que la anterior.'
  },
  {
    id: 'm11_bed_ready', speakerId: commander, missionId: 'mission-11-aurora-expansion', triggerId: 'bed-ready',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Cama contenida y sensores en línea. Sedimento propio, sin tocar la protoflora del valle.'
  },
  {
    id: 'm11_bio_trial', speakerId: commander, missionId: 'mission-11-aurora-expansion', triggerId: 'bio-trial',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Bioensayo activo. No estamos sembrando una colonia. Estamos preguntando si este suelo quiere responder.'
  },
  {
    id: 'm11_pleyadan_care', speakerId: 'pleyadan', missionId: 'mission-11-aurora-expansion', triggerId: 'pleyadan-care',
    priority: 'normal', autoDismissSeconds: 6, subtitleMode: true,
    text: 'El cuidado también es tecnología.'
  },
  {
    id: 'm11_impact_ok', speakerId: commander, missionId: 'mission-11-aurora-expansion', triggerId: 'impact-ok',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Huella inicial dentro de límites. Agua, suelo y protoflora sin alteración significativa.'
  },
  {
    id: 'm11_core_online', speakerId: commander, missionId: 'mission-11-aurora-expansion', triggerId: 'core-online',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Núcleo Aurora operativo. Esto ya no es solo supervivencia. Es comienzo.'
  },
  {
    id: 'm11_pleyadan_limits', speakerId: 'pleyadan', missionId: 'mission-11-aurora-expansion', triggerId: 'pleyadan-limits',
    priority: 'normal', autoDismissSeconds: 7, subtitleMode: true,
    text: 'La especie que aprende a limitarse puede quedarse.'
  },
  {
    id: 'm11_complete', speakerId: commander, missionId: 'mission-11-aurora-expansion', triggerId: 'mission-complete',
    priority: 'critical', requiresConfirmation: true,
    text: 'Que quede en el registro: no estamos tomando este valle. Estamos aprendiendo a vivir dentro de él.'
  },
  // --- Misión 12: Primeros Habitantes. Texto solamente; las voces se
  // generan después con el pipeline manual existente.
  {
    id: 'm12_start', speakerId: commander, missionId: 'mission-12-first-inhabitants', triggerId: 'mission-start',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Piloto, la Arca aprobó el primer descenso humano. Solo tres personas. Nada más.'
  },
  {
    id: 'm12_empty_vs_lives', speakerId: commander, missionId: 'mission-12-first-inhabitants', triggerId: 'empty-vs-lives',
    priority: 'normal', autoDismissSeconds: 7,
    text: 'Aurora funciona en vacío. Ahora necesitamos saber si puede sostener vidas.'
  },
  {
    id: 'm12_pleyadan_first_step', speakerId: 'pleyadan', missionId: 'mission-12-first-inhabitants', triggerId: 'pleyadan-first-step',
    priority: 'normal', autoDismissSeconds: 7, subtitleMode: true,
    text: 'El primer paso de una especie en un jardín revela más que sus palabras.'
  },
  {
    id: 'm12_authorized', speakerId: commander, missionId: 'mission-12-first-inhabitants', triggerId: 'authorized',
    priority: 'normal', autoDismissSeconds: 7,
    text: 'Prepare soporte vital para carga humana. No quiero improvisaciones cuando la cápsula toque suelo.'
  },
  {
    id: 'm12_life_support_ready', speakerId: commander, missionId: 'mission-12-first-inhabitants', triggerId: 'life-support-ready',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Capacidad para tres personas confirmada. Oxígeno, energía, agua filtrada y presión interna dentro de margen.'
  },
  {
    id: 'm12_habitation_ready', speakerId: commander, missionId: 'mission-12-first-inhabitants', triggerId: 'habitation-ready',
    priority: 'normal', autoDismissSeconds: 7,
    text: 'Marque una zona de aterrizaje limpia. Lejos del filtro, lejos del cultivo y fuera de la protoflora.'
  },
  {
    id: 'm12_zone_marked', speakerId: commander, missionId: 'mission-12-first-inhabitants', triggerId: 'zone-marked',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Zona registrada y despejada. Transmitiendo coordenadas a la cápsula.'
  },
  {
    id: 'm12_capsule_descending', speakerId: commander, missionId: 'mission-12-first-inhabitants', triggerId: 'capsule-descending',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Cápsula en descenso. Todos los equipos, mantengan enlace abierto.'
  },
  {
    id: 'm12_visual_contact', speakerId: commander, missionId: 'mission-12-first-inhabitants', triggerId: 'visual-contact',
    priority: 'important', autoDismissSeconds: 8,
    text: 'Contacto visual. Por primera vez desde la Tierra, hay humanos llegando a un nuevo hogar.'
  },
  {
    id: 'm12_crew_tech', speakerId: 'aurora-crew', missionId: 'mission-12-first-inhabitants', triggerId: 'crew-tech',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Presión interna estable. Aurora-01 responde.'
  },
  {
    id: 'm12_crew_biologist', speakerId: 'aurora-crew', missionId: 'mission-12-first-inhabitants', triggerId: 'crew-biologist',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'La protoflora no muestra reacción adversa. Mantengamos distancia.'
  },
  {
    id: 'm12_crew_engineer', speakerId: 'aurora-crew', missionId: 'mission-12-first-inhabitants', triggerId: 'crew-engineer',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'El enlace aguanta. Ajustando carga para ciclo nocturno.'
  },
  {
    id: 'm12_consumption_alert', speakerId: commander, missionId: 'mission-12-first-inhabitants', triggerId: 'consumption-alert',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Consumo de oxígeno por encima de la simulación. Recalibre antes de iniciar el ciclo nocturno.'
  },
  {
    id: 'm12_recalibrated', speakerId: commander, missionId: 'mission-12-first-inhabitants', triggerId: 'recalibrated',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Estabilidad recuperada. Aurora está aprendiendo a respirar con nosotros adentro.'
  },
  {
    id: 'm12_stability_recovered', speakerId: commander, missionId: 'mission-12-first-inhabitants', triggerId: 'stability-recovered',
    priority: 'normal', autoDismissSeconds: 7,
    text: 'Oxígeno, agua y energía estables. Cultivo sin daño, protoflora sin reacción. El núcleo aguanta habitado.'
  },
  {
    id: 'm12_pleyadan_inhabit', speakerId: 'pleyadan', missionId: 'mission-12-first-inhabitants', triggerId: 'pleyadan-inhabit',
    priority: 'normal', autoDismissSeconds: 6, subtitleMode: true,
    text: 'Habitar no es poseer.'
  },
  {
    id: 'm12_pleyadan_home', speakerId: 'pleyadan', missionId: 'mission-12-first-inhabitants', triggerId: 'pleyadan-home',
    priority: 'normal', autoDismissSeconds: 7, subtitleMode: true,
    text: 'Recuerden: un hogar se cuida antes de nombrarse.'
  },
  {
    id: 'm12_first_night', speakerId: commander, missionId: 'mission-12-first-inhabitants', triggerId: 'first-night',
    priority: 'important', autoDismissSeconds: 8,
    text: 'Arca Epsilon a todos los canales: primera noche humana en Aurora confirmada.'
  },
  {
    id: 'm12_complete', speakerId: commander, missionId: 'mission-12-first-inhabitants', triggerId: 'mission-complete',
    priority: 'critical', requiresConfirmation: true,
    text: 'Por primera vez desde la Tierra, seres humanos van a dormir bajo otro cielo. Que quede registrado con cuidado.'
  },
  // --- Misión 13: La Primera Tormenta. Texto solamente; las voces se generan
  // después con el pipeline manual existente.
  {
    id: 'm13_alert', speakerId: commander, missionId: 'mission-13-first-storm', triggerId: 'storm-alert',
    priority: 'critical', autoDismissSeconds: 8,
    text: 'Piloto, tenemos un frente electromagnético formándose sobre el valle. No estábamos preparados para esto tan pronto.'
  },
  {
    id: 'm13_pressure_drop', speakerId: commander, missionId: 'mission-13-first-storm', triggerId: 'pressure-drop',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Caída de presión y fluctuaciones eléctricas en toda la red exterior. Salga y confirme el estado.'
  },
  {
    id: 'm13_crew_worried', speakerId: 'aurora-crew', missionId: 'mission-13-first-storm', triggerId: 'crew-worried',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Las luces del módulo están parpadeando. Estamos los tres adentro.'
  },
  {
    id: 'm13_inspect_grid', speakerId: commander, missionId: 'mission-13-first-storm', triggerId: 'inspect-grid',
    priority: 'important', autoDismissSeconds: 7,
    text: 'El nodo energético es lo primero. Sin energía estable, el soporte vital no aguanta la noche.'
  },
  {
    id: 'm13_generator_stable', speakerId: commander, missionId: 'mission-13-first-storm', triggerId: 'generator-stable',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Energía parcialmente estable. Ahora la antena: si perdemos el enlace, quedan aislados ahí adentro.'
  },
  {
    id: 'm13_anchor_first', speakerId: commander, missionId: 'mission-13-first-storm', triggerId: 'anchor-first',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Primer tensor sujeto. El mástil todavía se mueve: falta el opuesto.'
  },
  {
    id: 'm13_anchor_second', speakerId: commander, missionId: 'mission-13-first-storm', triggerId: 'anchor-second',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Segundo tensor sujeto. La carga del viento ya está repartida. Active la antena.'
  },
  {
    id: 'm13_comms_back', speakerId: commander, missionId: 'mission-13-first-storm', triggerId: 'comms-back',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Enlace parcial recuperado. Vuelva al módulo: el frente todavía no llegó a su punto máximo.'
  },
  {
    id: 'm13_crew_relief', speakerId: 'aurora-crew', missionId: 'mission-13-first-storm', triggerId: 'crew-relief',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Volvemos a escucharlos. No corten el enlace otra vez, por favor.'
  },
  {
    id: 'm13_shield_prompt', speakerId: commander, missionId: 'mission-13-first-storm', triggerId: 'shield-prompt',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Panel de emergencia listo. No se aleje mientras carga: si se corta, hay que empezar de nuevo.'
  },
  {
    id: 'm13_shield_online', speakerId: commander, missionId: 'mission-13-first-storm', triggerId: 'shield-online',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Campo protector en línea. El pico del frente nos pasa por encima ahora mismo.'
  },
  {
    id: 'm13_crew_safe', speakerId: 'aurora-crew', missionId: 'mission-13-first-storm', triggerId: 'crew-safe',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Presión estable. Los tres enteros. Gracias, piloto.'
  },
  {
    id: 'm13_pleyadan_night', speakerId: 'pleyadan', missionId: 'mission-13-first-storm', triggerId: 'pleyadan-night',
    priority: 'normal', autoDismissSeconds: 7, subtitleMode: true,
    text: 'Un mundo no prueba a quienes llegan. Solo sigue siendo lo que es.'
  },
  {
    id: 'm13_complete', speakerId: commander, missionId: 'mission-13-first-storm', triggerId: 'mission-complete',
    priority: 'critical', requiresConfirmation: true,
    text: 'La colonia sobrevivió a su primera noche hostil. Con gente adentro. Que eso también quede en el registro.'
  },
  {
    id: 'm14_start', speakerId: commander, missionId: 'mission-14-coalition-trace', triggerId: 'trace-start',
    priority: 'important', autoDismissSeconds: 7,
    text: 'El frente pasó, pero la red quedó rara. Revise energía, comunicaciones y hábitat antes de dar la noche por cerrada.'
  },
  {
    id: 'm14_power_reading', speakerId: commander, missionId: 'mission-14-coalition-trace', triggerId: 'power-reading',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'El nodo está entero, pero consume como si algo siguiera encendido. No hay nada encendido.'
  },
  {
    id: 'm14_comms_reading', speakerId: commander, missionId: 'mission-14-coalition-trace', triggerId: 'comms-reading',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'La antena emite en intervalos exactos. La tormenta no hace nada exacto.'
  },
  {
    id: 'm14_pulse_detected', speakerId: commander, missionId: 'mission-14-coalition-trace', triggerId: 'pulse-detected',
    priority: 'important', autoDismissSeconds: 7,
    text: 'La tormenta terminó. La transmisión no.'
  },
  {
    id: 'm14_crew_uneasy', speakerId: 'aurora-crew', missionId: 'mission-14-coalition-trace', triggerId: 'crew-uneasy',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Piloto, los paneles de adentro parpadean con un ritmo. Siempre el mismo. No nos gusta.'
  },
  {
    id: 'm14_signature_match', speakerId: commander, missionId: 'mission-14-coalition-trace', triggerId: 'signature-match',
    priority: 'critical', requiresConfirmation: true,
    text: 'La firma coincide con la sonda silenciosa de Nereida. La purga de entonces no alcanzó: quedó una marca, y la tormenta la despertó.'
  },
  {
    id: 'm14_three_nodes', speakerId: commander, missionId: 'mission-14-coalition-trace', triggerId: 'three-nodes',
    priority: 'important', autoDismissSeconds: 8,
    text: 'Tres nodos contaminados. Están usando infraestructura nuestra para triangular Aurora, Nereida y el Arca. Empiece por energía.'
  },
  {
    id: 'm14_power_clean', speakerId: commander, missionId: 'mission-14-coalition-trace', triggerId: 'power-clean',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Nodo energético limpio. La portadora se calló. Vaya al repetidor: ahí los paquetes salen de a uno.'
  },
  {
    id: 'm14_comms_clean', speakerId: commander, missionId: 'mission-14-coalition-trace', triggerId: 'comms-clean',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Repetidor limpio. Queda un tercer nodo y no está en el asentamiento. Búsquelo por intensidad de señal.'
  },
  {
    id: 'm14_search_hint', speakerId: commander, missionId: 'mission-14-coalition-trace', triggerId: 'search-hint',
    priority: 'normal', autoDismissSeconds: 7,
    text: 'No busque una sonda. No mandaron nada nuevo. Busque algo nuestro que dejó de ser nuestro.'
  },
  {
    id: 'm14_crew_sensor', speakerId: 'aurora-crew', missionId: 'mission-14-coalition-trace', triggerId: 'crew-sensor',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Ese sensor lo plantamos nosotros el primer día. Lo dimos por perdido en la tormenta. Estuvo hablando todo este tiempo.'
  },
  {
    id: 'm14_extraction_lost', speakerId: commander, missionId: 'mission-14-coalition-trace', triggerId: 'extraction-lost',
    priority: 'normal', autoDismissSeconds: 5, repeatable: true,
    text: 'Terminó la ráfaga y se reinició el aislamiento. No se despegue del sensor esta vez.'
  },
  {
    id: 'm14_sample_recovered', speakerId: commander, missionId: 'mission-14-coalition-trace', triggerId: 'sample-recovered',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Muestra recuperada. Tenemos el patrón de la Coalición en nuestras manos por primera vez. Vuelva al repetidor.'
  },
  {
    id: 'm14_triangulation', speakerId: commander, missionId: 'mission-14-coalition-trace', triggerId: 'triangulation',
    priority: 'critical', requiresConfirmation: true,
    text: 'La mayor parte de la marca fue purgada, pero un paquete consiguió escapar hacia un repetidor desconocido.'
  },
  {
    id: 'm14_crew_quiet', speakerId: 'aurora-crew', missionId: 'mission-14-coalition-trace', triggerId: 'crew-quiet',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Los paneles dejaron de parpadear. Es la primera vez en dos días que hay silencio de verdad.'
  },
  {
    id: 'm14_pleyadan_mark', speakerId: 'pleyadan', missionId: 'mission-14-coalition-trace', triggerId: 'pleyadan-mark',
    priority: 'important', autoDismissSeconds: 8, subtitleMode: true,
    text: 'La sonda no necesitaba sobrevivir. Solo necesitaba dejar una marca.'
  },
  {
    id: 'm14_complete', speakerId: commander, missionId: 'mission-14-coalition-trace', triggerId: 'mission-complete',
    priority: 'critical', requiresConfirmation: true,
    text: 'La Coalición del Silencio ya sabe que seguimos vivos. A partir de acá dejamos de escondernos y empezamos a prepararnos.'
  },
  {
    id: 'm15_start', speakerId: commander, missionId: 'mission-15-aurora-sabotage', triggerId: 'routine-start',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Día tranquilo, piloto. Pase por el depósito y confirme el inventario antes del turno de la tarde.'
  },
  {
    id: 'm15_crew_routine', speakerId: 'aurora-crew', missionId: 'mission-15-aurora-sabotage', triggerId: 'crew-routine',
    priority: 'low', autoDismissSeconds: 5,
    text: 'Si sobra cinta de sellado, guardanos un rollo. Siempre falta.'
  },
  {
    id: 'm15_seal_alarm', speakerId: commander, missionId: 'mission-15-aurora-sabotage', triggerId: 'seal-alarm',
    priority: 'critical', requiresConfirmation: true,
    text: 'Aurora-02 se selló solo. Hay tres personas adentro y la presión está bajando. Vaya. Ahora.'
  },
  {
    id: 'm15_trapped_crew', speakerId: 'aurora-crew', missionId: 'mission-15-aurora-sabotage', triggerId: 'trapped-crew',
    priority: 'important', autoDismissSeconds: 7,
    text: 'La puerta no responde y el panel está muerto. Se escucha algo zumbando dentro del mamparo.'
  },
  {
    id: 'm15_door_open', speakerId: 'aurora-crew', missionId: 'mission-15-aurora-sabotage', triggerId: 'door-open',
    priority: 'important', autoDismissSeconds: 6,
    text: 'Presión subiendo. Estamos bien. Eso no fue una falla, piloto: alguien cortó la línea.'
  },
  {
    id: 'm15_failures', speakerId: commander, missionId: 'mission-15-aurora-sabotage', triggerId: 'failures',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Energía auxiliar, comunicaciones, soporte vital y sensores. Los cuatro en el mismo minuto. Confírmelo en la terminal.'
  },
  {
    id: 'm15_deliberate', speakerId: commander, missionId: 'mission-15-aurora-sabotage', triggerId: 'deliberate',
    priority: 'critical', requiresConfirmation: true,
    text: 'No hay daño residual de la tormenta. Los cuatro fallos empiezan a la misma señal. Esto es deliberado.'
  },
  {
    id: 'm15_tech_parasite', speakerId: 'aurora-crew', missionId: 'mission-15-aurora-sabotage', triggerId: 'tech-parasite',
    priority: 'important', autoDismissSeconds: 7,
    text: 'Es del tamaño de una mano. Está mordido al cable con una abrazadera. No lo instalamos nosotros.'
  },
  {
    id: 'm15_energy_clear', speakerId: commander, missionId: 'mission-15-aurora-sabotage', triggerId: 'energy-clear',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Línea energética libre. Busque el siguiente: si pusieron uno, pusieron varios.'
  },
  {
    id: 'm15_life_clear', speakerId: commander, missionId: 'mission-15-aurora-sabotage', triggerId: 'life-clear',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Soporte vital estabilizado. Queda comunicaciones. No los desconecte de golpe.'
  },
  {
    id: 'm15_comms_clear', speakerId: commander, missionId: 'mission-15-aurora-sabotage', triggerId: 'comms-clear',
    priority: 'important', autoDismissSeconds: 6,
    text: 'Tercer nodo fuera. Y descargó todo lo que le quedaba en el módulo central antes de morir.'
  },
  {
    id: 'm15_overload_warning', speakerId: commander, missionId: 'mission-15-aurora-sabotage', triggerId: 'overload-warning',
    priority: 'important', autoDismissSeconds: 5, repeatable: true,
    text: 'El núcleo está subiendo. Purgue esa carga antes de que se lleve el módulo y a la gente adentro.'
  },
  {
    id: 'm15_overload_clear', speakerId: 'aurora-crew', missionId: 'mission-15-aurora-sabotage', triggerId: 'overload-clear',
    priority: 'important', autoDismissSeconds: 6,
    text: 'Núcleo estable. Nos quedamos sin uñas, pero el módulo sigue en pie.'
  },
  {
    id: 'm15_origin', speakerId: commander, missionId: 'mission-15-aurora-sabotage', triggerId: 'origin',
    priority: 'critical', requiresConfirmation: true,
    text: 'El dispositivo llegó con el material que recuperamos de Nereida. Estuvo dormido acá adentro hasta que les llegó el paquete que se escapó.'
  },
  {
    id: 'm15_pleyadan_step', speakerId: 'pleyadan', missionId: 'mission-15-aurora-sabotage', triggerId: 'pleyadan-step',
    priority: 'important', autoDismissSeconds: 8, subtitleMode: true,
    text: 'El Silencio ya dio su primer paso. El próximo no será invisible.'
  },
  {
    id: 'm15_complete', speakerId: commander, missionId: 'mission-15-aurora-sabotage', triggerId: 'mission-complete',
    priority: 'critical', requiresConfirmation: true,
    text: 'Hasta ahora estuvimos construyendo un hogar. Desde hoy tenemos que defenderlo.'
  },
  {
    id: 'm16_start', speakerId: commander, missionId: 'mission-16-pleyadian-protocol', triggerId: 'mission-start',
    priority: 'critical', requiresConfirmation: true,
    text: 'Piloto, una transmisión Pleyadiana rompe el silencio. Es una urgencia. Ve a la terminal principal.'
  },
  {
    id: 'm16_alert', speakerId: 'pleyadan', missionId: 'mission-16-pleyadian-protocol', triggerId: 'alert',
    priority: 'critical', requiresConfirmation: true, subtitleMode: true,
    text: 'Aurora, el sabotaje no buscaba destruirlos. Buscaba medir cómo se rompen. La Coalición ya los cuenta entre los mundos despiertos.'
  },
  {
    id: 'm16_terminal', speakerId: commander, missionId: 'mission-16-pleyadian-protocol', triggerId: 'terminal',
    priority: 'important', requiresConfirmation: true,
    text: 'Cruza los registros. Necesito confirmar que lo de ayer fue una prueba y no un accidente.'
  },
  {
    id: 'm16_probe_confirmed', speakerId: commander, missionId: 'mission-16-pleyadian-protocol', triggerId: 'probe-confirmed',
    priority: 'important', requiresConfirmation: true,
    text: 'Confirmado. Nos estaban midiendo. Los Pleyadianos quieren enlazar Aurora, Nereida y el Arca en una sola red.'
  },
  {
    id: 'm16_triple_link', speakerId: 'pleyadan', missionId: 'mission-16-pleyadian-protocol', triggerId: 'triple-link',
    priority: 'important', requiresConfirmation: true, subtitleMode: true,
    text: 'Tres anclas humanas, una sola voz. Lo que está enlazado es mucho más difícil de apagar en silencio.'
  },
  {
    id: 'm16_atlas_key', speakerId: 'pleyadan', missionId: 'mission-16-pleyadian-protocol', triggerId: 'atlas-key',
    priority: 'important', requiresConfirmation: true, subtitleMode: true,
    text: 'El Resonador Atlas reconoce vuestra firma. La clave que os falta ya estaba esperando en su interior.'
  },
  {
    id: 'm16_seed_world', speakerId: 'pleyadan', missionId: 'mission-16-pleyadian-protocol', triggerId: 'seed-world',
    priority: 'critical', requiresConfirmation: true, subtitleMode: true,
    text: 'E-01 es un mundo semilla. Parte de una red antigua que preserva vida, conocimiento y rutas entre civilizaciones.'
  },
  {
    id: 'm16_seed_network', speakerId: 'pleyadan', missionId: 'mission-16-pleyadian-protocol', triggerId: 'seed-network',
    priority: 'important', requiresConfirmation: true, subtitleMode: true,
    text: 'La Coalición del Silencio intenta apagar, aislar o controlar estos mundos. Podéis reactivar parte de vuestra red. Nosotros no podemos hacerlo por vosotros.'
  },
  {
    id: 'm16_protocols', speakerId: commander, missionId: 'mission-16-pleyadian-protocol', triggerId: 'protocols',
    priority: 'normal', autoDismissSeconds: 7,
    text: 'Prototipo compilado. Son planos, no defensas terminadas. Habrá que construirlas después.'
  },
  {
    id: 'm16_nodes_synced', speakerId: 'pleyadan', missionId: 'mission-16-pleyadian-protocol', triggerId: 'nodes-synced',
    priority: 'important', requiresConfirmation: true, subtitleMode: true,
    text: 'Los tres nodos laten en fase. La red Pleyadiana está en línea sobre Aurora.'
  },
  {
    id: 'm16_simulation', speakerId: commander, missionId: 'mission-16-pleyadian-protocol', triggerId: 'simulation',
    priority: 'important', requiresConfirmation: true,
    text: 'La simulación marca las rutas por donde vendrán. Ecos, todavía. Pero ahora sabemos por dónde mirar.'
  },
  {
    id: 'm16_energy_deficit', speakerId: commander, missionId: 'mission-16-pleyadian-protocol', triggerId: 'energy-deficit',
    priority: 'critical', requiresConfirmation: true,
    text: 'El protocolo no se sostiene con lo que tenemos. Vamos a necesitar más energía, sensores, escudos y un plan de evacuación.'
  },
  {
    id: 'm16_final_line', speakerId: 'pleyadan', missionId: 'mission-16-pleyadian-protocol', triggerId: 'final-line',
    priority: 'critical', requiresConfirmation: true, subtitleMode: true,
    text: 'No podemos detener la guerra por ustedes. Solo enseñarles a sobrevivir a su llegada.'
  },
  // --- Mission 17: Preparativos de Defensa ---
  {
    id: 'm17_start', speakerId: commander, missionId: 'mission-17-defense-preparations', triggerId: 'mission-start',
    priority: 'critical', requiresConfirmation: true,
    text: 'Piloto, tenemos los planos Pleyadianos. Ahora hay que construirlos. Convoca el consejo en la terminal.'
  },
  {
    id: 'm17_council', speakerId: commander, missionId: 'mission-17-defense-preparations', triggerId: 'council',
    priority: 'important', requiresConfirmation: true,
    text: 'Aurora dejó de ser una colonia civil el día que la Coalición nos midió. Hoy la convertimos en algo que aguante.'
  },
  {
    id: 'm17_deficit', speakerId: commander, missionId: 'mission-17-defense-preparations', triggerId: 'deficit',
    priority: 'important', requiresConfirmation: true,
    text: 'Confirmado: el déficit es real y hay tres puntos ciegos en el perímetro. Empezamos por la energía.'
  },
  {
    id: 'm17_reserve', speakerId: commander, missionId: 'mission-17-defense-preparations', triggerId: 'reserve',
    priority: 'important', requiresConfirmation: true,
    text: 'Reserva en línea y soporte vital intacto. Ahora los ojos: despliega los tres sensores del perímetro.'
  },
  {
    id: 'm17_sensors', speakerId: commander, missionId: 'mission-17-defense-preparations', triggerId: 'sensors',
    priority: 'important', requiresConfirmation: true,
    text: 'Tres corredores cubiertos. Sincronízalos con el protocolo Pleyadiano o solo verán tormentas.'
  },
  {
    id: 'm17_calibration', speakerId: 'pleyadan', missionId: 'mission-17-defense-preparations', triggerId: 'calibration',
    priority: 'important', requiresConfirmation: true, subtitleMode: true,
    text: 'Sus sensores ya reconocen la forma de lo que viene. Aprendan a mirar antes de aprender a responder.'
  },
  {
    id: 'm17_shield', speakerId: commander, missionId: 'mission-17-defense-preparations', triggerId: 'shield',
    priority: 'important', requiresConfirmation: true,
    text: 'Escudo reforzado en anillo. No es una muralla, pero compra minutos. A veces alcanza.'
  },
  {
    id: 'm17_alert_network', speakerId: commander, missionId: 'mission-17-defense-preparations', triggerId: 'alert-network',
    priority: 'important', requiresConfirmation: true,
    text: 'Aurora, Nereida y el Arca en el mismo canal. Si cae una, las otras lo saben en el mismo segundo.'
  },
  {
    id: 'm17_evacuation', speakerId: commander, missionId: 'mission-17-defense-preparations', triggerId: 'evacuation',
    priority: 'important', requiresConfirmation: true,
    text: 'Refugio, punto médico y zona de extracción marcados. El simulacro salió limpio. Nadie corre a ciegas.'
  },
  {
    id: 'm17_drill', speakerId: commander, missionId: 'mission-17-defense-preparations', triggerId: 'drill',
    priority: 'critical', requiresConfirmation: true,
    text: 'La prueba funcionó… y nos dijo la verdad: la red no aguanta un ataque prolongado. Estabilízala antes del apagón.'
  },
  {
    id: 'm17_stabilized', speakerId: commander, missionId: 'mission-17-defense-preparations', triggerId: 'stabilized',
    priority: 'important', requiresConfirmation: true,
    text: 'Red estabilizada. Defensas en modo de espera. Por primera vez, Aurora puede recibir un golpe.'
  },
  {
    id: 'm17_signatures', speakerId: commander, missionId: 'mission-17-defense-preparations', triggerId: 'signatures',
    priority: 'critical', requiresConfirmation: true,
    text: 'Piloto… los sensores marcan múltiples firmas descendiendo desde la alta atmósfera. No están en el guion del simulacro.'
  },
  {
    id: 'm17_not_a_simulation', speakerId: 'pleyadan', missionId: 'mission-17-defense-preparations', triggerId: 'not-simulation',
    priority: 'critical', requiresConfirmation: true, subtitleMode: true,
    text: 'Esto ya no es una simulación.'
  },
  // --- Mission 18: Primer Fuego. The Coalition never speaks directly. ---
  {
    id: 'm18_start', speakerId: commander, missionId: 'mission-18-first-fire', triggerId: 'mission-start',
    priority: 'critical', requiresConfirmation: true,
    text: 'Piloto, esto es real. Contactos entrando en picada sobre Aurora. Activa el protocolo de emergencia.'
  },
  {
    id: 'm18_attack_confirmed', speakerId: commander, missionId: 'mission-18-first-fire', triggerId: 'attack-confirmed',
    priority: 'critical', requiresConfirmation: true,
    text: 'No es un simulacro y no son sensores fallando. Nos están atacando. La guerra empezó hoy.'
  },
  {
    id: 'm18_shelter', speakerId: 'aurora-crew', missionId: 'mission-18-first-fire', triggerId: 'shelter',
    priority: 'important', requiresConfirmation: true,
    text: 'Los habitantes ya bajaron a los refugios. Estamos todos abajo. Hacé lo que tengas que hacer.'
  },
  {
    id: 'm18_identified', speakerId: 'aurora-crew', missionId: 'mission-18-first-fire', triggerId: 'identified',
    priority: 'important', requiresConfirmation: true,
    text: 'Clasificados: drones de reconocimiento armado. Rumbo cero-cuatro-dos, dos mil cien metros, dos minutos.'
  },
  {
    id: 'm18_weapons_free', speakerId: commander, missionId: 'mission-18-first-fire', triggerId: 'weapons-free',
    priority: 'critical', requiresConfirmation: true,
    text: 'Autorizo fuego defensivo. Es la primera vez que Aurora dispara contra alguien. Que quede registrado.'
  },
  {
    id: 'm18_breach', speakerId: 'aurora-crew', missionId: 'mission-18-first-fire', triggerId: 'breach',
    priority: 'critical', requiresConfirmation: true,
    text: '¡Uno pasó! Le dio a la antena. Sin antena perdemos a Nereida y al Arca. Reparala vos, nosotros no llegamos.'
  },
  {
    id: 'm18_mast_restored', speakerId: 'aurora-crew', missionId: 'mission-18-first-fire', triggerId: 'mast-restored',
    priority: 'important', requiresConfirmation: true,
    text: 'Antena en pie. Las baterías no alcanzan a los que quedaron arriba. Alguien tiene que subir.'
  },
  {
    id: 'm18_takeoff', speakerId: commander, missionId: 'mission-18-first-fire', triggerId: 'takeoff',
    priority: 'critical', requiresConfirmation: true,
    text: 'Subí a la nave, piloto. Aurora no puede defenderse sola del aire. Pasadas cortas, no te alejes.'
  },
  {
    id: 'm18_shield_attack', speakerId: 'aurora-crew', missionId: 'mission-18-first-fire', triggerId: 'shield-attack',
    priority: 'critical', requiresConfirmation: true,
    text: 'Van por un emisor. Si cae la cúpula la levantamos otra vez, pero a media potencia. No los dejes.'
  },
  {
    id: 'm18_runner', speakerId: 'aurora-crew', missionId: 'mission-18-first-fire', triggerId: 'runner',
    priority: 'critical', requiresConfirmation: true,
    text: 'Uno se retira… y está transmitiendo. No alcanza con ahuyentarlo, piloto.'
  },
  {
    id: 'm18_transmission', speakerId: commander, missionId: 'mission-18-first-fire', triggerId: 'transmission',
    priority: 'critical', requiresConfirmation: true,
    text: 'Alcanzó a soltar el paquete antes de caer. Sea lo que sea, ya salió de la atmósfera.'
  },
  {
    id: 'm18_wreckage', speakerId: 'aurora-crew', missionId: 'mission-18-first-fire', triggerId: 'wreckage',
    priority: 'important', requiresConfirmation: true,
    text: 'Armamento ligero, navegación de largo alcance, sin soporte vital. Esto era una avanzada, no la fuerza principal.'
  },
  {
    id: 'm18_nereida_target', speakerId: commander, missionId: 'mission-18-first-fire', triggerId: 'nereida-target',
    priority: 'critical', requiresConfirmation: true,
    text: 'Desciframos el paquete. Eran coordenadas. Las de Base Nereida.'
  },
  {
    id: 'm18_closing', speakerId: 'pleyadan', missionId: 'mission-18-first-fire', triggerId: 'closing',
    priority: 'critical', requiresConfirmation: true, subtitleMode: true,
    text: 'Se retiran de Aurora. Pero ahora van hacia Nereida.'
  },
  // --- Mission 19: Nereida bajo Ataque. The Coalition still never speaks. ---
  {
    id: 'm19_start', speakerId: commander, missionId: 'mission-19-nereida-under-attack', triggerId: 'mission-start',
    priority: 'critical', requiresConfirmation: true,
    text: 'Piloto, Nereida está bajo ataque. Llegaron con las coordenadas que se llevaron de Aurora.'
  },
  {
    id: 'm19_nereida_call', speakerId: 'base-nereida', missionId: 'mission-19-nereida-under-attack', triggerId: 'call',
    priority: 'critical', requiresConfirmation: true, subtitleMode: true,
    text: '…Nereida a cualquiera que escuche… perdimos las defensas exteriores… van hacia el resonador…'
  },
  {
    id: 'm19_defenses_down', speakerId: 'base-nereida', missionId: 'mission-19-nereida-under-attack', triggerId: 'defenses-down',
    priority: 'critical', requiresConfirmation: true,
    text: 'Sin comunicaciones y sin perímetro. No quieren la base, piloto. Quieren Atlas.'
  },
  {
    id: 'm19_interference', speakerId: 'arca-ai', missionId: 'mission-19-nereida-under-attack', triggerId: 'interference',
    priority: 'important', requiresConfirmation: true,
    text: 'Interferencia creciente en la ruta. Detecto contactos hostiles en el corredor de aproximación.'
  },
  {
    id: 'm19_arrival', speakerId: 'base-nereida', missionId: 'mission-19-nereida-under-attack', triggerId: 'arrival',
    priority: 'critical', requiresConfirmation: true,
    text: 'Te vemos entrar. Hay humo en el sector norte y tres sistemas caídos. Aterriza en el apron, es lo único despejado.'
  },
  {
    id: 'm19_defenses_up', speakerId: 'aurora-crew', missionId: 'mission-19-nereida-under-attack', triggerId: 'defenses-up',
    priority: 'important', requiresConfirmation: true,
    text: 'Baliza, energía y barrera en línea. Aguantá ahí: ya vienen por tierra.'
  },
  {
    id: 'm19_breach', speakerId: 'base-nereida', missionId: 'mission-19-nereida-under-attack', triggerId: 'breach',
    priority: 'critical', requiresConfirmation: true,
    text: '¡Uno llegó al acceso del resonador! Cerrá las compuertas antes de que baje los registros.'
  },
  {
    id: 'm19_gate_sealed', speakerId: 'base-nereida', missionId: 'mission-19-nereida-under-attack', triggerId: 'gate-sealed',
    priority: 'important', requiresConfirmation: true,
    text: 'Compuertas selladas. Pero no alcanza la energía para sostenerlo todo. Vos decidís qué aguanta.'
  },
  {
    id: 'm19_priority', speakerId: commander, missionId: 'mission-19-nereida-under-attack', triggerId: 'priority',
    priority: 'critical', requiresConfirmation: true,
    text: 'Registrado. Lo que dejemos sin cubrir va a doler, pero es la decisión correcta ahora.'
  },
  {
    id: 'm19_counterattack', speakerId: 'aurora-crew', missionId: 'mission-19-nereida-under-attack', triggerId: 'counterattack',
    priority: 'important', requiresConfirmation: true,
    text: 'La batería pesada lleva años apagada. Le queda un disparo bueno. Que valga la pena.'
  },
  {
    id: 'm19_data_leak', speakerId: 'arca-ai', missionId: 'mission-19-nereida-under-attack', triggerId: 'data-leak',
    priority: 'critical', requiresConfirmation: true,
    text: 'Transmisión enemiga en curso. Se llevan una fracción del mapa orbital: ruta y firma del Arca.'
  },
  {
    id: 'm19_wreckage', speakerId: 'aurora-crew', missionId: 'mission-19-nereida-under-attack', triggerId: 'wreckage',
    priority: 'important', requiresConfirmation: true,
    text: 'Restos escaneados y enlace con Aurora reparado. Atlas está estable, dentro de lo que se puede pedir.'
  },
  {
    id: 'm19_ark_target', speakerId: commander, missionId: 'mission-19-nereida-under-attack', triggerId: 'ark-target',
    priority: 'critical', requiresConfirmation: true,
    text: 'Nuevas firmas subiendo a órbita. No vuelven a casa, piloto. Van hacia arriba.'
  },
  {
    id: 'm19_closing', speakerId: 'pleyadan', missionId: 'mission-19-nereida-under-attack', triggerId: 'closing',
    priority: 'critical', requiresConfirmation: true, subtitleMode: true,
    text: 'Nereida era el camino. El Arca siempre fue el objetivo.'
  },
  // --- Mission 20: Batalla por el Arca. The Coalition still does not speak
  // clearly; the closing transmission stays encrypted and unresolved. ---
  {
    id: 'm20_start', speakerId: commander, missionId: 'mission-20-ark-battle', triggerId: 'mission-start',
    priority: 'critical', requiresConfirmation: true,
    text: 'Piloto, el Arca está bajo ataque orbital. Subí ya. No quieren destruirla: quieren dejarla ciega y varada.'
  },
  {
    id: 'm20_ark_silent', speakerId: 'arca-ai', missionId: 'mission-20-ark-battle', triggerId: 'ark-silent',
    priority: 'critical', requiresConfirmation: true,
    text: 'Comunicaciones cortadas y defensas parciales. Tres sistemas comprometidos: comunicaciones, propulsión y núcleo de datos.'
  },
  {
    id: 'm20_ascent', speakerId: 'base-nereida', missionId: 'mission-20-ark-battle', triggerId: 'ascent',
    priority: 'important', requiresConfirmation: true,
    text: 'Te seguimos desde Nereida mientras podamos. Cuidado con los restos atmosféricos en el ascenso.'
  },
  {
    id: 'm20_systems', speakerId: 'arca-ai', missionId: 'mission-20-ark-battle', triggerId: 'systems',
    priority: 'important', requiresConfirmation: true,
    text: 'Necesito los tres enlaces externos sincronizados. Sin ellos no hay fijación de blancos ni apoyo de torretas.'
  },
  {
    id: 'm20_link_restored', speakerId: 'arca-ai', missionId: 'mission-20-ark-battle', triggerId: 'link-restored',
    priority: 'important', requiresConfirmation: true,
    text: 'Enlace restablecido. Torretas del Arca en automático. Ya no estás solo ahí afuera.'
  },
  {
    id: 'm20_jammer', speakerId: 'arca-ai', missionId: 'mission-20-ark-battle', triggerId: 'jammer',
    priority: 'critical', requiresConfirmation: true,
    text: 'Perdí fijación de blancos. Hay una unidad de guerra electrónica ahí fuera. Seguí la intensidad de señal.'
  },
  {
    id: 'm20_engines', speakerId: commander, missionId: 'mission-20-ark-battle', triggerId: 'engines',
    priority: 'critical', requiresConfirmation: true,
    text: 'Van por los motores orbitales. Si los perdemos, el Arca no evacua a nadie ni vuelve a bajar a E-01.'
  },
  {
    id: 'm20_modules', speakerId: 'aurora-crew', missionId: 'mission-20-ark-battle', triggerId: 'modules',
    priority: 'critical', requiresConfirmation: true,
    text: 'Las cápsulas civiles quedaron expuestas. Ahí adentro hay gente, piloto. Llegá antes que ellos.'
  },
  {
    id: 'm20_breach', speakerId: 'arca-ai', missionId: 'mission-20-ark-battle', triggerId: 'breach',
    priority: 'critical', requiresConfirmation: true,
    text: 'Una unidad se acopló al núcleo de datos coloniales. Cortá el enlace desde el casco: no entres.'
  },
  {
    id: 'm20_breach_cut', speakerId: 'arca-ai', missionId: 'mission-20-ark-battle', triggerId: 'breach-cut',
    priority: 'important', requiresConfirmation: true,
    text: 'Acoplamiento cortado. Se llevaron parte, no todo. Podría haber sido mucho peor.'
  },
  {
    id: 'm20_counterattack', speakerId: commander, missionId: 'mission-20-ark-battle', triggerId: 'counterattack',
    priority: 'critical', requiresConfirmation: true,
    text: 'Batería principal en línea. Aurora y Nereida disparan con nosotros. Por primera vez, los tres a la vez.'
  },
  {
    id: 'm20_stabilized', speakerId: 'arca-ai', missionId: 'mission-20-ark-battle', triggerId: 'stabilized',
    priority: 'important', requiresConfirmation: true,
    text: 'Casco íntegro dentro de lo tolerable. Enlace con E-01 restablecido. El Arca sigue de pie.'
  },
  {
    id: 'm20_capital_signature', speakerId: 'arca-ai', missionId: 'mission-20-ark-battle', triggerId: 'capital',
    priority: 'critical', requiresConfirmation: true,
    text: 'Firma entrando al sistema. La escala no coincide con nada de lo que enfrentamos hoy. Y está transmitiendo.'
  },
  {
    id: 'm20_closing', speakerId: 'pleyadan', missionId: 'mission-20-ark-battle', triggerId: 'closing',
    priority: 'critical', requiresConfirmation: true, subtitleMode: true,
    text: 'El ataque terminó. La señal no.'
  },
  // --- Mission 21: La ruptura del Silencio. The Coalition speaks directly
  // for the first time. It remains collective, faceless and text-only. ---
  {
    id: 'm21_start', speakerId: commander, missionId: 'mission-21-silence-rupture', triggerId: 'mission-start',
    priority: 'critical', requiresConfirmation: true,
    text: 'La transmisión sigue abierta. Quédate junto al Arca: tenemos que alinear nuestros canales con la portadora enemiga.'
  },
  {
    id: 'm21_channels_aligned', speakerId: 'arca-ai', missionId: 'mission-21-silence-rupture', triggerId: 'decoded',
    priority: 'important', requiresConfirmation: true,
    text: 'Frecuencias humana, Pleyadiana y enemiga alineadas. El cifrado cedió. La fuente ya es visible.'
  },
  {
    id: 'm21_capital_detected', speakerId: 'arca-ai', missionId: 'mission-21-silence-rupture', triggerId: 'capital-detected',
    priority: 'critical', requiresConfirmation: true,
    text: 'Nave capital confirmada a distancia extrema. Su masa y firma energética superan toda unidad registrada en el sistema.'
  },
  {
    id: 'm21_signature_analyzed', speakerId: 'arca-ai', missionId: 'mission-21-silence-rupture', triggerId: 'signature-analyzed',
    priority: 'critical', requiresConfirmation: true,
    text: 'Patrón de salto coordinado. Detecto escoltas, plataformas auxiliares y capacidad de ataque multivector. No está entrando en alcance.'
  },
  {
    id: 'm21_ultimatum_open', speakerId: 'coalition-silence', missionId: 'mission-21-silence-rupture', triggerId: 'ultimatum-open',
    priority: 'critical', requiresConfirmation: true, subtitleMode: true,
    text: 'Su presencia ha activado una red que debía permanecer en silencio.'
  },
  {
    id: 'm21_ultimatum_demands', speakerId: 'coalition-silence', missionId: 'mission-21-silence-rupture', triggerId: 'ultimatum-demands',
    priority: 'critical', requiresConfirmation: true, subtitleMode: true,
    text: 'Entreguen el archivo semilla. Desactiven el enlace Pleyadiano. Abandonen E-01.'
  },
  {
    id: 'm21_ultimatum_close', speakerId: 'coalition-silence', missionId: 'mission-21-silence-rupture', triggerId: 'ultimatum-close',
    priority: 'critical', requiresConfirmation: true, subtitleMode: true,
    text: 'La permanencia humana no será tolerada. El incumplimiento terminará todos sus enclaves.'
  },
  {
    id: 'm21_response_defiant', speakerId: commander, missionId: 'mission-21-silence-rupture', triggerId: 'response-defiant',
    priority: 'critical', requiresConfirmation: true,
    text: 'Respuesta registrada: no vamos a abandonar nuestro mundo. Aurora, Nereida y el Arca sostienen la misma posición.'
  },
  {
    id: 'm21_response_diplomatic', speakerId: commander, missionId: 'mission-21-silence-rupture', triggerId: 'response-diplomatic',
    priority: 'critical', requiresConfirmation: true,
    text: 'Respuesta registrada: podemos evitar otra guerra. Aurora, Nereida y el Arca solicitan un canal de negociación.'
  },
  {
    id: 'm21_response_strategic', speakerId: commander, missionId: 'mission-21-silence-rupture', triggerId: 'response-strategic',
    priority: 'critical', requiresConfirmation: true,
    text: 'Respuesta registrada: necesitamos tiempo para evaluar sus demandas. Usaremos cada segundo que nos concedan.'
  },
  {
    id: 'm21_total_interference', speakerId: 'arca-ai', missionId: 'mission-21-silence-rupture', triggerId: 'interference',
    priority: 'critical', requiresConfirmation: true,
    text: 'Interferencia total. Aurora, Nereida y el canal interno del Arca quedaron aislados. Restáuralos desde los enlaces externos.'
  },
  {
    id: 'm21_channels_restored', speakerId: commander, missionId: 'mission-21-silence-rupture', triggerId: 'channels-restored',
    priority: 'important', requiresConfirmation: true,
    text: 'Tres enclaves otra vez en línea. La Coalición sabe que nos escuchamos. Ahora quiere que entendamos su alcance.'
  },
  {
    id: 'm21_demonstration', speakerId: 'arca-ai', missionId: 'mission-21-silence-rupture', triggerId: 'demonstration',
    priority: 'critical', requiresConfirmation: true,
    text: 'Baliza orbital remota inutilizada por un único pulso. Distancia de disparo fuera de nuestra capacidad de respuesta.'
  },
  {
    id: 'm21_routes', speakerId: commander, missionId: 'mission-21-silence-rupture', triggerId: 'routes',
    priority: 'critical', requiresConfirmation: true,
    text: 'Tres grupos se separan: uno hacia Aurora, uno hacia Nereida y otro hacia la red orbital. Clasifica las rutas.'
  },
  {
    id: 'm21_pleyadian_network', speakerId: 'pleyadan', missionId: 'mission-21-silence-rupture', triggerId: 'pleyadian-network',
    priority: 'critical', requiresConfirmation: true, subtitleMode: true,
    text: 'Podemos restaurar una parte de la red y unir sus tres voces. No podemos enfrentar solos a esa nave.'
  },
  {
    id: 'm21_assault', speakerId: 'arca-ai', missionId: 'mission-21-silence-rupture', triggerId: 'simultaneous-assault',
    priority: 'critical', requiresConfirmation: true,
    text: 'Alarmas simultáneas. Contactos sobre Aurora, aproximación a Nereida y ataque contra las comunicaciones orbitales.'
  },
  {
    id: 'm21_closing', speakerId: commander, missionId: 'mission-21-silence-rupture', triggerId: 'closing',
    priority: 'critical', requiresConfirmation: true,
    text: 'El Silencio terminó. Ahora vienen por todo.'
  },
  // --- Mission 22: Frentes rotos. The Coalition stays silent; all traffic is
  // human or Pleyadian command telemetry across the three active fronts. ---
  {
    id: 'm22_start', speakerId: commander, missionId: 'mission-22-broken-fronts', triggerId: 'mission-start',
    priority: 'critical', requiresConfirmation: true,
    text: 'Tres alarmas al mismo tiempo. Aurora, Nereida y la red orbital están bajo presión. Necesito que coordines desde el Arca.'
  },
  {
    id: 'm22_aurora_alarm', speakerId: 'aurora-crew', missionId: 'mission-22-broken-fronts', triggerId: 'aurora-alarm',
    priority: 'critical', requiresConfirmation: true,
    text: 'Ataque sobre sensores y reserva energética. El escudo aguanta, pero los habitantes ya están en refugios.'
  },
  {
    id: 'm22_nereida_alarm', speakerId: 'base-nereida', missionId: 'mission-22-broken-fronts', triggerId: 'nereida-alarm',
    priority: 'critical', requiresConfirmation: true,
    text: 'Unidades de brecha convergen otra vez sobre Atlas. Esta vez intentan extraer los registros sin cruzar la compuerta.'
  },
  {
    id: 'm22_orbital_alarm', speakerId: 'arca-ai', missionId: 'mission-22-broken-fronts', triggerId: 'orbital-alarm',
    priority: 'critical', requiresConfirmation: true,
    text: 'Interceptores atacan los tres relés entre el Arca y E-01. Pérdida de enlace proyectada si no reciben cobertura.'
  },
  {
    id: 'm22_command_defiant', speakerId: commander, missionId: 'mission-22-broken-fronts', triggerId: 'command-defiant',
    priority: 'important', requiresConfirmation: true,
    text: 'Nuestra respuesta fue clara. Ahora hay que sostenerla: ningún enclave retrocede.'
  },
  {
    id: 'm22_command_diplomatic', speakerId: commander, missionId: 'mission-22-broken-fronts', triggerId: 'command-diplomatic',
    priority: 'important', requiresConfirmation: true,
    text: 'Intentamos mantener abierto el diálogo. Ellos respondieron con tres ataques. Salvaremos a todos antes de volver a hablar.'
  },
  {
    id: 'm22_command_strategic', speakerId: commander, missionId: 'mission-22-broken-fronts', triggerId: 'command-strategic',
    priority: 'important', requiresConfirmation: true,
    text: 'Pedimos tiempo y lo usamos bien. Distribuye recursos; las defensas están listas para responder juntas.'
  },
  {
    id: 'm22_resources_assigned', speakerId: 'arca-ai', missionId: 'mission-22-broken-fronts', triggerId: 'resources-assigned',
    priority: 'important', requiresConfirmation: true,
    text: 'Asignación inicial confirmada. La presión cambiará entre frentes, pero la red conserva capacidad de recuperación.'
  },
  {
    id: 'm22_aurora_held', speakerId: 'aurora-crew', missionId: 'mission-22-broken-fronts', triggerId: 'aurora-held',
    priority: 'important', requiresConfirmation: true,
    text: 'Sensores enlazados, escudo estable y módulos intactos. Aurora sostiene el frente.'
  },
  {
    id: 'm22_nereida_held', speakerId: 'base-nereida', missionId: 'mission-22-broken-fronts', triggerId: 'nereida-held',
    priority: 'important', requiresConfirmation: true,
    text: 'Compuertas cerradas y extracción remota interrumpida. Atlas permanece en nuestras manos.'
  },
  {
    id: 'm22_relays_held', speakerId: 'arca-ai', missionId: 'mission-22-broken-fronts', triggerId: 'relays-held',
    priority: 'important', requiresConfirmation: true,
    text: 'Tres relés protegidos. El Arca conserva enlace táctico con Aurora y Nereida.'
  },
  {
    id: 'm22_cross_crisis', speakerId: commander, missionId: 'mission-22-broken-fronts', triggerId: 'cross-crisis',
    priority: 'critical', requiresConfirmation: true,
    text: 'Cada vez que reforzamos un frente, otro pierde presión de escudo. Regresa al mando: vamos a redistribuir en tiempo real.'
  },
  {
    id: 'm22_support_chosen', speakerId: 'pleyadan', missionId: 'mission-22-broken-fronts', triggerId: 'support-chosen',
    priority: 'important', requiresConfirmation: true, subtitleMode: true,
    text: 'El refuerzo seguirá su prioridad. La red conjunta compensará los otros dos frentes mientras permanezcan enlazados.'
  },
  {
    id: 'm22_joint_network', speakerId: 'pleyadan', missionId: 'mission-22-broken-fronts', triggerId: 'joint-network',
    priority: 'critical', requiresConfirmation: true, subtitleMode: true,
    text: 'Aurora, Nereida y Arca sincronizados. Tres defensas, una respuesta.'
  },
  {
    id: 'm22_nodes_detected', speakerId: 'arca-ai', missionId: 'mission-22-broken-fronts', triggerId: 'nodes-detected',
    priority: 'critical', requiresConfirmation: true,
    text: 'Patrón resuelto: interferidor orbital, plataforma logística y baliza de salto. Son los tres nodos que sostienen la ofensiva.'
  },
  {
    id: 'm22_final_pressure', speakerId: commander, missionId: 'mission-22-broken-fronts', triggerId: 'final-pressure',
    priority: 'critical', requiresConfirmation: true,
    text: 'Última oleada sobre el Arca. Aurora y Nereida responderán con sus defensas; tú mantén limpio el frente orbital.'
  },
  {
    id: 'm22_closing', speakerId: commander, missionId: 'mission-22-broken-fronts', triggerId: 'closing',
    priority: 'critical', requiresConfirmation: true,
    text: 'No podemos seguir defendiendo tres frentes. Es hora de golpear el origen.'
  },
  // --- Mission 23: La contraofensiva. The Coalition remains silent while
  // the four allied sources coordinate the first deliberate strike. ---
  {
    id: 'm23_start', speakerId: commander, missionId: 'mission-23-counteroffensive', triggerId: 'mission-start',
    priority: 'critical', requiresConfirmation: true,
    text: 'Seguir defendiendo tres frentes nos va a agotar. Hoy dejamos de reaccionar: atacaremos los nodos que sostienen su ofensiva.'
  },
  {
    id: 'm23_joint_forces', speakerId: 'pleyadan', missionId: 'mission-23-counteroffensive', triggerId: 'joint-forces',
    priority: 'important', requiresConfirmation: true, subtitleMode: true,
    text: 'Arca, Aurora y Nereida enlazadas. Nuestra red estabilizara sus sensores. Elijan el primer objetivo.'
  },
  {
    id: 'm23_order_chosen', speakerId: 'arca-ai', missionId: 'mission-23-counteroffensive', triggerId: 'order-chosen',
    priority: 'important', requiresConfirmation: true,
    text: 'Orden de ataque registrado. La baliza de salto queda reservada como objetivo final.'
  },
  {
    id: 'm23_jammer_reading', speakerId: 'base-nereida', missionId: 'mission-23-counteroffensive', triggerId: 'jammer-reading',
    priority: 'important', requiresConfirmation: true,
    text: 'Lectura recibida. Atlas esta separando la portadora real de los ecos del interferidor.'
  },
  {
    id: 'm23_jammer_destroyed', speakerId: 'base-nereida', missionId: 'mission-23-counteroffensive', triggerId: 'jammer-destroyed',
    priority: 'critical', requiresConfirmation: true,
    text: 'Interferidor neutralizado. Lock-on y comunicaciones estables en los tres frentes.'
  },
  {
    id: 'm23_platform_exposed', speakerId: 'aurora-crew', missionId: 'mission-23-counteroffensive', triggerId: 'platform-exposed',
    priority: 'critical', requiresConfirmation: true,
    text: 'Plataforma logistica expuesta. Marcamos defensa exterior, depositos energeticos y nucleo de abastecimiento.'
  },
  {
    id: 'm23_platform_method', speakerId: 'arca-ai', missionId: 'mission-23-counteroffensive', triggerId: 'platform-method',
    priority: 'important', requiresConfirmation: true,
    text: 'Metodo confirmado. Bateria del Arca coordinada con sensores de Aurora. Ataque al nucleo en curso.'
  },
  {
    id: 'm23_platform_destroyed', speakerId: 'aurora-crew', missionId: 'mission-23-counteroffensive', triggerId: 'platform-destroyed',
    priority: 'critical', requiresConfirmation: true,
    text: 'Cadena de abastecimiento cortada. Los refuerzos enemigos ya no pueden rearmarse en este sector.'
  },
  {
    id: 'm23_beacon_located', speakerId: commander, missionId: 'mission-23-counteroffensive', triggerId: 'beacon-located',
    priority: 'critical', requiresConfirmation: true,
    text: 'Baliza de salto localizada. Derriba los tres anclajes; la red Pleyadiana preparara el pulso final.'
  },
  {
    id: 'm23_beacon_collapse', speakerId: 'pleyadan', missionId: 'mission-23-counteroffensive', triggerId: 'beacon-collapse',
    priority: 'critical', requiresConfirmation: true, subtitleMode: true,
    text: 'Anclajes desactivados. Sincronizamos el pulso. Permanezcan hasta que la ruta pierda coherencia.'
  },
  {
    id: 'm23_escape', speakerId: 'arca-ai', missionId: 'mission-23-counteroffensive', triggerId: 'escape',
    priority: 'critical', requiresConfirmation: true,
    text: 'Colapso confirmado. Onda de distorsion en expansion: abandona la zona ahora.'
  },
  {
    id: 'm23_route_recovered', speakerId: 'arca-ai', missionId: 'mission-23-counteroffensive', triggerId: 'route-recovered',
    priority: 'critical', requiresConfirmation: true,
    text: 'Ruta recuperada. La nave capital y sus escoltas convergen en el sector orbital inicial del Arca.'
  },
  {
    id: 'm23_closing', speakerId: commander, missionId: 'mission-23-counteroffensive', triggerId: 'closing',
    priority: 'critical', requiresConfirmation: true,
    text: 'Todo converge en el Arca. Tenemos que volver al lugar donde empezo.'
  },
  // --- Mission 24: Regreso al origen. Text only; no new voice generation. ---
  {
    id: 'm24_start', speakerId: commander, missionId: 'mission-24-return-to-origin', triggerId: 'mission-start',
    priority: 'critical', requiresConfirmation: true,
    text: 'La ruta enemiga termina en el sector donde comenzo todo. Volvemos al Arca antes que su fuerza principal.'
  },
  {
    id: 'm24_route_decoded', speakerId: 'base-nereida', missionId: 'mission-24-return-to-origin', triggerId: 'route-decoded',
    priority: 'important', requiresConfirmation: true,
    text: 'Coordenadas confirmadas. Aurora y Nereida sostendran el enlace durante el ascenso.'
  },
  {
    id: 'm24_launch_prepared', speakerId: 'arca-ai', missionId: 'mission-24-return-to-origin', triggerId: 'launch-prepared',
    priority: 'important', requiresConfirmation: true,
    text: 'Motores, escudo termico, reserva energetica y navegacion orbital dentro de parametros.'
  },
  {
    id: 'm24_boarded', speakerId: commander, missionId: 'mission-24-return-to-origin', triggerId: 'boarded',
    priority: 'important', requiresConfirmation: false,
    text: 'Compuertas cerradas. Cuando estes listo, inicia la secuencia.'
  },
  {
    id: 'm24_countdown', speakerId: 'arca-ai', missionId: 'mission-24-return-to-origin', triggerId: 'countdown',
    priority: 'critical', requiresConfirmation: false,
    text: 'Secuencia de lanzamiento iniciada. Cinco, cuatro, tres, dos, uno.'
  },
  {
    id: 'm24_liftoff', speakerId: 'base-nereida', missionId: 'mission-24-return-to-origin', triggerId: 'liftoff',
    priority: 'critical', requiresConfirmation: false,
    text: 'Despegue confirmado. Nereida mantiene el corredor; sostene el empuje.'
  },
  {
    id: 'm24_clouds', speakerId: 'aurora-crew', missionId: 'mission-24-return-to-origin', triggerId: 'clouds',
    priority: 'important', requiresConfirmation: false,
    text: 'Entraste en la capa. Confia en los instrumentos y conserva el vector.'
  },
  {
    id: 'm24_mid_atmosphere', speakerId: 'arca-ai', missionId: 'mission-24-return-to-origin', triggerId: 'mid-atmosphere',
    priority: 'important', requiresConfirmation: false,
    text: 'Nubes debajo. Inclina la trayectoria y comienza a ganar velocidad horizontal.'
  },
  {
    id: 'm24_upper_atmosphere', speakerId: 'pleyadan', missionId: 'mission-24-return-to-origin', triggerId: 'upper-atmosphere',
    priority: 'important', requiresConfirmation: false, subtitleMode: true,
    text: 'La atmosfera se debilita. Nuestra red conserva su rumbo hacia el Arca.'
  },
  {
    id: 'm24_vacuum', speakerId: 'arca-ai', missionId: 'mission-24-return-to-origin', triggerId: 'vacuum',
    priority: 'critical', requiresConfirmation: false,
    text: 'Presion exterior nula. Viento perdido. Prepara insercion orbital.'
  },
  {
    id: 'm24_orbit_insertion', speakerId: 'arca-ai', missionId: 'mission-24-return-to-origin', triggerId: 'orbit-insertion',
    priority: 'critical', requiresConfirmation: false,
    text: 'Insercion confirmada. Recalibrando navegacion y buscando la firma del Arca.'
  },
  {
    id: 'm24_ark_located', speakerId: commander, missionId: 'mission-24-return-to-origin', triggerId: 'ark-located',
    priority: 'critical', requiresConfirmation: false,
    text: 'Ahi esta. El mismo casco que nos trajo hasta esta galaxia. Regresemos a casa.'
  },
  {
    id: 'm24_origin_reached', speakerId: 'arca-ai', missionId: 'mission-24-return-to-origin', triggerId: 'origin-reached',
    priority: 'important', requiresConfirmation: false,
    text: 'Sector inicial alcanzado. La estructura principal del Arca responde.'
  },
  {
    id: 'm24_ark_arrival', speakerId: commander, missionId: 'mission-24-return-to-origin', triggerId: 'ark-arrival',
    priority: 'critical', requiresConfirmation: true,
    text: 'Volvimos al punto de partida con dos colonias, una alianza y una oportunidad de resistir.'
  },
  {
    id: 'm24_ark_assessed', speakerId: 'arca-ai', missionId: 'mission-24-return-to-origin', triggerId: 'ark-assessed',
    priority: 'important', requiresConfirmation: true,
    text: 'Cinco sistemas evaluados. El Arca esta herida, pero puede sostener la red conjunta.'
  },
  {
    id: 'm24_links_restored', speakerId: 'base-nereida', missionId: 'mission-24-return-to-origin', triggerId: 'links-restored',
    priority: 'important', requiresConfirmation: true,
    text: 'Aurora y Nereida enlazadas. Supervivientes, energia y defensas confirmados.'
  },
  {
    id: 'm24_ark_prepared', speakerId: 'arca-ai', missionId: 'mission-24-return-to-origin', triggerId: 'ark-prepared',
    priority: 'critical', requiresConfirmation: true,
    text: 'Escudo alineado. Motores balanceados. Condensadores de la bateria principal cargados.'
  },
  {
    id: 'm24_pleyadian_integrated', speakerId: 'pleyadan', missionId: 'mission-24-return-to-origin', triggerId: 'pleyadian-integrated',
    priority: 'critical', requiresConfirmation: true, subtitleMode: true,
    text: 'Tres nodos integrados. Estabilizaremos su escudo y su bateria, pero el pulso final exigira toda la red.'
  },
  {
    id: 'm24_shelters_ready', speakerId: 'arca-ai', missionId: 'mission-24-return-to-origin', triggerId: 'shelters-ready',
    priority: 'important', requiresConfirmation: false,
    text: 'Refugios sellados. Soporte vital, capacidad medica y rutas de evacuacion preparados.'
  },
  {
    id: 'm24_allies_assembled', speakerId: 'aurora-crew', missionId: 'mission-24-return-to-origin', triggerId: 'allies-assembled',
    priority: 'critical', requiresConfirmation: true,
    text: 'Aurora aporta energia y sensores. Nereida, Atlas. El Arca, coordinacion. Estamos listos.'
  },
  {
    id: 'm24_sector_revisited', speakerId: commander, missionId: 'mission-24-return-to-origin', triggerId: 'sector-revisited',
    priority: 'important', requiresConfirmation: true,
    text: 'Llegamos aqui sin mapa y sin hogar. Ahora cada señal amiga cuenta lo que construimos.'
  },
  {
    id: 'm24_rehearsal_complete', speakerId: 'arca-ai', missionId: 'mission-24-return-to-origin', triggerId: 'rehearsal-complete',
    priority: 'critical', requiresConfirmation: true,
    text: 'Ensayo completo. La defensa puede sostenerse; el pulso final consumira una reserva extrema.'
  },
  {
    id: 'm24_final_fleet', speakerId: 'arca-ai', missionId: 'mission-24-return-to-origin', triggerId: 'final-fleet',
    priority: 'critical', requiresConfirmation: true,
    text: 'Flota detectada: cazas, drones, plataformas, interferidores, escoltas y una nave capital. Aun fuera de alcance.'
  },
  {
    id: 'm24_final_line', speakerId: commander, missionId: 'mission-24-return-to-origin', triggerId: 'final-line',
    priority: 'critical', requiresConfirmation: true,
    text: 'Volvimos al lugar donde empez\u00f3 todo. Esta vez, el Arca no est\u00e1 sola.'
  },

  // --- Mission 01 prologue: departure from Arca Epsilon --------------------
  // Spoken from the launch platform, before the pilot has flown a metre. Six
  // beats: who is speaking, why we are here, what the Ark cannot do, the
  // actual first objective of M01, the launch instruction and a send-off.
  // These ids have no recorded voice yet, so DialogueManager plays them as
  // text \u2014 see the report's pending items.
  {
    id: 'm01_prologue_commander_intro', speakerId: commander, missionId: 'mission-01-search-home', triggerId: 'prologue-intro',
    priority: 'important', requiresConfirmation: true,
    text: 'Piloto, soy la comandante Valeria Soren, al mando del Arca Epsilon. Bienvenido a la plataforma Epsilon-3.'
  },
  {
    id: 'm01_prologue_context', speakerId: commander, missionId: 'mission-01-search-home', triggerId: 'prologue-context',
    priority: 'important', requiresConfirmation: true,
    text: 'La Tierra qued\u00f3 atr\u00e1s. Despu\u00e9s de todo este viaje, E-01 es nuestra primera posibilidad real de empezar de nuevo.'
  },
  {
    id: 'm01_prologue_situation', speakerId: commander, missionId: 'mission-01-search-home', triggerId: 'prologue-situation',
    priority: 'important', requiresConfirmation: true,
    text: 'El Arca no puede acercarse m\u00e1s. Llevamos adentro a todos los que quedamos, as\u00ed que el sector lo revisa una nave chica. La tuya.'
  },
  {
    id: 'm01_prologue_first_task', speakerId: commander, missionId: 'mission-01-search-home', triggerId: 'prologue-first-task',
    priority: 'important', requiresConfirmation: true,
    text: 'Tu primera misi\u00f3n: desacoplarte, salir del per\u00edmetro del Arca y activar el esc\u00e1ner de largo alcance. Necesitamos saber qu\u00e9 hay ah\u00ed afuera antes de fijar rumbo.'
  },
  {
    id: 'm01_prologue_preflight', speakerId: commander, missionId: 'mission-01-search-home', triggerId: 'prologue-preflight',
    priority: 'normal', autoDismissSeconds: 7,
    text: 'Revis\u00e1 tus sistemas. Cuando est\u00e9s listo, liber\u00e1 los anclajes y alejate de la plataforma.'
  },
  {
    id: 'm01_prologue_clamps_released', speakerId: commander, missionId: 'mission-01-search-home', triggerId: 'prologue-clamps-released',
    priority: 'normal', autoDismissSeconds: 6,
    text: 'Anclajes liberados. Ten\u00e9s el corredor de salida despejado, piloto. Sin apuro.'
  },
  {
    id: 'm01_prologue_farewell', speakerId: commander, missionId: 'mission-01-search-home', triggerId: 'prologue-farewell',
    priority: 'normal', autoDismissSeconds: 6.5,
    text: 'Vamos a depender de lo que encuentres. Buena suerte, piloto.'
  }
];


export const dialogueById = new Map(dialogueDefinitions.map((definition) => [definition.id, definition]));
