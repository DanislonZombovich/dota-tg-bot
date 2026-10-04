import os
import sys
import json
import time
import datetime
import requests
from google import genai
from google.genai import types

TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN")
TG_CHANNEL_ID = os.environ.get("TG_CHANNEL_ID")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
DOTA_ACCOUNT_ID = os.environ.get("DOTA_ACCOUNT_ID")
SITE_URL = os.environ.get("SITE_URL", "https://danislonzombovich.github.io/dota-tg-bot/")

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

    chat_log = []
    raw_chat = data.get("chat", [])
    slot_to_hero = {}
    for p in players:
        p_slot = p.get("player_slot")
        p_h_id = p.get("hero_id")
        p_h_info = heroes_map.get(str(p_h_id), {})
        slot_to_hero[p_slot] = {
            "name": p_h_info.get("localized_name", "Unknown"),
            "slug": p_h_info.get("name", "hero")
        }

    for c in raw_chat:
        c_type = c.get("type", "chat")
        c_time = format_time(c.get("time", 0))
        c_slot = c.get("player_slot", c.get("slot"))
        sender_info = slot_to_hero.get(c_slot, {"name": "Player", "slug": "hero"})
        sender_is_user = str(c_slot) == str(player_slot)
        sender_hero_name = sender_info["name"]
        sender_label = f"Данислон ({sender_hero_name})" if sender_is_user else sender_hero_name

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
        "lane_outcome": "Завершен",
        "final_items": final_items,
        "neutral_item": neutral_item,
        "purchase_timeline": purchase_timeline,
        "skill_build": skill_build,
        "chat_log": chat_log,
        "deaths_log": deaths_log
    }

def analyze_match_with_ai(match_info, client):
    models = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"]
    system_instruction = (
        "Ты - элитный киберспортивный аналитик и постироничный тренер Dota 2. "
        "Игрока зовут Данислон Зомбович-Ликвидонов. "
        "Проведи глубокий разбор конкретного матча на основе статистики, предметов, скиллбилда, логов смертей и чата. "
        "Формат вывода: СТРОГО валидный JSON со следующими полями: "
        "{"
        "\"diagnosis\": \"краткий язвительный диагноз игры\","
        "\"clown_rating\": \"оценка из 1000 (например: 322 / 1000 или 980 / 1000 TI God)\","
        "\"coach_verdict\": \"развернутый анализ микро и макро игры\","
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
    models = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"]
    system_instruction = (
        "Ты - элитный киберспортивный аналитик для Telegram-канала. "
        "Пользователя зовут Данислон Зомбович-Ликвидонов. "
        "Твой стиль: глубокая аналитика, приправленная постиронией и метаиронией. "
        "Похвали за гениальные моменты и высокий KDA/урон, и жестко, но смешно простеби за фид, низкий урон по зданиям и странные решения. "
        "Обязательно упомяни общую статистику (винрейт), разбери каждую игру за день. "
        "В конце поста ОБЯЗАТЕЛЬНО добавь строку с ссылкой на сайт с интерактивным разбором билдов, чата и позиционки: "
        f"🌐 Подробный разбор билдов, чата и позиционки на сайте: {SITE_URL}"
    )

    summary_payload = {
        "account_summary": account_summary,
        "matches": matches
    }
    prompt = f"Данные для ежедневного отчета:\n{json.dumps(summary_payload, ensure_ascii=False, indent=2)}"

    for model_name in models:
        try:
            resp = client.models.generate_content(
                model=model_name,
                contents=f"{system_instruction}\n\n{prompt}"
            )
            if resp and resp.text:
                return resp.text
        except Exception as e:
            print(f"Telegram post generation failed with {model_name}: {e}")

    lines = [
        "🏆 Итоги дня Данислона Зомбовича-Ликвидонова:",
        f"Игр за сегодня: {len(matches)}",
        f"Винрейт аккаунта: {account_summary.get('winrate', 50):.2f}%",
        "",
        f"🌐 Подробный разбор билдов, чата и позиционки на сайте: {SITE_URL}"
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

def update_matches_storage(new_matches, account_summary):
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(data_dir, exist_ok=True)
    matches_file = os.path.join(data_dir, "matches.json")

    existing_data = {
        "account_id": str(DOTA_ACCOUNT_ID),
        "player_name": "Данислон Зомбович-Ликвидонов",
        "last_updated": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "site_url": SITE_URL,
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

    web_data_dir = os.path.join(os.path.dirname(__file__), "web", "data")
    os.makedirs(web_data_dir, exist_ok=True)
    web_matches_file = os.path.join(web_data_dir, "matches.json")
    with open(web_matches_file, "w", encoding="utf-8") as f:
        json.dump(existing_data, f, ensure_ascii=False, indent=2)

    print(f"Saved {len(existing_matches)} matches to storage.")

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
            f"🏆 Итоги дня Данислона ({len(parsed_matches)} игр):\n"
            f"Винрейт: {account_summary['winrate']}%\n"
            f"🌐 Интерактивный разбор доступен на сайте: {SITE_URL}"
        )
        send_to_telegram(simple_text)

if __name__ == "__main__":
    main()
