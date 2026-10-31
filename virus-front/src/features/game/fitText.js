// Ajuste de texto medido en el DOM (no con una constante de "ancho por letra"):
// busca el tamaño de letra más grande, entre min y max, con el que el texto cabe en su caja
// sin partir palabras. La caja la definen los estilos del elemento (max-width, line-clamp…).
// Si ni con el mínimo cabe (una sola palabra larguísima), se permite partirla como último recurso.

import { useLayoutEffect } from 'react';

const fits = (el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1;

export const fitFont = (el, max, min) => {
  if (!el) return;
  el.style.overflowWrap = 'normal';
  el.style.fontSize = `${max}px`;
  if (fits(el)) return;
  el.style.fontSize = `${min}px`;
  if (!fits(el)) {
    el.style.overflowWrap = 'anywhere';
    return;
  }
  // Búsqueda binaria (7 pasos ≈ precisión de medio píxel en un rango de 40 px)
  let lo = min;
  let hi = max;
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    el.style.fontSize = `${mid}px`;
    if (fits(el)) lo = mid;
    else hi = mid;
  }
  el.style.fontSize = `${Math.floor(lo * 2) / 2}px`;
};

// Hook: reajusta cuando cambian las dependencias y cuando termina de cargar la fuente
export const useFitFont = (ref, max, min, deps) => {
  useLayoutEffect(() => {
    const run = () => fitFont(ref.current, max, min);
    run();
    const fonts = typeof document !== 'undefined' ? document.fonts : null;
    let alive = true;
    fonts?.ready.then(() => { if (alive) run(); });
    fonts?.addEventListener?.('loadingdone', run);
    return () => {
      alive = false;
      fonts?.removeEventListener?.('loadingdone', run);
    };
  }, [max, min, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
};
