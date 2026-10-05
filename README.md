# Dota 2 Telegram Bot & Pro Tracker Analytics

Автоматический бот и аналитическая веб-платформа для Dota 2 в стиле Dota2ProTracker. Проект собирает глубокие данные сыгранных матчей через OpenDota API (включая внутриигровой чат, позиционку, тайминги покупок, варды, тимфайты и порядок прокачки способностей), проводит разбор микро- и макро-игры с помощью модели Google Gemini 3.8 Flash, сохраняет историю в облачную базу данных Neon Serverless PostgreSQL, публикует ежедневные постироничные посты в Telegram-канал и деплоит интерактивный сайт на Vercel и GitHub Pages.

## Возможности

- **Облачная база данных Neon PostgreSQL**: матчи сохраняются в таблицы с индексами и JSONB для быстрого поиска и масштабирования.
- **Serverless API на Vercel**: эндпоинты `/api/matches`, `/api/summary` и `/api/coach` с пагинацией и фильтрами.
- **Интерактивный AI-коуч Gemini 3.8 Flash**: диалог с тренером прямо на сайте через live-чат в карточке матча.
- **Сбор глубоких логов матчей**:
  - Внутриигровой чат: сохранение всей истории реплик матча (All-chat и Team-chat) с таймкодами и выделением реплик игрока.
  - Тактическая миникарта: точки смертей, причины гибели, расстановка Observer и Sentry вардов.
  - Командные сражения: хронология тимфайтов, тайминги, длительность, урон и выживаемость.
  - Бенчмарки vs Мир: процентные показатели GPM, XPM, Kills и Hero Damage в сравнении с игроками со всего мира на этом герое.
  - Скиллбилд и таймлайн предметов: сетка прокачки способностей с 1 по 30 уровень и таймлайн покупок с минутами.
- **Постироничный Telegram-бот**: ежедневные обзоры в стиле строгого, но любящего киберспортивного тренера со ссылками на веб-платформу.

## Веб-платформа

Платформа развернута и доступна онлайн:
- **Основной сайт (Vercel + Neon API)**: https://dotatgbot.vercel.app
- **Зеркало (GitHub Pages)**: https://danislonzombovich.github.io/dota-tg-bot/

## Переменные окружения

| Переменная | Описание |
|---|---|
| `TG_BOT_TOKEN` | Токен Telegram-бота от @BotFather |
| `TG_CHANNEL_ID` | ID канала или чата (например, `@channel_name` или `-100...`) |
| `GOOGLE_API_KEY` | Ключ доступа к Google Gemini API |
| `DOTA_ACCOUNT_ID` | 32-битный цифровой ID игрока в Dota 2 |
| `DATABASE_URL` | Строка подключения к Neon PostgreSQL (sslmode=require) |
| `SITE_URL` | Ссылка на сайт (по умолчанию https://dotatgbot.vercel.app) |

## Локальный запуск

1. Установка зависимостей:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm install
```

2. Запуск бота:
```bash
export TG_BOT_TOKEN="your_token"
export TG_CHANNEL_ID="your_channel_id"
export GOOGLE_API_KEY="your_api_key"
export DOTA_ACCOUNT_ID="your_dota_id"
export DATABASE_URL="postgresql://..."
python bot.py
```

3. Локальный просмотр сайта и API:
```bash
npx vercel dev
```
Откройте в браузере `http://localhost:3000`.

## Автоматизация и CI/CD

В `.github/workflows/bot.yml` настроен ежедневный запуск в 17:00 UTC (и ручной запуск через workflow_dispatch). Скрипт собирает данные, выполняет анализ Gemini 3.8 Flash, пишет матчи в Neon PostgreSQL, отправляет сводку в Telegram и деплоит сайт.
