# Dota 2 Telegram Bot & Analytics

Автоматический бот и аналитическая платформа для трекинга матчей Dota 2. Бот собирает данные об играх через OpenDota API, передает глубокие логи матчей в модель Google Gemini 3.8 Flash и публикует в Telegram-канал ежедневный постироничный разбор с анализом микро- и макро-игры.

## Возможности

- Автоматический сбор сыгранных матчей за последние 24 часа через OpenDota API
- Глубокий парсинг логов: урон по героям и вышкам, нетворс, APM, использование способностей, тайминги покупок предметов, история смертей
- Постироничная киберспортивная аналитика от Gemini 3.8 Flash
- Автоматическая публикация отчетов в Telegram-канал
- Запуск по расписанию через GitHub Actions (cron)

## Переменные окружения

Для работы бота требуются следующие переменные (или GitHub Secrets):

| Переменная | Описание |
|---|---|
| `TG_BOT_TOKEN` | Токен Telegram-бота от @BotFather |
| `TG_CHANNEL_ID` | ID канала или чата (например, `@channel_name` или `-100...`) |
| `GOOGLE_API_KEY` | Ключ API для доступа к Google Gemini API |
| `DOTA_ACCOUNT_ID` | Цифровой Account ID игрока в Dota 2 (32-битный ID из профиля Steam/DotaBuff) |

## Локальный запуск

1. Установите зависимости:
```bash
pip install -r requirements.txt
```

2. Задайте переменные окружения и запустите бота:
```bash
export TG_BOT_TOKEN="your_token"
export TG_CHANNEL_ID="your_channel_id"
export GOOGLE_API_KEY="your_api_key"
export DOTA_ACCOUNT_ID="your_dota_id"
python bot.py
```

## Автоматизация через GitHub Actions

В репозитории настроен workflow `.github/workflows/bot.yml`, который запускается ежедневно в 17:00 UTC, а также поддерживает ручной запуск (workflow_dispatch).
