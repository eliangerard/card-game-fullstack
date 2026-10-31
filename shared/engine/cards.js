// Definición del mazo de Roña (68 cartas). Ver docs/RULES.md
export const CARD_KINDS = ['organ', 'virus', 'medicine', 'treatment'];
export const COLORS = ['red', 'green', 'blue', 'yellow', 'multi'];
export const BASE_COLORS = ['red', 'green', 'blue', 'yellow'];
export const TREATMENTS = ['transplant', 'thief', 'contagion', 'glove', 'medicalError'];

export const HAND_SIZE = 3;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const MAX_DISCARD = 3;
export const ORGANS_TO_WIN = 4;

// Composición del mazo, en el orden fijo en que se generan los ids
export const DECK_COMPOSITION = [
  { kind: 'organ', color: 'red', count: 5 },
  { kind: 'organ', color: 'green', count: 5 },
  { kind: 'organ', color: 'blue', count: 5 },
  { kind: 'organ', color: 'yellow', count: 5 },
  { kind: 'organ', color: 'multi', count: 1 },
  { kind: 'virus', color: 'red', count: 4 },
  { kind: 'virus', color: 'green', count: 4 },
  { kind: 'virus', color: 'blue', count: 4 },
  { kind: 'virus', color: 'yellow', count: 4 },
  { kind: 'virus', color: 'multi', count: 1 },
  { kind: 'medicine', color: 'red', count: 4 },
  { kind: 'medicine', color: 'green', count: 4 },
  { kind: 'medicine', color: 'blue', count: 4 },
  { kind: 'medicine', color: 'yellow', count: 4 },
  { kind: 'medicine', color: 'multi', count: 4 },
  { kind: 'treatment', treatment: 'transplant', count: 3 },
  { kind: 'treatment', treatment: 'thief', count: 3 },
  { kind: 'treatment', treatment: 'contagion', count: 2 },
  { kind: 'treatment', treatment: 'glove', count: 1 },
  { kind: 'treatment', treatment: 'medicalError', count: 1 },
];

export const DECK_SIZE = DECK_COMPOSITION.reduce((n, c) => n + c.count, 0); // 68

// 68 cartas con ids c01..c68, siempre en el mismo orden (sin barajar)
export function createDeck() {
  const deck = [];
  for (const { kind, color, treatment, count } of DECK_COMPOSITION) {
    for (let i = 0; i < count; i++) {
      const id = 'c' + String(deck.length + 1).padStart(2, '0');
      deck.push(kind === 'treatment' ? { id, kind, treatment } : { id, kind, color });
    }
  }
  return deck;
}
