# Servidor de Roña (Express + Socket.IO). Contexto de build: la raíz del repo,
# porque el servidor importa el motor desde ../../shared.
#   docker build -f virus-back/Dockerfile -t rona-server .
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3001
WORKDIR /app

# Primero sólo las dependencias, para que la capa se reutilice si no cambia el lock
COPY virus-back/package.json virus-back/package-lock.json ./virus-back/
RUN cd virus-back && npm ci --omit=dev && npm cache clean --force

COPY shared/ ./shared/
COPY virus-back/src/ ./virus-back/src/

USER node
WORKDIR /app/virus-back
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["node", "src/index.js"]
