const HERO_CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/";
const ITEM_CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/";
const ABILITY_CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/";

let appState = {
  data: null,
  activeFilter: "all",
  searchQuery: "",
  selectedMatchId: null
};

async function loadData() {
  try {
    const res = await fetch("data/matches.json");
    if (!res.ok) throw new Error("Fetch failed");
    appState.data = await res.json();
  } catch (err) {
    appState.data = {
      player_name: "Данислон Зомбович-Ликвидонов",
      summary: { total_games: 1673, wins: 853, losses: 820, winrate: 50.99 },
      matches: []
    };
  }

  renderProfile();
  renderMatches();
  if (appState.data.matches && appState.data.matches.length > 0) {
    selectMatch(appState.data.matches[0].match_id);
  }
}

function renderProfile() {
  const summary = appState.data.summary || {};
  document.getElementById("stat-winrate").textContent = `${summary.winrate || 50}%`;
  document.getElementById("stat-total").textContent = summary.total_games || 0;
  document.getElementById("stat-wins").textContent = summary.wins || 0;
  document.getElementById("stat-losses").textContent = summary.losses || 0;
  if (appState.data.player_name) {
    document.getElementById("player-name").textContent = appState.data.player_name;
  }
}

function getFilteredMatches() {
  if (!appState.data || !appState.data.matches) return [];
  return appState.data.matches.filter(m => {
    if (appState.activeFilter === "win" && !m.won) return false;
    if (appState.activeFilter === "loss" && m.won) return false;
    if (appState.searchQuery) {
      const q = appState.searchQuery.toLowerCase();
      const hero = (m.hero_name || "").toLowerCase();
      if (!hero.includes(q)) return false;
    }
    return true;
  });
}

function renderMatches() {
  const container = document.getElementById("matches-container");
  container.innerHTML = "";
  const matches = getFilteredMatches();

  if (matches.length === 0) {
    container.innerHTML = "<div class='empty-state'>Игры не найдены</div>";
    return;
  }

  matches.forEach(m => {
    const card = document.createElement("div");
    card.className = `match-card ${m.won ? "win" : "loss"} ${m.match_id === appState.selectedMatchId ? "selected" : ""}`;
    card.onclick = () => selectMatch(m.match_id);

    const heroSlug = m.hero_slug || "hero";
    const heroImgUrl = `${HERO_CDN}${heroSlug}.png`;
    const durMins = Math.floor((m.duration || 0) / 60);

    const itemsHtml = (m.final_items || []).map(itemKey => {
      const itemUrl = `${ITEM_CDN}${itemKey}.png`;
      return `<img src="${itemUrl}" alt="${itemKey}" class="item-icon" onerror="this.style.display='none'">`;
    }).join("");

    const neutralHtml = m.neutral_item
      ? `<img src="${ITEM_CDN}${m.neutral_item}.png" alt="Neutral" class="item-icon neutral" onerror="this.style.display='none'">`
      : "";

    const coachDiagnosis = m.ai_analysis && m.ai_analysis.diagnosis
      ? `<div class="coach-tag">🤖 ${m.ai_analysis.diagnosis}</div>`
      : "";

    card.innerHTML = `
      <div class="match-card-header">
        <div class="hero-block">
          <img src="${heroImgUrl}" alt="${m.hero_name}" class="hero-img" onerror="this.src='https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/pudge.png'">
          <div class="hero-meta">
            <h3>${m.hero_name}</h3>
            <span>${m.lane_role || "Роль N/A"} • ${durMins} мин</span>
          </div>
        </div>
        <span class="outcome-badge ${m.won ? "win" : "loss"}">${m.won ? "Победа" : "Поражение"}</span>
      </div>
      <div class="match-stats-row">
        <span>KDA: <span class="kda-val">${m.kills}/${m.deaths}/${m.assists}</span> (${m.kda})</span>
        <span>GPM: <strong>${m.gpm}</strong></span>
        <span>XPM: <strong>${m.xpm}</strong></span>
      </div>
      <div class="items-row">
        ${itemsHtml}
        ${neutralHtml}
      </div>
      ${coachDiagnosis}
    `;

    container.appendChild(card);
  });
}

function selectMatch(matchId) {
  appState.selectedMatchId = matchId;
  const match = (appState.data.matches || []).find(m => m.match_id === matchId);
  if (!match) return;

  document.querySelectorAll(".match-card").forEach(c => c.classList.remove("selected"));
  const cards = document.querySelectorAll(".match-card");
  matches = getFilteredMatches();
  const idx = matches.findIndex(m => m.match_id === matchId);
  if (idx >= 0 && cards[idx]) {
    cards[idx].classList.add("selected");
  }

  const heroSlug = match.hero_slug || "hero";
  document.getElementById("inspector-hero-img").src = `${HERO_CDN}${heroSlug}.png`;
  document.getElementById("inspector-hero-name").textContent = match.hero_name;
  const durMins = Math.floor((match.duration || 0) / 60);
  document.getElementById("inspector-match-meta").textContent = `ID матча: ${match.match_id} • Длительность: ${durMins} мин • KDA: ${match.kills}/${match.deaths}/${match.assists}`;

  const outcomeBadge = document.getElementById("inspector-outcome");
  outcomeBadge.textContent = match.won ? "Победа" : "Поражение";
  outcomeBadge.className = `outcome-badge ${match.won ? "win" : "loss"}`;

  const ai = match.ai_analysis || {};
  document.getElementById("coach-diagnosis").textContent = ai.diagnosis || "Стандартная игра";
  document.getElementById("coach-rating").textContent = ai.clown_rating || "N/A";
  document.getElementById("coach-verdict").textContent = ai.coach_verdict || "Анализ формируется.";

  const mistakesList = document.getElementById("coach-mistakes");
  mistakesList.innerHTML = "";
  (ai.key_mistakes || []).forEach(err => {
    const li = document.createElement("li");
    li.className = "mistake-item";
    li.textContent = err;
    mistakesList.appendChild(li);
  });

  document.getElementById("coach-positioning").textContent = ai.positioning_review || "Позиционка в норме.";
  document.getElementById("coach-build").textContent = ai.build_review || "Билд стандартный.";
  document.getElementById("coach-chat").textContent = ai.chat_review || "Без сообщений в чате.";
  document.getElementById("coach-advice").textContent = `💡 Совет тренера: ${ai.advice || "Продолжай тренироваться."}`;

  renderSkillBuild(match.skill_build || []);
  renderItemsTimeline(match.purchase_timeline || []);
  renderChatLog(match.chat_log || []);
  renderDeathsLog(match.deaths_log || []);
}

function renderSkillBuild(skills) {
  const container = document.getElementById("skill-grid-container");
  container.innerHTML = "";
  if (skills.length === 0) {
    container.innerHTML = "<div class='empty-state'>Скиллбилд недоступен для этого матча</div>";
    return;
  }

  skills.forEach(s => {
    const row = document.createElement("div");
    row.className = "skill-row";
    const abUrl = `${ABILITY_CDN}${s.ability}.png`;
    row.innerHTML = `
      <span class="skill-level">Lvl ${s.level}</span>
      <img src="${abUrl}" alt="${s.name}" class="skill-img" onerror="this.src='https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png'">
      <span class="skill-name">${s.name}</span>
    `;
    container.appendChild(row);
  });
}

function renderItemsTimeline(timeline) {
  const container = document.getElementById("items-timeline-container");
  container.innerHTML = "";
  if (timeline.length === 0) {
    container.innerHTML = "<div class='empty-state'>Таймлайн покупок пуст</div>";
    return;
  }

  timeline.forEach(t => {
    const itemUrl = `${ITEM_CDN}${t.item}.png`;
    const itemEl = document.createElement("div");
    itemEl.className = "timeline-item";
    itemEl.innerHTML = `
      <span class="timeline-time">${t.time}</span>
      <img src="${itemUrl}" alt="${t.name}" class="timeline-item-img" onerror="this.style.display='none'">
      <span class="timeline-item-name">${t.name}</span>
    `;
    container.appendChild(itemEl);
  });
}

function renderChatLog(chat) {
  const container = document.getElementById("chat-container");
  container.innerHTML = "";
  if (chat.length === 0) {
    container.innerHTML = "<div class='empty-state'>Лог чата пуст или реплей не содержал сообщений</div>";
    return;
  }

  chat.forEach(c => {
    const bubble = document.createElement("div");
    const isUser = (c.sender || "").includes("Данислон");
    bubble.className = `chat-bubble ${isUser ? "user-msg" : ""}`;
    bubble.innerHTML = `
      <div class="chat-bubble-header">
        <span class="chat-sender ${isUser ? "highlight" : ""}">${c.sender} [${c.channel}]</span>
        <span>${c.time}</span>
      </div>
      <div class="chat-text">${c.text}</div>
    `;
    container.appendChild(bubble);
  });
}

function renderDeathsLog(deaths) {
  const container = document.getElementById("deaths-container");
  container.innerHTML = "";
  if (deaths.length === 0) {
    container.innerHTML = "<div class='empty-state'>Смертей не зафиксировано (идеальная игра)</div>";
    return;
  }

  deaths.forEach(d => {
    const row = document.createElement("div");
    row.className = "death-row";
    row.innerHTML = `
      <span class="death-time">⏱ ${d.time}</span>
      <div class="death-info">
        <span class="death-killer">Убит: ${d.killer}</span>
        <span class="death-reason">${d.location} • ${d.reason}</span>
      </div>
    `;
    container.appendChild(row);
  });
}

document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    appState.activeFilter = btn.dataset.filter;
    renderMatches();
  };
});

document.getElementById("hero-search").oninput = (e) => {
  appState.searchQuery = e.target.value;
  renderMatches();
};

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    const tabId = `tab-${btn.dataset.tab}`;
    const target = document.getElementById(tabId);
    if (target) target.classList.add("active");
  };
});

window.addEventListener("DOMContentLoaded", loadData);
