// Bots: 'easy' juega algo legal al azar (o descarta); 'normal' usa una heurística simulando cada jugada.
import { MAX_DISCARD } from './cards.js';
import { makeRng, hashString } from './rng.js';
import { resolvePlay } from './game.js';
import {
  findPlayer,
  getHandOf,
  getTargetsForCard,
  healthyOrganCount,
  isWinningBody,
  slotStatus,
  autoContagionMoves,
} from './rules.js';

const SLOT_VALUE = { healthy: 10, vaccinated: 13, immunized: 17, infected: 3 };
const WIN = 10000;
const PLAY_THRESHOLD = 0.5;

// Valor de un cuerpo: suma de ranuras + bonus por cercanía a la victoria
function bodyScore(body) {
  let s = 0;
  for (const slot of body) s += SLOT_VALUE[slotStatus(slot)];
  const h = healthyOrganCount(body);
  return s + h * h * 2;
}

// Valoración del tablero desde el punto de vista de meId
function evaluate(board, meId) {
  const me = findPlayer(board, meId);
  const others = board.players.filter((p) => !p.out && p.id !== meId);
  if (isWinningBody(me.body)) return WIN;
  if (others.some((p) => isWinningBody(p.body))) return -WIN;
  const mine = bodyScore(me.body);
  if (!others.length) return mine;
  const scores = others.map((p) => bodyScore(p.body));
  const max = Math.max(...scores);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return mine - 0.75 * max - 0.25 * avg;
}

// Tablero mínimo para simular (sólo cuerpos), sin tocar el original
function simBoard(board) {
  return {
    players: board.players.map((p) => ({
      id: p.id,
      out: p.out,
      body: structuredClone(p.body),
      hand: [],
      skipNext: !!p.skipNext,
    })),
    discard: [],
  };
}

function simulate(board, meId, card, target) {
  const sim = simBoard(board);
  resolvePlay(sim, meId, card, target, []);
  return evaluate(sim, meId);
}

// Todas las jugadas legales [{ card, target }]
function allPlays(board, meId, hand) {
  const plays = [];
  for (const card of hand) for (const target of getTargetsForCard(board, meId, card)) plays.push({ card, target });
  return plays;
}

const pick = (arr, rng) => arr[rng.int(arr.length)];

function botRng(state, playerId, opts) {
  const seed =
    opts.seed !== undefined
      ? Number(opts.seed) >>> 0
      : ((state.rngState ?? state.turnNumber ?? 0) ^ hashString(String(playerId)) ^ Math.imul(state.turnNumber || 1, 2654435761)) >>> 0;
  return makeRng(seed);
}

function chooseEasy(board, meId, hand, rng) {
  const plays = allPlays(board, meId, hand);
  if (plays.length && rng.next() < 0.75) {
    const { card, target } = pick(plays, rng);
    return { type: 'play', cardId: card.id, target };
  }
  const shuffled = [...hand];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const n = 1 + rng.int(Math.min(MAX_DISCARD, hand.length));
  return { type: 'discard', cardIds: shuffled.slice(0, n).map((c) => c.id) };
}

// Ganancia estimada del guante (no cambia cuerpos): más útil cuanto más cerca esté un rival
function gloveGain(board, meId) {
  const others = board.players.filter((p) => !p.out && p.id !== meId);
  const maxHealthy = Math.max(0, ...others.map((p) => healthyOrganCount(p.body)));
  return 1.5 * others.length + (maxHealthy >= 3 ? 8 : maxHealthy >= 2 ? 2 : 0);
}

function chooseNormal(board, meId, hand, rng) {
  const base = evaluate(board, meId);
  const others = board.players.filter((p) => !p.out && p.id !== meId);
  // Para el contagio, mandar los virus primero al líder
  const leaders = [...others].sort((a, b) => bodyScore(b.body) - bodyScore(a.body)).map((p) => p.id);

  const bestByCard = new Map(); // cardId → mejor delta
  let best = null;
  for (const card of hand) {
    let cardBest = -Infinity;
    let targets = getTargetsForCard(board, meId, card);
    if (card.kind === 'treatment' && card.treatment === 'contagion') {
      targets = [{ moves: autoContagionMoves(board, meId, leaders) }];
    }
    for (const target of targets) {
      let delta;
      if (card.kind === 'treatment' && card.treatment === 'glove') delta = gloveGain(board, meId);
      else delta = simulate(board, meId, card, target) - base;
      // Pequeño ruido para desempatar
      delta += rng.next() * 0.01;
      if (delta > cardBest) cardBest = delta;
      if (!best || delta > best.delta) best = { card, target, delta };
    }
    bestByCard.set(card.id, cardBest);
  }

  if (best && best.delta > PLAY_THRESHOLD) {
    return { type: 'play', cardId: best.card.id, target: best.target };
  }

  // Descartar: primero las cartas sin ningún uso; si todas tienen alguno, sólo la peor
  const useless = hand.filter((c) => bestByCard.get(c.id) === -Infinity);
  if (useless.length) return { type: 'discard', cardIds: useless.slice(0, MAX_DISCARD).map((c) => c.id) };
  const worst = [...hand].sort((a, b) => bestByCard.get(a.id) - bestByCard.get(b.id))[0];
  return { type: 'discard', cardIds: [worst.id] };
}

// Devuelve una acción legal para playerId (con un GameState o un PlayerView propio).
// No comprueba que sea su turno; devuelve null si el jugador no está o la partida terminó.
export function chooseBotAction(state, playerId, opts = {}) {
  const level = opts.level === 'easy' ? 'easy' : 'normal';
  const me = findPlayer(state, playerId);
  if (!me || me.out || state.winner) return null;
  const hand = getHandOf(state, playerId);
  if (!hand.length) return { type: 'pass' };
  const rng = botRng(state, playerId, opts);
  return level === 'easy' ? chooseEasy(state, playerId, hand, rng) : chooseNormal(state, playerId, hand, rng);
}
