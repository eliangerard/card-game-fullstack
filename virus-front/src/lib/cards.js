// Mapa carta → arte. Usa import.meta.glob para no importar 42 archivos a mano
const big = import.meta.glob('../assets/Cards/*_big.png', { eager: true, import: 'default' });
const sm = import.meta.glob('../assets/Cards/*_sm.png', { eager: true, import: 'default' });

const COLOR_ART = { red: 'Red', green: 'Green', blue: 'Blue', yellow: 'Yellow' };
const KIND_ART = { organ: 'organ', virus: 'rona', medicine: 'heal' };
const MULTI_ART = { organ: 'superOrgan', virus: 'superRona', medicine: 'superHeal' };
const TREATMENT_ART = {
  transplant: 'starChangeOne',
  thief: 'starSteal',
  contagion: 'starSneeze',
  glove: 'starDrop',
  medicalError: 'starChangeAll',
};

const artName = (card) => {
  if (!card) return 'back';
  if (card.kind === 'treatment') return TREATMENT_ART[card.treatment];
  if (card.color === 'multi') return MULTI_ART[card.kind];
  return KIND_ART[card.kind] + COLOR_ART[card.color];
};

// card null/undefined → reverso
export const cardImage = (card, size = 'big') => {
  const set = size === 'sm' ? sm : big;
  return set[`../assets/Cards/${artName(card)}_${size}.png`];
};

export const BACK_IMAGE = cardImage(null);

export const COLOR_NAMES = { red: 'corazón', green: 'estómago', blue: 'cerebro', yellow: 'hueso', multi: 'comodín' };
export const COLOR_HEX = { red: '#ff4d4d', green: '#20c040', blue: '#1e90ff', yellow: '#ffcc00', multi: '#c070ff' };
const TREATMENT_NAMES = {
  transplant: 'Trasplante',
  thief: 'Ladrón de órganos',
  contagion: 'Contagio',
  glove: 'Guante de látex',
  medicalError: 'Error médico',
};
export const TREATMENT_HELP = {
  transplant: 'Intercambia un órgano entre dos jugadores',
  thief: 'Roba un órgano de otro jugador',
  contagion: 'Pasa tus virus a órganos sanos de los demás',
  glove: 'Todos los demás tiran su mano y pierden un turno',
  medicalError: 'Intercambia tu cuerpo completo con otro jugador',
};

export const cardLabel = (card) => {
  if (!card) return '';
  if (card.kind === 'treatment') return TREATMENT_NAMES[card.treatment];
  if (card.kind === 'organ') return card.color === 'multi' ? 'Órgano comodín' : `Órgano: ${COLOR_NAMES[card.color]}`;
  if (card.kind === 'virus') return card.color === 'multi' ? 'Roña comodín' : `Roña de ${COLOR_NAMES[card.color]}`;
  return card.color === 'multi' ? 'Medicina comodín' : `Medicina de ${COLOR_NAMES[card.color]}`;
};
