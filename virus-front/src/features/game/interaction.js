// Estado de la interacción con la mesa: carta seleccionada, destinos legales,
// trasplante en dos pasos, modo descartar, arrastrar y soltar.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getLegalTargets } from '@shared/engine/index.js';
import { useStore } from '../../store/useStore';
import { sfx } from '../../lib/sfx';
import { slotKey } from './Body';
import { shake } from './fx';
import { toastError } from './Overlays';

const same = (a, b) => a && b && a.playerId === b.playerId && a.slotId === b.slotId;

// Instrucción que se muestra junto al nombre de la carta seleccionada
const HINTS = {
  organ: 'Haz clic en tu cuerpo (o arrástrala ahí) para ponerte el órgano',
  virus: 'Elige un órgano compatible para pegarle la roña',
  medicine: 'Elige uno de tus órganos para curarlo o vacunarlo',
  thief: 'Elige el órgano que quieres robar',
  transplant: 'Elige el primer órgano del intercambio',
  transplant2: 'Ahora elige el órgano de otro jugador',
  contagion: 'Pasa tus virus a los órganos sanos de los demás',
  glove: 'Todos los demás tiran su mano y pierden un turno',
  medicalError: 'Elige con quién cambiar tu cuerpo completo',
};

export const useInteraction = ({ view, me }) => {
  const [selectedId, setSelectedId] = useState(null);
  const [first, setFirst] = useState(null); // primera ranura del trasplante
  const [discardMode, setDiscardMode] = useState(false);
  const [discardIds, setDiscardIds] = useState([]);
  const [confirmGlove, setConfirmGlove] = useState(false);
  const [pending, setPending] = useState(false);
  const [hover, setHover] = useState(null); // destino bajo el cursor al arrastrar
  const pendingRef = useRef(false);

  const myTurn = !!view && view.turnPlayerId === me && !view.winner;
  const card = (selectedId && view?.hand?.find((c) => c.id === selectedId)) || null;
  const mode = card ? (card.kind === 'treatment' ? card.treatment : card.kind) : null;

  const reset = useCallback(() => {
    setSelectedId(null);
    setFirst(null);
    setConfirmGlove(false);
    setHover(null);
  }, []);

  const cancelAll = useCallback(() => {
    reset();
    setDiscardMode(false);
    setDiscardIds([]);
  }, [reset]);

  // Si la carta se fue de la mano o dejó de ser mi turno, se limpia todo
  useEffect(() => {
    if (selectedId && (!card || !myTurn)) reset();
  }, [selectedId, card, myTurn, reset]);
  useEffect(() => {
    if (!myTurn) { setDiscardMode(false); setDiscardIds([]); }
  }, [myTurn]);
  useEffect(() => {
    setDiscardIds((ids) => ids.filter((id) => view?.hand?.some((c) => c.id === id)));
  }, [view?.hand]);

  const targets = useMemo(() => {
    if (!card || !myTurn) return [];
    try {
      return getLegalTargets(view, me, card.id) || [];
    } catch (err) {
      console.warn('[mesa] getLegalTargets falló', err);
      return [];
    }
  }, [view, me, card, myTurn]);

  // Qué se resalta en la mesa
  const hl = useMemo(() => {
    const slots = new Set();
    const bodies = new Set();
    const players = new Set();
    if (card) {
      if (mode === 'organ') targets.forEach((t) => bodies.add(t.playerId));
      else if (mode === 'virus' || mode === 'medicine' || mode === 'thief') targets.forEach((t) => slots.add(slotKey(t.playerId, t.slotId)));
      else if (mode === 'transplant') {
        targets.forEach((t) => {
          if (!first) {
            slots.add(slotKey(t.a.playerId, t.a.slotId));
            slots.add(slotKey(t.b.playerId, t.b.slotId));
          } else if (same(t.a, first)) slots.add(slotKey(t.b.playerId, t.b.slotId));
          else if (same(t.b, first)) slots.add(slotKey(t.a.playerId, t.a.slotId));
        });
      } else if (mode === 'medicalError') targets.forEach((t) => players.add(t.playerId));
    }
    return { slots, bodies, players, active: !!card && (slots.size + bodies.size + players.size > 0 || mode === 'transplant') };
  }, [card, mode, targets, first]);

  const tableTarget = !!card && (mode === 'contagion' || mode === 'glove');

  // Manda una acción al servidor; si falla, toast + la carta tiembla
  const send = useCallback(async (action, cardId) => {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    setPending(true);
    try {
      await useStore.getState().act(action);
      sfx.play();
      cancelAll();
      return true;
    } catch (err) {
      sfx.error();
      toastError(err?.message || 'No se pudo hacer esa jugada');
      const ids = cardId ? [cardId] : action.cardIds || [];
      ids.forEach((id) => {
        const el = document.querySelector(`.gt-hand [data-card-id="${CSS.escape(id)}"] .gc-fly`);
        shake(el, 9);
      });
      return false;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, [cancelAll]);

  const play = useCallback((target) => (card ? send({ type: 'play', cardId: card.id, target }, card.id) : false), [send, card]);

  // ---------- Clics ----------

  const onCardClick = useCallback((id) => {
    if (!myTurn) {
      sfx.error();
      toastError('Espera tu turno');
      return;
    }
    if (discardMode) {
      setDiscardIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= 3 ? ids : [...ids, id]));
      sfx.select();
      return;
    }
    setFirst(null);
    setConfirmGlove(false);
    setSelectedId((cur) => (cur === id ? null : id));
    sfx.select();
  }, [myTurn, discardMode]);

  const onSlot = useCallback((playerId, slotId) => {
    if (!card) return false;
    const pick = { playerId, slotId };
    if (!hl.slots.has(slotKey(playerId, slotId))) return false;
    if (mode === 'transplant') {
      if (!first) { setFirst(pick); sfx.select(); return 'step'; }
      const pair = targets.find((t) => (same(t.a, first) && same(t.b, pick)) || (same(t.b, first) && same(t.a, pick)));
      if (!pair) return false;
      return play(pair);
    }
    const t = targets.find((x) => same(x, pick));
    return t ? play(t) : false;
  }, [card, mode, first, hl, targets, play]);

  const onBody = useCallback((playerId) => {
    if (mode !== 'organ') return false;
    const t = targets.find((x) => x.playerId === playerId);
    return t ? play(t) : false;
  }, [mode, targets, play]);

  const onPlayer = useCallback((playerId) => {
    if (mode !== 'medicalError') return false;
    const t = targets.find((x) => x.playerId === playerId);
    return t ? play(t) : false;
  }, [mode, targets, play]);

  const onTable = useCallback(() => {
    if (mode === 'contagion') return play({});
    if (mode === 'glove') { setConfirmGlove(true); return 'confirm'; }
    return false;
  }, [mode, play]);

  const confirmDiscard = useCallback(() => {
    if (!discardIds.length) return false;
    return send({ type: 'discard', cardIds: discardIds }, null);
  }, [discardIds, send]);

  const toggleDiscard = useCallback(() => {
    if (!myTurn) return;
    reset();
    setDiscardMode((m) => !m);
    setDiscardIds([]);
    sfx.click();
  }, [myTurn, reset]);

  // ---------- Arrastrar y soltar ----------

  const dropAt = (point) => {
    if (!point) return null;
    const els = document.elementsFromPoint(point.x - window.scrollX, point.y - window.scrollY);
    for (const el of els) {
      const d = el.closest?.('[data-drop]');
      if (d && !d.closest('.gt-hand')) return d;
    }
    return null;
  };

  const dropKey = (el) => {
    if (!el) return null;
    const { drop, pid, slot } = el.dataset;
    if (drop === 'slot') return slotKey(pid, slot);
    if (drop === 'body') return `body:${pid}`;
    if (drop === 'player') return `player:${pid}`;
    return drop;
  };

  const onDragStart = useCallback((id) => {
    if (!myTurn || discardMode) return;
    if (selectedId !== id) {
      setFirst(null);
      setSelectedId(id);
      sfx.select();
    }
  }, [myTurn, discardMode, selectedId]);

  const lastHover = useRef(null);
  const onDragMove = useCallback((point) => {
    const k = dropKey(dropAt(point));
    if (k !== lastHover.current) {
      lastHover.current = k;
      setHover(k);
    }
  }, []);

  // Devuelve (o promete) true si la carta se jugó; si no, la carta regresa a la mano
  const onDrop = useCallback((id, point) => {
    lastHover.current = null;
    setHover(null);
    if (id !== card?.id) return false;
    const el = dropAt(point);
    if (!el) return false;
    const { drop, pid, slot } = el.dataset;
    let res = false;
    if (drop === 'slot') res = onSlot(pid, slot);
    else if (drop === 'body') res = onBody(pid);
    else if (drop === 'player') res = onPlayer(pid);
    else if (drop === 'table') res = onTable();
    if (res === 'step' || res === 'confirm') return false; // regresa a la mano y espera el siguiente paso
    return res;
  }, [card, onSlot, onBody, onPlayer, onTable]);

  // Esc cancela
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') cancelAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelAll]);

  const hint = !card
    ? null
    : mode === 'transplant' && first ? HINTS.transplant2 : HINTS[mode];

  return {
    myTurn, card, mode, selectedId, first, picked: first ? slotKey(first.playerId, first.slotId) : null,
    targets, hl, hover, tableTarget, hint, pending,
    discardMode, discardIds, confirmGlove, setConfirmGlove,
    onCardClick, onSlot, onBody, onPlayer, onTable, confirmDiscard, toggleDiscard, cancelAll,
    onDragStart, onDragMove, onDrop, play,
  };
};
