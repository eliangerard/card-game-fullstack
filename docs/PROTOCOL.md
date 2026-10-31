# Roña — arquitectura y contrato entre piezas

```
shared/        motor del juego (JS puro, ESM, sin dependencias). Lo importan el server y el cliente.
  engine/      cards.js, rules.js, game.js, bot.js, index.js
  test/        node --test
virus-back/    servidor Express + Socket.IO (ESM). Salas, sesiones, timers, bots. Importa ../shared/engine/index.js
virus-front/   React + Vite. Importa el motor con el alias `@shared` → ../shared
```

Todo es **autoritativo en el servidor**: el cliente sólo manda intenciones (`game:action`), y el servidor valida con el motor y difunde el resultado.
El cliente usa el mismo motor (`getLegalTargets`) sólo para resaltar los destinos válidos en la interfaz.

## 1. API del motor (`shared/engine/index.js`)

Son funciones puras: nunca mutan la entrada y siempre devuelven un estado nuevo. El azar se controla con una semilla.

```js
// Cartas
CARD_KINDS = ['organ','virus','medicine','treatment']
COLORS = ['red','green','blue','yellow','multi']
TREATMENTS = ['transplant','thief','contagion','glove','medicalError']
createDeck() -> Card[]                  // 68 cartas, ids c01..c68, en orden fijo
// Card = { id, kind, color?: Color, treatment?: Treatment }   (los treatment no llevan color)

// Partida
createGame({ players: [{ id, name }], seed?: number }) -> GameState
applyAction(state, playerId, action) -> { state, events }   // si es ilegal lanza GameError { code, message }
advanceTimeout(state) -> { state, events }                  // el jugador en turno no actuó: descarta 1 carta al azar (con la semilla)
removePlayer(state, playerId) -> { state, events }          // abandono
getPlayerView(state, viewerId) -> PlayerView                // oculta las manos ajenas y el mazo
getLegalTargets(view|state, playerId, cardId) -> Target[]   // para resaltar en la UI; funciona con un PlayerView
slotStatus(slot) -> 'healthy'|'infected'|'vaccinated'|'immunized'
chooseBotAction(state, playerId, { level: 'easy'|'normal' }) -> Action   // siempre una acción legal
class GameError extends Error { code }
```

### GameState (privado del servidor)

```js
{
  seed, rngState,             // PRNG determinista (mulberry32 o similar)
  players: [{ id, name, hand: Card[], body: Slot[], skipNext: boolean, out: boolean }],
  deck: Card[], discard: Card[],
  turn: number,               // índice en players
  turnNumber: number,         // empieza en 1 y sube 1 en cada cambio de turno
  winner: null | { playerId, reason: 'organs'|'forfeit' },
  log: []                     // opcional
}
Slot = { id /* = organ.id */, organ: Card, viruses: Card[], medicines: Card[] }
```

### PlayerView (lo que recibe cada cliente)

```js
{
  you: playerId,
  players: [{ id, name, handCount, body: Slot[], skipNext, out, isTurn }],
  hand: Card[],               // sólo la tuya
  deckCount, discardTop: Card|null, discardCount,
  turnPlayerId, turnNumber,
  winner
}
```

### Acciones

```js
{ type: 'discard', cardIds: string[] }                      // de 1 a 3, todas de tu mano
{ type: 'play', cardId, target }
  // organ:        target = { playerId: tú }
  // virus:        target = { playerId, slotId }
  // medicine:     target = { playerId: tú, slotId }
  // transplant:   target = { a: { playerId, slotId }, b: { playerId, slotId } }
  // thief:        target = { playerId, slotId }
  // contagion:    target = { moves?: [{ fromSlotId, toPlayerId, toSlotId }] }
  // glove:        target = {}
  // medicalError: target = { playerId }
```

`Target` (lo que devuelve getLegalTargets) tiene la forma de `target` de la acción; en el caso de transplant devuelve todos los pares `{a,b}` válidos.

### Eventos (para las animaciones; en orden)

```js
{ type: 'played', playerId, card, target }
{ type: 'organPlaced', playerId, slotId }
{ type: 'infected', playerId, slotId }
{ type: 'organDestroyed', playerId, slotId, cards }
{ type: 'cured', playerId, slotId }              // virus + medicina se anulan
{ type: 'vaccinated', playerId, slotId }
{ type: 'immunized', playerId, slotId }
{ type: 'vaccineRemoved', playerId, slotId }      // virus contra vacuna
{ type: 'slotMoved', fromPlayerId, toPlayerId, slotId }   // trasplante / ladrón (un evento por ranura movida)
{ type: 'virusMoved', fromPlayerId, fromSlotId, toPlayerId, toSlotId }   // contagio
{ type: 'handsDiscarded', playerIds }             // guante
{ type: 'bodiesSwapped', a, b }                   // error médico
{ type: 'discarded', playerId, count, cards }     // las cartas descartadas son públicas
{ type: 'drew', playerId, count }
{ type: 'reshuffled', count }
{ type: 'turnSkipped', playerId }
{ type: 'timeout', playerId }
{ type: 'playerLeft', playerId }
{ type: 'turn', playerId, turnNumber }
{ type: 'win', playerId, reason }
```

Códigos de `GameError`: `NOT_YOUR_TURN`, `GAME_OVER`, `CARD_NOT_IN_HAND`, `BAD_TARGET`, `ILLEGAL_MOVE`, `BAD_DISCARD`, `UNKNOWN_ACTION`.

## 2. Protocolo Socket.IO

Servidor: `http://localhost:3001` (variable `PORT`). En el cliente, la URL sale de `VITE_SERVER_URL` y por defecto es `http://<hostname>:3001`.
CORS abierto a cualquier origen en desarrollo, o al que diga `CLIENT_ORIGIN`.
Todos los eventos cliente→servidor usan **ack**: `socket.emit(ev, payload, (res) => …)`, con `res = { ok: true, ...data } | { ok: false, error: { code, message } }`.

### Sesión (para que una recarga no saque al jugador)
- `session:hello` `{ token?: string, profile?: { name, avatar, color } }` → ack `{ ok, token, playerId, profile, roomId|null }`.
  Si el `token` es conocido, la sesión se recupera (mismo `playerId`, misma sala y mismo asiento en la partida) y el servidor reenvía `room:state` y `game:state`.
  El cliente guarda `token` en `localStorage['rona.token']`.
- `profile:update` `{ name, avatar, color }` → ack `{ ok, profile }`. `name` de 1 a 16 caracteres, `avatar` de 0 a 8, `color` en formato hex.

### Lobby
- `rooms:list` → ack `{ ok, rooms: RoomSummary[] }`. Además, el servidor difunde `rooms:update` `RoomSummary[]` a todos cuando algo cambia.
- `RoomSummary = { id, name, playerCount, maxPlayers, status: 'lobby'|'playing'|'finished', hostName }`
- `room:create` `{ name, maxPlayers?: 2..6 (default 6) }` → ack `{ ok, roomId }` (el creador entra solo y es el anfitrión).
- `room:join` `{ roomId }` → ack `{ ok }`. Errores: `ROOM_NOT_FOUND`, `ROOM_FULL`, `ROOM_IN_GAME`, `ALREADY_IN_ROOM`.
- `room:leave` → ack `{ ok }`. Si el anfitrión sale, el anfitrión pasa al siguiente humano. Una sala sin humanos se borra.
- `room:addBot` `{ level?: 'easy'|'normal' }` (sólo el anfitrión, en el lobby) → ack. Los bots tienen nombres divertidos y un avatar y color al azar.
- `room:kick` `{ playerId }` (sólo el anfitrión, en el lobby; sirve también para quitar bots).
- `room:start` (sólo el anfitrión, con 2 a 6 jugadores) → ack. Errores: `NOT_HOST`, `NOT_ENOUGH_PLAYERS`.
- `room:chat` `{ text }` (de 1 a 200 caracteres; ráfagas limitadas a 5 por cada 5 s).
- `room:rematch` (sólo el anfitrión, con la partida terminada) → la sala vuelve al lobby con los mismos jugadores.

Servidor → cliente:
- `room:state` `RoomState = { id, name, hostId, maxPlayers, status, players: [{ id, name, avatar, color, isBot, connected }] }`. Se manda a la sala cada vez que algo cambia, y `null` cuando sales.
- `room:chat` `{ id, from: { id, name, color } | null, text, ts, system: boolean }`. Los mensajes de sistema ("Vane se unió", "Elian ganó") llevan `system: true`.

### Partida
- `game:action` `Action` → ack `{ ok }` o `{ ok: false, error }`.
- `game:state` `PlayerView & { turnDeadline: number /* epoch ms */, turnMs: number }`. Se manda a cada jugador, personalizado, después de cada cambio.
- `game:events` `{ seq, events: Event[] }`. Se manda **antes** del `game:state` correspondiente. El cliente reproduce las animaciones y luego aplica el estado. `seq` sube 1 en cada lote.

Tiempos:
- Turno de 40 s (`TURN_MS`). Si se agota, el servidor llama `advanceTimeout`.
- Los bots actúan tras 900–1600 ms de "pensar".
- Un jugador desconectado conserva su asiento 60 s. Si no vuelve, `removePlayer` lo saca. Mientras está desconectado, sus turnos se resuelven por timeout, pero de 8 s y no de 40 s.
- Al terminar una partida la sala pasa a `finished` y el anfitrión puede pedir `room:rematch`.

### HTTP
- `GET /health` → `{ ok: true }`
- `GET /rooms` → `RoomSummary[]` (se conserva por compatibilidad)

## 3. Cliente (`virus-front`)

- `src/net/socket.js`: el socket único y el helper `request(ev, payload)` que convierte el ack en una Promise.
- `src/store/useStore.js` (zustand): `session`, `profile`, `rooms`, `room`, `chat[]`, `game` (el último `PlayerView`), `eventQueue`. Se suscribe a todos los eventos del servidor.
- `src/lib/cards.js`: `cardImage(card, size='big'|'sm')` y `cardLabel(card)` (el nombre en español).
- Pantallas: `src/features/home` (inicio y perfil), `src/features/lobby` (lista de salas y sala de espera con chat), `src/features/game` (la mesa).
- Animaciones con `framer-motion`, confeti con `canvas-confetti`. Sonidos sintetizados con WebAudio en `src/lib/sfx.js`.
- Referencia visual de la mesa: `virus-front/src/assets/Group 12sa.png`. Paleta: `--background #885FFE`, `--strokes #653FD3`, `--accent #ffae00`. Fuente: `super_sedan`.
