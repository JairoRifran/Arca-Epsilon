export type Mission05StepId =
  | 'inactive'
  | 'boardShip'
  | 'gainScanAltitude'
  | 'orbitalScan'
  | 'approachProbe'
  | 'atlasRecalibration'
  | 'trackEcho'
  | 'counterSignal'
  | 'returnToBase'
  | 'completed';

export type SilentProbeState = 'hidden' | 'detected' | 'tracking' | 'jammed' | 'retreating' | 'escaped';

export type Mission05Target = 'ship' | 'scanAltitude' | 'probe' | 'atlasFrequency' | 'echo' | 'base' | 'none';

export type Mission05StepDefinition = {
  id: Mission05StepId;
  title: string;
  stepTitle: string;
  objective: string;
  nextAction: string;
  hint: string;
  target: Mission05Target;
};

export const silentProbePosition = [510, 145, -520] as const;

export const mission05EchoPositions = [
  [170, 82, -250],
  [315, 108, -365],
  [440, 132, -455]
] as const;

export const mission05Tuning = {
  minimumScanAltitude: 72,
  probeApproachRange: 105,
  echoScanRange: 52,
  counterSignalRange: 125,
  counterSignalSeconds: 4.5,
  baseInteractionRange: 52
} as const;

export const mission05Steps: Record<Mission05StepId, Mission05StepDefinition> = {
  inactive: {
    id: 'inactive',
    title: 'Mision 05: Sombra en la Orbita',
    stepTitle: 'En espera',
    objective: 'La red defensiva debe confirmar una amenaza movil antes de iniciar la investigacion.',
    nextAction: 'Completa la Mision 04.',
    hint: 'La firma anomala permanece archivada como una lectura distante.',
    target: 'none'
  },
  boardShip: {
    id: 'boardShip',
    title: 'Mision 05: Sombra en la Orbita',
    stepTitle: 'Firma en movimiento',
    objective: 'La red defensiva detecta que la firma anomala esta cambiando de orbita.',
    nextAction: 'Entra en la nave con F para investigar.',
    hint: 'No hay ataque confirmado. Comando Arca solicita observacion orbital.',
    target: 'ship'
  },
  gainScanAltitude: {
    id: 'gainScanAltitude',
    title: 'Mision 05: Sombra en la Orbita',
    stepTitle: 'Altura de escaneo',
    objective: 'Gana altura para separar la firma del ruido atmosferico de E-01.',
    nextAction: 'Asciende a altura de escaneo con Space.',
    hint: 'El empuje vertical conserva la altitud real de la nave.',
    target: 'scanAltitude'
  },
  orbitalScan: {
    id: 'orbitalScan',
    title: 'Mision 05: Sombra en la Orbita',
    stepTitle: 'Barrido orbital',
    objective: 'Usa los sensores de la nave para aislar la firma movil.',
    nextAction: 'Realiza un barrido orbital con E.',
    hint: 'La red defensiva y el Atlas combinaran sus lecturas.',
    target: 'probe'
  },
  approachProbe: {
    id: 'approachProbe',
    title: 'Mision 05: Sombra en la Orbita',
    stepTitle: 'Sonda Silenciosa',
    objective: 'Una sonda desconocida esta observando E-01 y probando la red defensiva.',
    nextAction: 'Acercate a la Sonda Silenciosa.',
    hint: 'No dispares. Comando Arca necesita identificar su protocolo de marca.',
    target: 'probe'
  },
  atlasRecalibration: {
    id: 'atlasRecalibration',
    title: 'Mision 05: Sombra en la Orbita',
    stepTitle: 'Interferencia silenciosa',
    objective: 'La sonda desaparecio de los sensores normales y esta degradando la guia.',
    nextAction: 'Recalibra sensores con frecuencia Atlas usando E.',
    hint: 'La frecuencia Pleyadana puede atravesar el patron de interferencia.',
    target: 'atlasFrequency'
  },
  trackEcho: {
    id: 'trackEcho',
    title: 'Mision 05: Sombra en la Orbita',
    stepTitle: 'Ecos de interferencia',
    objective: 'Sigue los tres ecos para reconstruir la posicion real de la sonda.',
    nextAction: 'Sigue el eco activo y analizalo con E.',
    hint: 'El mapa muestra ecos probables; la guia puede fluctuar ligeramente.',
    target: 'echo'
  },
  counterSignal: {
    id: 'counterSignal',
    title: 'Mision 05: Sombra en la Orbita',
    stepTitle: 'Contraseñal defensiva',
    objective: 'Interrumpe el protocolo de marca antes de que la sonda confirme E-01.',
    nextAction: 'Acercate y emite la contraseñal con E.',
    hint: 'No es un arma: el pulso invalida la telemetria robada por la sonda.',
    target: 'probe'
  },
  returnToBase: {
    id: 'returnToBase',
    title: 'Mision 05: Sombra en la Orbita',
    stepTitle: 'Contacto hostil indirecto',
    objective: 'La sonda perdio enlace y se retira. Lleva la telemetria a Base Nereida.',
    nextAction: 'Regresa a Base Nereida y confirma el informe con E.',
    hint: 'E-01 no fue marcado de forma valida. No se detectan otras naves.',
    target: 'base'
  },
  completed: {
    id: 'completed',
    title: 'Mision 05: Sombra en la Orbita',
    stepTitle: 'Primera crisis contenida',
    objective: 'Primer contacto hostil indirecto confirmado. E-01 conserva su ocultamiento parcial.',
    nextAction: 'Informe archivado. No hay invasion ni combate en curso.',
    hint: 'La respuesta defensiva funciono sin revelar capacidad militar humana.',
    target: 'none'
  }
};
