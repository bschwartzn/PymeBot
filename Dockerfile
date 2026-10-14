# Imagen de producción de PymeBot.
#
# Multietapa para que la imagen final no lleve las dependencias de desarrollo ni el código
# de los tests: menos peso que descargar en cada despliegue y menos superficie expuesta.

# ---------- Etapa 1: dependencias ----------
FROM node:22-alpine AS deps

WORKDIR /app

# Solo los manifiestos primero: si no cambian, Docker reutiliza la capa de node_modules
# y el despliegue no vuelve a descargar nada.
COPY package.json package-lock.json ./

# npm ci instala exactamente lo del lockfile; --omit=dev deja fuera lo de desarrollo.
RUN npm ci --omit=dev && npm cache clean --force

# ---------- Etapa 2: la imagen que corre ----------
FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=3000
# Los datos van en un volumen montado aquí. Sin volumen, cada despliegue los borra.
ENV PYMEBOT_DATA_DIR=/data

WORKDIR /app

# tini como PID 1: reenvía SIGTERM al proceso de Node para que el cierre ordenado ocurra.
# Sin él, Node corre como PID 1 y las señales no llegan como uno espera.
RUN apk add --no-cache tini

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
# Los negocios de ejemplo: se copian aparte de /data, que es el volumen.
COPY data/businesses ./semillas/businesses
# El negocio de la cuenta del dueño (PYMEBOT_DUENO_EMAIL): se lee de aquí al arrancar.
COPY data/demo ./data/demo

RUN mkdir -p /data && chown -R node:node /data /app

# No correr como root: si alguien escapara del proceso, no sería administrador del sistema.
USER node

EXPOSE 3000

# El hosting comprueba esto para saber si la instancia responde.
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/arranque.js"]
