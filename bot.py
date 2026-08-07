import os
import requests
import google.generativeai as genai
import datetime
import time

TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN")
TG_CHANNEL_ID = os.environ.get("TG_CHANNEL_ID")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
DOTA_ACCOUNT_ID = os.environ.get("DOTA_ACCOUNT_ID")

def get_dota_stats():
    # 1. Get recent matches
    recent_matches_url = f"https://api.opendota.com/api/players/{DOTA_ACCOUNT_ID}/recentMatches"
    resp = requests.get(recent_matches_url)
    if resp.status_code != 200:
        return "Не удалось получить последние матчи с OpenDota."
    matches = resp.json()

    # 2. Filter matches for the last 24 hours
    now = datetime.datetime.now()
    yesterday = now - datetime.timedelta(days=1)
    
    recent_24h = []
    for m in matches:
        match_time = datetime.datetime.fromtimestamp(m.get('start_time', 0))
        if match_time >= yesterday:
            recent_24h.append(m)
            
    if not recent_24h:
        return "NO_GAMES"

    # 3. Overall stats (win/loss)
    wl_url = f"https://api.opendota.com/api/players/{DOTA_ACCOUNT_ID}/wl"
    wl_resp = requests.get(wl_url)
    wl_data = wl_resp.json() if wl_resp.status_code == 200 else {}
    
    # 4. Heroes mapping
    heroes_url = "https://api.opendota.com/api/heroes"
    heroes_resp = requests.get(heroes_url)
    heroes_dict = {}
    if heroes_resp.status_code == 200:
        for h in heroes_resp.json():
            heroes_dict[h['id']] = h['localized_name']

    # Compile data for AI
    total_wins = wl_data.get('win', 0)
    total_losses = wl_data.get('lose', 0)
    total_games = total_wins + total_losses
    winrate = (total_wins / total_games * 100) if total_games > 0 else 0
    
    stats_text = f"Общая статистика аккаунта:\nИгр: {total_games}, Побед: {total_wins}, Поражений: {total_losses}, Винрейт: {winrate:.2f}%\n\n"
    stats_text += f"Игры за последние 24 часа ({len(recent_24h)} шт):\n"
    
    for i, m in enumerate(recent_24h, 1):
        hero_id = m.get('hero_id')
        hero_name = heroes_dict.get(hero_id, f"Hero_ID_{hero_id}")
        kills = m.get('kills', 0)
        deaths = m.get('deaths', 0)
        assists = m.get('assists', 0)
        gpm = m.get('gold_per_min', 0)
        xpm = m.get('xp_per_min', 0)
        
        # Player is radiant if player_slot < 128. Radiant wins if radiant_win is True.
        player_slot = m.get('player_slot', 0)
        is_radiant = player_slot < 128
        radiant_win = m.get('radiant_win', False)
        
        won = (is_radiant and radiant_win) or (not is_radiant and not radiant_win)
        result = "Победа" if won else "Поражение"
        
        stats_text += f"Игра {i}: {result}, Герой: {hero_name}, KDA: {kills}/{deaths}/{assists}, GPM: {gpm}, XPM: {xpm}\n"

    return stats_text

def analyze_with_ai(stats_text, retries=2):
    genai.configure(api_key=GOOGLE_API_KEY)
    
    # Лесенка моделей по убыванию качества
    models_to_try = [
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash',
        'gemini-1.5-flash'
    ]

    system_prompt = (
        "Ты - элитный киберспортивный аналитик, который пишет пост для Telegram-канала. "
        "Пользователя зовут Данислон Зомбович-Ликвидонов. "
        "Твой стиль: глубокая аналитика, приправленная постиронией и метаиронией. "
        "Используй свои продвинутые способности для максимально глубокого анализа: "
        "делай выводы о его макро и микро игре на основе цифр KDA, GPM и XPM. "
        "Когда Данислон делает крутые вещи, ты его безумно уважаешь, называешь гением, "
        "сравниваешь с победителями The International. "
        "Когда он фидит, умирает или проигрывает, ты стебешься над ним, "
        "но делаешь это уважительно, тонко и смешно, как любящий, но строгий тренер. "
        "Твоя задача — сделать глубокий, интересный и забавный анализ его игр за сегодня "
        "на основе предоставленных данных и упомянуть общую статистику (винрейт). "
        "Пиши текст, готовый для публикации в Telegram, с эмодзи. "
        "Не используй слишком длинные вступления, переходи сразу к сути (к Данислону)."
    )

    prompt = f"{system_prompt}\n\nДанные для анализа:\n{stats_text}"
    
    for attempt in range(retries):
        for model_name in models_to_try:
            try:
                print(f"Trying model {model_name} (attempt {attempt + 1})...")
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(prompt)
                if response and response.text:
                    return response.text
            except Exception as e:
                print(f"Failed with {model_name}: {e}")
        
        if attempt < retries - 1:
            print("Rate limited or error on all models, sleeping for 15 seconds before retry...")
            time.sleep(15)

    return "Не удалось сгенерировать текст нейросетью из-за лимитов API или отсутствия доступа к моделям. Попробуйте позже."

def send_to_telegram(text):
    url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TG_CHANNEL_ID,
        "text": text,
        "parse_mode": "Markdown"
    }
    resp = requests.post(url, json=payload)
    if resp.status_code != 200:
        print(f"Failed to send to TG: {resp.text}")
    else:
        print("Successfully sent message to Telegram!")

def main():
    if not all([TG_BOT_TOKEN, TG_CHANNEL_ID, GOOGLE_API_KEY, DOTA_ACCOUNT_ID]):
        print("Missing environment variables. Make sure variables are set in GitHub Actions.")
        return
        
    print("Fetching Dota 2 stats...")
    stats_text = get_dota_stats()
    
    if stats_text == "NO_GAMES":
        print("No games played today. Exiting without posting.")
        return
        
    if "Не удалось получить" in stats_text:
        print(stats_text)
        return

    print("Stats fetched:")
    print(stats_text)

    print("Analyzing with AI...")
    ai_text = analyze_with_ai(stats_text)
    print("AI output:")
    print(ai_text)
    
    print("Sending to Telegram...")
    send_to_telegram(ai_text)

if __name__ == "__main__":
    main()
