// Error de juego: lo lanza el motor cuando una acción es ilegal.
// El servidor lo traduce a { ok: false, error: { code, message } }.
export const ERROR_CODES = [
  'NOT_YOUR_TURN',
  'GAME_OVER',
  'CARD_NOT_IN_HAND',
  'BAD_TARGET',
  'ILLEGAL_MOVE',
  'BAD_DISCARD',
  'UNKNOWN_ACTION',
  'BAD_SETUP',
];

export class GameError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'GameError';
    this.code = code;
  }

  toJSON() {
    return { code: this.code, message: this.message };
  }
}

export const fail = (code, message) => {
  throw new GameError(code, message);
};
