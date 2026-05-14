const APP_VERSION = "Japanese Sense Trainer V5 Level";
const STORE_KEY = "japaneseSenseTrainerV2";
const MISSION_STORE_KEY = "japaneseMissionProgress_v1";
const QUESTION_HISTORY_KEY = "japaneseQuestionHistory_v1";
const RECENT_QUESTION_LIMIT = 45;
const RAW_QUESTION_BASE = "https://raw.githubusercontent.com/a901112/japanese-mission-app/main/data/questions/";
const RAW_DATA_BASE = "https://raw.githubusercontent.com/a901112/japanese-mission-app/main/data/";
const $ = (selector) => document.querySelector(selector);

const state = {
  questions: [],
  draft: [],
  rejected: [],
  flagged: [],
  auditReport: null,
  queue: [],
  index: 0,
  current: null,
  answered: false,
  progress: loadProgress(),
  questionHistory: loadQuestionHistory(),
  missionProgress: loadMissionProgress(),
  missions: [],
  missionPaths: [],
  knowledgePoints: [],
  vocabularyCategories: [],
  vocabularyItems: [],
  homeType: "grammar",
  selectedLevel: "N5",
  selectedVocabCategory: null,
  currentView: "home"
};

init();

async function init() {
  bindEvents();
  await Promise.all([loadBank(), loadMissionData()]);
  renderHome();
  renderWeakness();
  renderStats();
  renderDebug();
  registerWorker();
}

// ─── 資料載入 ───────────────────────────────────────────────

async function loadBank() {
  const [published, draft, rejected, flagged] = await Promise.all([
    fetchJson("./data/questions/published_questions.json"),
    fetchJson("./data/questions/draft_questions.json"),
    fetchJson("./data/questions/rejected_questions.json"),
    fetchJson("./data/questions/flagged_questions.json")
  ]);
  const audited = published.map((question) => ({ question, audit: auditQuestion(question) }));
  state.auditReport = buildAuditReport(audited);
  state.questions = audited
    .filter((item) => item.question.status === "published" && item.audit.pass)
    .map((item) => item.question);
  state.draft = draft.length ? draft : buildGeneratedBank().draft;
  state.rejected = rejected;
  state.flagged = flagged;
}

async function loadMissionData() {
  const [missions, paths, kps, vocabCategories, vocabItems] = await Promise.all([
    fetchJson("./data/missions/missions.json"),
    fetchJson("./data/missions/mission_paths.json"),
    fetchJson("./data/knowledge/knowledge_points.json"),
    fetchJson("./data/vocabulary/vocabulary_categories.json"),
    fetchJson("./data/vocabulary/vocabulary_items.json")
  ]);
  state.missions = missions;
  state.missionPaths = paths;
  state.knowledgePoints = kps;
  state.vocabularyCategories = vocabCategories;
  state.vocabularyItems = vocabItems;
  state.selectedVocabCategory = vocabCategories[0]?.id || null;
  syncMissionUnlocks();
}

async function fetchJson(path) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(path);
    return response.json();
  } catch {
    const fileName = path.split("/").pop();
    if (!fileName) return [];
    // 嘗試從 GitHub raw 抓
    const rawBase = path.includes("/data/questions/") ? RAW_QUESTION_BASE : RAW_DATA_BASE + path.replace("./data/", "").replace(fileName, "");
    try {
      const response = await fetch(rawBase + fileName, { cache: "no-store" });
      if (!response.ok) throw new Error(fileName);
      return response.json();
    } catch {
      return [];
    }
  }
}

// ─── 事件綁定 ─────────────────────────────────────────────

function bindEvents() {
  $(".tabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");
    if (button) showView(button.dataset.view);
  });
  document.querySelectorAll("[data-start]").forEach((button) => {
    button.addEventListener("click", () => startPractice(button.dataset.start));
  });
  document.querySelectorAll("[data-home-type]").forEach((button) => {
    button.addEventListener("click", () => {
      state.homeType = button.dataset.homeType;
      renderHome();
    });
  });
  $("#levelGrid")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-level]");
    if (!button) return;
    state.selectedLevel = button.dataset.level;
    const levelSelect = $("#jlptFilter");
    if (levelSelect) levelSelect.value = state.selectedLevel;
    renderHome();
  });
  $("#vocabularyGrid")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-vocab-category]");
    if (!button) return;
    state.selectedVocabCategory = button.dataset.vocabCategory;
    renderVocabulary();
  });
  $("#jlptFilter")?.addEventListener("change", (event) => {
    state.selectedLevel = event.target.value;
    renderHome();
  });
  $("#sceneFilter").addEventListener("change", renderHome);
  $("#backHome").addEventListener("click", () => showView("home"));
  $("#reviewWeakButton").addEventListener("click", () => startPractice("weak_review"));
  $("#unknownButton").addEventListener("click", markUnknown);
  $("#nextButton").addEventListener("click", nextQuestion);
  $("#playBefore").addEventListener("click", playBefore);
  $("#playAnswer").addEventListener("click", () => speak(answerText(state.current), 0.9));
  $("#playSlow").addEventListener("click", () => speak(answerText(state.current), 0.58));
}

// ─── 視圖控制 ─────────────────────────────────────────────

function showView(view) {
  state.currentView = view;
  document.querySelectorAll(".tabs button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".view").forEach((section) => section.classList.add("hidden"));
  $(`#${view}View`).classList.remove("hidden");
  if (view === "home") renderHome();
  if (view === "weakness") renderWeakness();
  if (view === "stats") renderStats();
  if (view === "debug") renderDebug();
}

// ─── 首頁渲染 ─────────────────────────────────────────────

function renderHome() {
  const filtered = filteredQuestions();
  const grammarCount = filteredMissions("grammar").length;
  const vocabularyMissionCount = filteredMissions("vocabulary").length;
  const listeningCount = filteredMissions("listening").length;
  renderLevels();
  if ($("#grammarSummary")) {
    $("#grammarSummary").textContent = `${grammarCount} 任務`;
  }
  if ($("#vocabularySummary")) {
    $("#vocabularySummary").textContent = `${filteredVocabularyItems().length} 字 · ${vocabularyMissionCount + listeningCount} 任務`;
  }
  $("#bankStatus").textContent = state.questions.length
    ? `Published 題庫：${state.questions.length} 題；目前篩選可練 ${filtered.length} 題。`
    : "目前沒有通過審核的題目，請先建立 published 題庫。";
  $("#policyStatus").textContent = "答題前依 audio_policy 控制發音；非聽力題不播放完整正解句，答題後才開放正解與慢速。";
  document.querySelectorAll("[data-home-type]").forEach((button) => {
    button.classList.toggle("active", button.dataset.homeType === state.homeType);
  });
  $("#grammarHomePanel").classList.toggle("hidden", state.homeType !== "grammar");
  $("#vocabularyHomePanel").classList.toggle("hidden", state.homeType !== "vocabulary");
  renderMissions();
  renderVocabulary();
}

function renderLevels() {
  const grid = $("#levelGrid");
  if (!grid) return;
  const levels = ["N5", "N4", "N3", "N2", "N1"];
  grid.innerHTML = levels.map((level) => {
    const missionCount = state.missions.filter((mission) => mission.level === level).length;
    const wordCount = state.vocabularyItems.filter((item) => item.level === level || item.jlpt === level).length;
    const active = state.selectedLevel === level;
    return `
      <button class="level-card ${active ? "active" : ""}" data-level="${level}" type="button">
        <strong>${level}</strong>
        <span>${missionCount} 任務 · ${wordCount} 字</span>
      </button>
    `;
  }).join("");
  $("#levelSummary").textContent = `${state.selectedLevel} · 最近 ${state.questionHistory.recent_question_ids.length} 題會避開重出`;
}

function filteredMissions(type) {
  return state.missions.filter((mission) => {
    const typeMatch = type ? mission.type === type : true;
    const levelMatch = !state.selectedLevel || state.selectedLevel === "all" || mission.level === state.selectedLevel;
    return typeMatch && levelMatch;
  });
}

function filteredVocabularyItems() {
  return state.vocabularyItems.filter((item) => !state.selectedLevel || state.selectedLevel === "all" || item.level === state.selectedLevel || item.jlpt === state.selectedLevel);
}

function renderMissions() {
  const container = $("#missionGrid");
  if (!container || !state.missions.length) return;

  const mp = state.missionProgress;
  const missions = filteredMissions("grammar");

  container.innerHTML = missions.length ? missions.map((mission) => {
    const prog = mp.mission_progress[mission.id] || {};
    const isUnlocked = mp.unlocked_missions.includes(mission.id);
    const isCompleted = mp.completed_missions.includes(mission.id);
    const status = isCompleted ? "completed" : isUnlocked ? "unlocked" : "locked";

    const questionCount = mission.question_ids ? mission.question_ids.length : 0;
    const availableCount = mission.question_ids
      ? mission.question_ids.filter(id => state.questions.find(q => q.id === id)).length
      : 0;

    const statusIcon = isCompleted ? "完成" : isUnlocked ? "開始" : "鎖定";
    const statusLabel = isCompleted ? "已完成" : isUnlocked ? "可挑戰" : "鎖定中";

    const bestScore = prog.best_score != null ? `最高 ${prog.best_score}/${questionCount}` : "";
    const attempts = prog.attempts ? `挑戰 ${prog.attempts} 次` : "";

    return `
      <button class="mission-card mission-${status}" 
        ${isUnlocked ? `onclick="startMission('${mission.id}')"` : "disabled"}
        type="button">
        <div class="mission-card-header">
          <span class="mission-status-icon">${statusIcon}</span>
          <span class="mission-level">N${mission.level.replace("N","")}</span>
        </div>
        <strong class="mission-title">${escapeHtml(mission.title)}</strong>
        <span class="mission-subtitle">${escapeHtml(mission.subtitle)}</span>
        <div class="mission-hook">${escapeHtml(mission.memory_hook)}</div>
        <div class="mission-footer">
          <span class="mission-status-label">${statusLabel}</span>
          <span class="mission-meta">${availableCount} 題可練${bestScore ? " · " + bestScore : ""}${attempts ? " · " + attempts : ""}</span>
        </div>
      </button>
    `;
  }).join("") : `<div class="empty-panel">這個等級目前沒有文法任務，請先選 N5 或 N4。</div>`;
}

function renderVocabulary() {
  const grid = $("#vocabularyGrid");
  const list = $("#vocabularyList");
  if (!grid || !list) return;
  if (!state.vocabularyCategories.length) {
    grid.innerHTML = `<div class="list-item">目前沒有單詞分類資料。</div>`;
    list.innerHTML = "";
    return;
  }

  if (!state.selectedVocabCategory) {
    state.selectedVocabCategory = state.vocabularyCategories[0].id;
  }

  const levelWords = filteredVocabularyItems();
  grid.innerHTML = state.vocabularyCategories.map((category) => {
    const count = levelWords.filter((item) => (item.categories || []).includes(category.id)).length;
    if (!count) return "";
    const active = category.id === state.selectedVocabCategory;
    return `
      <button class="vocab-card ${active ? "active" : ""}" data-vocab-category="${escapeHtml(category.id)}" type="button">
        <span class="vocab-icon">${escapeHtml(category.icon || "□")}</span>
        <strong>${escapeHtml(category.title)}</strong>
        <small>${escapeHtml(category.level || "")} · ${count} 個單字</small>
      </button>
    `;
  }).join("");

  let words = levelWords.filter((item) => (item.categories || []).includes(state.selectedVocabCategory));
  if (!words.length) {
    const firstAvailable = state.vocabularyCategories.find((category) => levelWords.some((item) => (item.categories || []).includes(category.id)));
    state.selectedVocabCategory = firstAvailable?.id || null;
    words = levelWords.filter((item) => (item.categories || []).includes(state.selectedVocabCategory));
  }
  const category = state.vocabularyCategories.find((item) => item.id === state.selectedVocabCategory);
  list.innerHTML = words.length ? `
    <div class="vocab-list-head">
      <strong>${escapeHtml(category?.title || "單詞")}</strong>
      <span>${words.length} 個單字</span>
    </div>
    ${words.map((word) => `
      <div class="vocab-item">
        <div>
          <strong>${escapeHtml(word.jp)}</strong>
          <span>${escapeHtml(word.kana || "")}</span>
        </div>
        <p>${escapeHtml(word.zh || "")}</p>
        <small>${escapeHtml(word.example?.jp || "")}${word.example_zh ? " / " + escapeHtml(word.example_zh) : ""}</small>
      </div>
    `).join("")}
  ` : `<div class="list-item">這個分類目前還沒有單字。</div>`;
}

// ─── Mission 系統 ─────────────────────────────────────────

function startMission(missionId) {
  const mission = state.missions.find(m => m.id === missionId);
  if (!mission) return;

  // 從 published 題庫中篩出這個 mission 的題目
  const missionQuestions = mission.question_ids
    ? mission.question_ids.map(id => state.questions.find(q => q.id === id)).filter(Boolean)
    : [];

  if (!missionQuestions.length) {
    // fallback：用 engine 篩選
    const engine = mission.type === "grammar" ? "grammar_arrangement" : "verb_sense";
    const fallback = filteredQuestions().filter(q => q.engine === engine);
    if (!fallback.length) {
      alert("這個任務目前沒有可用的題目，請確認題庫已載入。");
      return;
    }
    launchQueue(selectPracticeQueue(fallback, 10), missionId);
    return;
  }

  launchQueue(selectPracticeQueue(missionQuestions, 10), missionId);
}

function launchQueue(queue, missionId = null) {
  state.queue = queue;
  state.index = 0;
  state.activeMissionId = missionId;
  state.sessionCorrect = 0;
  showView("practice");
  renderQuestion();
}

function syncMissionUnlocks() {
  if (!state.missions.length) return;
  const mp = state.missionProgress;

  // 確保第一個任務永遠解鎖
  const firstMission = state.missions[0];
  if (firstMission && !mp.unlocked_missions.includes(firstMission.id)) {
    mp.unlocked_missions.push(firstMission.id);
  }

  // 根據 completed_missions 解鎖後續任務
  state.missions.forEach(mission => {
    const cond = mission.unlock_condition;
    if (!cond) return;
    if (cond.type === "default_unlocked") {
      if (!mp.unlocked_missions.includes(mission.id)) mp.unlocked_missions.push(mission.id);
    }
    if (cond.type === "complete_mission") {
      const allDone = (cond.mission_ids || []).every(id => mp.completed_missions.includes(id));
      if (allDone && !mp.unlocked_missions.includes(mission.id)) {
        mp.unlocked_missions.push(mission.id);
      }
    }
  });

  saveMissionProgress();
}

function completeMission(missionId, correctCount) {
  const mission = state.missions.find(m => m.id === missionId);
  if (!mission) return;

  const mp = state.missionProgress;
  const minCorrect = mission.completion_rule?.min_correct || 1;
  const passed = correctCount >= minCorrect;

  // 更新 mission_progress
  const existing = mp.mission_progress[missionId] || { attempts: 0, best_score: 0 };
  existing.attempts = (existing.attempts || 0) + 1;
  existing.best_score = Math.max(existing.best_score || 0, correctCount);
  existing.last_attempted_at = new Date().toISOString().slice(0, 10);

  if (passed) {
    existing.status = "completed";
    existing.completed_at = new Date().toISOString().slice(0, 10);
    if (!mp.completed_missions.includes(missionId)) {
      mp.completed_missions.push(missionId);
    }
    // 解鎖下一關
    const rewards = mission.reward?.unlock_mission_ids || [];
    rewards.forEach(id => {
      if (!mp.unlocked_missions.includes(id)) mp.unlocked_missions.push(id);
    });
  } else {
    existing.status = "in_progress";
  }

  mp.mission_progress[missionId] = existing;
  saveMissionProgress();
}

// ─── 題目練習（保留原有邏輯） ──────────────────────────────

function filteredQuestions() {
  const jlpt = state.selectedLevel || $("#jlptFilter")?.value || "all";
  const scene = $("#sceneFilter").value;
  return state.questions.filter((question) => {
    const jlptMatch = jlpt === "all" || question.jlpt_tag === jlpt;
    const sceneMatch = scene === "all" || question.scene_tags.includes(scene);
    return jlptMatch && sceneMatch;
  });
}

function startPractice(engine) {
  const source = engine === "weak_review" ? weakReviewQueue() : filteredQuestions().filter((question) => question.engine === engine);
  const queue = selectPracticeQueue(source, 10);
  if (!queue.length) {
    alert(state.questions.length ? "目前沒有符合條件的題目。" : "目前沒有通過審核的題目，請先建立 published 題庫。");
    return;
  }
  launchQueue(queue);
}

function weakReviewQueue() {
  const weakTags = Object.keys(state.progress.weaknesses).filter((tag) => state.progress.weaknesses[tag].status !== "mastered");
  if (!weakTags.length) return filteredQuestions();
  const recentWrongIds = new Set(Object.values(state.progress.weaknesses).map((item) => item.last_question_id).filter(Boolean));
  const candidates = filteredQuestions().filter((question) => question.weakness_tags.some((tag) => weakTags.includes(tag)));
  return candidates.sort((a, b) => {
    const aRepeatedWrong = recentWrongIds.has(a.id) ? 1 : 0;
    const bRepeatedWrong = recentWrongIds.has(b.id) ? 1 : 0;
    return aRepeatedWrong - bRepeatedWrong;
  });
}

function selectPracticeQueue(source, limit = 10) {
  const recentIds = new Set(state.questionHistory.recent_question_ids || []);
  const unique = Array.from(new Map(source.map((question) => [question.id, question])).values());
  const fresh = unique.filter((question) => !recentIds.has(question.id));
  const recent = unique.filter((question) => recentIds.has(question.id));
  return shuffle(fresh).concat(shuffle(recent)).slice(0, limit);
}

function renderQuestion() {
  const question = state.queue[state.index];
  state.current = question;
  state.answered = false;
  $("#questionMeta").textContent = `${engineLabel(question.engine)} · ${question.jlpt_tag} · ${question.scene_tags.join(" / ")}`;
  $("#questionType").textContent = typeLabel(question.question_type);
  $("#questionProgress").textContent = `${state.index + 1} / ${state.queue.length}`;
  $("#questionInstruction").textContent = "選出最符合目標語感的日文。";
  $("#questionText").textContent = question.prompt;
  $("#feedbackPanel").classList.add("hidden");
  $("#feedbackPanel").innerHTML = "";
  $("#playAnswer").disabled = true;
  $("#playSlow").disabled = true;
  renderTokens(question);
  renderAnswers(question);
}

function renderTokens(question) {
  const tokenArea = $("#tokenArea");
  tokenArea.innerHTML = "";
  $("#buildArea").classList.add("hidden");
  (question.choices || []).forEach((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${choice.text} 🔊`;
    button.addEventListener("click", () => speak(choice.text, 0.85));
    tokenArea.appendChild(button);
  });
}

function renderAnswers(question) {
  const area = $("#answerArea");
  area.innerHTML = "";
  question.choices.forEach((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = choice.text;
    button.addEventListener("click", () => gradeChoice(choice.id, button));
    area.appendChild(button);
  });
}

function gradeChoice(choiceId, button) {
  if (state.answered) return;
  const selected = state.current.choices.find((choice) => choice.id === choiceId);
  const correct = state.current.choices.find((choice) => choice.id === state.current.answer_id);
  const ok = choiceId === state.current.answer_id;
  state.answered = true;
  if (ok && state.sessionCorrect != null) state.sessionCorrect++;
  button.classList.add(ok ? "correct" : "wrong");
  document.querySelectorAll("#answerArea button").forEach((item) => {
    const choice = state.current.choices.find((entry) => entry.text === item.textContent);
    if (choice?.id === state.current.answer_id) item.classList.add("correct");
  });
  recordAnswer(state.current, ok, selected, correct);
  renderFeedback(state.current, ok, selected, correct);
  $("#playAnswer").disabled = false;
  $("#playSlow").disabled = false;
}

function recordAnswer(question, ok, selected, correct) {
  rememberQuestion(question.id);
  if (state.progress.today.date !== todayKey()) state.progress.today = { date: todayKey(), total: 0, correct: 0 };
  state.progress.today.total += 1;
  state.progress.total += 1;
  if (ok) {
    state.progress.today.correct += 1;
    state.progress.correct += 1;
  }
  question.weakness_tags.forEach((tag) => {
    const item = state.progress.weaknesses[tag] || {
      weakness_id: `weak_${tag}`,
      user_id: "local_user",
      engine: question.engine,
      wrong_type: question.concept_id,
      weakness_tags: [tag],
      wrong_count: 0,
      correct_streak: 0,
      status: "weak"
    };
    if (ok) {
      item.correct_streak += 1;
      if (item.correct_streak >= 3) item.status = "mastered";
    } else {
      item.status = "weak";
      item.wrong_count += 1;
      item.correct_streak = 0;
      item.wrong_answer = selected?.text || "我不懂";
      item.correct_answer = correct?.text || "";
      item.explanation = question.core_explanation;
      item.last_question_id = question.id;
      item.last_prompt = question.prompt;
    }
    state.progress.weaknesses[tag] = item;
  });
  saveProgress();
  renderWeakness();
  renderStats();
}

function renderFeedback(question, ok, selected, correct) {
  const choiceRows = question.choices.map((choice) => `
    <tr>
      <td>${escapeHtml(choice.text)}</td>
      <td>${escapeHtml(choice.zh)}</td>
      <td>${escapeHtml(choice.sense)}</td>
      <td>${escapeHtml(choice.is_correct ? choice.reason : choice.wrong_reason)}</td>
    </tr>
  `).join("");
  const contrastRows = question.contrast_table.map((row) => `
    <tr><td>${escapeHtml(row.text)}</td><td>${escapeHtml(row.zh)}</td><td>${escapeHtml(row.sense)}</td></tr>
  `).join("");
  const tags = question.weakness_tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  $("#feedbackPanel").classList.remove("hidden");
  $("#feedbackPanel").innerHTML = `
    <strong class="${ok ? "ok" : "bad"}">${ok ? "答對" : "答錯"}</strong><br>
    正解日文：${escapeHtml(correct.text)}<br>
    正解中文：${escapeHtml(correct.zh)}<br>
    使用者選項：${escapeHtml(selected?.text || "我不懂")}<br>
    使用者選項中文：${escapeHtml(selected?.zh || "")}<br>
    為什麼正解成立：${escapeHtml(correct.reason)}<br>
    為什麼使用者選項不對：${escapeHtml(ok ? "已選正解。" : selected?.wrong_reason || "使用者標記不懂。")}<br>
    <table class="feedback-table"><thead><tr><th>選項</th><th>中文</th><th>語感差異</th><th>解析</th></tr></thead><tbody>${choiceRows}</tbody></table>
    <table class="feedback-table"><thead><tr><th>對照</th><th>中文</th><th>語感差異</th></tr></thead><tbody>${contrastRows}</tbody></table>
    ${tags}
  `;
}

function markUnknown() {
  if (!state.current || state.answered) return;
  const correct = state.current.choices.find((choice) => choice.id === state.current.answer_id);
  state.answered = true;
  recordAnswer(state.current, false, null, correct);
  renderFeedback(state.current, false, null, correct);
  $("#playAnswer").disabled = false;
  $("#playSlow").disabled = false;
}

function nextQuestion() {
  if (state.index >= state.queue.length - 1) {
    // 最後一題結束
    if (state.activeMissionId) {
      completeMission(state.activeMissionId, state.sessionCorrect || 0);
    }
    state.activeMissionId = null;
    state.sessionCorrect = 0;
    showView("home");
    return;
  }
  state.index += 1;
  renderQuestion();
}

function playBefore() {
  const question = state.current;
  if (!question) return;
  const policy = question.audio_policy?.before_submit || [];
  if (policy.includes("token_audio")) {
    speak(question.choices.map((choice) => choice.text).join("、"), 0.82);
    return;
  }
  showMessage("這個題型答題前不播放完整正解句，避免洩題。");
}

function answerText(question) {
  return question?.choices?.find((choice) => choice.id === question.answer_id)?.text || "";
}

// ─── 弱點 / 統計 / Debug ──────────────────────────────────

function renderWeakness() {
  const items = Object.values(state.progress.weaknesses).sort((a, b) => b.wrong_count - a.wrong_count);
  $("#weaknessList").innerHTML = items.length ? items.map((item) => `
    <div class="list-item">
      <strong>${escapeHtml(item.weakness_tags[0])} · ${item.status}</strong>
      錯誤次數：${item.wrong_count}，連續答對：${item.correct_streak} / 3<br>
      正解：${escapeHtml(item.correct_answer || "--")}<br>
      <div class="meter"><span style="width:${Math.min(100, item.correct_streak * 33)}%"></span></div>
    </div>
  `).join("") : `<div class="list-item">目前還沒有弱點。答錯或按「我不懂」後，這裡會用概念分類。</div>`;
}

function renderStats() {
  const mastered = Object.values(state.progress.weaknesses).filter((item) => item.status === "mastered").length;
  const weak = Object.values(state.progress.weaknesses).filter((item) => item.status !== "mastered").length;
  const todayRate = state.progress.today.total ? Math.round((state.progress.today.correct / state.progress.today.total) * 100) : "--";
  const completedCount = state.missionProgress.completed_missions.length;
  const totalMissions = state.missions.length;
  $("#statsDetail").innerHTML = `
    <div class="list-item"><strong>今日</strong>答題 ${state.progress.today.total} 題，答對率 ${todayRate}${todayRate === "--" ? "" : "%"}。</div>
    <div class="list-item"><strong>累積</strong>答題 ${state.progress.total} 題，答對 ${state.progress.correct} 題。</div>
    <div class="list-item"><strong>弱點狀態</strong>待複習 ${weak} 個概念，已 mastered ${mastered} 個概念。</div>
    <div class="list-item"><strong>任務進度</strong>已完成 ${completedCount} / ${totalMissions} 個任務。</div>
  `;
}

function renderDebug() {
  const byEngine = countBy(state.questions, "engine");
  const audit = state.auditReport || buildAuditReport([]);
  const fails = audit.failures.slice(0, 20).map((failure) => `
    <div class="list-item">
      <strong>${escapeHtml(failure.question_id)}</strong>
      fail_reason：${escapeHtml(failure.fail_reason.join(" / "))}<br>
      prompt：${escapeHtml(failure.prompt)}<br>
      answer：${escapeHtml(failure.answer)}<br>
      建議處理：${escapeHtml(failure.suggestion)}
    </div>
  `).join("");
  $("#debugReport").innerHTML = `
    <div class="list-item"><strong>Pipeline</strong>draft：${state.draft.length}<br>published：${state.questions.length}<br>rejected：${state.rejected.length}<br>flagged：${state.flagged.length}</div>
    <div class="list-item"><strong>Published 分布</strong>語法排列：${byEngine.grammar_arrangement || 0}<br>動詞語感：${byEngine.verb_sense || 0}<br>聽覺語感：${byEngine.audio_sense || 0}</div>
    <div class="list-item"><strong>Mission 系統</strong>任務總數：${state.missions.length}<br>學習路線：${state.missionPaths.length}<br>知識點：${state.knowledgePoints.length}<br>已完成任務：${state.missionProgress.completed_missions.length}<br>已解鎖任務：${state.missionProgress.unlocked_missions.length}</div>
    <div class="list-item"><strong>題庫稽核報告</strong>
      published 總題數：${audit.total}<br>
      audit pass：${audit.pass}<br>
      audit fail：${audit.fail}<br>
      缺少 choice.zh：${audit.missingChoiceZh}<br>
      缺少 choice.sense：${audit.missingChoiceSense}<br>
      缺少 wrong_reason：${audit.missingWrongReason}<br>
      缺少 core_explanation：${audit.missingCoreExplanation}<br>
      缺少 contrast_table：${audit.missingContrastTable}<br>
      可能答案不唯一：${audit.nonUniqueAnswer}<br>
      target_meaning 與正解不一致：${audit.targetMismatch}<br>
      audio_policy 風險：${audit.audioRisk}
    </div>
    ${fails || '<div class="list-item"><strong>Audit fail 清單</strong>目前沒有 audit fail 題目。</div>'}
  `;
}

// ─── 稽核邏輯（原有，完整保留）────────────────────────────

function auditQuestion(question) {
  const reasons = [];
  const choices = question.choices || [];
  const correctChoices = choices.filter((choice) => choice.is_correct === true);
  const answerChoice = choices.find((choice) => choice.id === question.answer_id);
  const isListening = question.question_type === "listening_meaning_choice";
  ["id", "engine", "question_type", "concept_id", "pattern_id", "prompt", "target_meaning"].forEach((field) => {
    if (!question[field]) reasons.push(`missing ${field}`);
  });
  if (question.status !== "published") reasons.push("status is not published");
  if (!question.core_explanation) reasons.push("missing core_explanation");
  if (!Array.isArray(question.contrast_table) || !question.contrast_table.length) reasons.push("missing contrast_table");
  if (!Array.isArray(question.weakness_tags) || !question.weakness_tags.length) reasons.push("missing weakness_tags");
  if (!question.audio_policy) reasons.push("missing audio_policy");
  if (correctChoices.length !== 1) reasons.push("possible non-unique answer");
  if (!answerChoice || !answerChoice.is_correct) reasons.push("answer_id does not point to correct choice");
  choices.forEach((choice) => {
    if (!choice.zh) reasons.push(`missing choice.zh ${choice.id}`);
    if (!choice.sense) reasons.push(`missing choice.sense ${choice.id}`);
    if (choice.is_correct && !choice.reason) reasons.push(`missing correct reason ${choice.id}`);
    if (!choice.is_correct && !choice.wrong_reason) reasons.push(`missing wrong_reason ${choice.id}`);
    if (!Array.isArray(choice.weakness_tags) || !choice.weakness_tags.length) reasons.push(`missing choice weakness_tags ${choice.id}`);
  });
  if (!answerChoice?.zh || !question.target_meaning) reasons.push("target_meaning or correct zh unavailable");
  if (!isListening && question.audio_policy?.allow_full_answer_before_submit) reasons.push("audio_policy allows full answer before submit");
  if (!isListening && (question.audio_policy?.before_submit || []).some((item) => ["full_sentence_audio", "correct_sentence_audio", "target_sentence_audio"].includes(item))) {
    reasons.push("audio_policy leaks full answer before submit");
  }
  return { pass: reasons.length === 0 && question.audit_pass === true && question.validation?.audit_pass === true, reasons };
}

function buildAuditReport(auditedItems) {
  const report = { total: auditedItems.length, pass: 0, fail: 0, missingChoiceZh: 0, missingChoiceSense: 0, missingWrongReason: 0, missingCoreExplanation: 0, missingContrastTable: 0, nonUniqueAnswer: 0, targetMismatch: 0, audioRisk: 0, failures: [] };
  auditedItems.forEach(({ question, audit }) => {
    audit.pass ? report.pass += 1 : report.fail += 1;
    if (audit.reasons.some((r) => r.includes("missing choice.zh"))) report.missingChoiceZh += 1;
    if (audit.reasons.some((r) => r.includes("missing choice.sense"))) report.missingChoiceSense += 1;
    if (audit.reasons.some((r) => r.includes("missing wrong_reason"))) report.missingWrongReason += 1;
    if (audit.reasons.includes("missing core_explanation")) report.missingCoreExplanation += 1;
    if (audit.reasons.includes("missing contrast_table")) report.missingContrastTable += 1;
    if (audit.reasons.some((r) => r.includes("non-unique") || r.includes("answer_id"))) report.nonUniqueAnswer += 1;
    if (audit.reasons.includes("target_meaning or correct zh unavailable")) report.targetMismatch += 1;
    if (audit.reasons.some((r) => r.includes("audio_policy"))) report.audioRisk += 1;
    if (!audit.pass) {
      report.failures.push({
        question_id: question.id || "missing_id",
        fail_reason: audit.reasons,
        prompt: question.prompt || "",
        answer: question.choices?.find((c) => c.id === question.answer_id)?.text || "",
        suggestion: "移到 rejected/flagged，補齊解析資料並重新做語意與唯一性審核。"
      });
    }
  });
  return report;
}

function buildGeneratedBank() {
  const draft = Array.from({ length: 24 }, (_, index) => ({
    id: `DRAFT_FALLBACK_${index + 1}`,
    status: "needs_review",
    audit_pass: false,
    engine: "verb_sense",
    question_type: "verb_sense_choice",
    prompt: "未審核 fallback 題目，不可正式出題。",
    weakness_tags: ["needs_review"]
  }));
  return { draft };
}

// ─── 語音 ─────────────────────────────────────────────────

function speak(text, rate) {
  if (!("speechSynthesis" in window) || !text) {
    showMessage("這個瀏覽器不支援語音播放。");
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = rate;
  speechSynthesis.speak(utterance);
}

function showMessage(text) {
  $("#feedbackPanel").classList.remove("hidden");
  $("#feedbackPanel").textContent = text;
}

// ─── 進度 localStorage ────────────────────────────────────

function loadProgress() {
  const fallback = { today: { date: todayKey(), total: 0, correct: 0 }, total: 0, correct: 0, weaknesses: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!saved) return fallback;
    if (saved.today?.date !== todayKey()) saved.today = fallback.today;
    return { ...fallback, ...saved, weaknesses: saved.weaknesses || {} };
  } catch {
    return fallback;
  }
}

function saveProgress() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state.progress));
}

function loadQuestionHistory() {
  const fallback = { recent_question_ids: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(QUESTION_HISTORY_KEY));
    return saved ? { ...fallback, ...saved, recent_question_ids: saved.recent_question_ids || [] } : fallback;
  } catch {
    return fallback;
  }
}

function rememberQuestion(questionId) {
  if (!questionId) return;
  const recent = [questionId, ...(state.questionHistory.recent_question_ids || []).filter((id) => id !== questionId)];
  state.questionHistory.recent_question_ids = recent.slice(0, RECENT_QUESTION_LIMIT);
  localStorage.setItem(QUESTION_HISTORY_KEY, JSON.stringify(state.questionHistory));
}

function loadMissionProgress() {
  const fallback = {
    user_id: "local_user_" + Math.random().toString(36).slice(2, 10),
    completed_missions: [],
    unlocked_missions: [],
    mission_progress: {},
    last_practice_date: null
  };
  try {
    const saved = JSON.parse(localStorage.getItem(MISSION_STORE_KEY));
    return saved ? { ...fallback, ...saved } : fallback;
  } catch {
    return fallback;
  }
}

function saveMissionProgress() {
  state.missionProgress.last_practice_date = todayKey();
  localStorage.setItem(MISSION_STORE_KEY, JSON.stringify(state.missionProgress));
}

// ─── Service Worker ───────────────────────────────────────

function registerWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    navigator.serviceWorker.register("./sw.js").then((registration) => registration.update());
  }
}

// ─── 工具函式 ─────────────────────────────────────────────

function engineLabel(engine) {
  return { grammar_arrangement: "語法排列", verb_sense: "動詞語感", weak_review: "弱點複習", audio_sense: "聽覺語感" }[engine] || engine;
}

function typeLabel(type) {
  return { verb_sense_choice: "動詞語感選擇", listening_meaning_choice: "聽句選意思" }[type] || type;
}

function countBy(items, field) {
  return items.reduce((counts, item) => {
    counts[item[field]] = (counts[item[field]] || 0) + 1;
    return counts;
  }, {});
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
