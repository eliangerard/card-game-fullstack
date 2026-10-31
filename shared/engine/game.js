// Ciclo de partida: crear, aplicar acciones, timeouts, abandonos y vista por jugador.
// Todas las funciones son puras: clonan el estado de entrada y devuelven uno nuevo.
import { createDeck, HAND_SIZE, MIN_PLAYERS, MAX_PLAYERS, MAX_DISCARD } from './cards.js';
import { GameError, fail } from './errors.js';
import { makeRng, normalizeSeed, shuffleInPlace } from './rng.js';
import { findPlayer, findSlot, getHandOf, isWinningBody, slotStatus, validatePlay } from './rules.js';

const clone = (x) => structuredClone(x);

// ---------- Creación ----------

export function createGame({ players, seed } = {}) {
  if (!Array.isArray(players) || players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new GameError('BAD_SETUP', `Se necesitan de ${MIN_PLAYERS} a ${MAX_PLAYERS} jugadores`);
  }
  const ids = new Set(players.map((p) => p?.id));
  if (ids.size !== players.length || ids.has(undefined) || ids.has(null)) {
    throw new GameError('BAD_SETUP', 'Los jugadores necesitan ids únicos');
  }
  const s = normalizeSeed(seed);
  const rng = makeRng(s);
  const deck = shuffleInPlace(createDeck(), rng);
  const state = {
    seed: s,
    rngState: 0,
    players: players.map((p) => ({
      id: p.id,
      name: String(p.name ?? p.id),
      hand: [],
      body: [],
      skipNext: false,
      out: false,
    })),
    deck,
    discard: [],
    turn: 0,
    turnNumber: 1,
    winner: null,
    log: [],
  };
  // Reparto en ronda, como en la mesa
  for (let r = 0; r < HAND_SIZE; r++) for (const p of state.players) p.hand.push(state.deck.pop());
  state.rngState = rng.state;
  return state;
}

// ---------- Utilidades internas (operan sobre un estado ya clonado) ----------

const turnPlayer = (st) => st.players[st.turn];

// Roba hasta tener HAND_SIZE cartas; rebaraja el descarte si el mazo se acaba
function drawUpTo(st, player, events, rng) {
  let count = 0;
  while (player.hand.length < HAND_SIZE) {
    if (st.deck.length === 0) {
      if (st.discard.length === 0) break;
      st.deck = shuffleInPlace(st.discard, rng);
      st.discard = [];
      events.push({ type: 'reshuffled', count: st.deck.length });
    }
    player.hand.push(st.deck.pop());
    count++;
  }
  if (count > 0) events.push({ type: 'drew', playerId: player.id, count });
}

// Pasa el turno al siguiente jugador activo. Los que tienen skipNext sólo roban y pasan.
function advanceTurn(st, events, rng) {
  const n = st.players.length;
  // Cota de seguridad: como mucho cada jugador se salta una vez por vuelta
  for (let guard = 0; guard < n * 2 + 2; guard++) {
    let next = st.turn;
    for (let i = 1; i <= n; i++) {
      const idx = (st.turn + i) % n;
      if (!st.players[idx].out) {
        next = idx;
        break;
      }
    }
    st.turn = next;
    st.turnNumber += 1;
    const p = st.players[next];
    events.push({ type: 'turn', playerId: p.id, turnNumber: st.turnNumber });
    if (!p.skipNext) return;
    p.skipNext = false;
    events.push({ type: 'turnSkipped', playerId: p.id });
    drawUpTo(st, p, events, rng);
  }
}

// Comprueba la victoria de todos. Prioridad: quien jugó, luego orden de asientos.
function checkWinner(st, actorId, events) {
  if (st.winner) return true;
  const winners = st.players.filter((p) => !p.out && isWinningBody(p.body));
  if (winners.length === 0) return false;
  const w = winners.find((p) => p.id === actorId) || winners[0];
  st.winner = { playerId: w.id, reason: 'organs' };
  events.push({ type: 'win', playerId: w.id, reason: 'organs' });
  return true;
}

function removeFromHand(player, cardId) {
  const i = player.hand.findIndex((c) => c.id === cardId);
  return i === -1 ? null : player.hand.splice(i, 1)[0];
}

const newSlot = (organ) => ({ id: organ.id, organ, viruses: [], medicines: [] });

// Aplica los efectos de una carta ya validada. Muta `st` (debe ser una copia).
// Se exporta para que el bot pueda simular jugadas sin robar ni pasar turno.
export function resolvePlay(st, playerId, card, target, events) {
  const me = findPlayer(st, playerId);
  events.push({ type: 'played', playerId, card, target });

  if (card.kind === 'organ') {
    me.body.push(newSlot(card));
    events.push({ type: 'organPlaced', playerId, slotId: card.id });
    return;
  }

  if (card.kind === 'virus') {
    const p = findPlayer(st, target.playerId);
    const slot = findSlot(p, target.slotId);
    const status = slotStatus(slot);
    if (status === 'healthy') {
      slot.viruses.push(card);
      events.push({ type: 'infected', playerId: p.id, slotId: slot.id });
    } else if (status === 'infected') {
      const cards = [slot.organ, ...slot.viruses, card];
      p.body = p.body.filter((s) => s.id !== slot.id);
      st.discard.push(...cards);
      events.push({ type: 'organDestroyed', playerId: p.id, slotId: slot.id, cards });
    } else if (status === 'vaccinated') {
      st.discard.push(...slot.medicines, card);
      slot.medicines = [];
      events.push({ type: 'vaccineRemoved', playerId: p.id, slotId: slot.id });
    }
    return;
  }

  if (card.kind === 'medicine') {
    const slot = findSlot(me, target.slotId);
    const status = slotStatus(slot);
    if (status === 'infected') {
      st.discard.push(...slot.viruses, card);
      slot.viruses = [];
      events.push({ type: 'cured', playerId, slotId: slot.id });
    } else if (status === 'healthy') {
      slot.medicines.push(card);
      events.push({ type: 'vaccinated', playerId, slotId: slot.id });
    } else if (status === 'vaccinated') {
      slot.medicines.push(card);
      events.push({ type: 'immunized', playerId, slotId: slot.id });
    }
    return;
  }

  switch (card.treatment) {
    case 'transplant': {
      const pa = findPlayer(st, target.a.playerId);
      const pb = findPlayer(st, target.b.playerId);
      const ia = pa.body.findIndex((s) => s.id === target.a.slotId);
      const ib = pb.body.findIndex((s) => s.id === target.b.slotId);
      const sa = pa.body[ia];
      const sb = pb.body[ib];
      pa.body[ia] = sb;
      pb.body[ib] = sa;
      events.push({ type: 'slotMoved', fromPlayerId: pa.id, toPlayerId: pb.id, slotId: sa.id });
      events.push({ type: 'slotMoved', fromPlayerId: pb.id, toPlayerId: pa.id, slotId: sb.id });
      break;
    }
    case 'thief': {
      const victim = findPlayer(st, target.playerId);
      const slot = findSlot(victim, target.slotId);
      victim.body = victim.body.filter((s) => s.id !== slot.id);
      me.body.push(slot);
      events.push({ type: 'slotMoved', fromPlayerId: victim.id, toPlayerId: playerId, slotId: slot.id });
      break;
    }
    case 'contagion': {
      for (const m of target.moves) {
        const from = findSlot(me, m.fromSlotId);
        const to = findSlot(findPlayer(st, m.toPlayerId), m.toSlotId);
        to.viruses.push(from.viruses.shift());
        events.push({
          type: 'virusMoved',
          fromPlayerId: playerId,
          fromSlotId: from.id,
          toPlayerId: m.toPlayerId,
          toSlotId: to.id,
        });
      }
      break;
    }
    case 'glove': {
      const victims = st.players.filter((p) => !p.out && p.id !== playerId);
      for (const p of victims) {
        st.discard.push(...p.hand);
        p.hand = [];
        p.skipNext = true;
      }
      events.push({ type: 'handsDiscarded', playerIds: victims.map((p) => p.id) });
      break;
    }
    case 'medicalError': {
      const other = findPlayer(st, target.playerId);
      [me.body, other.body] = [other.body, me.body];
      events.push({ type: 'bodiesSwapped', a: playerId, b: other.id });
      break;
    }
    default:
      break;
  }
  // La carta de tratamiento jugada termina en el descarte
  st.discard.push(card);
}

// Tras una acción del jugador en turno: victoria, robo y cambio de turno
function finishTurn(st, actorId, events, rng) {
  if (checkWinner(st, actorId, events)) return;
  const actor = findPlayer(st, actorId);
  if (!actor.out) drawUpTo(st, actor, events, rng);
  advanceTurn(st, events, rng);
}

function assertCanAct(state, playerId) {
  if (state.winner) fail('GAME_OVER', 'La partida ya terminó');
  const p = findPlayer(state, playerId);
  if (!p || p.out) fail('NOT_YOUR_TURN', 'No estás en la partida');
  if (turnPlayer(state).id !== playerId) fail('NOT_YOUR_TURN', 'No es tu turno');
}

// ---------- API pública ----------

export function applyAction(state, playerId, action) {
  assertCanAct(state, playerId);
  if (!action || typeof action !== 'object') fail('UNKNOWN_ACTION', 'Acción desconocida');

  const st = clone(state);
  const rng = makeRng(st.rngState);
  const me = findPlayer(st, playerId);
  const events = [];

  if (action.type === 'discard') {
    const ids = action.cardIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_DISCARD) {
      fail('BAD_DISCARD', `Descarta de 1 a ${MAX_DISCARD} cartas`);
    }
    if (new Set(ids).size !== ids.length) fail('BAD_DISCARD', 'Hay cartas repetidas en el descarte');
    for (const id of ids) {
      if (!me.hand.some((c) => c.id === id)) fail('CARD_NOT_IN_HAND', 'Esa carta no está en tu mano');
    }
    const cards = ids.map((id) => removeFromHand(me, id));
    st.discard.push(...cards);
    events.push({ type: 'discarded', playerId, count: cards.length, cards });
  } else if (action.type === 'play') {
    const card = me.hand.find((c) => c.id === action.cardId);
    if (!card) fail('CARD_NOT_IN_HAND', 'Esa carta no está en tu mano');
    // Se valida sobre el estado sin la carta en la mano (no afecta a ninguna regla)
    const target = validatePlay(st, playerId, card, action.target);
    removeFromHand(me, card.id);
    resolvePlay(st, playerId, card, target, events);
  } else if (action.type === 'pass') {
    // Extensión: sólo si no tienes cartas (mazo y descarte agotados), para no bloquear la partida
    if (me.hand.length > 0) fail('ILLEGAL_MOVE', 'Sólo puedes pasar si no tienes cartas');
  } else {
    fail('UNKNOWN_ACTION', 'Acción desconocida');
  }

  finishTurn(st, playerId, events, rng);
  st.rngState = rng.state;
  return { state: st, events: clone(events) };
}

// El jugador en turno no actuó a tiempo: descarta 1 carta al azar y pasa
export function advanceTimeout(state) {
  if (state.winner) fail('GAME_OVER', 'La partida ya terminó');
  const st = clone(state);
  const rng = makeRng(st.rngState);
  const p = turnPlayer(st);
  const events = [{ type: 'timeout', playerId: p.id }];
  if (p.hand.length > 0) {
    const card = p.hand.splice(rng.int(p.hand.length), 1)[0];
    st.discard.push(card);
    events.push({ type: 'discarded', playerId: p.id, count: 1, cards: [card] });
  }
  finishTurn(st, p.id, events, rng);
  st.rngState = rng.state;
  return { state: st, events: clone(events) };
}

// Abandono: sus cartas van al descarte y se le salta. Si queda uno, gana por forfeit.
export function removePlayer(state, playerId) {
  const target = findPlayer(state, playerId);
  if (!target || target.out) return { state, events: [] };
  const st = clone(state);
  const rng = makeRng(st.rngState);
  const p = findPlayer(st, playerId);
  const events = [];
  const wasTurn = turnPlayer(st).id === playerId;

  st.discard.push(...p.hand);
  for (const s of p.body) st.discard.push(s.organ, ...s.viruses, ...s.medicines);
  p.hand = [];
  p.body = [];
  p.skipNext = false;
  p.out = true;
  events.push({ type: 'playerLeft', playerId });

  if (!st.winner) {
    const active = st.players.filter((x) => !x.out);
    if (active.length === 1) {
      st.winner = { playerId: active[0].id, reason: 'forfeit' };
      events.push({ type: 'win', playerId: active[0].id, reason: 'forfeit' });
    } else if (active.length > 1 && wasTurn) {
      advanceTurn(st, events, rng);
    }
  }
  st.rngState = rng.state;
  return { state: st, events: clone(events) };
}

// Vista personalizada: sin manos ajenas ni mazo
export function getPlayerView(state, viewerId) {
  const current = turnPlayer(state);
  return {
    you: viewerId,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      handCount: p.hand.length,
      body: clone(p.body),
      skipNext: p.skipNext,
      out: p.out,
      isTurn: !state.winner && p.id === current.id,
    })),
    hand: clone(getHandOf(state, viewerId)),
    deckCount: state.deck.length,
    discardTop: state.discard.length ? clone(state.discard[state.discard.length - 1]) : null,
    discardCount: state.discard.length,
    turnPlayerId: current.id,
    turnNumber: state.turnNumber,
    winner: state.winner ? { ...state.winner } : null,
  };
}

// Conteo total de cartas (manos + cuerpos + mazo + descarte); útil para tests e invariantes
export function countAllCards(state) {
  let n = state.deck.length + state.discard.length;
  for (const p of state.players) {
    n += p.hand.length;
    for (const s of p.body) n += 1 + s.viruses.length + s.medicines.length;
  }
  return n;
}
