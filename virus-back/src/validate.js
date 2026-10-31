// Validación de payloads: nunca se confía en el cliente. Todo lo que entra se copia
// a un objeto nuevo con sólo los campos esperados y tipos comprobados.
import { fail } from './errors.js';

export const NAME_MAX = 16;
export const ROOM_NAME_MAX = 24;
export const CHAT_MAX = 200;
export const AVATAR_MAX = 8;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
// Caracteres de control, de formato invisibles y separadores raros
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;

export const isPlainObject = (x) =>
  x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;

// Payload opcional: undefined/null → {}; si no es objeto plano, error
export function asObject(payload, { optional = true } = {}) {
  if (payload === undefined || payload === null) {
    if (optional) return {};
    fail('BAD_PAYLOAD', 'Falta el contenido del mensaje');
  }
  if (!isPlainObject(payload)) fail('BAD_PAYLOAD', 'El contenido debe ser un objeto');
  return payload;
}

// Limpia un texto: quita caracteres de control, colapsa espacios y recorta
export function cleanText(s) {
  return String(s).replace(CONTROL_RE, '').replace(/\s+/g, ' ').trim();
}

// Longitud en caracteres visibles (code points), no en unidades UTF-16
export const textLength = (s) => [...s].length;

export function parseText(value, { field, min = 1, max }) {
  if (typeof value !== 'string') fail('BAD_PAYLOAD', `"${field}" debe ser texto`);
  if (value.length > max * 4) fail('BAD_PAYLOAD', `"${field}" es demasiado largo`);
  const text = cleanText(value);
  const len = textLength(text);
  if (len < min) fail('BAD_PAYLOAD', `"${field}" no puede ir vacío`);
  if (len > max) fail('BAD_PAYLOAD', `"${field}" admite como máximo ${max} caracteres`);
  return text;
}

export function parseId(value, field = 'id') {
  if (typeof value !== 'string' || !ID_RE.test(value)) fail('BAD_PAYLOAD', `"${field}" no es válido`);
  return value;
}

export function parseColor(value) {
  if (typeof value !== 'string' || !COLOR_RE.test(value)) fail('BAD_PAYLOAD', 'El color debe ir en formato hex (#rrggbb)');
  let hex = value.slice(1).toLowerCase();
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return `#${hex}`;
}

export function parseAvatar(value) {
  if (!Number.isInteger(value) || value < 0 || value > AVATAR_MAX) {
    fail('BAD_PAYLOAD', `El avatar debe ser un entero de 0 a ${AVATAR_MAX}`);
  }
  return value;
}

// Perfil estricto (profile:update): los tres campos son obligatorios
export function parseProfile(payload) {
  const p = asObject(payload, { optional: false });
  return {
    name: parseText(p.name, { field: 'name', max: NAME_MAX }),
    avatar: parseAvatar(p.avatar),
    color: parseColor(p.color),
  };
}

// Perfil tolerante (session:hello): lo que no sea válido se toma de `fallback`
export function parseProfileLoose(payload, fallback) {
  if (!isPlainObject(payload)) return { ...fallback };
  const pick = (fn, v, def) => {
    try { return fn(v); } catch { return def; }
  };
  return {
    name: pick((v) => parseText(v, { field: 'name', max: NAME_MAX }), payload.name, fallback.name),
    avatar: pick(parseAvatar, payload.avatar, fallback.avatar),
    color: pick(parseColor, payload.color, fallback.color),
  };
}

export function parseToken(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) return null;
  return value;
}

export function parseRoomId(value) {
  if (typeof value !== 'string' || value.length > 16) fail('BAD_PAYLOAD', 'Código de sala no válido');
  const id = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,16}$/.test(id)) fail('BAD_PAYLOAD', 'Código de sala no válido');
  return id;
}

// ---------- Acciones de juego ----------

const CARD_ID_RE = /^c\d{1,3}$/;
const MAX_MOVES = 12;

function parseCardId(value, field = 'cardId') {
  if (typeof value !== 'string' || !CARD_ID_RE.test(value)) fail('BAD_PAYLOAD', `"${field}" no es una carta válida`);
  return value;
}

function parseSlotRef(x, field) {
  if (!isPlainObject(x)) fail('BAD_PAYLOAD', `"${field}" debe ser { playerId, slotId }`);
  return { playerId: parseId(x.playerId, `${field}.playerId`), slotId: parseCardId(x.slotId, `${field}.slotId`) };
}

// Copia sólo los campos de target que el motor entiende, con tipos comprobados.
// La legalidad (de quién es la ranura, colores, etc.) la decide el motor.
function parseTarget(t) {
  if (t === undefined || t === null) return {};
  if (!isPlainObject(t)) fail('BAD_PAYLOAD', 'El destino debe ser un objeto');
  const out = {};
  if (t.playerId !== undefined) out.playerId = parseId(t.playerId, 'target.playerId');
  if (t.slotId !== undefined) out.slotId = parseCardId(t.slotId, 'target.slotId');
  if (t.a !== undefined || t.b !== undefined) {
    out.a = parseSlotRef(t.a, 'target.a');
    out.b = parseSlotRef(t.b, 'target.b');
  }
  if (t.moves !== undefined) {
    if (!Array.isArray(t.moves) || t.moves.length > MAX_MOVES) fail('BAD_PAYLOAD', '"target.moves" no es válido');
    out.moves = t.moves.map((m, i) => {
      if (!isPlainObject(m)) fail('BAD_PAYLOAD', `"target.moves[${i}]" no es válido`);
      return {
        fromSlotId: parseCardId(m.fromSlotId, `moves[${i}].fromSlotId`),
        toPlayerId: parseId(m.toPlayerId, `moves[${i}].toPlayerId`),
        toSlotId: parseCardId(m.toSlotId, `moves[${i}].toSlotId`),
      };
    });
  }
  return out;
}

export function parseAction(payload) {
  const a = asObject(payload, { optional: false });
  switch (a.type) {
    case 'discard': {
      if (!Array.isArray(a.cardIds) || a.cardIds.length < 1 || a.cardIds.length > 3) {
        fail('BAD_PAYLOAD', 'Descarta de 1 a 3 cartas');
      }
      return { type: 'discard', cardIds: a.cardIds.map((id) => parseCardId(id, 'cardIds')) };
    }
    case 'play':
      return { type: 'play', cardId: parseCardId(a.cardId), target: parseTarget(a.target) };
    case 'pass':
      return { type: 'pass' };
    default:
      fail('UNKNOWN_ACTION', 'Acción desconocida');
  }
}
