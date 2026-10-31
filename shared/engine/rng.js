// PRNG determinista (mulberry32). El estado es un entero de 32 bits que vive en el GameState.
export function normalizeSeed(seed) {
  if (seed === undefined || seed === null || !Number.isFinite(Number(seed))) {
    return (Math.floor(Math.random() * 2 ** 32)) >>> 0;
  }
  return Number(seed) >>> 0;
}

// Devuelve [número en [0,1), nuevo estado]
export function nextRandom(rngState) {
  const a = (rngState + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

// Generador con estado interno, para usar sobre un estado ya clonado: rng.next() y rng.state
export function makeRng(rngState) {
  const rng = {
    state: rngState >>> 0,
    next() {
      const [value, next] = nextRandom(rng.state);
      rng.state = next;
      return value;
    },
    int(n) {
      return Math.floor(rng.next() * n);
    },
  };
  return rng;
}

// Fisher-Yates in situ con el rng dado
export function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Hash simple de cadena (para derivar semillas, p. ej. del bot)
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
