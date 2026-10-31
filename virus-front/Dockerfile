# Cliente de Roña: se compila con vite y lo sirve nginx, que además reenvía /socket.io/ y /health
# al servidor (rona-server:3001). Contexto de build: la raíz del repo, porque vite resuelve el
# alias @shared → ../shared.
#   docker build -f virus-front/Dockerfile -t rona-web .

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY virus-front/package.json virus-front/package-lock.json ./virus-front/
RUN cd virus-front && npm ci

COPY shared/ ./shared/
COPY virus-front/ ./virus-front/

# Vacía = mismo origen (lo normal detrás de nginx). Sólo hace falta si el servidor vive en otro dominio.
ARG VITE_SERVER_URL=
ENV VITE_SERVER_URL=${VITE_SERVER_URL}
RUN cd virus-front && npx vite build

# ---------- nginx ----------
FROM nginx:1.29-alpine
COPY virus-front/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/virus-front/dist/ /usr/share/nginx/html/

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
