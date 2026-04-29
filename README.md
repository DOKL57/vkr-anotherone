# Звукосклад

Сервис для учета звукового оборудования.

## Запуск на Windows

### 1. Установите WSL

Откройте `PowerShell` от имени администратора и выполните:

```powershell
wsl --install -d Ubuntu
```

Потом перезагрузите компьютер.

Официальная инструкция Microsoft:
[https://learn.microsoft.com/en-us/windows/wsl/install](https://learn.microsoft.com/en-us/windows/wsl/install)

### 2. Установите Docker Desktop

Скачайте и установите Docker Desktop для Windows:
[https://docs.docker.com/desktop/setup/install/windows-install/](https://docs.docker.com/desktop/setup/install/windows-install/)

После установки запустите Docker Desktop и дождитесь, пока он полностью стартует.

### 3. Установите LM Studio

LM Studio нужен до первого запуска проекта, если хотите, чтобы AI работал локально.

Скачать:
[https://lmstudio.ai/](https://lmstudio.ai/)

Полезные инструкции:

- старт LM Studio: [https://lmstudio.ai/docs/app/basics](https://lmstudio.ai/docs/app/basics)
- как поднять локальный сервер: [https://lmstudio.ai/docs/developer/core/server](https://lmstudio.ai/docs/developer/core/server)
- быстрый API-старт: [https://lmstudio.ai/docs/developer/rest/quickstart](https://lmstudio.ai/docs/developer/rest/quickstart)

Что сделать в LM Studio:

1. Установить программу.
2. Скачать модель.
3. Загрузить модель в память.
4. Открыть вкладку `Developer`.
5. Включить `Start server`.
6. Убедиться, что сервер работает на `http://localhost:1234`.

Если не знаете, какую модель взять:

- рекомендую начать с `Qwen3-1.7B-Instruct` в формате `GGUF`, вариант `4-bit` вроде `Q4_K_M`
- если компьютер слабый, можно взять `ibm/granite-4-micro`

`Qwen3-1.7B-Instruct` я рекомендую как практичный лёгкий вариант. `ibm/granite-4-micro` LM Studio сама использует в своих примерах документации.

### 4. Откройте терминал Ubuntu

После установки WSL откройте приложение `Ubuntu` из меню `Пуск`.

Если команда `git` не найдена, установите её:

```bash
sudo apt update
sudo apt install -y git
```

### 5. Скачайте проект

Если скачиваете проект первый раз:

```bash
git clone https://github.com/DOKL57/vkr-anotherone.git
cd vkr-anotherone
```

Если папка проекта уже есть и нужно обновить код:

```bash
cd ~/vkr-anotherone
git pull
```

## Подготовка перед запуском

### 1. Файл `.env` уже есть

Для первого запуска обычно ничего редактировать не нужно.

Если проект просто хотите открыть и проверить, сразу переходите к запуску через скрипт:

```bash
bash ./run-all.sh start
```

Если позже захотите поменять настройки, откройте файл [.env](/E:/vkr/.env).

### 2. Проверьте настройки AI

Для локального запуска через LM Studio в файле `.env` уже подходят такие значения:

```env
LOCAL_LLM_URL=http://host.docker.internal:1234/v1
LOCAL_LLM_MODEL=auto
```

`LOCAL_LLM_MODEL=auto` оставляйте как есть.

Если LM Studio уже установлена и сервер в ней запущен, обычно больше ничего менять не нужно.

#### Если не хотите ставить LM Studio

Можно использовать OpenRouter.

В `.env` укажите ключ:

```env
OPENROUTER_API_KEY=ваш_ключ
OPENROUTER_MODEL=openrouter/free
```

Если `OPENROUTER_API_KEY` заполнен, backend будет использовать OpenRouter вместо локальной модели.

## Как запустить

Находясь в папке проекта внутри `Ubuntu`:

```bash
bash ./run-all.sh start
```

Скрипт сам поднимет нужные сервисы.
Первый запуск может занять несколько минут.

После запуска откройте:

- сайт: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:3001](http://localhost:3001)
- проверка API: [http://localhost:3001/health](http://localhost:3001/health)

Чтобы остановить проект:

```bash
bash ./run-all.sh stop
```

## Если уже всё установлено

Короткий сценарий:

```bash
cd ~/vkr-anotherone
git pull
bash ./run-all.sh start
```

## Для разработчика

Если нужен режим разработки внутри WSL:

```bash
bash ./run-all.sh dev
```

Полезные команды:

```bash
bash ./run-all.sh start
bash ./run-all.sh stop
bash ./run-all.sh logs
bash ./run-all.sh reset
```

## Telegram bot

В проекте есть второй frontend: обычный Telegram bot, не Mini App.

Bot использует тот же backend, что и сайт: ту же авторизацию, роли, AI-запросы, каталог, выдачи, ремонты и закупки. Если `TELEGRAM_BOT_TOKEN` не задан, старый запуск сайта и API не ломается: в dev bot пропускается, в Docker bot остаётся выключенным.

Подробная простая инструкция: [docs/telegram-bot.md](docs/telegram-bot.md).
