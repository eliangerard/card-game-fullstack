// Geometría de la mesa: dónde va cada asiento y de qué tamaño son las cartas.
// Todo en píxeles a partir del tamaño de la ventana, para que se adapte de 1280×720 a 1920×1080
// y a un celular en horizontal. Referencia: el mockup assets/Group 12sa.png (1920×1080).

export const CARD_RATIO = 0.8; // ancho / alto del arte de las cartas (641×801)
export const STACK_STEP = 0.11; // cuánto asoma por debajo cada virus/medicina apilado, en fracción del alto
export const STACK_EXTRA = STACK_STEP * 2; // como mucho hay 2 cartas encima de un órgano

// Posiciones de los rivales según cuántos sean, en orden de asientos a partir de mí (sentido horario)
const SEAT_POSITIONS = {
  0: [],
  1: ['top'],
  2: ['top', 'top'],
  3: ['left', 'top', 'right'],
  4: ['left', 'top', 'top', 'right'],
  5: ['left', 'top', 'top', 'top', 'right'],
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// Tamaño de carta que cabe en una caja con n ranuras (en fila o en rejilla de `cols` columnas)
export const fitCards = (boxW, boxH, n, cols = n, gap = 8) => {
  const c = Math.max(1, Math.min(cols, n));
  const rows = Math.ceil(n / c);
  const byW = (boxW - (c - 1) * gap) / c;
  const byH = ((boxH - (rows - 1) * gap) / rows / (1 + STACK_EXTRA)) * CARD_RATIO;
  const w = Math.max(18, Math.floor(Math.min(byW, byH)));
  return { w, h: Math.round(w / CARD_RATIO) };
};

export const computeLayout = (W, H, nOpp) => {
  const positions = SEAT_POSITIONS[clamp(nOpp, 0, 5)];
  const hasSides = positions.includes('left');
  const nTop = positions.filter((p) => p === 'top').length;
  const pad = clamp(Math.min(W, H) * 0.014, 5, 18);
  const gap = clamp(Math.min(W, H) * 0.012, 4, 14);
  const radius = clamp(H * 0.03, 10, 34);

  const sideW = hasSides ? clamp(W * 0.18, 130, 370) : 0;
  const topH = nTop ? clamp(H * 0.3, 96, 360) : 0;
  const meTop = H * 0.585;

  // ---------- Mi zona ----------
  const handCardH = clamp(H * 0.23, 70, 260);
  const handCard = { w: Math.round(handCardH * CARD_RATIO), h: Math.round(handCardH) };
  const handWidth = handCard.w * 2.9;
  const meAvatar = clamp(H * 0.135, 40, 150);
  const meLimitL = hasSides ? sideW + gap : pad;
  const mePanelW = Math.min(clamp(W * 0.43, 260, 820), W - meLimitL * 2);
  const mePanel = { x: (W - mePanelW) / 2, y: meTop, w: mePanelW, h: H - meTop + radius };
  const hintRoom = clamp(H * 0.022, 8, 24); // espacio arriba para la pista que monta el borde del panel
  const meSlotsBox = { w: mePanelW - pad * 2, h: H * 0.805 - meTop - pad - hintRoom };
  const me = {
    panel: mePanel,
    hintRoom,
    slotsBox: meSlotsBox,
    card4: fitCards(meSlotsBox.w, meSlotsBox.h, 4, 4, gap * 1.6),
    card5: fitCards(meSlotsBox.w, meSlotsBox.h, 5, 5, gap * 1.2),
    hand: { cx: W / 2, top: H - handCard.h * 0.78, card: handCard, width: handWidth },
    avatar: {
      size: meAvatar,
      right: W - (W / 2 - handWidth / 2 - gap * 2), // se ancla por la derecha (el nombre va a la izquierda)
      y: H - meAvatar - pad,
    },
  };

  // ---------- Centro ----------
  const centerX0 = hasSides ? sideW + gap : pad;
  const center = { x: centerX0, y: topH + gap, w: W - centerX0 * 2, h: meTop - topH - gap * 2 };
  const pileH = clamp(Math.min(center.h * 0.82, H * 0.2), 50, 230);
  center.card = { w: Math.round(pileH * CARD_RATIO), h: Math.round(pileH) };

  // ---------- Rivales ----------
  const seats = [];
  const topX0 = hasSides ? sideW + gap * 1.5 : W * 0.035;
  const topRegionW = W - topX0 * 2;
  // Con 1 o 2 rivales arriba no hace falta un panel de lado a lado
  const maxTopW = nTop === 1 ? W * 0.6 : nTop === 2 ? W * 0.42 : Infinity;
  const topSeatW = nTop ? Math.min(maxTopW, (topRegionW - (nTop - 1) * gap * 2) / nTop) : 0;
  const topStart = (W - (nTop * topSeatW + (nTop - 1) * gap * 2)) / 2;
  let topIndex = 0;

  for (const pos of positions) {
    if (pos === 'top') {
      const x = topStart + topIndex * (topSeatW + gap * 2);
      topIndex += 1;
      const peek = topH * 0.17; // franja de la mano boca abajo que asoma desde el borde de arriba
      // Opción A: avatar a la derecha del panel (como el mockup)
      const avA = clamp(Math.min(topH * 0.46, topSeatW * 0.24), 34, 150);
      const boxA = { w: topSeatW - avA - gap * 2 - pad * 2, h: topH - peek - pad * 2 };
      // Opción B: avatar pequeño en la franja de la mano, a la izquierda (asientos angostos)
      const avB = clamp(topH * 0.22, 24, 64);
      const headB = Math.max(peek, avB + pad * 0.5);
      const boxB = { w: topSeatW - pad * 2, h: topH - headB - pad * 2 };
      const cardA = fitCards(boxA.w, boxA.h, 4, 4, gap);
      const cardB = fitCards(boxB.w, boxB.h, 4, 4, gap);
      const compact = cardB.w > cardA.w * 1.12;
      const avatar = compact ? avB : avA;
      const box = compact ? boxB : boxA;
      seats.push({
        pos, compact, x, y: 0, w: topSeatW, h: topH, peek, avatar, box, head: compact ? headB : peek,
        cols: 5, card4: fitCards(box.w, box.h, 4, 4, gap), card5: fitCards(box.w, box.h, 5, 5, gap * 0.8),
        panelW: compact ? topSeatW : topSeatW - avA - gap * 2,
      });
    } else {
      const avatar = clamp(Math.min(sideW * 0.4, H * 0.15), 34, 160);
      const y = avatar * 0.85 + pad * 2;
      const h = H * 0.895 - y;
      const gutter = sideW * 0.16; // la mano boca abajo asoma desde el borde de la pantalla
      const box = { w: sideW - gutter - pad * 2, h: h - pad * 2 };
      seats.push({
        pos, x: pos === 'left' ? 0 : W - sideW, y, w: sideW, h, avatar, gutter, box,
        cols: 2, card4: fitCards(box.w, box.h, 4, 2, gap), card5: fitCards(box.w, box.h, 5, 2, gap),
      });
    }
  }

  return { W, H, pad, gap, radius, sideW, topH, meTop, me, center, seats, positions };
};

// Orden de los rivales: los que se sientan después de mí, en orden
export const opponentsOf = (players, me) => {
  const i = players.findIndex((p) => p.id === me);
  if (i < 0) return players;
  return [...players.slice(i + 1), ...players.slice(0, i)];
};
