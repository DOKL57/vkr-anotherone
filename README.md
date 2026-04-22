# Звукосклад

Сайт для учета звукового оборудования.

Стек:
- `apps/web` — frontend сайта
- `apps/api` — backend API
- PostgreSQL
- локальная LLM по OpenAI-compatible API или OpenRouter

Интеграции с мессенджерами удалены. Windows-скрипты удалены. Локальный запуск рассчитан на WSL.

## Быстрый старт

Для Docker:

```bash
docker compose up --build
```

Для WSL dev-режима:

```bash
chmod +x ./run-all.sh
./run-all.sh dev
```

Полезные команды:

```bash
./run-all.sh start
./run-all.sh stop
./run-all.sh logs
./run-all.sh reset
```

## Переменные окружения

Основа: [.env.example](/E:/vkr/.env.example)

Минимум:

```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/sound_rental?schema=public
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
HOST=0.0.0.0
PORT=3001
CORS_ORIGIN=http://localhost:5173
LOCAL_LLM_URL=http://host.docker.internal:1234/v1
LOCAL_LLM_MODEL=local-model
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openrouter/free
API_URL=http://api:3001
VITE_API_PROXY_TARGET=http://api:3001
```

Если задан `OPENROUTER_API_KEY`, backend использует OpenRouter вместо локальной LLM.
Если в окружении остался старый alias БД вроде `worklist-postgres`, backend теперь умеет переключиться на `POSTGRES_HOST` или на стандартный host `postgres`.
Для Docker web proxy должен смотреть на `http://api:3001`, а не на `localhost:3001`, иначе login даст `ECONNREFUSED`.

## URL

- web: [http://localhost:5173](http://localhost:5173)
- api: [http://localhost:3001](http://localhost:3001)
- health: [http://localhost:3001/health](http://localhost:3001/health)

## База данных

Инициализация и seed идут через `pg` и локальные скрипты:
- `npm run db:init -w @sound/api`
- `npm run db:seed -w @sound/api`

Seed создает:
- категории оборудования
- склады и ячейки
- сотрудников
- оборудование и остатки
- выдачи
- ремонты
- закупки
- AI chat history
