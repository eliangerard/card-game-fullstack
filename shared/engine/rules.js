// Reglas puras: compatibilidad, estado de ranuras, validación de jugadas y destinos legales.
// Todo funciona sobre un "tablero" con la forma { players: [{ id, body, out }] }, que cumplen
// tanto el GameState del servidor como el PlayerView del cliente.
import { ORGANS_TO_WIN } from './cards.js';
import { fail } from './errors.js';

// ---------- Compatibilidad y estados ----------

// Un virus o medicina de color X es compatible con un órgano de color Y si X == Y o alguno es multi
export const isCompatible = (x, y) => x === y || x === 'multi' || y === 'multi';

export function slotStatus(slot) {
  const v = slot.viruses?.length || 0;
  const m = slot.medicines?.length || 0;
  if (m >= 2) return 'immunized';
  if (m === 1) return 'vaccinated';
  if (v >= 1) return 'infected';
  return 'healthy';
}

export const slotColor = (slot) => slot.organ.color;

export const isImmunized = (slot) => slotStatus(slot) === 'immunized';

// ¿El cuerpo ya tiene un órgano de ese color? (ignorando la ranura exceptSlotId)
export const bodyHasColor = (body, color, exceptSlotId = null) =>
  body.some((s) => s.id !== exceptSlotId && s.organ.color === color);

// Colores distintos de órganos no infectados
export function healthyOrganCount(body) {
  const colors = new Set();
  for (const s of body) if (slotStatus(s) !== 'infected') colors.add(s.organ.color);
  return colors.size;
}

export const isWinningBody = (body) => healthyOrganCount(body) >= ORGANS_TO_WIN;

// Un cuerpo nunca puede tener dos órganos del mismo color
export function bodyHasDuplicateColors(body) {
  const seen = new Set();
  for (const s of body) {
    if (seen.has(s.organ.color)) return true;
    seen.add(s.organ.color);
  }
  return false;
}

// ---------- Acceso al tablero ----------

export const findPlayer = (board, playerId) => board.players.find((p) => p.id === playerId) || null;
export const activePlayers = (board) => board.players.filter((p) => !p.out);
export const findSlot = (player, slotId) => player?.body.find((s) => s.id === slotId) || null;

// La mano del jugador, venga de un GameState (players[].hand) o de un PlayerView (view.hand)
export function getHandOf(board, playerId) {
  const p = findPlayer(board, playerId);
  if (p && Array.isArray(p.hand)) return p.hand;
  if (board.you === playerId && Array.isArray(board.hand)) return board.hand;
  return [];
}

const activeOrFail = (board, playerId) => {
  const p = findPlayer(board, playerId);
  if (!p || p.out) fail('BAD_TARGET', 'Ese jugador no está en la partida');
  return p;
};

const slotOrFail = (player, slotId) => {
  const s = findSlot(player, slotId);
  if (!s) fail('BAD_TARGET', 'Ese órgano no existe');
  return s;
};

// ---------- Predicados por tipo de carta ----------

export const canPlaceOrgan = (body, card) => !bodyHasColor(body, card.color);

// Virus sobre una ranura: debe ser compatible con el órgano y la ranura no estar inmunizada
export const canVirusSlot = (card, slot) => !isImmunized(slot) && isCompatible(card.color, slot.organ.color);

// Medicina sobre una ranura propia
export function canMedicineSlot(card, slot) {
  const st = slotStatus(slot);
  if (st === 'immunized') return false;
  if (isCompatible(card.color, slot.organ.color)) return true;
  // Un órgano infectado también se cura con una medicina del color del virus. Un virus multi NO abre
  // la puerta a cualquier medicina: RULES.md aclara que a un órgano infectado por un virus multi
  // "lo cura cualquier medicina compatible con el órgano" (la medicina multi cura todo).
  if (st === 'infected') return slot.viruses.some((v) => v.color !== 'multi' && card.color === v.color);
  return false;
}

// Trasplante: ranura sa del jugador A por ranura sb del jugador B
export function canTransplant(pa, sa, pb, sb) {
  if (!pa || !pb || !sa || !sb) return false;
  if (pa.id === pb.id) return false;
  if (pa.out || pb.out) return false;
  if (isImmunized(sa) || isImmunized(sb)) return false;
  // Después del intercambio, ningún cuerpo puede repetir color
  if (bodyHasColor(pa.body, sb.organ.color, sa.id)) return false;
  if (bodyHasColor(pb.body, sa.organ.color, sb.id)) return false;
  return true;
}

export function canSteal(me, victim, slot) {
  if (!me || !victim || !slot) return false;
  if (me.id === victim.id || victim.out) return false;
  if (isImmunized(slot)) return false;
  return !bodyHasColor(me.body, slot.organ.color);
}

// ---------- Contagio ----------

// Todos los movimientos individuales posibles: un virus de una ranura propia infectada
// a una ranura sana (sin virus ni medicinas) compatible de otro jugador activo
export function getContagionMoves(board, playerId) {
  const me = findPlayer(board, playerId);
  if (!me) return [];
  const moves = [];
  for (const from of me.body) {
    if (slotStatus(from) !== 'infected') continue;
    const virus = from.viruses[0];
    for (const p of board.players) {
      if (p.id === playerId || p.out) continue;
      for (const to of p.body) {
        if (slotStatus(to) !== 'healthy') continue;
        if (!isCompatible(virus.color, to.organ.color)) continue;
        moves.push({ fromSlotId: from.id, toPlayerId: p.id, toSlotId: to.id });
      }
    }
  }
  return moves;
}

// Asignación automática: emparejamiento máximo (cada origen y cada destino como mucho una vez).
// preferPlayerIds (opcional) ordena los destinos para favorecer a ciertos jugadores.
export function autoContagionMoves(board, playerId, preferPlayerIds = null) {
  const all = getContagionMoves(board, playerId);
  const destKey = (m) => `${m.toPlayerId}|${m.toSlotId}`;
  const rank = (m) => {
    if (!preferPlayerIds) return 0;
    const i = preferPlayerIds.indexOf(m.toPlayerId);
    return i === -1 ? preferPlayerIds.length : i;
  };
  const sources = [...new Set(all.map((m) => m.fromSlotId))];
  const options = new Map(
    sources.map((src) => [src, all.filter((m) => m.fromSlotId === src).sort((a, b) => rank(a) - rank(b))]),
  );
  const destOwner = new Map(); // destino → movimiento asignado

  // Algoritmo de Kuhn (caminos de aumento)
  const tryAssign = (src, seen) => {
    for (const m of options.get(src)) {
      const k = destKey(m);
      if (seen.has(k)) continue;
      seen.add(k);
      const current = destOwner.get(k);
      if (!current || tryAssign(current.fromSlotId, seen)) {
        destOwner.set(k, m);
        return true;
      }
    }
    return false;
  };
  for (const src of sources) tryAssign(src, new Set());

  const chosen = [...destOwner.values()];
  // Orden estable: por posición de la ranura de origen en el cuerpo
  const me = findPlayer(board, playerId);
  const pos = (id) => me.body.findIndex((s) => s.id === id);
  return chosen.sort((a, b) => pos(a.fromSlotId) - pos(b.fromSlotId)).map((m) => ({ ...m }));
}

function validateContagionMoves(board, me, moves) {
  if (!Array.isArray(moves)) fail('BAD_TARGET', 'Los movimientos del contagio no son válidos');
  const usedFrom = new Set();
  const usedTo = new Set();
  for (const m of moves) {
    if (!m || typeof m !== 'object') fail('BAD_TARGET', 'Movimiento de contagio mal formado');
    const from = findSlot(me, m.fromSlotId);
    if (!from) fail('BAD_TARGET', 'Ese órgano de origen no es tuyo');
    if (slotStatus(from) !== 'infected') fail('ILLEGAL_MOVE', 'Sólo puedes contagiar desde órganos infectados');
    if (m.toPlayerId === me.id) fail('ILLEGAL_MOVE', 'El contagio va a órganos de otros jugadores');
    const toPlayer = activeOrFail(board, m.toPlayerId);
    const to = slotOrFail(toPlayer, m.toSlotId);
    if (slotStatus(to) !== 'healthy') fail('ILLEGAL_MOVE', 'Sólo se contagian órganos sanos');
    if (!isCompatible(from.viruses[0].color, to.organ.color)) fail('ILLEGAL_MOVE', 'Ese virus no es compatible con ese órgano');
    const toKey = `${m.toPlayerId}|${m.toSlotId}`;
    if (usedFrom.has(m.fromSlotId)) fail('ILLEGAL_MOVE', 'Cada virus sólo se puede mover una vez');
    if (usedTo.has(toKey)) fail('ILLEGAL_MOVE', 'Cada órgano recibe como mucho un virus');
    usedFrom.add(m.fromSlotId);
    usedTo.add(toKey);
  }
  return moves.map((m) => ({ fromSlotId: m.fromSlotId, toPlayerId: m.toPlayerId, toSlotId: m.toSlotId }));
}

// ---------- Validación de una jugada ----------

// Comprueba que `card` (de la mano de playerId) se puede jugar sobre `target`.
// Lanza GameError si no; si sí, devuelve el target normalizado (p. ej. el contagio con sus moves resueltos).
export function validatePlay(board, playerId, card, target) {
  const me = findPlayer(board, playerId);
  if (!me || me.out) fail('NOT_YOUR_TURN', 'No estás en la partida');
  const t = target && typeof target === 'object' ? target : {};

  if (card.kind === 'organ') {
    if (t.playerId !== undefined && t.playerId !== playerId) fail('BAD_TARGET', 'Los órganos sólo van en tu cuerpo');
    if (!canPlaceOrgan(me.body, card)) fail('ILLEGAL_MOVE', 'Ya tienes un órgano de ese color');
    return { playerId };
  }

  if (card.kind === 'virus') {
    const p = activeOrFail(board, t.playerId);
    const slot = slotOrFail(p, t.slotId);
    if (isImmunized(slot)) fail('ILLEGAL_MOVE', 'Ese órgano está inmunizado');
    if (!isCompatible(card.color, slot.organ.color)) fail('ILLEGAL_MOVE', 'Ese virus no es compatible con ese órgano');
    return { playerId: p.id, slotId: slot.id };
  }

  if (card.kind === 'medicine') {
    if (t.playerId !== undefined && t.playerId !== playerId) fail('BAD_TARGET', 'Las medicinas sólo van en tu cuerpo');
    const slot = slotOrFail(me, t.slotId);
    if (isImmunized(slot)) fail('ILLEGAL_MOVE', 'Ese órgano ya está inmunizado');
    if (!canMedicineSlot(card, slot)) fail('ILLEGAL_MOVE', 'Esa medicina no es compatible');
    return { playerId, slotId: slot.id };
  }

  if (card.kind !== 'treatment') fail('ILLEGAL_MOVE', 'Carta desconocida');

  switch (card.treatment) {
    case 'transplant': {
      if (!t.a || !t.b || typeof t.a !== 'object' || typeof t.b !== 'object') {
        fail('BAD_TARGET', 'El trasplante necesita dos órganos');
      }
      const pa = activeOrFail(board, t.a.playerId);
      const pb = activeOrFail(board, t.b.playerId);
      const sa = slotOrFail(pa, t.a.slotId);
      const sb = slotOrFail(pb, t.b.slotId);
      if (pa.id === pb.id) fail('ILLEGAL_MOVE', 'El trasplante es entre dos jugadores distintos');
      if (isImmunized(sa) || isImmunized(sb)) fail('ILLEGAL_MOVE', 'No se puede trasplantar un órgano inmunizado');
      if (!canTransplant(pa, sa, pb, sb)) fail('ILLEGAL_MOVE', 'Algún cuerpo quedaría con dos órganos del mismo color');
      return { a: { playerId: pa.id, slotId: sa.id }, b: { playerId: pb.id, slotId: sb.id } };
    }
    case 'thief': {
      if (t.playerId === playerId) fail('ILLEGAL_MOVE', 'No te puedes robar a ti mismo');
      const victim = activeOrFail(board, t.playerId);
      const slot = slotOrFail(victim, t.slotId);
      if (isImmunized(slot)) fail('ILLEGAL_MOVE', 'No se puede robar un órgano inmunizado');
      if (bodyHasColor(me.body, slot.organ.color)) fail('ILLEGAL_MOVE', 'Ya tienes un órgano de ese color');
      return { playerId: victim.id, slotId: slot.id };
    }
    case 'contagion': {
      const moves =
        t.moves === undefined || t.moves === null || (Array.isArray(t.moves) && t.moves.length === 0)
          ? autoContagionMoves(board, playerId)
          : validateContagionMoves(board, me, t.moves);
      return { moves };
    }
    case 'glove':
      return {};
    case 'medicalError': {
      if (t.playerId === playerId) fail('ILLEGAL_MOVE', 'Elige a otro jugador');
      const other = activeOrFail(board, t.playerId);
      return { playerId: other.id };
    }
    default:
      fail('ILLEGAL_MOVE', 'Tratamiento desconocido');
  }
  return null;
}

// ---------- Destinos legales (para resaltar en la UI y para los bots) ----------

// Devuelve los targets válidos para la carta cardId de la mano de playerId.
// Funciona con un GameState o con un PlayerView. No comprueba si es su turno.
export function getLegalTargets(board, playerId, cardId) {
  if (!board || !Array.isArray(board.players) || board.winner) return [];
  const me = findPlayer(board, playerId);
  if (!me || me.out) return [];
  const card = getHandOf(board, playerId).find((c) => c.id === cardId);
  if (!card) return [];
  return getTargetsForCard(board, playerId, card);
}

export function getTargetsForCard(board, playerId, card) {
  const me = findPlayer(board, playerId);
  if (!me || me.out) return [];
  const others = board.players.filter((p) => !p.out && p.id !== playerId);
  const out = [];

  if (card.kind === 'organ') {
    if (canPlaceOrgan(me.body, card)) out.push({ playerId });
    return out;
  }
  if (card.kind === 'virus') {
    for (const p of board.players) {
      if (p.out) continue;
      for (const s of p.body) if (canVirusSlot(card, s)) out.push({ playerId: p.id, slotId: s.id });
    }
    return out;
  }
  if (card.kind === 'medicine') {
    for (const s of me.body) if (canMedicineSlot(card, s)) out.push({ playerId, slotId: s.id });
    return out;
  }
  switch (card.treatment) {
    case 'transplant': {
      const act = board.players.filter((p) => !p.out);
      for (let i = 0; i < act.length; i++) {
        for (let j = i + 1; j < act.length; j++) {
          const pa = act[i];
          const pb = act[j];
          for (const sa of pa.body) {
            for (const sb of pb.body) {
              if (canTransplant(pa, sa, pb, sb)) {
                out.push({ a: { playerId: pa.id, slotId: sa.id }, b: { playerId: pb.id, slotId: sb.id } });
              }
            }
          }
        }
      }
      return out;
    }
    case 'thief':
      for (const p of others) for (const s of p.body) if (canSteal(me, p, s)) out.push({ playerId: p.id, slotId: s.id });
      return out;
    case 'contagion':
      // Siempre se puede jugar (aunque no mueva nada); se devuelve la asignación automática
      return [{ moves: autoContagionMoves(board, playerId) }];
    case 'glove':
      return [{}];
    case 'medicalError':
      return others.map((p) => ({ playerId: p.id }));
    default:
      return [];
  }
}

// ¿Hay algún destino legal para esa carta?
export const isPlayable = (board, playerId, card) => getTargetsForCard(board, playerId, card).length > 0;
