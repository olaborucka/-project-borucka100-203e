# frontend — Nginx reverse proxy + serwer plików statycznych
# non-root: nasłuchuje na porcie 8080, pid i cache w /tmp
FROM nginx:1.25-alpine AS production

ARG BUILD_DATE
ARG VERSION=1.0.0
ARG GIT_COMMIT=unknown
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.title="shop-frontend" \
      org.opencontainers.image.description="Product Shop — Nginx reverse proxy + SPA" \
      org.opencontainers.image.licenses="MIT"

# usuń domyślną konfigurację nginxa
RUN rm -f /etc/nginx/conf.d/default.conf \
    && rm -f /usr/share/nginx/html/index.html

# skopiuj własne pliki
COPY --chown=nginx:nginx nginx.conf /etc/nginx/nginx.conf
COPY --chown=nginx:nginx index.html /usr/share/nginx/html/index.html

# nginx w Alpine — user nginx (UID 101)
# port 8080 nie wymaga uprawnień root
EXPOSE 8080

# wget dostępny w nginx:alpine
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
