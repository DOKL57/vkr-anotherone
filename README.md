# Звукосклад

Система учёта звукового оборудования:
- website
- Telegram Mini App
- Telegram bot
- API
- Postgres
- локальная LLM по OpenAI-compatible API

Всё на русском.

## Главное

- `apps/web` — интерфейс сайта и Mini App
- `apps/api` — backend/API
- `apps/bot` — Telegram bot
- `run-all.sh` — запуск из bash/WSL
- `run-all.ps1` — запуск из Windows PowerShell

## Важно

Prisma убран из пути запуска полностью.

Сейчас стек поднимается без:
- `prisma generate`
- `prisma db push`
- `binaries.prisma.sh`

Инициализация БД и seed идут через:
- `pg`
- SQL
- локальные скрипты `db:init` и `db:seed`

## Быстрый запуск

Для bash/WSL:

```bash
chmod +x ./run-all.sh
./run-all.sh
```

Для Windows PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\run-all.ps1
```

Что делают скрипты:
- **автоматически устанавливают Node.js / npm**, если не найдены:
  - bash: через nvm, либо apt/dnf/yum/pacman
  - PowerShell: через winget, choco, scoop, или MSI-установщик
- создают `.env`, если его нет
- подхватывают настройки из `.env`
- проверяют `node_modules` под текущую платформу
- при необходимости переустанавливают зависимости с optional native пакетами
- **автоматически устанавливают и запускают PostgreSQL**, если не найден:
  - сначала пытаются установить Docker и поднять postgres через `docker compose`
  - если Docker недоступен — устанавливают PostgreSQL нативно (apt/winget/choco)
  - если PostgreSQL уже установлен, но не запущен — запускают сервис
- ждут БД на `localhost:5432`
- создают schema через `db:init`
- заливают тестовые данные через `db:seed`
- стартуют `api`, `web`, `bot`

PowerShell-вариант нужен для случая, когда в WSL проблемы с DNS или `npm registry`.

## Автоустановка зависимостей

Скрипты **не падают** при отсутствии зависимостей, а пытаются установить их автоматически:

| Зависимость | bash (WSL/Linux) | PowerShell (Windows) |
|---|---|---|
| Node.js / npm | nvm → apt/dnf/yum/pacman | winget → choco → scoop → MSI |
| Docker | apt/dnf | winget → choco |
| PostgreSQL (fallback) | apt/dnf/yum/pacman | winget → choco → поиск в Program Files |

Если PostgreSQL уже запущен на `localhost:5432` — скрипт пропустит установку.

## Переменные окружения

Основа: [.env.example](/E:/vkr/.env.example)

Ключевые:

```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/sound_rental?schema=public
LOCAL_LLM_URL=http://localhost:1234/v1
LOCAL_LLM_MODEL=auto
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free
TELEGRAM_BOT_TOKEN=replace_me
TELEGRAM_WEBAPP_URL=http://localhost:5173
```

## OpenRouter override

Если задан `OPENROUTER_API_KEY`, backend использует OpenRouter **вместо** локальной LLM.

Рекомендуемое минимальное значение:

```env
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=openrouter/free
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

`openrouter/free` — бесплатный router OpenRouter, который выбирает доступную free-модель автоматически.

## Как выбирается модель LLM

`LOCAL_LLM_URL` сам модель не выбирает.
Модель выбирает backend:

1. Если `LOCAL_LLM_MODEL` задан явно, берётся он.
2. Если `LOCAL_LLM_MODEL=auto`, backend делает `GET /models` на `LOCAL_LLM_URL`.
3. Берётся первая доступная модель.
4. Дальше запросы идут в `POST /chat/completions` уже с этим `model`.

Логика:
- [apps/api/dist/src/llm.js](/E:/vkr/apps/api/dist/src/llm.js)

## Тестовые данные

После запуска seed создаёт:
- категории оборудования
- склады и ячейки
- сотрудников
- Telegram user
- оборудование `Shure SM58`, `Shure ULXD24/B58`, `Klotz XLR 10m`, `Yamaha DXR12`, `Allen & Heath SQ-5`
- остатки
- выдачу
- ремонт
- закупку
- чат-сессию для AI

Seed:
- [apps/api/prisma/seed.mjs](/E:/vkr/apps/api/prisma/seed.mjs)

## URL

- web: [http://localhost:5173](http://localhost:5173)
- api: [http://localhost:3001](http://localhost:3001)
- health: [http://localhost:3001/health](http://localhost:3001/health)

## Docker

Если нужен контейнерный режим:

```bash
docker compose up --build
```

API container делает:
- `db:init`
- `db:seed`
- `start`
