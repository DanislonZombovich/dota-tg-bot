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
    const rawHash = window.location.hash.replace("#match_", "").replace("#", "").trim();
    const hashMatch = rawHash ? appState.data.matches.find(m => String(m.match_id) === rawHash) : null;
    if (hashMatch) {
      selectMatch(hashMatch.match_id);
    } else {
      selectMatch(appState.data.matches[0].match_id);
    }
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

  if (window.location.hash !== `#match_${matchId}`) {
    history.replaceState(null, null, `#match_${matchId}`);
  }

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
  renderSwingGraph(match);
  renderLaneMatchup(match);
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

  const maxLvl = Math.max(...skills.map(s => s.level), 1);
  const uniqueAbilities = [];
  const seenAb = new Set();
  skills.forEach(s => {
    if (!seenAb.has(s.ability)) {
      seenAb.add(s.ability);
      uniqueAbilities.push({ ability: s.ability, name: s.name });
    }
  });

  const scrollWrapper = document.createElement("div");
  scrollWrapper.className = "skill-matrix-scroll";

  let tableHtml = `<table class="skill-matrix-table"><thead><tr><th class="skill-matrix-th-name">Способность</th>`;
  for (let lvl = 1; lvl <= maxLvl; lvl++) {
    tableHtml += `<th>${lvl}</th>`;
  }
  tableHtml += `</tr></thead><tbody>`;

  uniqueAbilities.forEach(ab => {
    const isTalent = ab.ability.includes("talent") || ab.name.toLowerCase().includes("talent");
    const isUlt = ab.ability.includes("finger_of_death") || ab.ability.includes("ultimate");
    const pipClass = isTalent ? "talent" : (isUlt ? "ult" : "");

    tableHtml += `<tr><td class="skill-matrix-th-name">${ab.name}</td>`;
    for (let lvl = 1; lvl <= maxLvl; lvl++) {
      const matchLevel = skills.find(s => s.ability === ab.ability && s.level === lvl);
      if (matchLevel) {
        tableHtml += `<td><span class="skill-matrix-pip ${pipClass}">✓</span></td>`;
      } else {
        tableHtml += `<td style="color: rgba(255,255,255,0.1);">·</td>`;
      }
    }
    tableHtml += `</tr>`;
  });

  tableHtml += `</tbody></table>`;
  scrollWrapper.innerHTML = tableHtml;
  container.appendChild(scrollWrapper);

  const listTitle = document.createElement("div");
  listTitle.style.cssText = "margin-top: 16px; margin-bottom: 8px; font-size: 0.82rem; color: var(--text-muted); font-family: var(--font-mono);";
  listTitle.textContent = "Хронологический порядок прокачки:";
  container.appendChild(listTitle);

  const listWrap = document.createElement("div");
  listWrap.style.cssText = "display: flex; flex-direction: column; gap: 6px;";

  skills.forEach(s => {
    const item = document.createElement("div");
    item.className = "skill-item";
    const abUrl = `${ABILITY_CDN}${s.ability}.png`;
    item.innerHTML = `
      <span class="skill-lvl">Lvl ${s.level}</span>
      <img src="${abUrl}" alt="${s.name}" class="skill-icon" onerror="this.src='https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png'">
      <span style="font-size: 0.86rem; font-weight: 600;">${s.name}</span>
    `;
    listWrap.appendChild(item);
  });

  container.appendChild(listWrap);
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

function renderSwingGraph(match) {
  const svg = document.getElementById("swing-chart-svg");
  const badge = document.getElementById("swing-lead-badge");
  if (!svg || !badge) return;

  svg.innerHTML = "";

  const goldAdv = match.radiant_gold_adv || [];
  const xpAdv = match.radiant_xp_adv || [];

  if (goldAdv.length === 0) {
    badge.textContent = "Логи преимущества в обработке";
    badge.style.color = "var(--text-muted)";
    svg.innerHTML = `
      <text x="370" y="120" fill="var(--text-muted)" text-anchor="middle" font-family="var(--font-mono)" font-size="13">
        График преимущества формируется из реплея матча
      </text>
    `;
    return;
  }

  const lastGold = goldAdv[goldAdv.length - 1] || 0;
  const isRadiantLeading = lastGold >= 0;
  badge.textContent = `Исход: ${isRadiantLeading ? "+" : ""}${lastGold.toLocaleString()}g (${isRadiantLeading ? "Radiant" : "Dire"})`;
  badge.style.color = isRadiantLeading ? "var(--neon-green)" : "var(--neon-crimson)";

  const width = 740;
  const height = 240;
  const paddingX = 45;
  const paddingY = 28;
  const zeroY = 120;

  const maxDelta = Math.max(...goldAdv.map(v => Math.abs(v)), ...xpAdv.map(v => Math.abs(v)), 5000);
  const n = goldAdv.length;
  const stepX = (width - paddingX * 2) / Math.max(1, n - 1);

  const zeroLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  zeroLine.setAttribute("x1", paddingX);
  zeroLine.setAttribute("y1", zeroY);
  zeroLine.setAttribute("x2", width - paddingX);
  zeroLine.setAttribute("y2", zeroY);
  zeroLine.setAttribute("stroke", "rgba(255, 255, 255, 0.2)");
  zeroLine.setAttribute("stroke-width", "1");
  zeroLine.setAttribute("stroke-dasharray", "4");
  svg.appendChild(zeroLine);

  const radLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
  radLabel.setAttribute("x", paddingX);
  radLabel.setAttribute("y", 18);
  radLabel.setAttribute("fill", "#00ff88");
  radLabel.setAttribute("font-family", "var(--font-mono)");
  radLabel.setAttribute("font-size", "10");
  radLabel.setAttribute("font-weight", "600");
  radLabel.textContent = `▲ RADIANT (+${maxDelta.toLocaleString()})`;
  svg.appendChild(radLabel);

  const direLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
  direLabel.setAttribute("x", paddingX);
  direLabel.setAttribute("y", height - 8);
  direLabel.setAttribute("fill", "#f43f5e");
  direLabel.setAttribute("font-family", "var(--font-mono)");
  direLabel.setAttribute("font-size", "10");
  direLabel.setAttribute("font-weight", "600");
  direLabel.textContent = `▼ DIRE (-${maxDelta.toLocaleString()})`;
  svg.appendChild(direLabel);

  const goldPoints = [];
  const xpPoints = [];

  for (let i = 0; i < n; i++) {
    const cx = paddingX + i * stepX;
    const gVal = goldAdv[i] || 0;
    const xVal = xpAdv[i] || 0;
    const cyGold = zeroY - (gVal / maxDelta) * (zeroY - paddingY);
    const cyXp = zeroY - (xVal / maxDelta) * (zeroY - paddingY);

    goldPoints.push({ x: cx, y: cyGold, minute: i, val: gVal });
    xpPoints.push({ x: cx, y: cyXp, minute: i, val: xVal });
  }

  const polyPointsGold = goldPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const goldPolyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  goldPolyline.setAttribute("points", polyPointsGold);
  goldPolyline.setAttribute("fill", "none");
  goldPolyline.setAttribute("stroke", "#00ff88");
  goldPolyline.setAttribute("stroke-width", "2");
  svg.appendChild(goldPolyline);

  if (xpPoints.length > 0) {
    const polyPointsXp = xpPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const xpPolyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    xpPolyline.setAttribute("points", polyPointsXp);
    xpPolyline.setAttribute("fill", "none");
    xpPolyline.setAttribute("stroke", "#06b6d4");
    xpPolyline.setAttribute("stroke-width", "1.5");
    xpPolyline.setAttribute("stroke-dasharray", "3,3");
    svg.appendChild(xpPolyline);
  }

  goldPoints.forEach(p => {
    if (p.minute % 5 === 0 || p.minute === n - 1) {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", p.x);
      circle.setAttribute("cy", p.y);
      circle.setAttribute("r", "3.5");
      circle.setAttribute("fill", p.val >= 0 ? "#00ff88" : "#f43f5e");
      circle.setAttribute("stroke", "#0f131c");
      circle.setAttribute("stroke-width", "1.5");

      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${p.minute} мин: ${p.val >= 0 ? "+" : ""}${p.val.toLocaleString()}g`;
      circle.appendChild(title);
      svg.appendChild(circle);

      const tickText = document.createElementNS("http://www.w3.org/2000/svg", "text");
      tickText.setAttribute("x", p.x);
      tickText.setAttribute("y", zeroY + 14);
      tickText.setAttribute("fill", "var(--text-muted)");
      tickText.setAttribute("font-family", "var(--font-mono)");
      tickText.setAttribute("font-size", "9");
      tickText.setAttribute("text-anchor", "middle");
      tickText.textContent = `${p.minute}m`;
      svg.appendChild(tickText);
    }
  });
}

function renderLaneMatchup(match) {
  const container = document.getElementById("lane-matchup-container");
  if (!container) return;
  container.innerHTML = "";

  const stats = match.lane_stats || {};
  const opps = stats.opponents || [];

  if (opps.length === 0) {
    container.innerHTML = `
      <div class="empty-view">
        Данные о противнике на линии (${match.lane_role || "Линия"}) загружаются из реплея.
        <div style="margin-top: 8px; color: var(--neon-cyan); font-family: var(--font-mono); font-size: 0.85rem;">
          Эффективность фарма линии: ${match.lane_efficiency_pct || 65}%
        </div>
      </div>
    `;
    return;
  }

  const heroSlug = match.hero_slug || "hero";
  const userHeroImg = `${HERO_CDN}${heroSlug}.png`;
  const goldDiff = stats.gold_diff_at_10 || 0;
  const isWinning = goldDiff > 0;
  const diffClass = goldDiff > 400 ? "win" : (goldDiff < -400 ? "loss" : "even");

  const oppCardsHtml = opps.map(op => {
    const oppSlug = op.hero_slug || "hero";
    return `
      <div class="lane-card opp">
        <div class="lane-hero-row">
          <img src="${HERO_CDN}${oppSlug}.png" alt="${op.hero_name}" class="lane-avatar" onerror="this.src='https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/pudge.png'">
          <div>
            <strong style="font-family: var(--font-headline); font-size: 0.95rem;">${op.hero_name}</strong>
            <div style="font-size: 0.76rem; color: var(--text-muted); font-family: var(--font-mono);">Оппонент</div>
          </div>
        </div>
        <div class="lane-data-row">
          <span>Крипстат к 10 мин: <strong>${op.lh_at_10} / ${op.dn_at_10}</strong></span>
          <span>Золото к 10 мин: <strong>${op.gold_at_10.toLocaleString()}</strong></span>
        </div>
      </div>
    `;
  }).join("");

  const wrap = document.createElement("div");
  wrap.className = "lane-duel-wrap";
  wrap.innerHTML = `
    <div class="lane-card">
      <div class="lane-hero-row">
        <img src="${userHeroImg}" alt="${match.hero_name}" class="lane-avatar">
        <div>
          <strong style="font-family: var(--font-headline); font-size: 0.95rem;">${match.hero_name}</strong>
          <div style="font-size: 0.76rem; color: var(--neon-cyan); font-family: var(--font-mono);">${match.lane_role || "Mid Lane"}</div>
        </div>
      </div>
      <div class="lane-data-row">
        <span>Крипстат к 10 мин: <strong>${stats.user_lh_at_10} / ${stats.user_dn_at_10}</strong></span>
        <span>Золото к 10 мин: <strong>${stats.user_gold_at_10.toLocaleString()}</strong></span>
      </div>
    </div>

    <div class="lane-vs-badge">
      <div class="lane-vs-circle">VS</div>
      <div style="font-family: var(--font-mono); font-size: 0.8rem; font-weight: 700; color: ${isWinning ? 'var(--neon-green)' : 'var(--neon-crimson)'};">
        ${isWinning ? '+' : ''}${goldDiff.toLocaleString()}g
      </div>
      <span class="lane-result-badge ${diffClass}">${stats.outcome || "Завершен"}</span>
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${oppCardsHtml}
    </div>
  `;

  container.appendChild(wrap);
}

function showToast(text) {
  const toast = document.getElementById("toast-notify");
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add("visible");
  setTimeout(() => {
    toast.classList.remove("visible");
  }, 2500);
}

function copyMatchLink() {
  const url = `${window.location.origin}${window.location.pathname}#match_${appState.selectedMatchId}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast("📋 Ссылка на матч скопирована в буфер!");
    }).catch(() => {
      fallbackCopy(url);
    });
  } else {
    fallbackCopy(url);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  showToast("📋 Ссылка на матч скопирована в буфер!");
}

const shareBtn = document.getElementById("btn-share-match");
if (shareBtn) {
  shareBtn.onclick = copyMatchLink;
}

document.querySelectorAll(".coach-pill").forEach(pill => {
  pill.onclick = () => {
    const input = document.getElementById("coach-user-prompt");
    input.value = pill.dataset.prompt;
    const form = document.getElementById("coach-ask-form");
    if (form) {
      if (form.requestSubmit) {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event("submit", { cancelable: true }));
      }
    }
  };
});

window.addEventListener("DOMContentLoaded", loadData);
