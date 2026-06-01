# etap 1 — deps: instalacja TYLKO zależności produkcyjnych
# cache Docker: rebuild tylko gdy zmieni się package.json
# w repo z committed package-lock.json użyć: npm ci --only=production
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-fund --no-audit

# etap 2 — test: weryfikacja składni JS przed buildem produkcyjnym
# jeśli npm test zakończy się błędem, etap production NIE zostanie zbudowany
FROM node:20-alpine AS test
WORKDIR /app
COPY package*.json ./
RUN npm install --no-fund --no-audit
COPY server.js .
RUN npm test

# etap 3 — production: minimalny obraz non-root z tylko tym co potrzeba
FROM node:20-alpine AS production
WORKDIR /app

# metadane OCI — przekazywane przez --build-arg w GitHub Actions
ARG BUILD_DATE
ARG VERSION=1.0.0
ARG GIT_COMMIT=unknown
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.title="shop-backend" \
      org.opencontainers.image.description="Product Shop REST API — Kubernetes demo" \
      org.opencontainers.image.licenses="MIT"

# alpine: addgroup/adduser zamiast useradd (jak na laboratorium)
# -S = systemowy (bez katalogu domowego, bez powłoki logowania)
RUN addgroup -S app && adduser -S app -G app

# kopiujemy TYLKO node_modules z etapu deps — bez devDependencies
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
# kopiujemy kod aplikacji — nie kopiujemy .env, node_modules lokalnych itp.
COPY --chown=app:app server.js .

# przełącz na użytkownika bez uprawnień root
USER app

EXPOSE 3000

# wget dostępny w node:20-alpine (curl nie jest instalowany domyślnie)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
