import io from 'socket.io-client';

// VITE_SERVER_URL manda si está definida. Si no: en producción el servidor está detrás del mismo
// origen (nginx reenvía /socket.io/), y en desarrollo vite y el servidor van en puertos distintos
// del mismo host (5173 y 3001).
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.PROD
    ? window.location.origin
    : `${window.location.protocol}//${window.location.hostname}:3001`);

// Socket único de la app; se conecta al importar
export const socket = io(SERVER_URL, { transports: ['websocket'], autoConnect: true });

// Emite un evento con ack y lo convierte en Promise; rechaza con { code, message }
export const request = (event, payload) =>
  new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload, (err, res) => {
      if (err) return reject({ code: 'TIMEOUT', message: 'El servidor no respondió' });
      if (!res?.ok) return reject(res?.error || { code: 'UNKNOWN', message: 'Error desconocido' });
      resolve(res);
    });
  });
