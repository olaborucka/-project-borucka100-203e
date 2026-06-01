# etap 1 — deps: tylko zależności produkcyjne
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-fund --no-audit

# etap 2 — test: weryfikacja składni (build zatrzymuje się przy błędzie)
FROM node:20-alpine AS test
WORKDIR /app
COPY package*.json ./
RUN npm install --no-fund --no-audit
COPY worker.js .
RUN npm test

# etap 3 — production: minimalny obraz non-root
FROM node:20-alpine AS production
WORKDIR /app

ARG BUILD_DATE
ARG VERSION=1.0.0
ARG GIT_COMMIT=unknown
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.title="shop-worker" \
      org.opencontainers.image.description="Product Shop background worker — Redis stats" \
      org.opencontainers.image.licenses="MIT"

# alpine: addgroup/adduser (nie useradd jak w Debianie)
RUN addgroup -S app && adduser -S app -G app

COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app worker.js .

USER app

# worker nie wystawia portu HTTP — brak EXPOSE
# hEALTHCHECK sprawdza czy proces node żyje
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD pgrep -x node || exit 1

CMD ["node", "worker.js"]
