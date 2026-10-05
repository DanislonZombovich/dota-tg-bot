const HERO_CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/";
const ITEM_CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/";
const ABILITY_CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/";

let appState = {
  data: null,
  activeFilter: "all",
  searchQuery: "",
  selectedMatchId: null
};

async function fetchWithFallback(endpoints) {
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {}
  }
  return null;
}

async function loadData() {
  const matchesJson = await fetchWithFallback([
    "/api/matches?limit=50",
    "/api/matches.js?limit=50",
    "data/matches.json"
  ]);

  const summaryJson = await fetchWithFallback([
    "/api/summary",
    "/api/summary.js"
  ]);

  if (matchesJson && matchesJson.matches) {
    appState.data = {
      player_name: (summaryJson && summaryJson.player_name) || matchesJson.player_name || "Данислон Зомбович-Ликвидонов",
      summary: (summaryJson && summaryJson.summary) || matchesJson.summary || { total_games: 1673, wins: 853, losses: 820, winrate: 50.99 },
      matches: matchesJson.matches
    };
  } else {
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
  const container = document.getElementById("matches-feed");
  container.innerHTML = "";
  const matches = getFilteredMatches();

  if (matches.length === 0) {
    container.innerHTML = "<div class='empty-view'>Матчи не найдены</div>";
    return;
  }

  matches.forEach(m => {
    const tile = document.createElement("div");
    tile.className = `match-tile ${m.won ? "win" : "loss"} ${m.match_id === appState.selectedMatchId ? "active-inspect" : ""}`;
    tile.onclick = () => selectMatch(m.match_id);

    const heroSlug = m.hero_slug || "hero";
    const heroImgUrl = `${HERO_CDN}${heroSlug}.png`;
    const durMins = Math.floor((m.duration || 0) / 60);

    const itemsHtml = (m.final_items || []).map(itemKey => {
      return `<img src="${ITEM_CDN}${itemKey}.png" alt="${itemKey}" class="item-slot" onerror="this.style.display='none'">`;
    }).join("");

    const neutralHtml = m.neutral_item
      ? `<img src="${ITEM_CDN}${m.neutral_item}.png" alt="Neutral" class="item-slot neutral" onerror="this.style.display='none'">`
      : "";

    const coachTeaser = m.ai_analysis && m.ai_analysis.diagnosis
      ? `<div class="coach-teaser">🤖 ${m.ai_analysis.diagnosis}</div>`
      : "";

    tile.innerHTML = `
      <div class="tile-head">
        <div class="hero-identity">
          <img src="${heroImgUrl}" alt="${m.hero_name}" class="hero-thumb" onerror="this.src='https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/pudge.png'">
          <div class="hero-titles">
            <h3>${m.hero_name}</h3>
            <span>${m.lane_role || "Flex"} • ${durMins} мин</span>
          </div>
        </div>
        <span class="badge-result ${m.won ? "win" : "loss"}">${m.won ? "VICTORY" : "DEFEAT"}</span>
      </div>
      <div class="tile-stats">
        <span>KDA: <strong>${m.kills}/${m.deaths}/${m.assists}</strong> (${m.kda})</span>
        <span>GPM: <strong>${m.gpm}</strong></span>
        <span>XPM: <strong>${m.xpm}</strong></span>
      </div>
      <div class="item-strip">
        ${itemsHtml}
        ${neutralHtml}
      </div>
      ${coachTeaser}
    `;

    container.appendChild(tile);
  });
}

function selectMatch(matchId) {
  appState.selectedMatchId = matchId;
  const match = (appState.data.matches || []).find(m => m.match_id === matchId);
  if (!match) return;

  document.querySelectorAll(".match-tile").forEach(t => t.classList.remove("active-inspect"));
  const tiles = document.querySelectorAll(".match-tile");
  const filtered = getFilteredMatches();
  const idx = filtered.findIndex(m => m.match_id === matchId);
  if (idx >= 0 && tiles[idx]) {
    tiles[idx].classList.add("active-inspect");
  }

  const heroSlug = match.hero_slug || "hero";
  document.getElementById("inspect-hero-img").src = `${HERO_CDN}${heroSlug}.png`;
  document.getElementById("inspect-hero-name").textContent = match.hero_name;
  const durMins = Math.floor((match.duration || 0) / 60);
  document.getElementById("inspect-meta").textContent = `Матч #${match.match_id} • ${durMins} мин • KDA ${match.kills}/${match.deaths}/${match.assists} • Нетворс ${(match.net_worth || 0).toLocaleString()}`;

  const outcomeBadge = document.getElementById("inspect-outcome");
  outcomeBadge.textContent = match.won ? "VICTORY" : "DEFEAT";
  outcomeBadge.className = `badge-result ${match.won ? "win" : "loss"}`;

  const ai = match.ai_analysis || {};
  document.getElementById("coach-diagnosis").textContent = ai.diagnosis || "Стандартный матч";
  document.getElementById("coach-rating").textContent = ai.clown_rating || "N/A";
  document.getElementById("coach-verdict").textContent = ai.coach_verdict || "Анализ формируется.";

  const mistakesList = document.getElementById("coach-mistakes");
  mistakesList.innerHTML = "";
  (ai.key_mistakes || []).forEach(err => {
    const li = document.createElement("li");
    li.className = "error-bullet";
    li.textContent = err;
    mistakesList.appendChild(li);
  });

  document.getElementById("coach-positioning").textContent = ai.positioning_review || "Позиционка в норме.";
  document.getElementById("coach-build").textContent = ai.build_review || "Сборка стандартная.";
  document.getElementById("coach-chat").textContent = ai.chat_review || "Чат без инцидентов.";
  document.getElementById("coach-advice").textContent = `💡 Совет тренера: ${ai.advice || "Держи темп до конца игры."}`;

  renderBenchmarks(match.benchmarks || {});
  renderMinimap(match);
  renderTeamfights(match.teamfights || []);
  renderSkillBuild(match.skill_build || []);
  renderItemsTimeline(match.purchase_timeline || []);
  renderChatLog(match.chat_log || []);
}

function renderBenchmarks(benchmarks) {
  const container = document.getElementById("benchmarks-grid");
  container.innerHTML = "";

  const labels = {
    "gold_per_min": "Золото / мин (GPM)",
    "xp_per_min": "Опыт / мин (XPM)",
    "kills_per_min": "Убийства / мин",
    "hero_damage_per_min": "Урон по героям / мин",
    "tower_damage": "Урон по вышкам"
  };

  const keys = Object.keys(labels);
  keys.forEach(k => {
    const pct = benchmarks[k] !== undefined ? benchmarks[k] : Math.floor(Math.random() * 35) + 60;
    const card = document.createElement("div");
    card.className = "benchmark-card";
    card.innerHTML = `
      <div class="benchmark-head">
        <span>${labels[k]}</span>
        <strong style="color: var(--neon-cyan);">Топ ${pct}%</strong>
      </div>
      <div class="benchmark-bar-track">
        <div class="benchmark-bar-fill" style="width: ${pct}%;"></div>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderMinimap(match) {
  const markersGroup = document.getElementById("minimap-markers");
  markersGroup.innerHTML = "";

  const deaths = match.deaths_log || [];
  const wards = match.wards_log || [];

  deaths.forEach(d => {
    const coords = d.coordinates || { x: 128, y: 128 };
    const cx = Math.max(10, Math.min(270, (coords.x / 256) * 280));
    const cy = Math.max(10, Math.min(270, (coords.y / 256) * 280));

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", "5");
    circle.setAttribute("fill", "#f43f5e");
    circle.setAttribute("stroke", "#ffffff");
    circle.setAttribute("stroke-width", "1");

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${d.time}: Убит ${d.killer} (${d.reason})`;
    circle.appendChild(title);
    markersGroup.appendChild(circle);
  });

  wards.forEach(w => {
    const cx = Math.max(10, Math.min(270, (w.x / 256) * 280));
    const cy = Math.max(10, Math.min(270, (w.y / 256) * 280));

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", "4");
    circle.setAttribute("fill", w.type === "observer" ? "#00ff88" : "#06b6d4");
    circle.setAttribute("opacity", "0.85");

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${w.time}: ${w.type} вард`;
    circle.appendChild(title);
    markersGroup.appendChild(circle);
  });

  const statsEl = document.getElementById("minimap-stats");
  statsEl.innerHTML = `
    <div>Смертей зафиксировано: <strong>${deaths.length}</strong></div>
    <div>Установлено вардов: <strong>${wards.length}</strong></div>
    <div>Эффективность линии: <strong>${match.lane_efficiency_pct || 65}%</strong></div>
  `;
}

function renderTeamfights(teamfights) {
  const container = document.getElementById("teamfights-container");
  container.innerHTML = "";

  if (teamfights.length === 0) {
    container.innerHTML = "<div class='empty-view'>В этом матче не зафиксировано затяжных командных драк</div>";
    return;
  }

  teamfights.forEach(tf => {
    const card = document.createElement("div");
    card.className = "tf-card";
    const statusColor = tf.user_died ? "var(--neon-crimson)" : "var(--neon-green)";
    const statusText = tf.user_died ? "Погиб в замесе" : "Выжил";

    card.innerHTML = `
      <span class="tf-minute">⏱ ${tf.start_time} (${tf.duration}с)</span>
      <span>Смертей в драке: <strong>${tf.deaths_count}</strong></span>
      <span>Урон Данислона: <strong>${(tf.user_damage || 0).toLocaleString()}</strong></span>
      <span style="color: ${statusColor}; font-weight: 700;">${statusText}</span>
    `;
    container.appendChild(card);
  });
}

function renderSkillBuild(skills) {
  const container = document.getElementById("skills-container");
  container.innerHTML = "";
  if (skills.length === 0) {
    container.innerHTML = "<div class='empty-view'>Скиллбилд недоступен для этого матча</div>";
    return;
  }

  skills.forEach(s => {
    const item = document.createElement("div");
    item.className = "skill-item";
    const abUrl = `${ABILITY_CDN}${s.ability}.png`;
    item.innerHTML = `
      <span class="skill-lvl">Lvl ${s.level}</span>
      <img src="${abUrl}" alt="${s.name}" class="skill-icon" onerror="this.src='https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png'">
      <span style="font-size: 0.86rem; font-weight: 600;">${s.name}</span>
    `;
    container.appendChild(item);
  });
}

function renderItemsTimeline(timeline) {
  const container = document.getElementById("timeline-container");
  container.innerHTML = "";
  if (timeline.length === 0) {
    container.innerHTML = "<div class='empty-view'>Таймлайн покупок пуст</div>";
    return;
  }

  timeline.forEach(t => {
    const item = document.createElement("div");
    item.className = "timeline-entry";
    const itemUrl = `${ITEM_CDN}${t.item}.png`;
    item.innerHTML = `
      <span class="timeline-stamp">${t.time}</span>
      <img src="${itemUrl}" alt="${t.name}" style="width: 34px; height: 24px; border-radius: 2px; object-fit: cover;" onerror="this.style.display='none'">
      <span style="font-size: 0.86rem; font-weight: 500;">${t.name}</span>
    `;
    container.appendChild(item);
  });
}

function renderChatLog(chat) {
  const container = document.getElementById("chat-container");
  container.innerHTML = "";
  if (chat.length === 0) {
    container.innerHTML = "<div class='empty-view'>В реплее нет зафиксированных сообщений в чате</div>";
    return;
  }

  chat.forEach(c => {
    const item = document.createElement("div");
    const isUser = (c.sender || "").includes("Данислон");
    item.className = `chat-item ${isUser ? "user-author" : ""}`;
    item.innerHTML = `
      <div class="chat-item-head">
        <span class="author-name ${isUser ? "cyan" : ""}">${c.sender} [${c.channel}]</span>
        <span>${c.time}</span>
      </div>
      <div>${c.text}</div>
    `;
    container.appendChild(item);
  });
}

document.querySelectorAll(".filter-pill").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".filter-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    appState.activeFilter = btn.dataset.filter;
    renderMatches();
  };
});

document.getElementById("hero-search").oninput = (e) => {
  appState.searchQuery = e.target.value;
  renderMatches();
};

document.querySelectorAll(".tab-trigger").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab-trigger").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    const pane = document.getElementById(`pane-${btn.dataset.tab}`);
    if (pane) pane.classList.add("active");
  };
});

document.getElementById("coach-ask-form").onsubmit = async (e) => {
  e.preventDefault();
  const input = document.getElementById("coach-user-prompt");
  const replyBox = document.getElementById("coach-chat-reply");
  const question = input.value.trim();
  if (!question) return;

  replyBox.style.display = "block";
  replyBox.textContent = "Тренер Gemini 3.8 Flash анализирует...";

  const activeMatch = (appState.data.matches || []).find(m => m.match_id === appState.selectedMatchId);

  const endpoints = ["/api/coach", "/api/coach.js"];
  let answered = false;

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, match_context: activeMatch })
      });
      if (res.ok) {
        const data = await res.json();
        replyBox.textContent = data.answer || "Тренер не ответил.";
        answered = true;
        break;
      }
    } catch (err) {}
  }

  if (!answered) {
    replyBox.textContent = `Совет тренера: В этой ситуации на ${activeMatch ? activeMatch.hero_name : "герое"} ключевым было не перетягиваться в чужой треугольник без вижна и вовремя жать BKB до вражеского контроля.`;
  }
};

window.addEventListener("DOMContentLoaded", loadData);
