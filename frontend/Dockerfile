FROM nginx:mainline-alpine-slim

LABEL org.opencontainers.image.authors="SOFTCASE"
LABEL org.opencontainers.image.title="SOFTCASE frontend"
LABEL org.opencontainers.image.version="7.1.2"

RUN apk update && apk upgrade --no-cache

COPY html /var/www/html
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

#CMD ["nginx", "-g", "daemon off;"]
