FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/bot/package.json ./apps/bot/package.json

RUN npm ci

COPY . .

RUN npm run build -w @sound/web

EXPOSE 5173

CMD ["npm", "run", "start", "-w", "@sound/web", "--", "--host", "0.0.0.0"]
