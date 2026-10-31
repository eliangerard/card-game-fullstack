// Errores del servidor. Se traducen a { ok: false, error: { code, message } } en el ack.
export class AppError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'AppError';
    this.code = code;
  }
}

export const fail = (code, message) => {
  throw new AppError(code, message);
};

// Convierte cualquier excepción en el error que ve el cliente (sin filtrar detalles internos)
export function toClientError(err) {
  if (err && typeof err.code === 'string' && (err.name === 'AppError' || err.name === 'GameError')) {
    return { code: err.code, message: err.message };
  }
  return { code: 'INTERNAL', message: 'Error interno del servidor' };
}
