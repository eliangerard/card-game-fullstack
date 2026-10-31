# Roña

Juego de cartas multijugador en línea: ponte cuatro órganos sanos antes que los demás mientras
les pegas la roña. De 2 a 6 jugadores, con salas, chat, bots y reconexión.

```
shared/        motor del juego (JS puro, sin dependencias): reglas, partida, bots. Lo usan el servidor y el cliente
virus-back/    servidor Express + Socket.IO: sesiones, salas, timers de turno y bots
virus-front/   cliente React 18 + Vite 5 + framer-motion + zustand
e2e/           pruebas de punta a punta (Playwright) y de resistencia (por socket)
docs/          RULES.md (reglas exactas) y PROTOCOL.md (API del motor y protocolo Socket.IO)
```

Requisitos: Node 20 o más nuevo (probado con Node 22).

## Instalar

Cada carpeta tiene su propio `package.json`:

```bash
cd virus-back  && npm install
cd ../virus-front && npm install
cd ../e2e && npm install && npx playwright install chromium   # sólo para las pruebas e2e
```

`shared/` no tiene dependencias.

## Correr en desarrollo

En dos terminales:

```bash
# 1. Servidor en http://localhost:3001
cd virus-back
npm run dev            # node --watch; o `npm start` sin recarga automática

# 2. Cliente en http://localhost:5173
cd virus-front
npm run dev
```

Abre http://localhost:5173 en dos navegadores (o una ventana normal y una de incógnito) para jugar
contra ti mismo, o agrega bots desde la sala. El cliente busca el servidor en `http://<host>:3001`;
para otra URL, define `VITE_SERVER_URL`. Como vite escucha en todas las interfaces, desde otro equipo
de la red local basta con abrir `http://<ip-de-tu-pc>:5173`.

### Variables del servidor

| Variable | Por defecto | Qué hace |
| --- | --- | --- |
| `PORT` | `3001` | puerto HTTP / Socket.IO |
| `CLIENT_ORIGIN` | cualquiera | orígenes permitidos por CORS, separados por comas |
| `TURN_MS` | `40000` | duración de un turno |
| `DISCONNECTED_TURN_MS` | `8000` | turno de un jugador desconectado |
| `RECONNECT_TURN_MS` | `15000` | margen mínimo al volver en tu propio turno |
| `GRACE_MS` | `60000` | cuánto se guarda el asiento de un desconectado |
| `BOT_MIN_MS` / `BOT_MAX_MS` | `900` / `1600` | lo que "piensa" un bot |
| `LOG` | `1` | `LOG=0` apaga los logs |

### Modos de demostración del cliente (sólo en desarrollo, sin servidor)

- Lobby: `?demo=lobby`, `?demo=room`, `?demo=room-guest`, `?demo=offline`
- Mesa: `?demo=game` (4 jugadores), `?demo=game2` … `?demo=game6`; añade `&pause` para congelar a los bots.
  En la consola, `window.__ronaDemo.run('destroy' | 'contagion' | 'glove' | 'win' | …)` dispara cada animación.

## Producción

```bash
cd virus-front && npm run build      # genera virus-front/dist (estático)
cd ../virus-back && npm start        # PORT=3001
```

Sirve `virus-front/dist` con cualquier servidor estático. Si el servidor no está en `<host>:3001`,
compila el cliente con `VITE_SERVER_URL=https://tu-servidor npm run build`, y en el servidor
define `CLIENT_ORIGIN` con el dominio del cliente.

## Pruebas

```bash
cd shared      && npm test     # motor: 85 tests (reglas, tratamientos, fuzz de 300 partidas)
cd virus-back  && npm test     # servidor: 17 tests de integración por Socket.IO (puertos aleatorios)
cd virus-front && npm run lint && npm run build
```

### Resistencia por socket (sin navegador)

```bash
cd e2e
npm run soak                                        # levanta su propio servidor rápido en un puerto libre
SOAK_URL=http://localhost:3001 GAMES=3 npm run soak # o contra un servidor ya corriendo
```

Juega 20 partidas (`GAMES`) de 2 humanos-script + 1 a 4 bots, con reconexiones y abandonos a media
partida y acciones ilegales a propósito. En cada `game:state` comprueba que haya 68 cartas en total
(visibles + ocultas), que `handCount` coincida con la mano, que el turno avance y nunca sea de alguien
que salió, y que el `seq` de los lotes sea consecutivo. Falla si una partida se atora o no termina.

### Punta a punta con Playwright

Con el servidor y vite corriendo (los bots rápidos acortan la prueba):

```bash
cd virus-back  && BOT_MIN_MS=350 BOT_MAX_MS=650 npm start
cd virus-front && npm run dev
cd e2e         && npm run play          # HEADED=1 para ver los navegadores
```

Dos jugadores en contextos de navegador aislados: el anfitrión crea la sala, el otro se une, se
mandan un mensaje por el chat, el anfitrión agrega 2 bots y empieza. Los dos humanos juegan haciendo
clic en la mesa (eligen una carta, hacen clic en un destino resaltado o descartan) hasta que hay
ganador o pasan `MAX_TURNS` (120) turnos. A media partida el invitado recarga la página y debe
volver a su asiento; al final se pide la revancha y se abre la misma sesión en otra pestaña.
Falla si aparece cualquier error en la consola o una excepción en la página.
Las capturas quedan en `e2e/shots/e2e-*.png` (la carpeta no se sube al repo).

`node e2e/shot.mjs <url> <png> [ancho] [alto] [esperaMs]` saca una captura suelta.
