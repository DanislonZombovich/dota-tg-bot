import os
import sys
import json
import time
import datetime
import requests
from google import genai
from google.genai import types

try:
    import psycopg2
    from psycopg2.extras import Json
except ImportError:
    psycopg2 = None
    Json = None

TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN")
TG_CHANNEL_ID = os.environ.get("TG_CHANNEL_ID")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
DOTA_ACCOUNT_ID = os.environ.get("DOTA_ACCOUNT_ID")
DATABASE_URL = os.environ.get("DATABASE_URL")

# ==========================================================
# Customizable Parameters (can also be overridden via ENV)
# ==========================================================
PLAYER_NAME = os.environ.get("PLAYER_NAME", "Данислон Зомбович-Ликвидонов")
# Temperature / Creativity (0.0 = deterministic, 1.0 = balanced, 2.0 = maximal creativity)
AI_TEMPERATURE = float(os.environ.get("AI_TEMPERATURE", "1.0"))
# Model priority ladder (Gemini 3.8 Flash is primary)
DEFAULT_MODELS = [
    os.environ.get("PRIMARY_MODEL", "gemini-3.8-flash"),
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite"
]

REQ_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
}

def load_constants():
    const_path = os.path.join(os.path.dirname(__file__), "data", "constants.json")
    if os.path.exists(const_path):
        try:
            with open(const_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading local constants: {e}")

    heroes_dict = {}
    item_ids_dict = {}
    ability_ids_dict = {}

    try:
        h_resp = requests.get("https://api.opendota.com/api/heroes", headers=REQ_HEADERS, timeout=15)
        if h_resp.status_code == 200:
            for h in h_resp.json():
                heroes_dict[str(h["id"])] = {
                    "localized_name": h.get("localized_name"),
                    "name": h.get("name", "").replace("npc_dota_hero_", "")
                }
    except Exception as e:
        print(f"Error fetching heroes: {e}")

    try:
        items_resp = requests.get("https://api.opendota.com/api/constants/item_ids", headers=REQ_HEADERS, timeout=15)
        if items_resp.status_code == 200:
            item_ids_dict = items_resp.json()
    except Exception as e:
        print(f"Error fetching item IDs: {e}")

    try:
        ab_resp = requests.get("https://api.opendota.com/api/constants/ability_ids", headers=REQ_HEADERS, timeout=15)
        if ab_resp.status_code == 200:
            ability_ids_dict = ab_resp.json()
    except Exception as e:
        print(f"Error fetching ability IDs: {e}")

    return {
        "heroes": heroes_dict,
        "item_ids": item_ids_dict,
        "ability_ids": ability_ids_dict
    }

def format_time(seconds):
    if seconds is None:
        return "00:00"
    is_neg = seconds < 0
    s = abs(int(seconds))
    mins = s // 60
    secs = s % 60
    prefix = "-" if is_neg else ""
    return f"{prefix}{mins:02d}:{secs:02d}"

def request_replay_parse(match_id):
    try:
        requests.post(f"https://api.opendota.com/api/request/{match_id}", headers=REQ_HEADERS, timeout=10)
    except Exception:
        pass

def parse_deep_match(match_id, constants):
    url = f"https://api.opendota.com/api/matches/{match_id}"
    try:
        resp = requests.get(url, headers=REQ_HEADERS, timeout=30)
        if resp.status_code != 200:
            return None
        data = resp.json()
    except Exception as e:
        print(f"Failed to fetch match {match_id}: {e}")
        return None

    if not data.get("chat") and data.get("version") is None:
        request_replay_parse(match_id)

    players = data.get("players", [])
    player = next((p for p in players if str(p.get("account_id")) == str(DOTA_ACCOUNT_ID)), None)
    if not player:
        return None

    heroes_map = constants.get("heroes", {})
    item_ids_map = constants.get("item_ids", {})
    ability_ids_map = constants.get("ability_ids", {})

    hero_id = player.get("hero_id")
    hero_info = heroes_map.get(str(hero_id), {})
    hero_name = hero_info.get("localized_name") or f"Hero_{hero_id}"
    hero_slug = hero_info.get("name") or str(hero_id)

    player_slot = player.get("player_slot", 0)
    is_radiant = player.get("isRadiant", player_slot < 128)
    radiant_win = data.get("radiant_win", False)
    won = (is_radiant and radiant_win) or (not is_radiant and not radiant_win)

    kills = player.get("kills", 0)
    deaths = player.get("deaths", 0)
    assists = player.get("assists", 0)
    kda_val = (kills + assists) / max(1, deaths)
    kda_str = f"{kda_val:.2f}"

    gpm = player.get("gold_per_min", 0)
    xpm = player.get("xp_per_min", 0)
    net_worth = player.get("net_worth", 0)
    hero_damage = player.get("hero_damage", 0)
    tower_damage = player.get("tower_damage", 0)
    apm = player.get("actions_per_min", "N/A")

    lane_role_id = player.get("lane_role")
    lane_map = {1: "Safe Lane", 2: "Mid Lane", 3: "Offlane", 4: "Jungle"}
    lane_role = lane_map.get(lane_role_id, "Flex / Roam")
    lane_efficiency_pct = player.get("lane_efficiency_pct", 0)

    final_items = []
    for slot_idx in range(6):
        item_id = player.get(f"item_{slot_idx}")
        if item_id and str(item_id) in item_ids_map:
            final_items.append(item_ids_map[str(item_id)])

    neutral_id = player.get("item_neutral")
    neutral_item = item_ids_map.get(str(neutral_id), "") if neutral_id else ""

    purchase_timeline = []
    raw_purchases = player.get("purchase_log", [])
    for p in raw_purchases:
        item_key = p.get("key")
        sec = p.get("time", 0)
        item_name = item_key.replace("_", " ").title() if item_key else ""
        purchase_timeline.append({
            "minute": max(0, sec // 60),
            "time": format_time(sec),
            "item": item_key,
            "name": item_name
        })

    skill_build = []
    upgrades = player.get("ability_upgrades_arr", [])
    for lvl, ab_id in enumerate(upgrades, 1):
        ab_slug = ability_ids_map.get(str(ab_id), f"ability_{ab_id}")
        ab_name = ab_slug.replace("_", " ").title()
        skill_build.append({
            "level": lvl,
            "ability": ab_slug,
            "name": ab_name
        })

    slot_to_hero = {}
    for p in players:
        p_slot = p.get("player_slot")
        p_h_id = p.get("hero_id")
        p_h_info = heroes_map.get(str(p_h_id), {})
        slot_to_hero[p_slot] = {
            "name": p_h_info.get("localized_name", "Unknown"),
            "slug": p_h_info.get("name", "hero")
        }

    chat_log = []
    raw_chat = data.get("chat", [])
    for c in raw_chat:
        c_type = c.get("type", "chat")
        c_time = format_time(c.get("time", 0))
        c_slot = c.get("player_slot", c.get("slot"))
        sender_info = slot_to_hero.get(c_slot, {"name": "Player", "slug": "hero"})
        sender_is_user = str(c_slot) == str(player_slot)
        sender_hero_name = sender_info["name"]
        sender_label = f"{PLAYER_NAME} ({sender_hero_name})" if sender_is_user else sender_hero_name

        channel = "All"
        if c_type == "chatwheel":
            text = f"[Колесо чата: {c.get('key')}]"
        else:
            text = str(c.get("key", ""))

        chat_log.append({
            "time": c_time,
            "sender": sender_label,
            "hero": sender_info["slug"],
            "channel": channel,
            "text": text
        })

    deaths_log = []
    raw_deaths = player.get("deaths_log", [])
    for d in raw_deaths:
        d_sec = d.get("time", 0)
        killer_unit = d.get("key", "Enemy")
        killer_clean = killer_unit.replace("npc_dota_hero_", "").replace("_", " ").title()
        deaths_log.append({
            "time": format_time(d_sec),
            "killer": killer_clean,
            "location": "Линия / Лес",
            "coordinates": {"x": 128, "y": 128},
            "reason": f"Убит героем {killer_clean}"
        })

    benchmarks_raw = player.get("benchmarks", {})
    benchmarks = {}
    for b_key in ["gold_per_min", "xp_per_min", "kills_per_min", "hero_damage_per_min", "tower_damage"]:
        b_val = benchmarks_raw.get(b_key, {})
        pct = b_val.get("pct")
        if pct is not None:
            benchmarks[b_key] = round(pct * 100)

    wards_log = []
    for obs in player.get("obs_log", []):
        wards_log.append({
            "type": "observer",
            "time": format_time(obs.get("time", 0)),
            "x": obs.get("x", 128),
            "y": obs.get("y", 128)
        })
    for sen in player.get("sen_log", []):
        wards_log.append({
            "type": "sentry",
            "time": format_time(sen.get("time", 0)),
            "x": sen.get("x", 128),
            "y": sen.get("y", 128)
        })

    teamfights = []
    raw_tf = data.get("teamfights", [])
    for tf in raw_tf:
        start_sec = tf.get("start", 0)
        end_sec = tf.get("end", 0)
        deaths_in_tf = len(tf.get("deaths", []))
        user_tf_player = next((p for p in tf.get("players", []) if str(p.get("account_id")) == str(DOTA_ACCOUNT_ID)), None)
        user_dmg = user_tf_player.get("damage", 0) if user_tf_player else 0
        user_died = user_tf_player.get("deaths", 0) > 0 if user_tf_player else False

        teamfights.append({
            "minute": start_sec // 60,
            "start_time": format_time(start_sec),
            "duration": end_sec - start_sec,
            "deaths_count": deaths_in_tf,
            "user_damage": user_dmg,
            "user_died": user_died
        })

    user_lane = player.get("lane")
    lane_opponents = []
    for op in players:
        if op.get("isRadiant") != is_radiant and op.get("lane") == user_lane:
            op_h_id = op.get("hero_id")
            op_h_info = heroes_map.get(str(op_h_id), {})
            op_lh_t = op.get("lh_t") or []
            op_dn_t = op.get("dn_t") or []
            op_gold_t = op.get("gold_t") or []
            lane_opponents.append({
                "hero_id": op_h_id,
                "hero_name": op_h_info.get("localized_name", f"Hero_{op_h_id}"),
                "hero_slug": op_h_info.get("name", "hero"),
                "lh_at_10": op_lh_t[10] if len(op_lh_t) > 10 else (op_lh_t[-1] if op_lh_t else 0),
                "dn_at_10": op_dn_t[10] if len(op_dn_t) > 10 else (op_dn_t[-1] if op_dn_t else 0),
                "gold_at_10": op_gold_t[10] if len(op_gold_t) > 10 else (op_gold_t[-1] if op_gold_t else 0)
            })

    user_lh_t = player.get("lh_t") or []
    user_dn_t = player.get("dn_t") or []
    user_gold_t = player.get("gold_t") or []
    user_lh_10 = user_lh_t[10] if len(user_lh_t) > 10 else (user_lh_t[-1] if user_lh_t else 0)
    user_dn_10 = user_dn_t[10] if len(user_dn_t) > 10 else (user_dn_t[-1] if user_dn_t else 0)
    user_gold_10 = user_gold_t[10] if len(user_gold_t) > 10 else (user_gold_t[-1] if user_gold_t else 0)

    opp_gold_10 = max([o["gold_at_10"] for o in lane_opponents], default=0)
    gold_diff_10 = user_gold_10 - opp_gold_10
    if lane_opponents:
        if gold_diff_10 > 500:
            lane_outcome = f"Победа на линии (+{gold_diff_10}g к 10 мин)"
        elif gold_diff_10 < -500:
            lane_outcome = f"Проигрыш линии ({gold_diff_10}g к 10 мин)"
        else:
            lane_outcome = "Равная линия"
    else:
        lane_outcome = "Завершен"

    lane_stats = {
        "user_lh_at_10": user_lh_10,
        "user_dn_at_10": user_dn_10,
        "user_gold_at_10": user_gold_10,
        "opponents": lane_opponents,
        "gold_diff_at_10": gold_diff_10,
        "outcome": lane_outcome
    }

    return {
        "match_id": match_id,
        "hero_id": hero_id,
        "hero_name": hero_name,
        "hero_slug": hero_slug,
        "won": won,
        "duration": data.get("duration", 0),
        "start_time": data.get("start_time", 0),
        "kills": kills,
        "deaths": deaths,
        "assists": assists,
        "kda": kda_str,
        "gpm": gpm,
        "xpm": xpm,
        "net_worth": net_worth,
        "hero_damage": hero_damage,
        "tower_damage": tower_damage,
        "apm": apm,
        "lane_role": lane_role,
        "lane_efficiency_pct": lane_efficiency_pct,
        "lane_outcome": lane_outcome,
        "lane_stats": lane_stats,
        "radiant_gold_adv": data.get("radiant_gold_adv") or [],
        "radiant_xp_adv": data.get("radiant_xp_adv") or [],
        "final_items": final_items,
        "neutral_item": neutral_item,
        "purchase_timeline": purchase_timeline,
        "skill_build": skill_build,
        "chat_log": chat_log,
        "deaths_log": deaths_log,
        "benchmarks": benchmarks,
        "wards_log": wards_log,
        "teamfights": teamfights
    }

def analyze_match_with_ai(match_info, client):
    models = DEFAULT_MODELS
    system_instruction = (
        "Ты - элитный киберспортивный аналитик и постироничный тренер Dota 2. "
        f"Игрока зовут {PLAYER_NAME}. "
        "Проведи глубокий разбор конкретного матча на основе статистики, лейнинга против врага на линии, предметов, скиллбилда, логов смертей, вардов, тимфайтов, графика преимущества по золоту и чата. "
        "Формат вывода: СТРОГО валидный JSON со следующими полями: "
        "{"
        "\"diagnosis\": \"краткий язвительный диагноз игры\","
        "\"clown_rating\": \"оценка из 1000 (например: 322 / 1000 или 980 / 1000 TI God)\","
        "\"coach_verdict\": \"развернутый анализ микро и макро игры с учетом противостояния на линии и камбэков\","
        "\"key_mistakes\": [\"ошибка 1\", \"ошибка 2\", \"ошибка 3\"],"
        "\"positioning_review\": \"анализ смертей, позиционки и обзора\","
        "\"build_review\": \"критика сборки предметов и порядка прокачки скиллов\","
        "\"chat_review\": \"разбор реплик в чате, тильта и психологии\","
        "\"advice\": \"практический совет на следующий матч\""
        "}"
    )

    prompt = f"Данные матча:\n{json.dumps(match_info, ensure_ascii=False, indent=2)}"

    for model_name in models:
        try:
            config = types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=AI_TEMPERATURE,
                response_mime_type="application/json"
            )
            resp = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config
            )
            if resp and resp.text:
                return json.loads(resp.text)
        except Exception as e:
            print(f"Match AI analysis failed with {model_name}: {e}")

    return {
        "diagnosis": "Парсинг без ответа нейросети",
        "clown_rating": "500 / 1000",
        "coach_verdict": f"Игра на {match_info.get('hero_name')} завершилась {'победой' if match_info.get('won') else 'поражением'}. Статистика KDA: {match_info.get('kda')}.",
        "key_mistakes": ["Требуется повторный анализ логов"],
        "positioning_review": "Стандартная позиционка по карте.",
        "build_review": "Сборка соответствовала стандартному паттерну.",
        "chat_review": "Внутриигровой чат прошел без критических инцидентов.",
        "advice": "Держи концентрацию до сноса вражеского трона."
    }

def generate_daily_telegram_post(matches, account_summary, client):
    models = DEFAULT_MODELS
    system_instruction = (
        "Ты - элитный киберспортивный аналитик для Telegram-канала. "
        f"Пользователя зовут {PLAYER_NAME}. "
        "Твой стиль: глубокая аналитика, приправленная постиронией и метаиронией. "
        "Похвали за гениальные моменты и высокий KDA/урон, и жестко, но смешно простеби за фид, низкий урон по зданиям и странные решения. "
        "Обязательно упомяни общую статистику (винрейт), подробно разбери каждую игру за день с яркими выводами. "
        "Используй выразительное форматирование Telegram (жирный шрифт, списки, эмодзи)."
    )

    summary_payload = {
        "account_summary": account_summary,
        "matches": matches
    }
    prompt = f"Данные для ежедневного отчета:\n{json.dumps(summary_payload, ensure_ascii=False, indent=2)}"

    for model_name in models:
        try:
            config = types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=AI_TEMPERATURE
            )
            resp = client.models.generate_content(
                model=model_name,
                contents=f"{system_instruction}\n\n{prompt}",
                config=config
            )
            if resp and resp.text:
                return resp.text
        except Exception as e:
            print(f"Telegram post generation failed with {model_name}: {e}")

    lines = [
        f"🏆 Итоги дня {PLAYER_NAME}:",
        f"Игр за сегодня: {len(matches)}",
        f"Винрейт аккаунта: {account_summary.get('winrate', 50):.2f}%"
    ]
    return "\n".join(lines)

def send_to_telegram(text):
    if not TG_BOT_TOKEN or not TG_CHANNEL_ID:
        print("Telegram tokens not set, skipping TG notification.")
        return

    url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"
    chunks = [text[i:i + 4000] for i in range(0, len(text), 4000)] if len(text) > 4000 else [text]

    for chunk in chunks:
        payload = {
            "chat_id": TG_CHANNEL_ID,
            "text": chunk,
            "parse_mode": "Markdown"
        }
        try:
            resp = requests.post(url, json=payload, timeout=30)
            if resp.status_code != 200:
                payload.pop("parse_mode", None)
                resp = requests.post(url, json=payload, timeout=30)
                if resp.status_code != 200:
                    print(f"Failed to send to TG: {resp.text}")
                    return
            print("Successfully sent message to Telegram!")
        except Exception as e:
            print(f"Error sending message to Telegram: {e}")

def save_to_neon(matches, account_summary, db_url):
    if not psycopg2:
        print("psycopg2 is not installed, skipping Neon database save.")
        return

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()

        cur.execute("""
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
        """)

        cur.execute("""
        INSERT INTO account_summary (id, account_id, player_name, data, updated_at)
        VALUES (1, %s, %s, %s, NOW())
        ON CONFLICT (id) DO UPDATE SET
            data = EXCLUDED.data,
            updated_at = NOW();
        """, (str(DOTA_ACCOUNT_ID), PLAYER_NAME, Json(account_summary)))

        match_insert_sql = """
        INSERT INTO matches (
            match_id, hero_id, hero_name, hero_slug, won, duration,
            kills, deaths, assists, kda, gpm, xpm, net_worth,
            hero_damage, tower_damage, apm, lane_role,
            start_time, full_data
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, to_timestamp(%s), %s)
        ON CONFLICT (match_id) DO UPDATE SET
            won = EXCLUDED.won,
            full_data = EXCLUDED.full_data;
        """

        for m in matches:
            cur.execute(match_insert_sql, (
                m["match_id"], m["hero_id"], m["hero_name"], m["hero_slug"], m["won"], m["duration"],
                m["kills"], m["deaths"], m["assists"], str(m["kda"]), m["gpm"], m["xpm"], m["net_worth"],
                m.get("hero_damage", 0), m.get("tower_damage", 0), str(m.get("apm", "N/A")), m.get("lane_role", ""),
                m["start_time"], Json(m)
            ))

        conn.commit()
        cur.close()
        conn.close()
        print(f"Successfully saved {len(matches)} matches to Neon PostgreSQL!")
    except Exception as e:
        print(f"Error saving to Neon: {e}")

def update_matches_storage(new_matches, account_summary):
    if DATABASE_URL:
        save_to_neon(new_matches, account_summary, DATABASE_URL)

    data_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(data_dir, exist_ok=True)
    matches_file = os.path.join(data_dir, "matches.json")

    existing_data = {
        "account_id": str(DOTA_ACCOUNT_ID),
        "player_name": PLAYER_NAME,
        "last_updated": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "summary": account_summary,
        "matches": []
    }

    if os.path.exists(matches_file):
        try:
            with open(matches_file, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict) and "matches" in loaded:
                    existing_data = loaded
        except Exception as e:
            print(f"Failed to read existing matches.json: {e}")

    existing_matches = existing_data.get("matches", [])
    existing_ids = {m["match_id"] for m in existing_matches if "match_id" in m}

    for m in reversed(new_matches):
        if m["match_id"] not in existing_ids:
            existing_matches.insert(0, m)
            existing_ids.add(m["match_id"])
        else:
            for idx, em in enumerate(existing_matches):
                if em.get("match_id") == m["match_id"]:
                    existing_matches[idx] = m
                    break

    existing_data["summary"] = account_summary
    existing_data["last_updated"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    existing_data["matches"] = existing_matches

    with open(matches_file, "w", encoding="utf-8") as f:
        json.dump(existing_data, f, ensure_ascii=False, indent=2)

    print(f"Saved {len(existing_matches)} matches to local file storage.")

def main():
    if not DOTA_ACCOUNT_ID:
        print("DOTA_ACCOUNT_ID environment variable is missing.")
        sys.exit(1)

    constants = load_constants()

    print("Fetching player account stats from OpenDota...")
    wl_url = f"https://api.opendota.com/api/players/{DOTA_ACCOUNT_ID}/wl"
    wl_resp = requests.get(wl_url, headers=REQ_HEADERS, timeout=30)
    wl_data = wl_resp.json() if wl_resp.status_code == 200 else {}
    total_wins = wl_data.get("win", 0)
    total_losses = wl_data.get("lose", 0)
    total_games = total_wins + total_losses
    winrate = (total_wins / total_games * 100) if total_games > 0 else 0

    account_summary = {
        "total_games": total_games,
        "wins": total_wins,
        "losses": total_losses,
        "winrate": round(winrate, 2)
    }

    recent_matches_url = f"https://api.opendota.com/api/players/{DOTA_ACCOUNT_ID}/recentMatches"
    resp = requests.get(recent_matches_url, headers=REQ_HEADERS, timeout=30)
    if resp.status_code != 200:
        print("Failed to fetch recent matches from OpenDota.")
        sys.exit(1)

    matches_raw = resp.json()
    now = datetime.datetime.now(datetime.timezone.utc)
    yesterday = now - datetime.timedelta(days=1)
    yesterday_ts = yesterday.timestamp()

    recent_24h = [m for m in matches_raw if m.get("start_time", 0) >= yesterday_ts]

    if not recent_24h:
        print("No games in the last 24 hours. Updating summary and exiting.")
        update_matches_storage([], account_summary)
        return

    print(f"Found {len(recent_24h)} matches in the last 24 hours. Parsing deep logs...")

    ai_client = None
    if GOOGLE_API_KEY:
        ai_client = genai.Client(api_key=GOOGLE_API_KEY)

    parsed_matches = []
    for m in recent_24h:
        match_id = m.get("match_id")
        deep_match = parse_deep_match(match_id, constants)
        if not deep_match:
            continue

        if ai_client:
            print(f"Analyzing match {match_id} with Gemini 3.8 Flash...")
            analysis = analyze_match_with_ai(deep_match, ai_client)
            deep_match["ai_analysis"] = analysis
        else:
            deep_match["ai_analysis"] = {
                "diagnosis": "GOOGLE_API_KEY не задан",
                "clown_rating": "N/A",
                "coach_verdict": "Анализ не был произведен.",
                "key_mistakes": [],
                "positioning_review": "N/A",
                "build_review": "N/A",
                "chat_review": "N/A",
                "advice": "Добавьте GOOGLE_API_KEY в окружение."
            }

        parsed_matches.append(deep_match)

    update_matches_storage(parsed_matches, account_summary)

    if parsed_matches and ai_client:
        print("Generating daily Telegram post with Gemini 3.8 Flash...")
        tg_post = generate_daily_telegram_post(parsed_matches, account_summary, ai_client)
        print("Daily Telegram Post:")
        print(tg_post)
        send_to_telegram(tg_post)
    elif parsed_matches:
        simple_text = (
            f"🏆 Итоги дня {PLAYER_NAME} ({len(parsed_matches)} игр):\n"
            f"Винрейт: {account_summary['winrate']}%"
        )
        send_to_telegram(simple_text)

if __name__ == "__main__":
    main()
