(() => {
  "use strict";

  const bank = window.IELTS_BANK;
  const answerBank = window.IELTS_ANSWERS || { part1: [], part2: [] };
  const $ = (id) => document.getElementById(id);
  const views = { welcome: $("welcomeView"), exam: $("examView"), results: $("resultsView") };
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  const state = {
    phase: "welcome",
    queue: [],
    index: 0,
    answers: [],
    recognition: null,
    listening: false,
    finalText: "",
    interimText: "",
    confidence: [],
    answerStartedAt: null,
    phaseTimer: null,
    timerStartedAt: null,
    timerMode: "up",
    timerLimit: 0,
    part2Card: null,
    part3Group: null,
    part3Target: 5,
    part3AdaptiveAdded: false,
    voiceSupported: Boolean(SpeechRecognition),
  };

  const els = {
    sessionState: $("sessionState"), compatibilityNote: $("compatibilityNote"), startButton: $("startButton"),
    partLabel: $("partLabel"), phaseTitle: $("phaseTitle"), timer: $("timer"), progressFill: $("progressFill"),
    questionText: $("questionText"), cueList: $("cueList"), prepPanel: $("prepPanel"), notes: $("notes"),
    answerPanel: $("answerPanel"), voiceStatus: $("voiceStatus"), wave: $("wave"), transcriptBox: $("transcriptBox"),
    interimTranscript: $("interimTranscript"), manualAnswer: $("manualAnswer"), micButton: $("micButton"),
    submitAnswer: $("submitAnswer"), repeatButton: $("repeatButton"), questionCounter: $("questionCounter"),
    overallBand: $("overallBand"), scoreGrid: $("scoreGrid"), metrics: $("metrics"),
    memorisedNotes: $("memorisedNotes"), expansionNotes: $("expansionNotes"), answerReview: $("answerReview"), restartButton: $("restartButton"),
    downloadButton: $("downloadButton"),
  };

  function sample(items, count) {
    return [...items].sort(() => Math.random() - .5).slice(0, count);
  }

  // Frequency data supplied for the current IELTS speaking season. Counts are
  // deliberately softened below, so a very frequent topic is favoured without
  // making every mock test feel identical.
  const FREQUENCY_STATUS_FACTOR = { common: 1.25, new: 1, retained: 0.62 };
  const PART1_FREQUENCY = {
    "Growing Vegetables": { count: 994, status: "common" },
    "Politeness": { count: 805, status: "new" },
    "Rubbish": { count: 630, status: "new" },
    "Tiredness": { count: 392, status: "new" },
    "Travelling": { count: 301, status: "retained" },
    "Paper": { count: 1036, status: "new" },
    "Secondary Schools": { count: 637, status: "new" },
    "Study": { count: 1463, status: "common" },
    "Hometown": { count: 483, status: "common" },
    "Accommodation": { count: 364, status: "common" },
    "The Area You Live In": { count: 896, status: "common" },
    "Names": { count: 329, status: "new" },
    "Advertisements": { count: 406, status: "new" },
    "Shoes": { count: 658, status: "new" },
    "Public Gardens and Parks": { count: 273, status: "retained" },
    "Cars": { count: 504, status: "retained" },
    "Shopping": { count: 259, status: "retained" },
    "Watches": { count: 1064, status: "retained" },
    "Websites": { count: 483, status: "retained" },
    "Tidiness": { count: 203, status: "retained" },
    "Mirrors": { count: 273, status: "retained" },
    "Teachers": { count: 322, status: "retained" },
    "Social Media": { count: 161, status: "retained" },
    "Music": { count: 490, status: "retained" },
    "Science": { count: 245, status: "retained" },
    "Singing": { count: 210, status: "retained" },
    "Outer Space and Stars": { count: 196, status: "retained" },
    "Clothes": { count: 217, status: "retained" },
    "Headphones": { count: 154, status: "retained" },
    "Jokes": { count: 105, status: "retained" },
  };
  const PART2_FREQUENCY = [
    ["person who likes to make things by hand", 469, "new"], ["saved money to buy", 357, "new"],
    ["film you didn’t like", 336, "new"], ["happy with the result", 294, "new"],
    ["ambition that you have had", 287, "retained"], ["watched a famous person", 238, "new"],
    ["enjoys learning history", 217, "new"], ["career in the medical field", 210, "retained"],
    ["person who taught you", 210, "new"], ["favourite childhood friend", 203, "new"],
    ["old person you know and respect", 203, "new"], ["athlete you admire", 189, "new"],
    ["enjoyable evening", 154, "new"], ["really likes taking photos", 154, "new"],
    ["popular person", 147, "new"], ["good at learning and speaking", 147, "retained"],
    ["successful business person", 140, "retained"], ["got up early", 126, "retained"],
    ["food people eat", 126, "retained"], ["advertisement with a famous person", 119, "new"],
    ["new law", 112, "retained"], ["boring place", 112, "retained"], ["live sports event", 105, "retained"],
    ["not interested in", 105, "new"], ["important decision you made in life", 98, "retained"],
    ["good service", 98, "retained"], ["short trip", 98, "new"], ["loves to grow plants", 98, "retained"],
    ["party you enjoyed", 91, "new"], ["worked in a group", 84, "retained"],
    ["challenging technological", 77, "retained"], ["interesting video", 77, "retained"],
    ["organized person", 70, "new"], ["helped to become healthier", 56, "new"],
    ["plan that you had to change", 14, "new"], ["noisy place", 294, "new"],
    ["natural place", 224, "new"], ["place you have travelled", 189, "retained"],
    ["tall building", 189, "retained"], ["friend’s home", 147, "retained"],
  ];
  // The starred lists the learner supplied are a separate, more immediate
  // priority signal. It applies on top of the seasonal frequency data.
  const PART1_STAR_PRIORITY = {
    "Study": 7, "Accommodation": 7, "The Area You Live In": 7, "Hometown": 7,
    "Rubbish": 6, "Paper": 6, "Websites": 6, "Social Media": 5, "Shopping": 5,
    "Headphones": 5, "Advertisements": 4, "Shoes": 4, "Politeness": 4,
    "Clothes": 4, "Science": 4,
  };
  const PART2_STAR_PRIORITY = [
    ["law or regulation about environmental", 5], ["watched a famous person", 5],
    ["old person you know and respect", 5], ["food people eat", 5], ["live sports event", 5],
    ["successful business person", 5], ["person who likes to make things by hand", 4],
    ["exciting book", 4], ["challenging technological", 4], ["public building", 4],
    ["good at learning and speaking", 4], ["loves to grow plants", 4],
    ["enjoys learning history", 3], ["film you didn’t like", 3], ["party you enjoyed", 3],
    ["popular person", 3], ["advertisement with a famous person", 3], ["crowded place", 3],
  ];

  function starBoost(stars = 0) {
    return stars >= 7 ? 3 : stars === 6 ? 2.5 : stars === 5 ? 2 : stars === 4 ? 1.55 : stars === 3 ? 1.2 : 1;
  }

  function frequencyWeight(record) {
    // The square-root curve preserves the ranking while preventing the top
    // item from being selected many times more often than the rest.
    return Math.sqrt(record.count) * FREQUENCY_STATUS_FACTOR[record.status] * starBoost(record.stars);
  }

  function weightedPick(items, weightFor) {
    const weights = items.map(item => Math.max(0, Number(weightFor(item)) || 0));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (!total) return sample(items, 1)[0];
    let cursor = Math.random() * total;
    for (let index = 0; index < items.length; index += 1) {
      cursor -= weights[index];
      if (cursor <= 0) return items[index];
    }
    return items.at(-1);
  }

  function weightedSample(items, count, weightFor) {
    const pool = [...items];
    const result = [];
    while (pool.length && result.length < count) {
      const picked = weightedPick(pool, weightFor);
      result.push(picked);
      pool.splice(pool.indexOf(picked), 1);
    }
    return result;
  }

  function part2Frequency(title) {
    const normalized = title.toLowerCase();
    const match = PART2_FREQUENCY.find(([phrase]) => normalized.includes(phrase));
    const priority = PART2_STAR_PRIORITY.find(([phrase]) => normalized.includes(phrase));
    const frequency = match ? { count: match[1], status: match[2] } : { count: 48, status: "retained" };
    return { ...frequency, stars: priority?.[1] || 0 };
  }

  function clean(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function questionKey(text) {
    return clean(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  const standardAnswers = new Map(
    [...answerBank.part1, ...answerBank.part2].map(item => [questionKey(item.question), item.answer])
  );

  function standardAnswerFor(question) {
    return standardAnswers.get(questionKey(question)) || "题库中未提供这道题的参考答案（Part 3 通常只有追问题目）。";
  }

  function words(text) {
    return clean(text).toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.round(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
  }

  function showView(name) {
    Object.entries(views).forEach(([key, node]) => node.classList.toggle("hidden", key !== name));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setSession(label, active = true) {
    els.sessionState.lastElementChild.textContent = label;
    els.sessionState.querySelector(".state-light").style.background = active ? "var(--cyan)" : "var(--muted)";
  }

  function speak(text, callback) {
    if (!("speechSynthesis" in window)) { callback?.(); return; }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-GB";
    utterance.rate = .94;
    utterance.pitch = .96;
    const voices = speechSynthesis.getVoices();
    utterance.voice = voices.find(v => /^en-GB/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang)) || null;
    utterance.onend = () => callback?.();
    utterance.onerror = () => callback?.();
    speechSynthesis.speak(utterance);
  }

  function makePart1Queue() {
    const topicMap = new Map();
    bank.part1.forEach(item => {
      if (!topicMap.has(item.topic)) topicMap.set(item.topic, []);
      topicMap.get(item.topic).push(item.question);
    });
    const topics = weightedSample([...topicMap.keys()], Math.random() < .35 ? 2 : 3,
      topic => frequencyWeight({ ...(PART1_FREQUENCY[topic] || { count: 55, status: "retained" }), stars: PART1_STAR_PRIORITY[topic] || 0 }));
    const target = Math.floor(Math.random() * 5) + 8;
    const topicPools = new Map(topics.map(topic => [topic, sample(topicMap.get(topic), topicMap.get(topic).length)]));
    const selected = [];
    let round = 0;
    while (selected.length < target && round < 8) {
      topics.forEach(topic => {
        const candidates = topicPools.get(topic);
        if (selected.length < target && candidates[round]) selected.push({ part: 1, topic, question: candidates[round] });
      });
      round += 1;
    }
    return selected;
  }

  function beginExam() {
    state.answers = [];
    state.queue = makePart1Queue();
    state.index = 0;
    state.phase = "part1";
    state.part3AdaptiveAdded = false;
    showView("exam");
    setSession("Test in progress");
    els.partLabel.textContent = "PART 1 · INTERVIEW";
    els.phaseTitle.textContent = "Introduction and interview";
    els.prepPanel.classList.add("hidden");
    els.answerPanel.classList.remove("hidden");
    speak("Good morning. My name is Alex. Can you tell me your full name, please? We will now begin Part One.", () => renderQuestion());
  }

  function resetAnswerUI() {
    stopRecognition();
    state.finalText = "";
    state.interimText = "";
    state.confidence = [];
    state.answerStartedAt = null;
    els.interimTranscript.textContent = state.voiceSupported ? "Your answer will appear here…" : "Voice recognition is unavailable. Please type your answer below.";
    els.manualAnswer.value = "";
    els.manualAnswer.classList.toggle("hidden", state.voiceSupported);
    els.transcriptBox.classList.toggle("hidden", !state.voiceSupported);
    els.submitAnswer.disabled = true;
    els.micButton.disabled = !state.voiceSupported;
    els.micButton.classList.remove("recording");
    els.wave.classList.remove("active");
    els.voiceStatus.textContent = state.voiceSupported ? "Press the microphone when you are ready." : "Type your answer, then submit.";
    startTimer("up", 0);
  }

  function renderQuestion() {
    resetAnswerUI();
    const item = state.queue[state.index];
    if (!item) return;
    els.cueList.classList.add("hidden");
    els.questionText.textContent = item.question;
    els.questionCounter.textContent = `Question ${state.index + 1} of ${state.queue.length}`;
    els.progressFill.style.width = `${((state.index + 1) / state.queue.length) * 100}%`;
    els.partLabel.textContent = state.phase === "part1" ? "PART 1 · INTERVIEW" : "PART 3 · DISCUSSION";
    els.phaseTitle.textContent = state.phase === "part1" ? item.topic : (state.part3Group?.topic || "Discussion");
    setTimeout(() => speak(item.question), 280);
  }

  function setupRecognition() {
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-GB";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          state.finalText += `${text} `;
          if (Number.isFinite(result[0].confidence)) state.confidence.push(result[0].confidence);
        } else interim += text;
      }
      state.interimText = interim;
      const display = clean(`${state.finalText} ${interim}`);
      els.interimTranscript.textContent = display || "Listening…";
      updateSubmitAvailability();
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        state.voiceSupported = false;
        stopRecognition();
        els.manualAnswer.classList.remove("hidden");
        els.transcriptBox.classList.add("hidden");
        els.voiceStatus.textContent = "Microphone access is unavailable. Type your answer instead.";
        els.micButton.disabled = true;
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        els.voiceStatus.textContent = "I couldn't capture that clearly. You can try again or type your answer.";
      }
    };
    recognition.onend = () => {
      if (state.listening) {
        try { recognition.start(); } catch (_) { /* browser is already restarting */ }
      }
    };
    state.recognition = recognition;
  }

  function startRecognition() {
    if (!state.voiceSupported || !state.recognition || state.listening) return;
    state.listening = true;
    state.answerStartedAt = state.answerStartedAt || Date.now();
    try { state.recognition.start(); } catch (_) { /* already active */ }
    els.micButton.classList.add("recording");
    els.wave.classList.add("active");
    els.voiceStatus.textContent = "Listening — speak naturally.";
    els.micButton.setAttribute("aria-label", "Stop recording");
  }

  function stopRecognition() {
    state.listening = false;
    if (state.recognition) {
      try { state.recognition.stop(); } catch (_) { /* already stopped */ }
    }
    els.micButton?.classList.remove("recording");
    els.wave?.classList.remove("active");
    els.micButton?.setAttribute("aria-label", "Start recording");
  }

  function startTimer(mode, limit) {
    clearInterval(state.phaseTimer);
    state.timerMode = mode;
    state.timerLimit = limit;
    state.timerStartedAt = Date.now();
    els.timer.textContent = formatTime(mode === "down" ? limit : 0);
    state.phaseTimer = setInterval(() => {
      const elapsed = (Date.now() - state.timerStartedAt) / 1000;
      const shown = mode === "down" ? Math.max(0, limit - elapsed) : elapsed;
      els.timer.textContent = formatTime(shown);
      if (state.phase === "part2speak") updateSubmitAvailability();
      if (mode === "down" && elapsed >= limit) {
        clearInterval(state.phaseTimer);
        if (state.phase === "part2prep") beginPart2Speech();
      }
      if (state.phase === "part2speak" && elapsed >= 120) submitCurrentAnswer(true);
    }, 250);
  }

  function currentAnswerText() {
    return clean(state.voiceSupported ? `${state.finalText} ${state.interimText}` : els.manualAnswer.value);
  }

  function updateSubmitAvailability() {
    const hasAnswer = words(currentAnswerText()).length > 0;
    const part2MinimumMet = state.phase !== "part2speak" || (Date.now() - state.timerStartedAt) >= 60000;
    els.submitAnswer.disabled = !(hasAnswer && part2MinimumMet);
  }

  function submitCurrentAnswer(auto = false) {
    const text = currentAnswerText();
    if (!text && !auto) return;
    const duration = state.answerStartedAt ? Math.max(1, (Date.now() - state.answerStartedAt) / 1000) : Math.max(1, (Date.now() - state.timerStartedAt) / 1000);
    const item = state.phase === "part2speak"
      ? { part: 2, topic: state.part2Card.title, question: state.part2Card.title }
      : state.queue[state.index];
    state.answers.push({
      ...item,
      text: text || "[No answer captured]",
      duration,
      confidence: state.confidence.length ? state.confidence.reduce((a, b) => a + b, 0) / state.confidence.length : null,
    });
    stopRecognition();
    clearInterval(state.phaseTimer);

    if (state.phase === "part1") {
      state.index += 1;
      if (state.index < state.queue.length) renderQuestion();
      else beginPart2Prep();
    } else if (state.phase === "part2speak") {
      beginPart3();
    } else if (state.phase === "part3") {
      maybeAddAdaptiveFollowUp(text);
      state.index += 1;
      if (state.index < state.queue.length && state.index < state.part3Target) renderQuestion();
      else finishExam();
    }
  }

  function beginPart2Prep() {
    state.phase = "part2prep";
    state.part2Card = weightedPick(bank.part2, card => frequencyWeight(part2Frequency(card.title)));
    els.partLabel.textContent = "PART 2 · LONG TURN";
    els.phaseTitle.textContent = "Preparation time";
    els.questionText.textContent = state.part2Card.title;
    els.cueList.innerHTML = state.part2Card.bullets.map(x => `<li>${escapeHtml(x)}</li>`).join("");
    els.cueList.classList.remove("hidden");
    els.prepPanel.classList.remove("hidden");
    els.answerPanel.classList.add("hidden");
    els.questionCounter.textContent = "1 minute to prepare";
    els.progressFill.style.width = "50%";
    startTimer("down", 60);
    speak(`Now I am going to give you a topic. You have one minute to prepare. ${state.part2Card.title}`);
  }

  function beginPart2Speech() {
    state.phase = "part2speak";
    els.phaseTitle.textContent = "Long turn";
    els.prepPanel.classList.add("hidden");
    els.answerPanel.classList.remove("hidden");
    resetAnswerUI();
    clearInterval(state.phaseTimer);
    els.timer.textContent = "02:00";
    els.questionCounter.textContent = "Speak for 1–2 minutes";
    els.progressFill.style.width = "75%";
    speak("All right. Remember, you have one to two minutes for this, so don't worry if I stop you. Please begin now.", () => {
      startTimer("up", 0);
      startRecognition();
    });
  }

  const stopwords = new Set("describe talk about person time place thing your you have had that who what where when why how this with from into before after their there they people should could would does are were being been some very more most much many".split(" "));

  function relevantPart3Group(cardTitle) {
    const cueWords = new Set(words(cardTitle).filter(w => w.length > 3 && !stopwords.has(w)));
    const scored = bank.part3.map(group => {
      const groupWords = words(`${group.topic} ${group.questions.join(" ")}`);
      let score = groupWords.reduce((sum, w) => sum + (cueWords.has(w) ? 4 : 0), 0);
      cueWords.forEach(w => { if (group.topic.toLowerCase().includes(w)) score += 5; });
      return { group, score: score + Math.random() * 1.2 };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].group;
  }

  function beginPart3() {
    state.phase = "part3";
    state.part3Group = relevantPart3Group(state.part2Card.title);
    state.part3Target = Math.floor(Math.random() * 3) + 4;
    const primary = sample(state.part3Group.questions, Math.min(state.part3Target, state.part3Group.questions.length));
    if (primary.length < state.part3Target) {
      const extras = sample(bank.part3.flatMap(g => g.questions), state.part3Target - primary.length);
      primary.push(...extras);
    }
    state.queue = primary.map(question => ({ part: 3, topic: state.part3Group.topic, question }));
    state.index = 0;
    els.prepPanel.classList.add("hidden");
    els.answerPanel.classList.remove("hidden");
    els.cueList.classList.add("hidden");
    speak("We have been talking about this topic, and I would now like to discuss it in a more general way.", () => renderQuestion());
  }

  function maybeAddAdaptiveFollowUp(answer) {
    if (state.part3AdaptiveAdded || state.index < 1 || state.queue.length >= 6 || words(answer).length < 8) return;
    const content = words(answer).filter(w => w.length > 5 && !stopwords.has(w));
    if (!content.length) return;
    const keyword = content.sort((a, b) => b.length - a.length)[0];
    const follow = `You mentioned ${keyword}. Why do you think that is important in this context?`;
    state.queue.splice(state.index + 1, 0, { part: 3, topic: state.part3Group.topic, question: follow, adaptive: true });
    state.part3Target = Math.min(6, Math.max(state.part3Target, state.queue.length));
    state.part3AdaptiveAdded = true;
  }

  function finishExam() {
    state.phase = "results";
    clearInterval(state.phaseTimer);
    stopRecognition();
    window.speechSynthesis?.cancel();
    setSession("Test complete", false);
    renderResults();
    showView("results");
  }

  function band(value) {
    return Math.max(4, Math.min(7.5, Math.round(value * 2) / 2));
  }

  function analyse() {
    const valid = state.answers.filter(a => !a.text.startsWith("[No answer"));
    const allText = valid.map(a => a.text).join(" ");
    const allWords = words(allText);
    const totalMinutes = valid.reduce((sum, a) => sum + a.duration, 0) / 60 || 1;
    const wpm = Math.round(allWords.length / totalMinutes);
    const fillers = (allText.match(/\b(um+|uh+|erm|you know|like|actually|basically)\b/gi) || []).length;
    const fillerRate = fillers / Math.max(1, allWords.length);
    const uniqueRatio = new Set(allWords).size / Math.max(1, allWords.length);
    const longRatio = allWords.filter(w => w.length >= 8).length / Math.max(1, allWords.length);
    const connectors = (allText.match(/\b(however|although|because|therefore|while|whereas|for example|in contrast|as a result|on the other hand)\b/gi) || []).length;
    const sentences = Math.max(1, (allText.match(/[.!?]+/g) || []).length);
    const avgSentence = allWords.length / sentences;
    const p2 = valid.find(a => a.part === 2);
    const completeAnswers = valid.filter(a => words(a.text).length >= (a.part === 1 ? 8 : a.part === 2 ? 90 : 22));
    const repetitions = (allText.match(/\b(\w+)(?:\s+\1){1,}\b/gi) || []).length;

    // Speech-recognition transcripts usually omit pauses and fillers, so their
    // absence is no longer treated as proof of fluent delivery.
    let fluency = 4.2;
    if (wpm >= 85 && wpm <= 165) fluency += .45;
    else if (wpm >= 65 && wpm < 85) fluency += .2;
    if ((p2 ? words(p2.text).length : 0) >= 115) fluency += .3;
    if (completeAnswers.length >= valid.length * .7) fluency += .3;
    fluency -= Math.min(.5, repetitions * .12);
    fluency -= fillerRate >= .055 ? .35 : fillerRate >= .035 ? .15 : 0;

    let lexical = 4.6 + Math.min(.95, Math.max(0, uniqueRatio - .28) * 3.2) + Math.min(.55, longRatio * 4.5);
    let grammar = 4.6 + Math.min(.9, connectors / Math.max(2, valid.length / 2)) + (avgSentence >= 9 && avgSentence <= 25 ? .45 : .1);
    // Do not infer pronunciation quality from an automatic transcript. This
    // neutral placeholder prevents recognition confidence from inflating a band.
    let pronunciation = 5.0;
    if (fillerRate >= .055 || repetitions >= 3) pronunciation -= .25;

    const scores = {
      "Fluency & Coherence": band(fluency),
      "Lexical Resource": band(lexical),
      "Grammar": band(grammar),
      "Pronunciation": band(pronunciation),
    };
    const overall = band(Object.values(scores).reduce((a, b) => a + b, 0) / 4);
    return { scores, overall, wpm, fillers, uniqueRatio, repetitions, valid, p2 };
  }

  function renderResults() {
    const report = analyse();
    els.overallBand.textContent = report.overall.toFixed(1);
    const descriptions = {
      "Fluency & Coherence": "节奏、停顿与观点衔接",
      "Lexical Resource": "词汇范围与表达准确度",
      "Grammar": "句式变化与语法控制",
      "Pronunciation": "无法由转写可靠评分，保持中性",
    };
    els.scoreGrid.innerHTML = Object.entries(report.scores).map(([name, score]) => `
      <div class="score-card"><p>${name}<br><small>${descriptions[name]}</small></p><b>${score.toFixed(1)}</b></div>
    `).join("");
    els.metrics.innerHTML = [
      [report.wpm, "words / minute"],
      [report.fillers, "fillers detected"],
      [`${Math.round(report.uniqueRatio * 100)}%`, "unique-word ratio"],
    ].map(([value, label]) => `<div class="metric"><b>${value}</b><span>${label}</span></div>`).join("");

    const rehearsed = [];
    report.valid.forEach((answer, idx) => {
      const wc = words(answer.text).length;
      const formulaic = /^(the (person|place|thing|time) i'd like to talk about|i'd like to talk about)/i.test(answer.text);
      if ((answer.part === 1 && wc > 65) || formulaic || /in conclusion|all things considered/i.test(answer.text)) {
        rehearsed.push(`<li><b>${answer.part === 1 ? `Part 1, Q${idx + 1}` : `Part ${answer.part}`}</b>：${formulaic ? "开头模板感较强" : "长度或收束方式偏书面"}。可直接从具体事实开始。</li>`);
      }
    });
    els.memorisedNotes.innerHTML = rehearsed.length
      ? `<ul>${rehearsed.slice(0, 4).join("")}</ul>`
      : "<p>没有检测到明显的固定模板或异常书面化表达。整体更接近现场回答。</p>";

    const expansions = [];
    const shortP3 = report.valid.filter(a => a.part === 3 && words(a.text).length < 28);
    if (shortP3.length) expansions.push(`Part 3 有 ${shortP3.length} 个回答较短：先给直接观点，再补一个原因和一个现实例子。`);
    const shortP1 = report.valid.filter(a => a.part === 1 && words(a.text).length < 8);
    if (shortP1.length) expansions.push(`Part 1 有 ${shortP1.length} 个回答只有一句左右：可自然补充 “because + 一个个人细节”，但不需要讲成长段。`);
    if (report.p2 && words(report.p2.text).length < 100) expansions.push("Part 2 还可以增加一个具体场景、一个感官细节，以及事情前后的变化，让讲话更接近两分钟。");
    if (!expansions.length) expansions.push("你的答案长度分配较均衡。下一步可在 Part 3 的例子后补一句影响或对比，提升观点的层次感。");
    els.expansionNotes.innerHTML = `<ul>${expansions.map(x => `<li>${x}</li>`).join("")}</ul>`;
    els.answerReview.innerHTML = state.answers.map((answer, index) => `
      <div class="review-item">
        <p class="review-part">Part ${answer.part}${answer.adaptive ? " · adaptive follow-up" : ""} · Question ${index + 1}</p>
        <p class="review-question">Q: ${escapeHtml(answer.question)}</p>
        <p class="review-answer review-standard"><b>题库参考答案：</b>${escapeHtml(standardAnswerFor(answer.question))}</p>
        <p class="review-answer review-your-answer"><b>你的本场回答：</b>${escapeHtml(answer.text)}</p>
      </div>
    `).join("") || "<p>本场没有保存到可回顾的回答。</p>";
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function downloadTranscript() {
    const lines = ["IELTS SPEAKING MOCK TEST TRANSCRIPT", ""];
    state.answers.forEach((a, i) => {
      lines.push(`Part ${a.part} · ${a.topic || ""}`);
      lines.push(`Q${i + 1}: ${a.question}`);
      lines.push(`A: ${a.text}`);
      lines.push("");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ielts-speaking-mock-transcript.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  setupRecognition();
  els.compatibilityNote.textContent = state.voiceSupported
    ? `语音识别已就绪 · 题库包含 ${bank.stats.part1Questions} 道 Part 1、${bank.stats.part2Cards} 张题卡和 ${bank.stats.part3Questions} 道 Part 3 问题。已按考频加权：常考/新题优先，保留题穿插。`
    : "此浏览器不支持实时语音识别；仍可使用文字作答完成完整流程。建议使用最新版 Chrome 或 Edge。";

  els.startButton.addEventListener("click", beginExam);
  els.micButton.addEventListener("click", () => state.listening ? stopRecognition() : startRecognition());
  els.submitAnswer.addEventListener("click", () => submitCurrentAnswer(false));
  els.manualAnswer.addEventListener("input", updateSubmitAvailability);
  els.repeatButton.addEventListener("click", () => speak(els.questionText.textContent));
  els.restartButton.addEventListener("click", beginExam);
  els.downloadButton.addEventListener("click", downloadTranscript);
})();

