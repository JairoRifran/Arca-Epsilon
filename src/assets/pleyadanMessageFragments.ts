export type PleyadanMessageFragment = {
  id: string;
  raw: string;
  translated: string;
};

export const pleyadanMessageFragments: readonly PleyadanMessageFragment[] = [
  { id: 'atlas-activation', raw: 'AT-LS // 7A-KOR // REC', translated: 'Recibimos la activacion del corredor Atlas.' },
  { id: 'humanity', raw: 'HU-MA // EPS-ILON // ACK', translated: 'Humanidad de la Arca Epsilon, no estan solos.' },
  { id: 'identity', raw: 'PLE-YA // CIV-ETH // OPEN', translated: 'Somos los Pleyadanos. No venimos a reclamar este mundo.' },
  { id: 'atlas-purpose', raw: 'AT-LS // WARN // NO-DOM', translated: 'El Atlas fue construido para advertir, no para conquistar.' },
  { id: 'visibility', raw: 'STAR-THR // OBS // ALL', translated: 'Cada civilizacion que alcanza las estrellas se vuelve visible.' },
  { id: 'silence-coalition', raw: 'SIL-COL // ERASE // SEED', translated: 'La Coalicion del Silencio impide que otros mundos despierten.' },
  { id: 'extermination', raw: 'WORLD // STERILE // PRE-FLIGHT', translated: 'Exterminan planetas antes de que sus habitantes abandonen su cuna.' },
  { id: 'e01-signal', raw: 'E-01 // REFUGE-SIGNAL // DUAL', translated: 'E-01 puede ser refugio, pero tambien puede convertirse en senal.' },
  { id: 'prepare', raw: 'BASE // ORBIT // NO-FEAR', translated: 'Preparen su base. Fortalezcan su orbita. No respondan con miedo.' },
  { id: 'return', raw: 'AT-LS // COMPLETE // RETURN', translated: 'Volveremos cuando la Red Atlas este completa.' }
];
