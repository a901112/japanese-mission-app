const VERSION = "Kotoba Trip V1";
const STORE_KEY = "kotobaTripProgress_v1";
const HISTORY_LIMIT = 36;
const $ = (selector) => document.querySelector(selector);

const scenes = [
  {
    id: "morning-train",
    icon: "電",
    title: "早晨電車",
    copy: "聽懂方向、時間、要去哪裡。",
    memory: "に 是目的地，で 是動作舞台。",
    cards: [
      card("train-1", "direction", "你想說：我去車站。", "駅に行きます。", ["駅で行きます。", "駅を行きます。"], "に 標出移動的目的地。", "place_particle"),
      card("train-2", "time", "你想說：七點出門。", "七時に出ます。", ["七時で出ます。", "七時を出ます。"], "具體時間點用 に。", "time_particle"),
      card("train-3", "listen", "聽句子，選意思。", "次の駅で降ります。", ["在下一站下車。", "去下一個車站。"], "で 在這裡標出動作發生地。", "place_particle", true)
    ]
  },
  {
    id: "small-cafe",
    icon: "茶",
    title: "巷口咖啡",
    copy: "點餐、請求、想要什麼。",
    memory: "ください 是請給我；お願いします 更像麻煩你。",
    cards: [
      card("cafe-1", "request", "你想說：請給我水。", "水をください。", ["水がください。", "水にください。"], "要拿到某物時，物品後面常用 を。", "object_particle"),
      card("cafe-2", "want", "你想說：我想喝咖啡。", "コーヒーを飲みたいです。", ["コーヒーが飲みます。", "コーヒーに飲みたいです。"], "たい 接在動詞ます形前，想做的動作對象用 を。", "want_form"),
      card("cafe-3", "sound", "聽句子，選場合。", "お会計をお願いします。", ["結帳時", "搭電車時"], "お会計をお願いします 是請對方幫你結帳。", "restaurant_phrase", true)
    ]
  },
  {
    id: "tiny-hotel",
    icon: "宿",
    title: "小旅館",
    copy: "確認狀態、房間、已經準備好。",
    memory: "ている 是眼前狀態；てある 是有人先弄好了。",
    cards: [
      card("hotel-1", "state", "你想說：門開著。", "ドアが開いています。", ["ドアが開きます。", "ドアを開けています。"], "開いています 描述現在維持開的狀態。", "state_vs_change"),
      card("hotel-2", "prepared", "你想說：窗戶已經開好了。", "窓が開けてあります。", ["窓が開いています。", "窓を開きます。"], "開けてあります 暗示有人事先打開。", "tearu"),
      card("hotel-3", "see", "你想說：從房間看得到海。", "部屋から海が見えます。", ["部屋から海を見ます。", "部屋に海が見せます。"], "見えます 是自然看得到，不是主動看。", "miru_mieru")
    ]
  },
  {
    id: "rainy-shop",
    icon: "店",
    title: "雨天小店",
    copy: "買東西、問價格、描述感覺。",
    memory: "い形容詞直接接名詞；な形容詞接名詞要加な。",
    cards: [
      card("shop-1", "price", "你想說：這個多少錢？", "これはいくらですか。", ["これをいくらですか。", "ここはいくらですか。"], "これは 把眼前物品拿來當話題。", "topic_marker"),
      card("shop-2", "adjective", "你想說：安靜的店。", "静かな店です。", ["静か店です。", "静かい店です。"], "静か 是な形容詞，修飾名詞要加 な。", "na_adjective"),
      card("shop-3", "past", "你想說：昨天很冷。", "昨日は寒かったです。", ["昨日は寒いでした。", "昨日は寒くです。"], "い形容詞過去式是 かったです。", "i_adjective_past")
    ]
  }
];

function card(id, type, prompt, answer, distractors, explanation, family, audio = false) {
  const choices = shuffle([answer, ...distractors]).map((text) => ({ text, correct: text === answer }));
  return { id, type, prompt, answer, choices, explanation, family, audio };
}

const state = {
  view: "home",
  activeSceneId: scenes[0].id,
  deck: [],
  index: 0,
  current: null,
  answered: false,
  sound: true,
  progress: loadProgress()
};

init();

function init() {
  bindEvents();
  renderAll();
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.view === "practice") startSession(state.activeSceneId);
      else showView(button.dataset.view);
    });
  });
  $("#soundToggle").addEventListener("click", () => {
    state.sound = !state.sound;
    $("#soundToggle").classList.toggle("secondary", !state.sound);
  });
  $("#startToday").addEventListener("click", () => startSession(todayScene().id));
  $("#leavePractice").addEventListener("click", () => showView("home"));
  $("#playPrompt").addEventListener("click", () => speak(state.current?.answer));
  $("#notSure").addEventListener("click", () => grade(null));
  $("#nextCard").addEventListener("click", nextCard);
  $("#reviewWeakness").addEventListener("click", startWeaknessReview);
}

function renderAll() {
  renderHome();
  renderNotebook();
  renderMe();
  updateNav();
}

function renderHome() {
  const today = todayScene();
  $("#todayTitle").textContent = today.title;
  $("#todayCopy").textContent = today.copy;
  $("#freshCount").textContent = `${freshCards(allCards()).length} 個新練習`;

  $("#sceneList").innerHTML = scenes.map((scene) => {
    const done = scene.cards.filter((item) => state.progress.seen[item.id]).length;
    return `
      <button class="scene-card" type="button" data-scene="${scene.id}">
        <span class="scene-art">${scene.icon}</span>
        <span>
          <strong>${escapeHtml(scene.title)}</strong>
          <small>${escapeHtml(scene.copy)}</small>
        </span>
        <span class="scene-count">${done}/${scene.cards.length}</span>
      </button>
    `;
  }).join("");
  document.querySelectorAll("[data-scene]").forEach((button) => {
    button.addEventListener("click", () => startSession(button.dataset.scene));
  });

  $("#memoryBoard").innerHTML = scenes.map((scene) => `
    <div class="memory-chip">
      <strong>${escapeHtml(scene.title)}</strong>
      <span>${escapeHtml(scene.memory)}</span>
    </div>
  `).join("");
}

function startSession(sceneId) {
  const scene = scenes.find((item) => item.id === sceneId) || scenes[0];
  state.activeSceneId = scene.id;
  state.deck = pickDeck(scene.cards, 5);
  state.index = 0;
  state.answered = false;
  showView("practice");
  renderPractice();
}

function startWeaknessReview() {
  const weakFamilies = Object.keys(state.progress.weakness);
  if (!weakFamilies.length) {
    startSession(state.activeSceneId);
    return;
  }
  const pool = allCards().filter((item) => weakFamilies.includes(item.family));
  state.deck = pickDeck(pool, 6);
  state.index = 0;
  state.answered = false;
  showView("practice");
  renderPractice("換句複習");
}

function renderPractice(title = "小劇情練習") {
  const cardItem = state.deck[state.index];
  state.current = cardItem;
  state.answered = false;
  const scene = scenes.find((item) => item.cards.some((cardEntry) => cardEntry.id === cardItem.id));
  $("#practiceScene").textContent = scene?.title || "Review";
  $("#practiceTitle").textContent = title;
  $("#practiceProgress").textContent = `${state.index + 1}/${state.deck.length}`;
  $("#promptMode").textContent = labelFor(cardItem.type);
  $("#promptText").textContent = cardItem.prompt;
  $("#promptHint").textContent = cardItem.audio ? "先聽，再選意思。答錯下次會換一句同概念的題。" : "選最自然的日文。答錯下次會換題練同一個語感。";
  $("#feedback").classList.add("hidden");
  $("#feedback").innerHTML = "";
  $("#choiceArea").innerHTML = cardItem.choices.map((choice) => `
    <button class="choice-button" type="button" data-choice="${escapeHtml(choice.text)}">${escapeHtml(choice.text)}</button>
  `).join("");
  document.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => grade(button.dataset.choice));
  });
  if (cardItem.audio) speak(cardItem.answer);
}

function grade(choiceText) {
  if (!state.current || state.answered) return;
  state.answered = true;
  const ok = choiceText === state.current.answer;
  rememberSeen(state.current.id);

  document.querySelectorAll(".choice-button").forEach((button) => {
    if (button.dataset.choice === state.current.answer) button.classList.add("correct");
    if (choiceText && button.dataset.choice === choiceText && !ok) button.classList.add("wrong");
  });

  if (ok) {
    state.progress.correct += 1;
    const weak = state.progress.weakness[state.current.family];
    if (weak) {
      weak.streak += 1;
      if (weak.streak >= 2) delete state.progress.weakness[state.current.family];
    }
  } else {
    state.progress.weakness[state.current.family] = {
      family: state.current.family,
      lastCardId: state.current.id,
      lastPrompt: state.current.prompt,
      answer: state.current.answer,
      explanation: state.current.explanation,
      streak: 0
    };
  }
  state.progress.total += 1;
  state.progress.lastDate = todayKey();
  saveProgress();

  $("#feedback").classList.remove("hidden");
  $("#feedback").innerHTML = `
    <strong>${ok ? "答對" : "這次先記住語感"}</strong><br>
    正解：${escapeHtml(state.current.answer)}<br>
    ${escapeHtml(state.current.explanation)}<br>
    ${ok ? "很好，下一題會避開重複。" : "錯題本會用同概念換一句再考。"}
  `;
  renderNotebook();
  renderMe();
}

function nextCard() {
  if (state.index >= state.deck.length - 1) {
    showView("home");
    renderAll();
    return;
  }
  state.index += 1;
  renderPractice();
}

function pickDeck(pool, limit) {
  const fresh = freshCards(pool);
  const used = pool.filter((item) => state.progress.history.includes(item.id));
  return [...shuffle(fresh), ...shuffle(used)].slice(0, limit);
}

function freshCards(pool) {
  const recent = new Set(state.progress.history.slice(0, HISTORY_LIMIT));
  return pool.filter((item) => !recent.has(item.id));
}

function allCards() {
  return scenes.flatMap((scene) => scene.cards);
}

function rememberSeen(id) {
  state.progress.seen[id] = true;
  state.progress.history = [id, ...state.progress.history.filter((item) => item !== id)].slice(0, HISTORY_LIMIT);
}

function renderNotebook() {
  const items = Object.values(state.progress.weakness);
  $("#weaknessList").innerHTML = items.length ? items.map((item) => `
    <div class="note-item">
      <strong>${escapeHtml(item.family)}</strong>
      上次卡住：${escapeHtml(item.lastPrompt)}<br>
      正解：${escapeHtml(item.answer)}<br>
      ${escapeHtml(item.explanation)}
    </div>
  `).join("") : `<div class="note-item"><strong>目前沒有錯題</strong>答錯後，這裡會留下語感弱點，下一次用不同句子練。</div>`;
}

function renderMe() {
  const total = state.progress.total;
  const rate = total ? Math.round((state.progress.correct / total) * 100) : 0;
  $("#streakText").textContent = `${state.progress.lastDate === todayKey() ? 1 : 0} 天`;
  $("#profileSummary").textContent = total ? `做過 ${total} 題，答對率 ${rate}%。` : "今天還沒開始。";
  $("#statsList").innerHTML = `
    <div class="note-item"><strong>練習量</strong>總共 ${total} 題，最近會避開 ${Math.min(state.progress.history.length, HISTORY_LIMIT)} 題。</div>
    <div class="note-item"><strong>語感弱點</strong>${Object.keys(state.progress.weakness).length} 個概念正在複習。</div>
    <div class="note-item"><strong>版本</strong>${VERSION}，完全不讀舊題庫。</div>
  `;
}

function showView(view) {
  state.view = view;
  document.querySelectorAll(".view").forEach((section) => section.classList.add("hidden"));
  $(`#${view}View`).classList.remove("hidden");
  updateNav();
}

function updateNav() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
}

function todayScene() {
  const index = new Date().getDate() % scenes.length;
  return scenes[index];
}

function labelFor(type) {
  return {
    direction: "方向",
    time: "時間",
    listen: "聽力",
    request: "請求",
    want: "想做",
    sound: "場合",
    state: "狀態",
    prepared: "準備",
    see: "感官",
    price: "購物",
    adjective: "形容詞",
    past: "過去"
  }[type] || "語感";
}

function speak(text) {
  if (!state.sound || !text || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = .86;
  speechSynthesis.speak(utterance);
}

function loadProgress() {
  const fallback = { total: 0, correct: 0, history: [], seen: {}, weakness: {}, lastDate: null };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    return saved ? { ...fallback, ...saved, history: saved.history || [], seen: saved.seen || {}, weakness: saved.weakness || {} } : fallback;
  } catch {
    return fallback;
  }
}

function saveProgress() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state.progress));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function shuffle(items) {
  return items.map((value) => ({ value, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ value }) => value);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}
