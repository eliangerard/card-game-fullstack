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

// Ancho mínimo cómodo para tocar una ranura con el dedo
export const MIN_TOUCH = 44;
// Ancho que necesita un nombre para que su palabra más larga (hasta ~11 letras) quepa a 11 px
export const NAME_MIN_W = 100;
// Ancho del contador de cartas de los asientos compactos, en fracción del avatar
export const COUNT_W = 0.8;

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
      // Mi nombre ocupa lo que queda a la izquierda del avatar (con un tope para que no se vea perdido)
      nameMax: Math.max(60, Math.min(meAvatar * 3, W / 2 - handWidth / 2 - gap * 2 - meAvatar * 1.14 - pad * 2)),
    },
  };

  // ---------- Centro ----------
  const centerX0 = hasSides ? sideW + gap : pad;
  const center = { x: centerX0, y: topH + gap, w: W - centerX0 * 2, h: meTop - topH - gap * 2 };
  const pileH = clamp(Math.min(center.h * 0.82, H * 0.2), 50, 230);
  center.card = { w: Math.round(pileH * CARD_RATIO), h: Math.round(pileH) };

  // ---------- Rivales ----------
  // Asientos de arriba repartidos entre x0 y W - x0
  const topSeats = (x0) => {
    const regionW = W - x0 * 2;
    // Con 1 o 2 rivales arriba no hace falta un panel de lado a lado
    const maxTopW = nTop === 1 ? W * 0.6 : nTop === 2 ? W * 0.42 : Infinity;
    const seatW = nTop ? Math.min(maxTopW, (regionW - (nTop - 1) * gap * 2) / nTop) : 0;
    const start = (W - (nTop * seatW + (nTop - 1) * gap * 2)) / 2;
    return Array.from({ length: nTop }, (_, i) => {
      const x = start + i * (seatW + gap * 2);
      const peek = topH * 0.17; // franja de la mano boca abajo que asoma desde el borde de arriba
      // Opción A: avatar a la derecha del panel (como el mockup)
      const avA = clamp(Math.min(topH * 0.46, seatW * 0.24), 34, 150);
      const boxA = { w: seatW - avA - gap * 2 - pad * 2, h: topH - peek - pad * 2 };
      // Opción B (compacta): avatar pequeño en una franja arriba, sin abanico de reversos
      // (sólo un contador de cartas), para no encimar el nombre con la mano
      const avB = clamp(topH * 0.22, 24, 64);
      const headB = avB + pad * 0.5;
      const boxB = { w: seatW - pad * 2, h: topH - headB - pad * 2 };
      const cardA = fitCards(boxA.w, boxA.h, 4, 4, gap);
      const cardB = fitCards(boxB.w, boxB.h, 4, 4, gap);
      // Compacto si así caben cartas más grandes, o si la columna del avatar no da para un nombre legible
      const compact = cardB.w > cardA.w * 1.12 || avA + gap * 2 < NAME_MIN_W;
      const avatar = compact ? avB : avA;
      const box = compact ? boxB : boxA;
      const panelW = compact ? seatW : seatW - avA - gap * 2;
      // El nombre: en el compacto, a la derecha del avatar hasta el contador de cartas; si no, bajo el avatar
      const nameMax = compact ? seatW - pad * 2 - avB * (1.14 + COUNT_W) - pad : seatW - panelW;
      return {
        pos: 'top', compact, x, y: 0, w: seatW, h: topH, peek, avatar, box, head: compact ? headB : peek,
        cols: 5, card4: fitCards(box.w, box.h, 4, 4, gap), card5: fitCards(box.w, box.h, 5, 5, gap * 0.8),
        panelW, nameMax,
      };
    });
  };
  let tops = topSeats(hasSides ? sideW + gap * 1.5 : W * 0.035);
  // Celular en horizontal con 2 o 3 rivales arriba y 2 a los lados: si las ranuras de arriba no llegan
  // a un tamaño táctil (44 px), la fila de arriba usa todo el ancho y los laterales empiezan debajo
  let sideTop = 0;
  if (hasSides && nTop >= 2 && tops[0].card4.w < MIN_TOUCH) {
    const wide = topSeats(pad);
    if (wide[0].card4.w > tops[0].card4.w) {
      tops = wide;
      sideTop = topH + gap;
    }
  }

  const seats = [];
  let topIndex = 0;
  for (const pos of positions) {
    if (pos === 'top') {
      seats.push(tops[topIndex]);
      topIndex += 1;
    } else {
      // El nombre va a la derecha (o izquierda) del avatar: si la columna es angosta, el avatar se achica
      const nameNeed = Math.max(NAME_MIN_W, sideW * 0.5);
      const avatar = clamp(Math.min(sideW * 0.4, H * 0.15, (sideW - pad * 3 - nameNeed) / 1.14), 30, 160);
      const headY = sideTop + pad; // dónde va el avatar
      const nameMax = sideW - pad * 3 - avatar * 1.14;
      const y = headY + avatar * 0.85 + pad;
      const h = H * 0.895 - y;
      const gutter = sideW * 0.16; // la mano boca abajo asoma desde el borde de la pantalla
      const box = { w: sideW - gutter - pad * 2, h: h - pad * 2 };
      seats.push({
        pos, x: pos === 'left' ? 0 : W - sideW, y, headY, w: sideW, h, avatar, gutter, box, nameMax,
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
