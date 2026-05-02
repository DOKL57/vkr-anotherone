# Telegram bot frontend

В проект добавлен второй frontend: обычный Telegram bot. Это не Mini App.

Bot работает через тот же backend, что и сайт. Он не подключается к базе данных напрямую.

Что совпадает с сайтом:

- вход и выход идут через `/api/auth/login` и `/api/auth/logout`
- права проверяет backend по тому же токену и роли сотрудника
- каталог, сотрудники, выдачи, ремонты, закупки и сводка берутся из `/api/bootstrap`
- AI-помощник использует `/api/ai/query`, поэтому LLM работает так же, как на сайте
- создание выдачи, ремонта и закупки идёт через те же API endpoints
- возврат выдачи, завершение ремонта и приём закупки тоже идут через backend API

## Роли

Bot использует те же роли, что и сайт. Подробная таблица прав находится в [employees.md](employees.md).

- `ADMIN` и `WAREHOUSE` видят кнопки складских операций: создание выдачи, ремонт, закупка существующей позиции, закупка новой позиции, возврат, завершение ремонта и приёмка закупки.
- `SOUND_ENGINEER` видит справочные разделы, каталог, выдачи, ремонты, закупки и AI-помощника, но не получает кнопки изменения склада.

Даже если команду написать вручную, backend всё равно проверит роль и не даст выполнить складскую операцию без прав.

## Что нужно получить в Telegram

У Telegram нужно взять только токен bot.

1. Откройте Telegram.
2. Найдите `@BotFather`.
3. Создайте bot через `/newbot`.
4. Скопируйте token.
5. Вставьте token в `.env`:

```env
TELEGRAM_BOT_TOKEN=ваш_токен_от_BotFather
```

## Что такое `TELEGRAM_BOT_SESSION_FILE`

`TELEGRAM_BOT_SESSION_FILE` не выдаётся Telegram.

Это обычный локальный файл проекта. Bot сам создаёт его при запуске и хранит там сессии пользователей:

- какой Telegram chat уже вошёл в систему
- backend token после `/login`
- id AI-сессии для продолжения диалога

По умолчанию используется:

```env
TELEGRAM_BOT_SESSION_FILE=.runtime/telegram-bot-sessions.json
```

Обычно менять этот параметр не нужно. Файл появится сам после первого входа в bot.

## Настройки `.env`

Минимально нужен только token:

```env
TELEGRAM_BOT_TOKEN=ваш_токен_от_BotFather
```

Остальное можно оставить как есть:

```env
TELEGRAM_BOT_API_URL=https://api.telegram.org
TELEGRAM_BOT_SESSION_FILE=.runtime/telegram-bot-sessions.json
BOT_POLLING_INTERVAL=1000
```

Для Docker backend доступен так:

```env
API_URL=http://api:3001
```

Для локального dev-режима backend доступен так:

```env
BOT_LOCAL_API_URL=http://localhost:3001
```

## Запуск

Docker:

```bash
bash ./run-all.sh start
```

Локальный dev-режим:

```bash
bash ./run-all.sh dev
```

Если `TELEGRAM_BOT_TOKEN` пустой:

- в dev-режиме bot не запускается
- в Docker bot остаётся выключенным и не мешает запуску сайта и API

## Команды bot

После входа bot показывает кнопки меню. Основные действия можно делать без ручного ввода команд:

- `Сводка`
- `Каталог`
- `Поиск`
- `AI-помощник`
- `Выдачи`
- `Ремонты`
- `Закупки`
- `Сотрудники`
- `Создать выдачу`
- `Создать ремонт`
- `Закупить существующее`
- `Закупить новое`
- `Принять выдачу`
- `Завершить ремонт`
- `Принять закупку`
- `Выйти`

Команды тоже остаются и работают как раньше:

```text
/login user pass
/logout
/dashboard
/catalog all
/catalog Shure
/employees
/issues
/repairs
/purchases
/ai Где есть Shure SM58?
/new_issue
/new_repair
/new_purchase_existing
/new_purchase_new
/return_issue ID
/complete_repair ID
/receive_purchase ID
```

## Создание записей

Для создания выдачи, ремонта или закупки bot сначала покажет список оборудования, складов, категорий или ячеек. Потом нужно отправить одну строку с полями.

Пример выдачи:

```text
equipment=1; qty=1; warehouse=1; due=2026-05-01T18:00; project=1; employee=1; purpose=Выдача на проект
```

Пример закупки существующей позиции:

```text
title=Пополнение микрофонов; supplier=Поставщик; equipment=1; qty=2; location=1; planned=2026-05-01T18:00; reason=Пополнение склада
```

Пример закупки новой позиции:

```text
title=Новый пульт; supplier=Поставщик; category=1; name=Пульт; type=Цифровой микшер; model=Behringer X32; manufacturer=Behringer; serial=; qty=1; location=1; min=0; planned=2026-05-01T18:00; reason=Новая позиция склада
```

Числа `1`, `2`, `3` - это номера из списка, который показал bot. Вместо номера можно указать настоящий id из базы.

Если вы начали ввод и передумали, нажмите `Отмена` или `Главное меню`.

## Совместимость

Старый сайт и API продолжают работать как раньше. Если token bot не указан, запуск проекта не ломается.
