// Reproductor de eventos: saca los lotes { seq, events } de useStore.eventQueue en orden,
// reproduce los efectos (partículas, sonidos, narrador) y aplica el estado a la mesa.
//
// Secuencia por lote:
//   1. Foto de la posición de todas las cartas y anclas (estado viejo).
//   2. Pre-efectos sobre lo que va a desaparecer (explosión de un órgano destruido, manos al descarte).
//   3. Registro de "orígenes": las cartas que van a aparecer llegan volando desde un avatar o el mazo.
//   4. Se aplica el estado nuevo → framer-motion hace volar las cartas por su layoutId.
//   5. Las cartas que desaparecieron vuelan al descarte; efectos y narración, espaciados.

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { sfx } from '../../lib/sfx';
import { COLOR_HEX, cardLabel } from '../../lib/cards';
import {
  anchorRect, avatarAnchor, centerOf, emitFx, handAnchor, setOrigin, shake, shakeScreen, anchorEl, slotAnchor, wait, reducedMotion,
} from './fx';
import { narrate, showBanner } from './Overlays';

const ORGAN_NAME = { red: 'corazón', green: 'estómago', blue: 'cerebro', yellow: 'hueso', multi: 'órgano comodín' };
const ORGAN_ART = { red: 'un corazón', green: 'un estómago', blue: 'un cerebro', yellow: 'un hueso', multi: 'el órgano comodín' };

// ---------- Narración ----------

const findSlot = (views, slotId) => {
  for (const v of views) {
    for (const p of v?.players || []) {
      const s = p.body?.find((b) => b.id === slotId);
      if (s) return s;
    }
  }
  return null;
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Convierte un lote de eventos en frases ("Vane le robó el corazón a Elian")
export const describeBatch = (events, { me, prev, next }) => {
  const views = [prev, next];
  const nameOf = (pid) => next?.players?.find((p) => p.id === pid)?.name || prev?.players?.find((p) => p.id === pid)?.name || 'Alguien';
  const colorOfSlot = (slotId, cards) => {
    const organ = cards?.find((c) => c.kind === 'organ') || findSlot(views, slotId)?.organ;
    return organ?.color;
  };
  const organ = (slotId, cards) => ORGAN_NAME[colorOfSlot(slotId, cards)] || 'órgano';
  const theOrgan = (slotId, pid, cards) => (pid === me ? `tu ${organ(slotId, cards)}` : `el ${organ(slotId, cards)} de ${nameOf(pid)}`);

  const lines = [];
  let actor = null;
  let played = null;
  let narratedPlay = false;
  const moved = [];
  const contagion = { from: null, to: [] };

  const push = (text, opts = {}) => lines.push({ text, ...opts });

  for (const e of events) {
    switch (e.type) {
      case 'played':
        actor = e.playerId;
        played = e.card;
        narratedPlay = false;
        break;
      case 'organPlaced':
        push(e.playerId === me ? `Te pusiste ${ORGAN_ART[colorOfSlot(e.slotId)] || 'un órgano'}` : `${nameOf(e.playerId)} se puso ${ORGAN_ART[colorOfSlot(e.slotId)] || 'un órgano'}`, { pid: e.playerId });
        narratedPlay = true;
        break;
      case 'infected': {
        const a = actor ?? e.playerId;
        const o = organ(e.slotId);
        let t;
        if (a === e.playerId) t = a === me ? `Te infectaste tu propio ${o}` : `${nameOf(a)} se infectó su propio ${o}`;
        else if (a === me) t = `Le pegaste roña al ${o} de ${nameOf(e.playerId)}`;
        else if (e.playerId === me) t = `${nameOf(a)} te pegó roña en el ${o}`;
        else t = `${nameOf(a)} le pegó roña al ${o} de ${nameOf(e.playerId)}`;
        push(t, { pid: a, tone: e.playerId === me ? 'bad' : 'info' });
        narratedPlay = true;
        break;
      }
      case 'organDestroyed': {
        const a = actor ?? e.playerId;
        const o = organ(e.slotId, e.cards);
        let t;
        if (a === me && e.playerId !== me) t = `¡Destruiste el ${o} de ${nameOf(e.playerId)}!`;
        else if (e.playerId === me && a !== me) t = `¡${nameOf(a)} te destruyó el ${o}!`;
        else if (a === e.playerId) t = a === me ? `Destruiste tu propio ${o}` : `${nameOf(a)} destruyó su propio ${o}`;
        else t = `¡${nameOf(a)} destruyó el ${o} de ${nameOf(e.playerId)}!`;
        push(t, { pid: a, tone: e.playerId === me ? 'bad' : 'hot' });
        narratedPlay = true;
        break;
      }
      case 'cured':
        push(e.playerId === me ? `Te curaste el ${organ(e.slotId)}` : `${nameOf(e.playerId)} se curó el ${organ(e.slotId)}`, { pid: e.playerId, tone: 'good' });
        narratedPlay = true;
        break;
      case 'vaccinated':
        push(e.playerId === me ? `Vacunaste tu ${organ(e.slotId)}` : `${nameOf(e.playerId)} vacunó su ${organ(e.slotId)}`, { pid: e.playerId, tone: 'good' });
        narratedPlay = true;
        break;
      case 'immunized':
        push(e.playerId === me ? `¡Inmunizaste tu ${organ(e.slotId)}!` : `¡${nameOf(e.playerId)} inmunizó su ${organ(e.slotId)}!`, { pid: e.playerId, tone: 'gold' });
        narratedPlay = true;
        break;
      case 'vaccineRemoved': {
        const a = actor ?? e.playerId;
        const t = a === me
          ? `Le quitaste la vacuna del ${organ(e.slotId)} a ${nameOf(e.playerId)}`
          : e.playerId === me
            ? `${nameOf(a)} te quitó la vacuna del ${organ(e.slotId)}`
            : `${nameOf(a)} le quitó la vacuna del ${organ(e.slotId)} a ${nameOf(e.playerId)}`;
        push(t, { pid: a });
        narratedPlay = true;
        break;
      }
      case 'slotMoved':
        moved.push(e);
        if (played?.treatment === 'thief') {
          const a = actor ?? e.toPlayerId;
          const t = a === me
            ? `Le robaste el ${organ(e.slotId)} a ${nameOf(e.fromPlayerId)}`
            : e.fromPlayerId === me
              ? `¡${nameOf(a)} te robó el ${organ(e.slotId)}!`
              : `${nameOf(a)} le robó el ${organ(e.slotId)} a ${nameOf(e.fromPlayerId)}`;
          push(t, { pid: a, tone: e.fromPlayerId === me ? 'bad' : 'hot' });
          narratedPlay = true;
        } else if (moved.length === 2) {
          const [x, y] = moved;
          push(`Trasplante: ${theOrgan(x.slotId, x.fromPlayerId)} por ${theOrgan(y.slotId, y.fromPlayerId)}`, { pid: actor });
          narratedPlay = true;
        }
        break;
      case 'virusMoved':
        contagion.from = e.fromPlayerId;
        contagion.to.push(e.toPlayerId);
        break;
      case 'handsDiscarded':
        push(actor === me ? '¡Usaste el guante! Todos tiran su mano y pierden un turno' : `¡${nameOf(actor)} usó el guante! Todos tiran su mano`, { pid: actor, tone: 'hot' });
        narratedPlay = true;
        break;
      case 'bodiesSwapped': {
        const other = e.a === me ? e.b : e.b === me ? e.a : null;
        push(other ? `¡Error médico! Cambiaste de cuerpo con ${nameOf(other)}` : `¡Error médico! ${nameOf(e.a)} y ${nameOf(e.b)} cambiaron de cuerpo`, { pid: actor, tone: 'hot' });
        narratedPlay = true;
        break;
      }
      case 'discarded':
        push(e.playerId === me ? `Descartaste ${plural(e.count, 'carta', 'cartas')}` : `${nameOf(e.playerId)} descartó ${plural(e.count, 'carta', 'cartas')}`, { pid: e.playerId, tone: 'muted' });
        break;
      case 'reshuffled':
        push(`Se barajó el descarte: el mazo vuelve a tener ${e.count}`, { tone: 'muted' });
        break;
      case 'turnSkipped':
        push(e.playerId === me ? 'Pierdes este turno (te tocó el guante)' : `${nameOf(e.playerId)} pierde su turno`, { pid: e.playerId, tone: 'muted' });
        break;
      case 'timeout':
        push(e.playerId === me ? 'Se te acabó el tiempo: se descartó una carta' : `${nameOf(e.playerId)} se tardó demasiado`, { pid: e.playerId, tone: 'muted' });
        break;
      case 'playerLeft':
        push(`${nameOf(e.playerId)} abandonó la partida`, { pid: e.playerId, tone: 'bad' });
        break;
      case 'win':
        push(e.playerId === me ? '¡Ganaste la partida!' : `¡${nameOf(e.playerId)} ganó la partida!`, { pid: e.playerId, tone: 'gold' });
        break;
      default:
        break;
    }
  }

  if (contagion.to.length) {
    const others = [...new Set(contagion.to)].filter((p) => p !== me).map(nameOf);
    const hitMe = contagion.to.includes(me);
    const from = contagion.from;
    let t;
    if (from === me) t = `Contagiaste a ${others.join(' y ')}`;
    else if (hitMe) t = `¡${nameOf(from)} te contagió${others.length ? ` (y a ${others.join(' y ')})` : ''}!`;
    else t = `${nameOf(from)} contagió a ${others.join(' y ')}`;
    lines.unshift({ text: t, pid: from, tone: hitMe ? 'bad' : 'hot' });
    narratedPlay = true;
  }
  // Una carta jugada sin consecuencias visibles (p. ej. un contagio que no movió nada)
  if (played && !narratedPlay) {
    lines.unshift({ text: actor === me ? `Jugaste ${cardLabel(played)}` : `${nameOf(actor)} jugó ${cardLabel(played)}`, pid: actor });
  }
  return lines;
};

// ---------- Utilidades de posición ----------

const cardRects = () => {
  const map = new Map();
  document.querySelectorAll('[data-card-id]').forEach((el) => map.set(el.dataset.cardId, el.getBoundingClientRect()));
  return map;
};

const visibleCards = (view) => {
  const map = new Map();
  if (!view) return map;
  (view.hand || []).forEach((c) => map.set(c.id, c));
  (view.players || []).forEach((p) => p.body?.forEach((s) => {
    map.set(s.organ.id, s.organ);
    s.viruses?.forEach((c) => map.set(c.id, c));
    s.medicines?.forEach((c) => map.set(c.id, c));
  }));
  if (view.discardTop) map.set(view.discardTop.id, view.discardTop);
  return map;
};

const slotCenter = (playerId, slotId) => centerOf(anchorRect(slotAnchor(playerId, slotId)));

const pidColor = (room, pid) => room?.players?.find((p) => p.id === pid)?.color;

// ---------- Estado de cada lote ----------

// El servidor manda game:events y justo después el game:state que le corresponde. useStore sólo guarda
// el último estado, así que aquí se empareja cada estado con el lote que lo trajo: si se acumulan
// varios lotes, cada uno se anima con SU estado y no con el más nuevo.
const batchStates = new WeakMap();
useStore.subscribe((s, prevS) => {
  if (!s.game || s.game === prevS.game) return;
  const last = s.eventQueue[s.eventQueue.length - 1];
  if (last && !batchStates.has(last)) batchStates.set(last, s.game);
});

// ---------- Hook principal ----------

// Devuelve el PlayerView que se está mostrando (va detrás del de useStore mientras se animan los eventos)
export const useEventPlayer = ({ me }) => {
  const storeGame = useStore((s) => s.game);
  const queue = useStore((s) => s.eventQueue);
  const [view, setView] = useState(storeGame);
  const viewRef = useRef(view);
  viewRef.current = view;
  const busy = useRef(false);
  const alive = useRef(true);
  const meRef = useRef(me);
  meRef.current = me;

  useEffect(() => () => { alive.current = false; }, []);

  // Sin eventos pendientes, el estado se aplica directo
  useEffect(() => {
    if (!busy.current && queue.length === 0 && storeGame !== viewRef.current) setView(storeGame);
  }, [storeGame, queue.length]);

  useEffect(() => {
    if (busy.current || queue.length === 0) return;
    busy.current = true;
    const batch = queue[0];
    playBatch(batch, { me: meRef.current, viewRef, setView, alive })
      .catch((err) => console.error('[mesa] error al animar eventos', err))
      .finally(() => {
        busy.current = false;
        if (!alive.current) return;
        useStore.getState().shiftEvents();
        // Si ya no quedan lotes, aplicar el último estado
        if (useStore.getState().eventQueue.length === 0) setView(useStore.getState().game);
      });
  }, [queue]);

  return view;
};

const playBatch = async (batch, { me, viewRef, setView, alive }) => {
  const events = batch?.events || [];
  const prev = viewRef.current;
  const room = useStore.getState().room;
  const fast = reducedMotion();

  // 1. Fotos del estado viejo
  const oldRects = cardRects();
  const deckC = centerOf(anchorRect('deck'));
  const prevCards = visibleCards(prev);
  const handCountBefore = new Map((prev?.players || []).map((p) => [p.id, p.handCount]));

  // 2. Pre-efectos: lo que explota antes de desaparecer
  let preWait = 0;
  for (const e of events) {
    if (e.type === 'organDestroyed') {
      const el = anchorEl(slotAnchor(e.playerId, e.slotId));
      const c = centerOf(el?.getBoundingClientRect());
      shake(el, 10, 420);
      const color = COLOR_HEX[e.cards?.find((x) => x.kind === 'organ')?.color] || '#ff4d4d';
      setTimeout(() => {
        emitFx({ kind: 'explosion', x: c?.x, y: c?.y, w: c?.w || 80, color });
        shakeScreen(5);
        sfx.destroy();
      }, 260);
      preWait = Math.max(preWait, 520);
    }
    if (e.type === 'handsDiscarded') {
      sfx.swap();
      const dc = centerOf(anchorRect('discard'));
      e.playerIds.filter((p) => p !== me).forEach((pid, k) => {
        const from = centerOf(anchorRect(handAnchor(pid))) || centerOf(anchorRect(avatarAnchor(pid)));
        const n = Math.min(3, handCountBefore.get(pid) || 3);
        for (let i = 0; i < n; i++) {
          emitFx({ kind: 'flyCard', from, to: dc, w: 60, h: 75, faceDown: true, delay: k * 90 + i * 70, rotate: i * 20 });
        }
      });
      preWait = Math.max(preWait, 450);
    }
    if (e.type === 'played' && e.playerId !== me && e.card?.kind === 'treatment') {
      const who = prev?.players?.find((p) => p.id === e.playerId)?.name;
      emitFx({ kind: 'reveal', card: e.card, who });
      preWait = Math.max(preWait, 650);
    }
  }
  if (!fast && preWait) await wait(preWait);
  // Dejar que llegue el game:state que acompaña al lote (el servidor lo manda justo después)
  await wait(40);
  if (!alive.current) return;

  // 3. Orígenes de las cartas que van a aparecer
  const next = batchStates.get(batch) || useStore.getState().game;
  if (!next) return;
  for (const e of events) {
    if (e.type === 'played' && e.playerId !== me && e.card) {
      setOrigin(e.card.id, centerOf(anchorRect(avatarAnchor(e.playerId))), { flip: true, scale: 0.4 });
    }
    if (e.type === 'discarded' && e.playerId !== me && e.cards?.length) {
      const from = centerOf(anchorRect(avatarAnchor(e.playerId)));
      const last = e.cards[e.cards.length - 1];
      setOrigin(last.id, from, { flip: true, scale: 0.4 });
      e.cards.slice(0, -1).forEach((c, i) => {
        emitFx({ kind: 'flyCard', from, to: centerOf(anchorRect('discard')), w: 60, h: 75, card: c, delay: i * 90 });
      });
    }
  }
  // Cartas nuevas en mi mano: salen del mazo y se voltean
  const prevHand = new Set((prev?.hand || []).map((c) => c.id));
  let drawn = 0;
  (next.hand || []).forEach((c) => {
    if (!prevHand.has(c.id) && !oldRects.has(c.id)) {
      setOrigin(c.id, deckC, { flip: true, delay: 250 + drawn * 140, scale: 0.7, rotate: 20 });
      drawn += 1;
    }
  });

  // 4. Aplicar el estado
  setView(next);
  if (drawn) setTimeout(() => sfx.draw(), 250);

  // 5. Lo que desapareció vuela al descarte (o al mazo si se barajó)
  await wait(30);
  if (!alive.current) return;
  const nextCards = visibleCards(next);
  const reshuffled = events.some((e) => e.type === 'reshuffled');
  const discardC = centerOf(anchorRect('discard'));
  let k = 0;
  for (const [id, rect] of oldRects) {
    if (nextCards.has(id) || document.querySelector(`[data-card-id="${CSS.escape(id)}"]`)) continue;
    if (prev?.discardTop?.id === id) continue; // sólo quedó tapada en el descarte
    const card = prevCards.get(id);
    if (!card) continue;
    emitFx({
      kind: 'flyCard',
      from: centerOf(rect),
      to: reshuffled ? deckC : discardC,
      w: rect.width,
      h: rect.height,
      card,
      delay: k * 70,
      rotate: (k % 2 ? -1 : 1) * 10,
    });
    k += 1;
  }

  // Efectos posteriores y narración
  const effects = [];
  for (const e of events) {
    switch (e.type) {
      case 'played':
        if (e.playerId === me || e.card?.kind !== 'treatment') effects.push(() => sfx.play());
        break;
      case 'organPlaced':
        effects.push(() => {
          const c = slotCenter(e.playerId, e.slotId);
          if (c) emitFx({ kind: 'glint', x: c.x, y: c.y, w: c.w });
        });
        break;
      case 'infected':
        effects.push(() => {
          const c = slotCenter(e.playerId, e.slotId);
          if (c) emitFx({ kind: 'puff', x: c.x, y: c.y, w: c.w });
          sfx.infect();
        });
        break;
      case 'vaccineRemoved':
        effects.push(() => {
          const c = slotCenter(e.playerId, e.slotId);
          if (c) emitFx({ kind: 'puff', x: c.x, y: c.y, w: c.w });
          sfx.infect();
        });
        break;
      case 'cured':
        effects.push(() => {
          const c = slotCenter(e.playerId, e.slotId);
          if (c) emitFx({ kind: 'sparkles', x: c.x, y: c.y, w: c.w });
          sfx.cure();
        });
        break;
      case 'vaccinated':
        effects.push(() => {
          const c = slotCenter(e.playerId, e.slotId);
          if (c) emitFx({ kind: 'glint', x: c.x, y: c.y, w: c.w });
          sfx.vaccinate();
        });
        break;
      case 'immunized':
        effects.push(() => {
          const c = slotCenter(e.playerId, e.slotId);
          if (c) emitFx({ kind: 'goldWave', x: c.x, y: c.y, w: c.w * 1.2 });
          sfx.immunize();
        });
        break;
      case 'slotMoved':
        effects.push(() => sfx.swap());
        break;
      case 'virusMoved':
        effects.push(() => {
          // El virus vuela solo por su layoutId; encima, una estela verde
          const from = centerOf(oldRects.get(findVirusId(prev, e.fromPlayerId, e.fromSlotId)))
            || centerOf(anchorRect(avatarAnchor(e.fromPlayerId)));
          const to = slotCenter(e.toPlayerId, e.toSlotId);
          if (from && to) emitFx({ kind: 'trail', from, to, w: to.w });
          sfx.infect();
        });
        break;
      case 'bodiesSwapped':
        effects.push(() => {
          const a = centerOf(anchorRect(`body:${e.a}`));
          const b = centerOf(anchorRect(`body:${e.b}`));
          if (a && b) emitFx({ kind: 'swirl', from: a, to: b, w: 90 });
          sfx.swap();
        });
        break;
      case 'drew':
        if (e.playerId !== me && e.count > 0) {
          const to = centerOf(anchorRect(handAnchor(e.playerId))) || centerOf(anchorRect(avatarAnchor(e.playerId)));
          for (let i = 0; i < Math.min(3, e.count); i++) {
            emitFx({ kind: 'flyCard', from: deckC, to, w: 50, h: 62, faceDown: true, delay: 200 + i * 110 });
          }
        }
        break;
      case 'reshuffled':
        effects.push(() => {
          if (deckC) emitFx({ kind: 'shuffle', x: deckC.x, y: deckC.y, w: deckC.w, h: deckC.h });
          sfx.swap();
        });
        break;
      default:
        break;
    }
  }

  // "¡Tu turno!" según el estado resultante (el motor emite 'turn' también para quien luego se salta)
  const myTurnNow = next.turnPlayerId === me && !next.winner;
  const myTurnBefore = prev?.turnPlayerId === me && prev?.turnNumber === next.turnNumber;
  if (myTurnNow && !myTurnBefore) {
    effects.push(() => {
      showBanner('¡Tu turno!');
      sfx.turn();
    });
  }

  const lines = describeBatch(events, { me, prev, next });
  lines.forEach((l) => narrate(l.text, { tone: l.tone, color: pidColor(room, l.pid) }));

  // Los efectos esperan a que las cartas aterricen
  const STEP = fast ? 0 : 200;
  effects.forEach((fn, i) => setTimeout(() => alive.current && fn(), (fast ? 0 : 330) + i * STEP));
  const total = fast ? 120 : Math.min(1700, 420 + effects.length * STEP + (lines.length > 1 ? 300 : 0));
  await wait(total);
};

const findVirusId = (view, pid, slotId) => {
  const p = view?.players?.find((x) => x.id === pid);
  const s = p?.body?.find((b) => b.id === slotId);
  return s?.viruses?.[0]?.id;
};

// Reparto inicial: las cartas salen del mazo en cascada (se llama antes del primer render de la mesa)
export const registerDeal = (view, me) => {
  if (!view || reducedMotion()) return false;
  const fresh = view.turnNumber <= 1 && (view.players || []).every((p) => (p.body || []).length === 0);
  if (!fresh) return false;
  const players = view.players || [];
  const myIdx = Math.max(0, players.findIndex((p) => p.id === me));
  const order = [...players.slice(myIdx), ...players.slice(0, myIdx)];
  // El mazo todavía no se ha pintado: se usa el centro de la ventana como origen
  const deck = { x: window.innerWidth / 2 - 60, y: window.innerHeight * 0.44 };
  for (let round = 0; round < 3; round++) {
    order.forEach((p, i) => {
      const delay = 350 + (round * order.length + i) * 110;
      if (p.id === me) {
        const c = view.hand?.[round];
        if (c) setOrigin(c.id, deck, { flip: true, delay, scale: 0.6, rotate: 30, duration: 700 });
      } else {
        setOrigin(`${p.id}:b${round}`, deck, { delay, scale: 0.7, rotate: 40, duration: 650 });
      }
    });
  }
  const total = 350 + 3 * order.length * 110;
  for (let i = 0; i < 3 * order.length; i += 2) setTimeout(() => sfx.draw(), 350 + i * 110);
  return total;
};
