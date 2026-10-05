import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }

  const { question, match_context } = body || {};
  if (!question) {
    return res.status(400).json({ error: "Field 'question' is required." });
  }

  const apiKey = process.env.GOOGLE_API_KEY;

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction = [
        "Ты - элитный постироничный киберспортивный тренер Dota 2 Данислона Зомбовича-Ликвидонова.",
        "Отвечай четко, язвительно, профессионально и с юмором.",
        "Давай практические советы по сборкам предметов, позиционке, драфтам и макро-игре в Dota 2.",
        "Используй дотерский сленг и метаиронию, но сохраняй ценность киберспортивного анализа."
      ].join(" ");

      const contents = match_context
        ? `Контекст матча:\n${JSON.stringify(match_context)}\n\nВопрос игрока: ${question}`
        : `Вопрос игрока: ${question}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7
        }
      });

      return res.status(200).json({ answer: response.text || "Тренер не ответил." });
    } catch (err) {
      console.error(err);
    }
  }

  const heroName = match_context && match_context.hero_name ? match_context.hero_name : "твоем герое";
  const won = match_context ? match_context.won : false;
  const kda = match_context && match_context.kda ? match_context.kda : "нормальный";

  let fallbackAdvice = `Анализ тренера по ${heroName} (KDA: ${kda}): `;
  if (!won) {
    fallbackAdvice += "В проигранной игре ключевой ошибкой было отсутствие своевременного BKB против дизейблов и затяжные соло-перетяжки в чужой лес без вижна. Работай над позиционкой в драках и фокусируйся на контроле Рошана.";
  } else {
    fallbackAdvice += "Победа оформлена уверенно за счет темпа и ранних слотов. Главное — не затягивать игру флексом и сразу ломать строения после выигранных замесов.";
  }

  return res.status(200).json({ answer: fallbackAdvice });
}
