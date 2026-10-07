(() => {
  "use strict";

  const bank = window.IELTS_BANK;
  const answerBank = window.IELTS_ANSWERS || { part1: [], part2: [] };
  const $ = (id) => document.getElementById(id);
  const views = { welcome: $("welcomeView"), exam: $("examView"), results: $("resultsView") };
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const HISTORY_KEY = "ielts-speaking-mock-question-history-v1";
  const AUDIO_ONLY_KEY = "ielts-speaking-mock-audio-only-v1";

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
    audioOnly: loadAudioOnlyPreference(),
  };

  const els = {
    sessionState: $("sessionState"), compatibilityNote: $("compatibilityNote"), startButton: $("startButton"), resetHistoryButton: $("resetHistoryButton"), audioOnlyToggle: $("audioOnlyToggle"),
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

  function loadHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}");
      return { part1Topics: Array.isArray(saved.part1Topics) ? saved.part1Topics : [], part2Cards: Array.isArray(saved.part2Cards) ? saved.part2Cards : [] };
    } catch (_) {
      return { part1Topics: [], part2Cards: [] };
    }
  }

  function loadAudioOnlyPreference() {
    try { return localStorage.getItem(AUDIO_ONLY_KEY) !== "false"; } catch (_) { return true; }
  }

  const questionHistory = loadHistory();

  function saveHistory() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(questionHistory)); } catch (_) { /* private browsing can disable storage */ }
  }

  function selectWithHistory(items, count, historyField, keyFor, weightFor) {
    const seen = new Set(questionHistory[historyField]);
    let unseen = items.filter(item => !seen.has(keyFor(item)));
    if (!unseen.length) {
      questionHistory[historyField] = [];
      unseen = [...items];
    }
    const selected = weightedSample(unseen, Math.min(count, unseen.length), weightFor);
    if (selected.length < count) {
      const fallback = items.filter(item => !selected.includes(item));
      selected.push(...weightedSample(fallback, count - selected.length, weightFor));
    }
    questionHistory[historyField] = [...new Set([...questionHistory[historyField], ...selected.map(keyFor)])];
    saveHistory();
    return selected;
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
  // The three learner-provided priority charts are the default sampling pool.
  // A small outside chance keeps the mock realistic without overwhelming this list.
  const FEATURED_PART1_TOPICS = new Set(Object.keys(PART1_STAR_PRIORITY));

  function isFeaturedPart2(title) {
    const normalized = title.toLowerCase();
    return PART2_STAR_PRIORITY.some(([phrase]) => normalized.includes(phrase));
  }

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

  const comparisonStopwords = new Set("do does did is are was were be been being have has had can could would should will may might why how what when where which who whom whose people person thing things your you their they them this that these those about with from into for and the a an of to in on at by as it its more most less very".split(" "));

  function relatedPart1Answer(question) {
    const target = new Set(words(question).filter(word => word.length > 3 && !comparisonStopwords.has(word)));
    if (!target.size) return null;
    const scored = answerBank.part1.map(item => {
      const candidates = new Set(words(item.question).filter(word => word.length > 3 && !comparisonStopwords.has(word)));
      const overlap = [...target].filter(word => candidates.has(word)).length;
      return { item, overlap };
    }).sort((a, b) => b.overlap - a.overlap);
    return scored[0]?.overlap >= 2 ? scored[0].item : null;
  }

  const P3_PROFILES = {
    relationships: { reason: "People need trust, emotional support and a sense of belonging, so close relationships matter throughout life.", qualities: "A true friend should be reliable, honest and able to listen without judging too quickly.", prosCons: "Close relationships provide support, but they also need time, patience and clear communication to remain healthy.", how: "The most effective way is to spend regular time together, listen carefully and deal with small misunderstandings before they become bigger problems.", opinion: "Yes, I think it matters because supportive relationships can reduce stress and make people feel less isolated.", examples: "People often build friendships at school, university, work, clubs or during shared activities where they meet repeatedly." },
    happiness: { reason: "Positive emotions often spread because people copy the mood and behaviour of those around them.", qualities: "Adults who work with children need patience, empathy and the ability to notice small changes in behaviour.", prosCons: "Creative activities can improve mood and connection, although they are not a replacement for professional support when a child is seriously unhappy.", how: "Schools can use music, drama, drawing and group activities to give children safe ways to express their feelings.", opinion: "Yes, teachers should pay attention to children's wellbeing, but they also need to respect a child's privacy and avoid controlling every detail.", examples: "Music, films, public art and community performances can all create shared positive emotions." },
    fame: { reason: "People often become popular because they are talented, visible online, or represent something that others admire.", qualities: "A public figure needs self-discipline and a clear sense of responsibility because many people may copy their behaviour.", prosCons: "Fame can bring opportunities and influence, but it also reduces privacy and creates constant public pressure.", how: "Young people should question what celebrities promote and compare it with reliable information rather than copying them automatically.", opinion: "Being popular is not always good; it depends on what a person is known for and how they use their influence.", examples: "Athletes, entertainers, entrepreneurs and online creators are commonly interviewed or become well known." },
    business: { reason: "Many people start businesses because they want more independence, a chance to develop an idea, or potentially a higher income.", qualities: "Successful business people usually need resilience, financial judgement, communication skills and a genuine understanding of customers.", prosCons: "Running a business offers independence and the chance to create jobs, but it also involves financial risk and long working hours.", how: "A business can improve its chances by researching customers, controlling costs and responding honestly to feedback.", opinion: "Yes, calculated risks are often necessary in business, but they should be based on information rather than optimism alone.", examples: "A business succeeds through a useful product or service, capable staff, stable finances and customer trust." },
    elderlyPlants: { reason: "Many older people enjoy plants because caring for them gives a calm routine, light exercise and a feeling of achievement.", qualities: "Older people can offer patience, perspective and practical experience gained from dealing with many different situations.", prosCons: "Living independently can protect an older person's freedom, but it may also increase loneliness or make daily help harder to access.", how: "Families can support older relatives through regular contact, practical help and by respecting their choices.", opinion: "Families should take responsibility for older people when possible, while also considering the person's health needs and preferences.", examples: "Young people can learn resilience, family history and practical life skills from older relatives." },
    sports: { reason: "People admire athletes because visible effort, discipline and performance under pressure can be inspiring.", qualities: "A good athlete needs consistent training, mental resilience, teamwork where relevant and the ability to recover from setbacks.", prosCons: "Sport improves health and confidence, although excessive competition can create pressure or injuries.", how: "Technology can analyse movement, monitor training loads and help athletes recover more safely.", opinion: "Yes, children should do regular sport because it supports health, social skills and lifelong habits, not only competition.", examples: "Children can attend local matches or watch events that are safe, affordable and suitable for their age." },
    medical: { reason: "People become doctors because they want to help others and are interested in science, health and solving difficult problems.", qualities: "Doctors need medical knowledge, careful judgement, empathy and strong communication skills.", prosCons: "Medicine is meaningful and respected, but it involves long training, heavy responsibility and emotional pressure.", how: "Technology can support doctors with information and routine tasks, but doctors still need to explain options and make human judgements.", opinion: "No, technology is unlikely to replace doctors completely because patients need trust, empathy and accountable decision-making.", examples: "Clear explanations, active listening and checking patients understand are important communication skills." },
    languageLearning: { reason: "People learn foreign languages for study, work, travel and access to other cultures.", qualities: "Successful learners are usually curious, patient and willing to make mistakes while practising.", prosCons: "Language learning opens opportunities, although progress can feel slow and frustrating without regular exposure.", how: "A good method combines frequent listening and speaking with useful vocabulary, feedback and realistic goals.", opinion: "Yes, it is important for students because another language can broaden both communication and future options.", examples: "Common difficulties include pronunciation, limited vocabulary, fear of speaking and finding regular practice." },
    money: { reason: "People save money because it gives security and allows them to prepare for education, housing, travel or important purchases.", qualities: "Good money management needs self-control, planning and the ability to distinguish needs from wants.", prosCons: "Saving creates security, but being too focused on money can prevent people from enjoying reasonable experiences in the present.", how: "Schools and parents can teach budgeting through small allowances, simple goals and discussions about everyday spending.", opinion: "Yes, children should learn basic money management early, because habits formed young can prevent problems later.", examples: "People often save for a home, education, emergencies, a vehicle or meaningful gifts." },
    learning: { reason: "Children often learn new skills quickly because they have time to practise, fewer fears about making mistakes and a strong curiosity.", qualities: "Before school, children benefit from communication, basic self-care, cooperation and the ability to concentrate for short periods.", prosCons: "Group learning develops cooperation and ideas, while independent learning allows people to work at their own pace.", how: "Adults learn well when they connect a new skill to a practical need and practise it regularly in small steps.", opinion: "Yes, specialised skills are valuable, but people also need adaptable skills such as communication and problem-solving.", examples: "Useful early skills include sharing, asking for help, listening and handling simple daily tasks." },
    shopping: { reason: "Shopping malls remain popular because they combine shops, food, entertainment and air-conditioned public space in one convenient place.", qualities: "Good service staff need patience, product knowledge and the ability to understand what a customer actually needs.", prosCons: "Small shops can offer personal service, while online shopping provides choice and convenience but makes it harder to check quality first.", how: "Customers can compare reviews, return policies and prices before buying, especially for expensive items.", opinion: "Online shopping is useful, but physical shops remain important when people need to try an item or ask detailed questions.", examples: "People usually shop in malls for clothing, food, household items and leisure activities." },
    memory: { reason: "People remember information better when it is meaningful, repeated and linked to a strong image or personal experience.", qualities: "People with good memories often pay close attention, organise information and review it regularly.", prosCons: "Photos make details easy to recall, while words can explain ideas more precisely; the two work best together.", how: "Technology can use reminders, calendars, photos and note-taking apps, but people still need to decide what is worth remembering.", opinion: "Both words and photos are useful, but photos are often stronger for personal events because they capture visual details.", examples: "Spaced-review apps, calendars and labelled photos can help people remember important information." },
    decisions: { reason: "Some people find decisions difficult because they fear making a mistake, lack information or feel pressure from others.", qualities: "Good decision-makers gather information, consider consequences and accept that no choice is completely risk-free.", prosCons: "Taking time can improve an important decision, but delaying too long can create extra stress or missed opportunities.", how: "People can compare options, ask trusted people for advice and set a realistic deadline for deciding.", opinion: "Important decisions should usually be made carefully, while small everyday choices do not need excessive analysis.", examples: "Daily decisions include what to buy, how to spend time, what to eat and how to organise work." },
    communication: { reason: "The Internet makes communication faster and broader, but it can also make messages shorter and easier to misunderstand.", qualities: "A good listener pays attention, asks relevant questions and responds to the other person's main point.", prosCons: "Digital communication is convenient, but face-to-face conversation often gives clearer emotional cues.", how: "If someone does not listen, I would calmly restate my point, ask whether it is a good time to talk and avoid turning it into an argument.", opinion: "Listening carefully is important because it shows respect and helps prevent unnecessary misunderstandings.", examples: "Young people often discuss study, work, entertainment, relationships and things they see online." },
    time: { reason: "People feel pressured when demands from study, work, family and money compete for the same limited time.", qualities: "People who manage time well tend to plan priorities, start tasks early and leave room for unexpected problems.", prosCons: "Technology can save time through reminders and online services, but it can also distract people if used without limits.", how: "A realistic schedule, short breaks and clear priorities help people balance work, rest and social life.", opinion: "Most people continue some time-wasting activities because they provide quick relaxation, but setting limits can keep them under control.", examples: "Common pressures include deadlines, exams, financial worries and caring responsibilities." },
    groupwork: { reason: "Group work is used because people can combine different strengths and complete a larger task more efficiently.", qualities: "A good leader needs to set clear goals, listen to team members, share credit and deal with problems fairly.", prosCons: "Working alone gives more control and can be faster for simple tasks, while group work brings more ideas but requires coordination.", how: "Schools can teach group work through projects with clear roles, shared deadlines and a short reflection on how the team worked.", opinion: "Yes, students should learn group work because most workplaces require people to communicate and cooperate with others.", examples: "At school, group work can include presentations, experiments, debates, sports teams and research projects." },
    lostItems: { reason: "People lose belongings when they are distracted, rushed or carrying too many things at once.", qualities: "Careful people usually develop small habits, such as putting important items in the same place and checking before they leave.", prosCons: "Digital tracking and online lost-property services can help, but they cannot replace taking basic care of valuable items.", how: "Someone who loses an item should retrace their steps, contact the place they visited and cancel or secure anything sensitive, such as bank cards.", opinion: "Most people lose small everyday items like phones, keys, cards, umbrellas or bags at some point.", examples: "Items are often lost on public transport, in cafés, shops, schools and other busy public places." },
    leisure: { reason: "Leisure matters because people need time to recover from study and work, maintain relationships and enjoy interests outside their responsibilities.", qualities: "Healthy leisure choices usually involve balance, enough rest and activities that genuinely help a person recover.", prosCons: "Technology gives people more entertainment choices, but it can also turn leisure into passive screen time if it is used without limits.", how: "People can protect leisure time by setting boundaries around work and choosing activities such as exercise, hobbies or time with friends.", opinion: "No, leisure is not only for older people; people at every age need some free time to rest and stay mentally healthy.", examples: "In China, people may spend leisure time exercising, eating with friends, travelling locally, watching programmes or doing hobbies." },
    gifts: { reason: "People give gifts to show care, celebrate an occasion or maintain an important relationship.", qualities: "A thoughtful gift-giver pays attention to the other person's interests, needs and preferences rather than focusing only on price.", prosCons: "An expensive gift can feel special, but it can also make the receiver uncomfortable if it creates pressure to return the favour.", how: "The easiest way to choose a gift is to notice what the person uses, talks about or has wanted for some time.", opinion: "A meaningful gift does not have to be expensive; a useful or personal gift is often more memorable.", examples: "People commonly give gifts for birthdays, weddings, graduations, visits and major traditional festivals." },
    travel: { reason: "Young people may travel abroad more often because they seek new experiences, while older people may prefer familiar and comfortable arrangements.", qualities: "Good travellers need flexibility, basic planning and respect for local people and customs.", prosCons: "Reading gives background knowledge, while travel provides direct experience of daily life, language and atmosphere.", how: "People can travel more responsibly by planning transport, respecting local rules and avoiding unnecessary waste.", opinion: "Travelling is usually the stronger way to understand a country, but reading first can make the trip more meaningful.", examples: "People watch travel programmes, read guides and visit museums to learn about other places." },
    technology: { reason: "AI is attractive because it can handle information quickly and support people with routine or complex tasks.", qualities: "Responsible technology users need curiosity, critical thinking and an awareness of privacy and accuracy.", prosCons: "AI can improve efficiency and access to information, but it can also create errors, bias, privacy concerns and over-reliance.", how: "Teachers can set clear rules, require students to explain their thinking and use AI as a support rather than a substitute for learning.", opinion: "People should learn basic AI literacy so they can use it effectively and recognise its limits.", examples: "AI can help with translation, accessibility, scheduling, research support and routine customer service." },
    food: { reason: "People spend more on special food because meals are a way to celebrate, show care and bring family or friends together.", qualities: "Good cooks need patience, attention to detail and a willingness to learn from family traditions or recipes.", prosCons: "Traditional food connects people to culture, while foreign food offers variety; both can be enjoyable when people make balanced choices.", how: "Families can preserve food traditions by cooking together and explaining the story behind festival dishes.", opinion: "Everyday food should be practical and healthy, while festival food can be richer because it is part of a special occasion.", examples: "Traditional dishes, family recipes and seasonal ingredients are often important during festivals." },
    rules: { reason: "Rules exist to protect fairness, safety and the rights of other people in shared spaces.", qualities: "People follow rules more willingly when they understand the reason behind them and see that rules are applied fairly.", prosCons: "Rules create order, but unnecessary or unclear rules can make people feel frustrated and less cooperative.", how: "Parents and teachers can explain consequences, set a good example and apply rules consistently rather than only punishing mistakes.", opinion: "Yes, learning about laws outside school is useful because children also learn from family, media and everyday public life.", examples: "Schools commonly have rules about attendance, respect, safety, homework and use of phones." },
    media: { reason: "People choose films, books, videos and programmes that offer relaxation, useful information or a story they can relate to.", qualities: "Good media creators need originality, an understanding of their audience and the ability to communicate clearly.", prosCons: "Watching at home is convenient and cheap, while cinemas and live programmes offer a stronger shared atmosphere and fewer distractions.", how: "Viewers can choose reliable sources, compare perspectives and limit passive screen time to use media more thoughtfully.", opinion: "Films and books can both develop creativity; films make visual ideas immediate, while books leave more space for imagination.", examples: "Popular content often includes comedy, drama, sport, documentaries, practical tutorials and short entertainment videos." },
    animals: { reason: "People keep pets because companionship can reduce loneliness and teach responsibility, especially in families.", qualities: "Pet owners need patience, time, basic knowledge and a commitment to care for an animal over many years.", prosCons: "Pets bring companionship, but city living can make space, noise and welfare more difficult to manage.", how: "Schools can teach children about animals through visits, stories, science lessons and practical discussions about responsible care.", opinion: "Pets can be family members emotionally, but owners still need to make decisions based on the animal's real welfare needs.", examples: "Animal stories help children understand emotions, consequences and different ways of living." },
    ambition: { reason: "Ambitions give people direction and can motivate them to develop skills over a long period.", qualities: "Helpful parents encourage effort, curiosity and realistic planning rather than forcing one fixed dream on a child.", prosCons: "High ambitions can be motivating, but unrealistic pressure can harm confidence and wellbeing.", how: "People can turn an ambition into progress by setting small milestones, seeking feedback and adjusting plans when circumstances change.", opinion: "Parents should support and advise their children, but the final ambition should reflect the child's own interests and strengths.", examples: "People may aim for a meaningful career, financial security, creative achievement, travel or helping their community." },
  };

  function profileForPart3(topic) {
    const name = topic.toLowerCase();
    if (/friend|family|party|evening/.test(name)) return P3_PROFILES.relationships;
    if (/happiness/.test(name)) return P3_PROFILES.happiness;
    if (/popular|famous/.test(name)) return P3_PROFILES.fame;
    if (/business|successful/.test(name)) return P3_PROFILES.business;
    if (/old people|growing plants/.test(name)) return P3_PROFILES.elderlyPlants;
    if (/athlete|sports|live sports/.test(name)) return P3_PROFILES.sports;
    if (/medical/.test(name)) return P3_PROFILES.medical;
    if (/language/.test(name)) return P3_PROFILES.languageLearning;
    if (/gift for a friend/.test(name)) return P3_PROFILES.gifts;
    if (/saving money/.test(name)) return P3_PROFILES.money;
    if (/skill|lesson/.test(name)) return P3_PROFILES.learning;
    if (/shopping|good service/.test(name)) return P3_PROFILES.shopping;
    if (/memory/.test(name)) return P3_PROFILES.memory;
    if (/decision|plan/.test(name)) return P3_PROFILES.decisions;
    if (/message|told you/.test(name)) return P3_PROFILES.communication;
    if (/special day/.test(name)) return P3_PROFILES.leisure;
    if (/wastes your time|save time|organizing/.test(name)) return P3_PROFILES.time;
    if (/working in a group/.test(name)) return P3_PROFILES.groupwork;
    if (/trip|travel/.test(name)) return P3_PROFILES.travel;
    if (/losing something/.test(name)) return P3_PROFILES.lostItems;
    if (/technological/.test(name)) return P3_PROFILES.technology;
    if (/food|cake/.test(name)) return P3_PROFILES.food;
    if (/law/.test(name)) return P3_PROFILES.rules;
    if (/animals/.test(name)) return P3_PROFILES.animals;
    if (/film|video|advertisement|tv|book/.test(name)) return P3_PROFILES.media;
    if (/ambition/.test(name)) return P3_PROFILES.ambition;
    return P3_PROFILES.time;
  }

  function generatedPart3Answer(question, topic) {
    const lower = question.toLowerCase();
    const profile = profileForPart3(topic);
    if (/disturbed by your neighbour.*party/.test(lower)) return "I would first speak to the neighbour politely, especially if it was late or the noise was affecting sleep. If the problem continued, I would contact building management or the relevant local service rather than starting a confrontation.";
    if (/music and dancing necessary.*party/.test(lower)) return "No, they are not necessary. They can create a lively atmosphere, but a small party can be enjoyable simply because people have good food and time to talk with one another.";
    if (/prefer holding parties at home or in public places/.test(lower)) return "I think it depends on the size and purpose. Small gatherings are often more comfortable at home, while restaurants or event spaces are more practical for larger parties because they provide more room and reduce the cleaning work.";
    if (/where do people normally watch sports events/.test(lower)) return "Many people watch them at home or on their phones because it is convenient and inexpensive. However, fans may go to a stadium, a sports bar or a public screening when they want a stronger shared atmosphere.";
    if (/what sports matches are suitable for children/.test(lower)) return "Matches with a safe venue, a reasonable length and a family-friendly atmosphere are most suitable. Local games or daytime events are often better than very crowded or late-night matches.";
    if (/when do people send gifts/.test(lower)) return P3_PROFILES.gifts.examples;
    if (/do people give gifts or red packets/.test(lower)) return "Both are common. Red packets are especially practical during traditional festivals and weddings, while gifts are often chosen when people want to make the gesture more personal.";
    if (/how does technology affect the way people spend their leisure/.test(lower)) return P3_PROFILES.leisure.prosCons;
    if (/what qualities|what should .* have/.test(lower)) return profile.qualities;
    if (/advantages and disadvantages|differences between|difference between/.test(lower)) return profile.prosCons;
    if (lower.startsWith("why") || /what factors/.test(lower)) return profile.reason;
    if (lower.startsWith("how") || /what should .* do/.test(lower)) return profile.how;
    if (/what kinds|what kind|where do/.test(lower)) return profile.examples;
    return profile.opinion;
  }

  function referenceAnswerFor(item) {
    const exact = standardAnswers.get(questionKey(item.question));
    if (exact) return { source: "题库原题参考答案", text: exact };
    if (item.part === 3) {
      const related = relatedPart1Answer(item.question);
      if (related) return { source: `Part 1 相近题参考答案：${related.question}`, text: related.answer };
      return { source: "根据本题生成的 Part 3 示范回答", text: generatedPart3Answer(item.question, item.topic) };
    }
    return { source: "题库未匹配到参考答案", text: "这道题未在你提供的题库中找到对应参考答案。" };
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
    const allTopics = [...topicMap.keys()];
    const featuredTopics = allTopics.filter(topic => FEATURED_PART1_TOPICS.has(topic));
    const candidateTopics = featuredTopics.length && Math.random() < .85 ? featuredTopics : allTopics;
    const topics = selectWithHistory(candidateTopics, Math.random() < .35 ? 2 : 3, "part1Topics", topic => topic,
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
    const hideQuestionText = state.audioOnly && (state.phase === "part1" || state.phase === "part3");
    els.questionText.textContent = hideQuestionText ? "Listen to the examiner’s question." : item.question;
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
    const featuredCards = bank.part2.filter(card => isFeaturedPart2(card.title));
    const part2Pool = featuredCards.length && Math.random() < .85 ? featuredCards : bank.part2;
    state.part2Card = selectWithHistory(part2Pool, 1, "part2Cards", card => card.title,
      card => frequencyWeight(part2Frequency(card.title)))[0];
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
    els.answerReview.innerHTML = state.answers.map((answer, index) => {
      const reference = referenceAnswerFor(answer);
      return `
      <div class="review-item">
        <p class="review-part">Part ${answer.part}${answer.adaptive ? " · adaptive follow-up" : ""} · Question ${index + 1}</p>
        <p class="review-question">Q: ${escapeHtml(answer.question)}</p>
        <p class="review-answer review-standard"><b>${escapeHtml(reference.source)}：</b>${escapeHtml(reference.text)}</p>
        <p class="review-answer review-your-answer"><b>你的本场回答：</b>${escapeHtml(answer.text)}</p>
      </div>
    `;
    }).join("") || "<p>本场没有保存到可回顾的回答。</p>";
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
  els.audioOnlyToggle.checked = state.audioOnly;
  els.compatibilityNote.textContent = state.voiceSupported
    ? `语音识别已就绪 · 题库包含 ${bank.stats.part1Questions} 道 Part 1、${bank.stats.part2Cards} 张题卡和 ${bank.stats.part3Questions} 道 Part 3 问题。85% 概率优先从你标星图内的 Part 1 / Part 2 题目抽取。`
    : "此浏览器不支持实时语音识别；仍可使用文字作答完成完整流程。建议使用最新版 Chrome 或 Edge。";

  els.startButton.addEventListener("click", beginExam);
  els.resetHistoryButton.addEventListener("click", () => {
    questionHistory.part1Topics = [];
    questionHistory.part2Cards = [];
    saveHistory();
    els.compatibilityNote.textContent = "抽题记录已重置。下一场将从优先题范围重新开始抽取。";
  });
  els.audioOnlyToggle.addEventListener("change", () => {
    state.audioOnly = els.audioOnlyToggle.checked;
    try { localStorage.setItem(AUDIO_ONLY_KEY, String(state.audioOnly)); } catch (_) { /* preference remains for this visit */ }
  });
  els.micButton.addEventListener("click", () => state.listening ? stopRecognition() : startRecognition());
  els.submitAnswer.addEventListener("click", () => submitCurrentAnswer(false));
  els.manualAnswer.addEventListener("input", updateSubmitAvailability);
  els.repeatButton.addEventListener("click", () => {
    const prompt = state.phase === "part2prep" || state.phase === "part2speak"
      ? state.part2Card?.title
      : state.queue[state.index]?.question;
    if (prompt) speak(prompt);
  });
  els.restartButton.addEventListener("click", beginExam);
  els.downloadButton.addEventListener("click", downloadTranscript);
})();

