# Dota 2 AI Analyst & Telegram Bot

Автоматизированный аналитический комплекс для глубокого анализа матчей Dota 2 и генерации ежедневных киберспортивных сводок в Telegram. Сервис извлекает расширенные игровые метрики через OpenDota API, формирует тактический разбор микро- и макро-игры с помощью модели Google Gemini 3.8 Flash, сохраняет историю в бессерверную базу данных Neon PostgreSQL и запускается по расписанию в GitHub Actions.

## Ключевые возможности

- **Глубокий парсинг матчей OpenDota API**:
  - Динамика противостояния на линии (0:00 - 10:00): крипстат, денаи, нетворс против оппонентов на линии, разница по золоту и автоматический вердикт лейнинга.
  - Полный лог смертей с таймкодами, локацией на карте и юнитами-убийцами.
  - Журнал внутриигрового чата (All-chat и Team-chat) с таймкодами и распознаванием колеса чата.
  - Хронология командных сражений (тимфайты): продолжительность, урон игрока, участие и выживаемость.
  - Глобальные бенчмарки (GPM, XPM, Kills/min, урон по героям и зданиям в процентилях относительно мировой базы).
  - Матрица прокачки способностей (1 - 30 уровень) и поминутный таймлайн приобретения предметов.
- **Аналитическое ядро Google Gemini 3.8 Flash**:
  - Двухуровневый разбор: индивидуальный JSON-диагноз каждого матча (оценка в клоун-рейтинге, ошибки, обзор позиционки, билдов, чата и практические советы) и итоговый структурированный дайджест за сутки для Telegram-канала.
  - Каскадная лестница моделей (fallback): при высокой нагрузке или исчерпании квот запрос автоматически передается модели следующего уровня (`gemini-3.8-flash` -> `gemini-3.5-flash` -> `gemini-3.1-flash-lite`).
- **Облачное хранилище Neon Serverless PostgreSQL**:
  - Схема с индексами по времени, героям и исходу матча, а также хранение сырых и обработанных данных в формате JSONB.
  - Локальный JSON-бэкап (`data/matches.json`) сохраняется в репозитории при каждом прогоне.
- **Полная автономность через GitHub Actions**:
  - Ежедневный запуск по cron в 17:00 UTC без необходимости держать собственный сервер.
  - Возможность ручного запуска в один клик через Workflow Dispatch.

## Архитектура проекта

```
dota-tg-bot/
├── .github/workflows/
│   └── bot.yml           # Расписание и запуск в GitHub Actions
├── data/
│   ├── constants.json    # Локальный кэш героев, предметов и способностей
│   └── matches.json      # Резервный файл истории матчей
├── bot.py                # Основной скрипт парсинга, ИИ-анализа и постинга
├── requirements.txt      # Зависимости Python
├── .env.example          # Шаблон переменных окружения
└── README.md             # Документация проекта
```

## Схема базы данных Neon PostgreSQL

При первом подключении бот автоматически создает необходимые таблицы:

```sql
CREATE TABLE IF NOT EXISTS matches (
    match_id BIGINT PRIMARY KEY,
    hero_id INT NOT NULL,
    hero_name VARCHAR(64) NOT NULL,
    hero_slug VARCHAR(64) NOT NULL,
    won BOOLEAN NOT NULL,
    duration INT NOT NULL,
    kills INT NOT NULL,
    deaths INT NOT NULL,
    assists INT NOT NULL,
    kda VARCHAR(16) NOT NULL,
    gpm INT NOT NULL,
    xpm INT NOT NULL,
    net_worth INT NOT NULL,
    hero_damage INT NOT NULL,
    tower_damage INT NOT NULL,
    apm VARCHAR(16),
    lane_role VARCHAR(64),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    full_data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS account_summary (
    id INT PRIMARY KEY,
    account_id VARCHAR(32) NOT NULL,
    player_name VARCHAR(128) NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matches_start_time ON matches (start_time DESC);
CREATE INDEX IF NOT EXISTS idx_matches_hero_slug ON matches (hero_slug);
CREATE INDEX IF NOT EXISTS idx_matches_won ON matches (won);
```

## Настройка и переменные окружения

Создайте файл `.env` на основе примера `.env.example`:

| Переменная | Обязательная | Описание |
|---|---|---|
| `TG_BOT_TOKEN` | Да | Токен Telegram-бота от @BotFather |
| `TG_CHANNEL_ID` | Да | Идентификатор канала или чата (например, `@my_dota_channel` или `-1001234567890`) |
| `GOOGLE_API_KEY` | Да | Ключ доступа к Google Gemini API из Google AI Studio |
| `DOTA_ACCOUNT_ID` | Да | 32-битный цифровой ID аккаунта Dota 2 (Steam32 ID) |
| `DATABASE_URL` | Нет | Строка подключения к Neon PostgreSQL (`postgresql://...sslmode=require`) |
| `PLAYER_NAME` | Нет | Имя игрока для обращения в аналитике (по умолчанию "Данислон Зомбович-Ликвидонов") |
| `PRIMARY_MODEL` | Нет | Основная модель Gemini (по умолчанию "gemini-3.8-flash") |
| `AI_TEMPERATURE` | Нет | Температура генерации от 0.0 до 2.0 (по умолчанию 1.0) |

## Параметры для кастомизации в коде

Все ключевые поведенческие настройки вынесены в начало `bot.py` и доступны для удобной модификации:

1. **Имя игрока (`PLAYER_NAME`)**:
   Определяет, к кому обращается тренер в разборах. Можно задать через переменную окружения `PLAYER_NAME` или отредактировать строку в `bot.py`.
2. **Креативность и температура (`AI_TEMPERATURE`)**:
   - `0.0` - `0.3` - строгий, детерминированный и максимально фактологический тон.
   - `0.7` - `1.0` - сбалансированная аналитика с юмором и живой подачей (режим по умолчанию).
   - `1.2` - `1.5` - повышенная постирония, нестандартные метафоры и яркие сравнения.
3. **Лестница моделей (`DEFAULT_MODELS`)**:
   Список моделей, по которому бот перебирает генерацию при сбоях квоты или таймаутах. По умолчанию первым идет флагман `gemini-3.8-flash`, за ним `gemini-3.5-flash` и `gemini-3.1-flash-lite`.
4. **Системные инструкции тренера (`system_instruction` в `analyze_match_with_ai` и `generate_daily_telegram_post`)**:
   - Стиль общения: можно изменить постироничный образ на строгий профессиональный разбор для подготовки к турнирам или на юмористический дайджест для друзей.
   - Структура поста в Telegram: можно настроить обязательные секции, хэштеги, включить или отключить упоминание тильта в чате.

## Локальный запуск

1. Склонируйте репозиторий:
```bash
git clone https://github.com/DanislonZombovich/dota-tg-bot.git
cd dota-tg-bot
```

2. Создайте виртуальное окружение и активируйте его:
```bash
python3 -m venv .venv
source .venv/bin/activate
```

3. Установите зависимости:
```bash
pip install -r requirements.txt
```

4. Заполните переменные окружения и запустите скрипт:
```bash
cp .env.example .env
# Отредактируйте .env своими значениями
export $(cat .env | xargs)
python bot.py
```

## Развертывание в GitHub Actions

1. Перейдите в **Settings** -> **Secrets and variables** -> **Actions** вашего репозитория на GitHub.
2. Добавьте секреты репозитория (**Repository secrets**):
   - `TG_BOT_TOKEN`
   - `TG_CHANNEL_ID`
   - `GOOGLE_API_KEY`
   - `DOTA_ACCOUNT_ID`
   - `DATABASE_URL` (строка подключения Neon PostgreSQL)
3. В разделе **Actions** -> **Daily Dota 2 Analysis & Telegram Bot** можно нажать **Run workflow** для внеочередного тестового запуска. Регулярный запуск происходит автоматически каждый день в 17:00 UTC.
