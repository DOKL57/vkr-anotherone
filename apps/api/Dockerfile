FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN npm ci

COPY . .

RUN npm run build -w @sound/web
RUN npm run build -w @sound/api

EXPOSE 3001

CMD ["sh", "-c", "node apps/api/dist/db/init-db.js && node apps/api/dist/db/seed.js && node apps/api/dist/src/index.js"]
