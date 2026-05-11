const APP_VERSION = "Japanese Sense Trainer V2";
const STORE_KEY = "japaneseSenseTrainerV2";
const RAW_QUESTION_BASE = "https://raw.githubusercontent.com/a901112/japanese-mission-app/main/data/questions/";
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
  progress: loadProgress()
};

init();

async function init() {
  bindEvents();
  await loadBank();
  renderHome();
  renderWeakness();
  renderStats();
  renderDebug();
  registerWorker();
}

function bindEvents() {
  $(".tabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");
    if (button) showView(button.dataset.view);
  });
  document.querySelectorAll("[data-start]").forEach((button) => {
    button.addEventListener("click", () => startPractice(button.dataset.start));
  });
  $("#jlptFilter").addEventListener("change", renderHome);
  $("#sceneFilter").addEventListener("change", renderHome);
  $("#backHome").addEventListener("click", () => showView("home"));
  $("#reviewWeakButton").addEventListener("click", () => startPractice("weak_review"));
  $("#unknownButton").addEventListener("click", markUnknown);
  $("#nextButton").addEventListener("click", nextQuestion);
  $("#playBefore").addEventListener("click", playBefore);
  $("#playAnswer").addEventListener("click", () => speak(answerText(state.current), 0.9));
  $("#playSlow").addEventListener("click", () => speak(answerText(state.current), 0.58));
}

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

async function fetchJson(path) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(path);
    return response.json();
  } catch {
    const fileName = path.split("/").pop();
    if (!fileName || !path.includes("/data/questions/")) return [];
    try {
      const response = await fetch(RAW_QUESTION_BASE + fileName, { cache: "no-store" });
      if (!response.ok) throw new Error(fileName);
      return response.json();
    } catch {
      return [];
    }
  }
}

function showView(view) {
  document.querySelectorAll(".tabs button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".view").forEach((section) => section.classList.add("hidden"));
  $(`#${view}View`).classList.remove("hidden");
  if (view === "home") renderHome();
  if (view === "weakness") renderWeakness();
  if (view === "stats") renderStats();
  if (view === "debug") renderDebug();
}

function filteredQuestions() {
  const jlpt = $("#jlptFilter").value;
  const scene = $("#sceneFilter").value;
  return state.questions.filter((question) => {
    const jlptMatch = jlpt === "all" || question.jlpt_tag === jlpt;
    const sceneMatch = scene === "all" || question.scene_tags.includes(scene);
    return jlptMatch && sceneMatch;
  });
}

function renderHome() {
  const filtered = filteredQuestions();
  $("#bankStatus").textContent = state.questions.length
    ? `Published 題庫：${state.questions.length} 題；目前篩選可練 ${filtered.length} 題。正式練習只抽 status = published 且 audit_pass = true 的題目。`
    : "目前沒有通過審核的題目，請先建立 published 題庫。";
  $("#policyStatus").textContent = "答題前依 audio_policy 控制發音；非聽力題不播放完整正解句，答題後才開放正解與慢速。";
}

function startPractice(engine) {
  const source = engine === "weak_review" ? weakReviewQueue() : filteredQuestions().filter((question) => question.engine === engine);
  const queue = shuffle(source).slice(0, 10);
  if (!queue.length) {
    alert(state.questions.length ? "目前沒有符合條件的題目。" : "目前沒有通過審核的題目，請先建立 published 題庫。");
    return;
  }
  state.queue = queue;
  state.index = 0;
  showView("practice");
  renderQuestion();
}

function weakReviewQueue() {
  const weakTags = Object.keys(state.progress.weaknesses).filter((tag) => state.progress.weaknesses[tag].status !== "mastered");
  if (!weakTags.length) return filteredQuestions();
  return filteredQuestions().filter((question) => question.weakness_tags.some((tag) => weakTags.includes(tag)));
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
  $("#statsDetail").innerHTML = `
    <div class="list-item"><strong>今日</strong>答題 ${state.progress.today.total} 題，答對率 ${todayRate}${todayRate === "--" ? "" : "%"}。</div>
    <div class="list-item"><strong>累積</strong>答題 ${state.progress.total} 題，答對 ${state.progress.correct} 題。</div>
    <div class="list-item"><strong>弱點狀態</strong>待複習 ${weak} 個概念，已 mastered ${mastered} 個概念。</div>
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
    if (audit.reasons.some((reason) => reason.includes("missing choice.zh"))) report.missingChoiceZh += 1;
    if (audit.reasons.some((reason) => reason.includes("missing choice.sense"))) report.missingChoiceSense += 1;
    if (audit.reasons.some((reason) => reason.includes("missing wrong_reason"))) report.missingWrongReason += 1;
    if (audit.reasons.includes("missing core_explanation")) report.missingCoreExplanation += 1;
    if (audit.reasons.includes("missing contrast_table")) report.missingContrastTable += 1;
    if (audit.reasons.some((reason) => reason.includes("non-unique") || reason.includes("answer_id"))) report.nonUniqueAnswer += 1;
    if (audit.reasons.includes("target_meaning or correct zh unavailable")) report.targetMismatch += 1;
    if (audit.reasons.some((reason) => reason.includes("audio_policy"))) report.audioRisk += 1;
    if (!audit.pass) {
      report.failures.push({
        question_id: question.id || "missing_id",
        fail_reason: audit.reasons,
        prompt: question.prompt || "",
        answer: question.choices?.find((choice) => choice.id === question.answer_id)?.text || "",
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
