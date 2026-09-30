#FROM node:lts-alpine3.24

# 1. Фиксируем конкретную LTS-версию (22), а не плавающий тег 'lts'
#FROM node:26.3.0-alpine3.24
FROM node:current-alpine

ENV NODE_ENV=production

RUN apk upgrade --no-cache

WORKDIR /app

RUN npm install -g npm@latest

COPY package*.json ./

RUN npm install --omit=dev --no-audit --no-fund && \
    npm cache clean --force

COPY server.js ./

EXPOSE 3000

CMD ["node", "server.js"]

