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

### 3. Откройте терминал Ubuntu

После установки WSL откройте приложение `Ubuntu` из меню `Пуск`.

Если команда `git` не найдена, установите её:

```bash
sudo apt update
sudo apt install -y git
```

### 4. Скачайте проект

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

### 2. Настройте AI

Есть 2 варианта.

#### Вариант A. LM Studio на вашем компьютере

Подходит, если хотите локальную AI-модель без внешнего API.

1. Скачайте LM Studio:
[https://lmstudio.ai/](https://lmstudio.ai/)
2. Краткая инструкция по первому запуску:
[https://lmstudio.ai/docs/app/basics](https://lmstudio.ai/docs/app/basics)
3. Запустите локальный сервер LM Studio:
[https://lmstudio.ai/docs/local-server](https://lmstudio.ai/docs/local-server)

Что нужно сделать в LM Studio:

1. Установить программу.
2. Скачать любую совместимую модель.
3. Загрузить модель в память.
4. Включить локальный сервер на `http://localhost:1234`.

В файле `.env` уже подходят такие значения:

```env
LOCAL_LLM_URL=http://host.docker.internal:1234/v1
LOCAL_LLM_MODEL=auto
```

`LOCAL_LLM_MODEL=auto` оставляйте как есть.

#### Вариант B. OpenRouter

Если не хотите ставить LM Studio, можно использовать OpenRouter.

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
