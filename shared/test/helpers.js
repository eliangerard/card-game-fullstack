// Utilidades de test: arman estados a medida sacando cartas reales del mazo,
// así el total sigue siendo 68 y los ids son los de verdad.
import { createDeck, countAllCards } from '../engine/index.js';

// 'organ:red' | 'virus:multi' | 'medicine:blue' | 'transplant' | 'thief' | ...
function matches(card, spec) {
  const [kind, color] = spec.split(':');
  if (color) return card.kind === kind && card.color === color;
  return card.kind === 'treatment' && card.treatment === kind;
}

export function makePool() {
  const pool = createDeck();
  const take = (spec) => {
    const i = pool.findIndex((c) => matches(c, spec));
    if (i === -1) throw new Error(`No quedan cartas "${spec}" en el mazo de prueba`);
    return pool.splice(i, 1)[0];
  };
  return { pool, take };
}

// Ranura: 'red' (sana) o { o: 'red', v: ['multi'], m: ['red', 'multi'] }
function makeSlot(spec, take) {
  const s = typeof spec === 'string' ? { o: spec } : spec;
  const organ = take(`organ:${s.o}`);
  return {
    id: organ.id,
    organ,
    viruses: (s.v || []).map((c) => take(`virus:${c}`)),
    medicines: (s.m || []).map((c) => take(`medicine:${c}`)),
  };
}

// Estado arreglado a mano. hands/bodies indexados por id de jugador.
// El resto de las cartas queda en el mazo (o en el descarte si se pide).
export function arrange({
  players = ['a', 'b'],
  hands = {},
  bodies = {},
  turn = 0,
  discard = [],
  deckSize = null, // si se da, el sobrante va al descarte
  skipNext = {},
  out = {},
  seed = 42,
} = {}) {
  const { pool, take } = makePool();
  const st = {
    seed,
    rngState: seed >>> 0,
    players: players.map((id) => ({
      id,
      name: id.toUpperCase(),
      hand: [],
      body: [],
      skipNext: !!skipNext[id],
      out: !!out[id],
    })),
    deck: [],
    discard: [],
    turn,
    turnNumber: 1,
    winner: null,
    log: [],
  };
  for (const p of st.players) {
    p.body = (bodies[p.id] || []).map((s) => makeSlot(s, take));
    p.hand = (hands[p.id] || []).map((spec) => take(spec));
  }
  st.discard = discard.map((spec) => take(spec));
  st.deck = pool;
  if (deckSize !== null) {
    st.discard.push(...st.deck.splice(0, st.deck.length - deckSize));
  }
  if (countAllCards(st) !== 68) throw new Error('El helper perdió cartas');
  return st;
}

export const P = (st, id) => st.players.find((p) => p.id === id);
export const handCard = (st, playerId, i = 0) => P(st, playerId).hand[i];
export const slotOf = (st, playerId, color) => P(st, playerId).body.find((s) => s.organ.color === color);
export const types = (events) => events.map((e) => e.type);

// Compara listas de targets sin importar el orden
export const sortTargets = (ts) => ts.map((t) => JSON.stringify(t)).sort();
