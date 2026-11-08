# 🎮 Dota 2 Esports Analytics & AI Telegram Digest

> **Automated Esports Data Engineering Pipeline & AI Analyst powered by OpenDota API, Google Gemini 3.8 Flash, Neon Serverless PostgreSQL, and GitHub Actions**

---

## 📌 Оглавление
1. [Обзор архитектуры](#-обзор-архитектуры)
2. [Data Science & Аналитика Данных](#-data-science--аналитика-данных)
   - [Извлечение признаков (Feature Engineering) из сырой телеметрии](#1-извлечение-признаков-feature-engineering-из-сырой-телеметрии)
   - [Многомерный анализ таймлайнов золота и опыта](#2-многомерный-анализ-таймлайнов-золота-и-опыта)
   - [Пространственно-временной анализ смертей и обзора](#3-пространственно-временной-анализ-смертей-и-обзора)
   - [Нормализация и бенчмаркинг по глобальным процентилям](#4-нормализация-и-бенчмаркинг-по-глобальным-процентилям)
   - [Двухуровневый LLM-пайплайн генерации аналитики (NLG)](#5-двухуровневый-llm-пайплайн-генерации-аналитики-nlg)
3. [Стек технологий](#-стек-технологий)
4. [Интеграция с Neon Serverless PostgreSQL](#-интеграция-с-neon-serverless-postgresql)
5. [Каскадная лестница моделей (Model Fallback Ladder)](#-каскадная-лестница-моделей-model-fallback-ladder)
6. [Параметры для настройки и кастомизации](#-параметры-для-настройки-и-кастомизации)
   - [Креативность нейросети (`AI_TEMPERATURE`)](#1-креативность-нейросети-ai_temperature)
   - [Системные инструкции (System Instructions)](#2-системные-инструкции-system-instructions)
   - [Имя игрока (`PLAYER_NAME`)](#3-имя-игрока-player_name)
   - [Иерархия моделей (`DEFAULT_MODELS`)](#4-иерархия-моделей-default_models)
7. [Инструкция по установке и локальному запуску](#-инструкция-по-установке-и-локальному-запуску)
8. [Автоматизация в GitHub Actions](#-автоматизация-в-github-actions)
9. [Лицензия](#-лицензия)

---

## 🔬 Обзор архитектуры

Проект представляет собой автономный аналитический конвейер полного цикла для киберспортивной дисциплины Dota 2:
1. **Data Ingestion**: Ежедневный автоматический опрос OpenDota REST API с глубоким парсингом матчей за последние 24 часа.
2. **Feature Extraction & Processing**: Агрегация микро- и макро-метрик (динамика лейнинга, таймлайны предметов, граф командных сражений, лог смертей и чата).
3. **AI Cognitive Synthesis**: Использование флагманской языковой модели **Google Gemini 3.8 Flash** с каскадной отказоустойчивостью для генерации структурированного JSON-диагноза по каждому матчу и итогового постироничного отчета.
4. **Relational & JSONB Storage**: Сохранение нормализованных метаданных и полных JSONB-снапшотов в бессерверную СУБД **Neon PostgreSQL**.
5. **Channel Dispatch**: Публикация готовой аналитической сводки в Telegram-канал.
6. **Orchestration**: Полностью бессерверный запуск по cron в **GitHub Actions** без выделенного сервера.

---

## 📊 Data Science & Аналитика Данных

### 1. Извлечение признаков (Feature Engineering) из сырой телеметрии
В отличие от базового анализа по KDA, система конструирует глубокий набор признаков:
- **Lane Outcome Metric**: Автоматический расчет дифференциала золота на 10-й минуте ($GoldDiff_{10} = Gold_{user} - \max(Gold_{opponents})$) с классификацией исхода ранней стадии (победа на линии, равная линия, проигрыш).
- **Lane Efficiency Ratio**: Процент крипов, добитых на линии, по отношению к максимально доступным за первые 10 минут.
- **Combat Efficiency**: Коэффициент конверсии нанесенного урона к смертям в тимфайтах ($Dmg_{fight} / \max(1, Deaths_{fight})$).

### 2. Многомерный анализ таймлайнов золота и опыта
- Анализ графиков преимущества (`radiant_gold_adv`, `radiant_xp_adv`) с поминутной дискретизацией позволяет нейросети определять ключевые точки перелома матча (comeback moments, throw moments).
- Синхронизация таймлайна покупки ключевых слотов (`purchase_timeline`) с динамикой преимущества команды.

### 3. Пространственно-временной анализ смертей и обзора
- Координатный маппинг логов смертей (`deaths_log`) с фиксацией позиции игрока ($X, Y$) и юнитов-убийц.
- Анализ плотности расстановки вардов (`wards_log`) для оценки качества обзора и позиционирования.

### 4. Нормализация и бенчмаркинг по глобальным процентилям
Бот извлекает глобальные бенчмарки игрока относительно мировой базы данных на конкретном герое:
- `gold_per_min`, `xp_per_min`, `kills_per_min`, `hero_damage_per_min`, `tower_damage`.
- Значения переводятся в процентили ($0\% - 100\%$), что позволяет ИИ-тренеру объективно оценивать импакт (например, топ-5% по урону при низком винрейте указывает на проблему реализации макро-целей, а не микро-скилла).

### 5. Двухуровневый LLM-пайплайн генерации аналитики (NLG)
- **Уровень 1 (Per-Match Deep Reasoning)**: Строгий структурированный JSON-вывод через `response_mime_type="application/json"`. Включает язвительный диагноз, оценку в "клоун-рейтинге" (от 0 до 1000), детальный разбор ошибок, позиционки, билда и психологического состояния по чату.
- **Уровень 2 (Daily Aggregate Synthesis)**: Обобщающая генерация целостного поста для Telegram с ярким форматированием, сарказмом и практическими рекомендациями на следующий игровой день.

---

## 🛠️ Стек технологий

- **Язык**: Python 3.11+
- **LLM SDK**: Google GenAI SDK (`google-genai` v1)
- **Основная модель**: Google Gemini 3.8 Flash (`gemini-3.8-flash`)
- **База данных**: Neon Serverless PostgreSQL (`psycopg2-binary`)
- **API Источник**: OpenDota API (Cloud Replay Parser)
- **Мессенджер**: Telegram Bot API
- **CI/CD & Автоматизация**: GitHub Actions Workflow

---

## 🗄️ Интеграция с Neon Serverless PostgreSQL

Бот использует облачную бессерверную СУБД Neon PostgreSQL для постоянного хранения истории матчей и профилей:

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

---

## 🪜 Каскадная лестница моделей (Model Fallback Ladder)

Для обеспечения непрерывности работы (High Availability) реализован механизм каскадного переключения:
```python
DEFAULT_MODELS = [
    os.environ.get("PRIMARY_MODEL", "gemini-3.8-flash"),
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite"
]
```
В случае исчерпания поминутных лимитов квоты (HTTP 429), сетевых задержек или временных сбоев на стороне сервиса запрос автоматически перенаправляется на следующую доступную модель.

---

## ⚙️ Параметры для настройки и кастомизации

Все поведенческие параметры вынесены в начало `bot.py` и могут быть скорректированы как в коде, так и через переменные окружения:

### 1. Креативность нейросети (`AI_TEMPERATURE`)
- **Переменная окружения**: `AI_TEMPERATURE` (по умолчанию `1.0`)
- **Диапазон**: `0.0` - `2.0`
  - `0.0` - `0.3`: Строгий, сухой аналитический отчет без метафор и иронии.
  - `0.7` - `1.0`: Сбалансированный киберспортивный разбор с легкой иронией и точными замечаниями (рекомендуемый).
  - `1.2` - `1.5`: Максимальная постирония, нестандартные сравнения и экспрессивный стиль.

### 2. Системные инструкции (System Instructions)
- `system_instruction` в `analyze_match_with_ai`: задает роль ИИ-тренера, критерии оценки и формат ответа. Вы можете изменить тон (например, на дружеский, строгий тренерский или мемный).
- `system_instruction` в `generate_daily_telegram_post`: определяет формат ежедневного поста для канала, наличие списков, хэштегов и акцентов.

### 3. Имя игрока (`PLAYER_NAME`)
- **Переменная окружения**: `PLAYER_NAME` (по умолчанию `"Данислон Зомбович-Ликвидонов"`)
- Подставляется в системный промпт и логи внутриигрового чата для персонального обращения нейросети.

### 4. Иерархия моделей (`DEFAULT_MODELS`)
- Задается через `PRIMARY_MODEL` (по умолчанию `"gemini-3.8-flash"`).

---

## 🚀 Инструкция по установке и локальному запуску

### 1. Клонирование репозитория
```bash
git clone https://github.com/DanislonZombovich/dota-tg-bot.git
cd dota-tg-bot
```

### 2. Создание и активация виртуального окружения
```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Установка зависимостей
```bash
pip install -r requirements.txt
```

### 4. Настройка конфигурации
Создайте `.env` файл (или скопируйте из шаблона `cp .env.example .env`):
```ini
TG_BOT_TOKEN="1234567890:ABCdef..."
TG_CHANNEL_ID="-1001234567890"
GOOGLE_API_KEY="AIzaSy..."
DOTA_ACCOUNT_ID="123456789"
DATABASE_URL="postgresql://neondb_owner:password@ep-xyz.eu-central-1.aws.neon.tech/neondb?sslmode=require"
PLAYER_NAME="Данислон Зомбович-Ликвидонов"
PRIMARY_MODEL="gemini-3.8-flash"
AI_TEMPERATURE="1.0"
```

| Переменная | Обязательная | Назначение / Описание | Пример / По умолчанию |
| :--- | :---: | :--- | :--- |
| `DOTA_ACCOUNT_ID` | Да | 32-битный цифровой идентификатор Steam/Dota 2 игрока для отслеживания телеметрии. | `872780` |
| `GOOGLE_API_KEY` | Да (для AI-генерации) | Ключ доступа к Google Gemini API (Google AI Studio). | `AIzaSy...` |
| `TG_BOT_TOKEN` | Да (для Telegram) | Токен Telegram-бота, полученный через `@BotFather`. | `1234567890:ABCdef...` |
| `TG_CHANNEL_ID` | Да (для Telegram) | Идентификатор канала или чата (например, `@channel_name` или `-100...`). | `@my_dota_digest` |
| `DATABASE_URL` | Нет (Опционально) | Строка подключения к Neon Serverless PostgreSQL (`sslmode=require`). Если не задана, данные сохраняются локально в `data/matches.json`. | `postgresql://user:pass@ep-xyz.neon.tech/neondb?sslmode=require` |
| `PLAYER_NAME` | Нет (Опционально) | Имя или никнейм игрока, используемые в системном промпте для персональной аналитики. | `"Данислон Зомбович-Ликвидонов"` |
| `PRIMARY_MODEL` | Нет (Опционально) | Модель первого уровня для детального анализа и синтеза дайджеста. | `"gemini-3.8-flash"` |
| `AI_TEMPERATURE` | Нет (Опционально) | Температура сэмплирования нейросети от `0.0` (строгий разбор) до `2.0` (максимальная постирония). | `1.0` |

### 5. Запуск
```bash
python bot.py
```

---

## ⚡ Автоматизация в GitHub Actions

Бот полностью автономен и не требует запущенного ПК или арендованного VDS. Вся работа выполняется внутри GitHub Actions:

1. Перейдите в **Settings** -> **Secrets and variables** -> **Actions** вашего репозитория.
2. Добавьте следующие **Repository Secrets**:
   - `TG_BOT_TOKEN` — токен Telegram-бота
   - `TG_CHANNEL_ID` — ID канала публикации
   - `GOOGLE_API_KEY` — ключ Google Gemini API
   - `DOTA_ACCOUNT_ID` — Steam ID игрока
   - `DATABASE_URL` — строка подключения Neon PostgreSQL (опционально)
3. Расписание запуска настроено в `.github/workflows/bot.yml` на **17:00 UTC** ежедневно.
4. Вы также можете запустить процесс вручную в любой момент через вкладку **Actions** -> **Daily Dota 2 Analysis & Telegram Bot** -> **Run workflow**.

---

## 📄 Лицензия

Проект распространяется под открытой лицензией [MIT License](LICENSE). Вы можете свободно использовать, модифицировать и распространять данный код.

