(function (global) {
  'use strict';

  var STORAGE_KEY = 'cbi_db';
  var SCHEMA_VERSION = 3;
  var CANON_VERSION = 1;
  var CBI_CHARACTERS = ['jane', 'cho', 'rigsby', 'lisbon', 'vanpelt'];
  var SCORE_IDS = ['boss'].concat(CBI_CHARACTERS);
  var CANON_PERSONNEL = [
    {
      id: 'boss',
      name: 'Milo Hayes',
      role: 'CBI 重案组组长 / 现场总指挥 / 小组导师',
      profile: '27岁。大学提前毕业，已有6—7年调查、审讯与现场经验；大学时期便处理过人质谈判。开局时是小组正式组长，不是名义负责人，也不是由成员代行权力的协调人。履历厚于组内年轻探员，是小组真正的导师与最终决策者。',
      timeline: '大学提前毕业 → 大学时期的人质谈判经历 → 6—7年一线与重案经验 → 组建并带领现小组。开局时27岁，领导资历与重大现场经验都在Lisbon、Rigsby和Van Pelt之上。',
      abilities: '小组里最成熟、最聪明的统筹者；擅长现场指挥、审讯、谈判、推理、识人和培养新人。Boss指出的线索、记忆与判断是叙事事实，不得在后文被否定、降级成“记错了”或被他人重新发现。',
      relationships: 'Jane：Milo亲自留下、最偏爱也最重要的人；Jane的感情归属与“家”最终都指向Milo。Cho：年长而可靠，但主动选择服从Milo的领导。Rigsby：Milo看见并培养他的独立能力。Lisbon：因Milo留下Jane造成的空缺而提前调入；Milo是她进入CBI后的第一位重要导师。Van Pelt：Milo给她最初的重要任务与信任，把她带成真正的探员。',
      longTermStatus: '绝对主角与关系中心。所有核心角色的成长都必须因Milo而改变；删去Milo后若某人的主线仍能原样成立，说明写偏了。Boss可以授权局部任务，但授权不等于交出全局指挥；所有结果最终回到Boss。'
    },
    {
      id: 'jane',
      name: 'Patrick Jane',
      role: 'CBI 顾问 / Milo亲自留下的人',
      profile: '观察与操纵天赋极高的顾问，不是探员，也不拥有调动小组的行政权。开局时因Milo坚持留下他而继续待在CBI；这个决定直接造成一个人员空缺，并让Lisbon提前获得调入机会。',
      timeline: 'Milo坚持留下Jane → 原成员被气走、出现空缺 → Lisbon提前调入。关系前期，Jane只把Milo的暧昧理解成惯常调情；低自我价值感使他不敢相信Milo会认真选择自己。Milo约一年后不再和别人约会并继续为Jane留在CBI，Jane才在长期相处中逐渐看懂。',
      abilities: '天才级观察、读人和心理操纵；可以提出反常判断、挑战常规，但不能抢走Boss已经找到的线索，也不能把Boss挤出自己案件的中心。关键场面里，别人看证据时，Jane会先看Milo。',
      relationships: 'Milo是Jane最重要的关系、最终的归属与不肯承认的“家”。他可以欣赏其他人的能力，却不会把任何人放到比Milo更核心的位置；“Jane早已知道Milo认真却故意无视”不是本世界事实。',
      longTermStatus: 'Boss家的猫。当前仍不相信Milo对自己是认真的，关系要通过Milo一次次选择、保护和留下他慢慢建立；不能提前写成已知情后的冷处理。'
    },
    {
      id: 'cho',
      name: 'Kimball Cho',
      role: 'CBI 探员 / Milo麾下资深骨干',
      profile: '33岁左右，比Milo年长约六岁，冷静、稳定、现场经验扎实。他的成熟不构成对Milo的监护或上级关系；他清楚评估过Milo，并主动选择追随这个更年轻的组长。',
      timeline: '积累一线经验 → 与Rigsby搭档并共同办出真正的大案 → 调入Milo的小组。开局时是可靠骨干，但不是Milo的导师，也不会越过Milo接管全局。',
      abilities: '执行、观察、审讯和风险判断稳定；能独立完成被授权的任务，并把结果简洁地交回Boss。',
      relationships: '对Milo的核心关系是经过判断后的主动服从与忠诚。对Rigsby是搭档，不替他决定人生，也不会把小组变成自己的班底。',
      longTermStatus: '成熟的追随者与执行支柱。能力用于证明Milo会选人、会用人，而不是削弱Milo的领导位置。'
    },
    {
      id: 'rigsby',
      name: 'Wayne Rigsby',
      role: 'CBI 探员 / 外勤骨干',
      profile: '27岁，与Milo同龄。有一定地方警务与现场经验，但在与Cho搭档之前没有经手过真正的大案。体能、走访和现场执行突出，仍需要有人把他从“Cho的搭档”看成能独当一面的探员。',
      timeline: '地方与现场工作 → 与Cho搭档 → 两人共同办出一宗重要案件 → 被调入Milo的小组。年龄与Milo相同，但领导经验、重案履历与全局判断明显少于Milo。',
      abilities: '追踪、走访、现场保护、体力执行与建立证人信任。接到任务后可以自主完成过程，但重要判断和调查成果必须向Boss汇报。',
      relationships: 'Milo是第一个真正把重要责任交给他、让他证明自己不只是Cho附属的人。Cho是搭档；Van Pelt与他有四岁年龄差。',
      longTermStatus: '在Milo的信任与任务中长成独立骨干。他的高光应当同时体现Milo识人准确，而不是另起一条与Boss无关的成长线。'
    },
    {
      id: 'lisbon',
      name: 'Teresa Lisbon',
      role: 'CBI 新调入探员 / Milo的学生',
      profile: '25岁。大学毕业后在地方警局工作三年，明显比同龄人优秀，但小地方缺少大案和施展空间，年轻女性也很难获得上升机会。她本来还不到调入CBI的时候；Milo坚持留下Jane气走一名成员后出现空缺，她听说年轻组长很难相处，仍闭眼抓住了这个机会。',
      timeline: '大学毕业 → 地方警局三年 → 因小组临时空缺而提前数年进入CBI。调入前没有重要导师，也没有办成过大案要案；原作中成熟强悍的Lisbon是她在Milo带领下会抵达的终点，不是开局状态。',
      abilities: '潜力高、学习快、认真、倔强，努力用程序意识和准备充分掩饰紧张。第一次面对疑似Red John现场时也会紧张，只是比Van Pelt更会藏。她可以质疑、提出担忧和请求任务，但必须向Boss提问。',
      relationships: 'Milo是她进入CBI后的组长、真正的导师和最重要的职业关系。她想向他证明自己值得这次破格机会，是一只年轻、倔强、要Boss亲手带出来的小Kitty；不是照管Boss的妈妈、姐姐或行政上级。',
      longTermStatus: '开局没有核查Boss流程、索要全员名单、审查人员决定、调动Milo的人或接管全局的权力。只有Milo明确授权时，她才获得局部协调权，而且那代表Milo的权威。她的成长来自Milo的教导、信任和逐步放权。'
    },
    {
      id: 'vanpelt',
      name: 'Grace Van Pelt',
      role: 'CBI 新人探员 / Milo带教成员',
      profile: '23岁。大学毕业后完成一年专项培训，刚正式入职。聪明、认真、技术能力好，但还没有足以让她在重大现场完全镇定的经验。',
      timeline: '大学毕业 → 一年专项培训 → 23岁进入Milo的小组。与Rigsby相差四岁。第一次看到疑似Red John现场时会明显紧张，需要在任务与信任中慢慢站稳。',
      abilities: '资料检索、通讯与数据整理潜力突出；当前仍需要明确任务、反馈和现场带教。她找到的信息先交给Boss，由Boss决定它在全案中的位置。',
      relationships: 'Milo是给她第一份重要任务、第一份真正信任并把她培养成探员与未来领导者的人。她与其他成员可以建立关系，但职业成长的主轴必须经过Milo。',
      longTermStatus: '年轻新人，不被写成已经完成成长的成熟探员。她会依靠Boss的判断与保护，同时努力成为值得Boss继续托付的人。'
    }
  ];
  var ACTION_DIFFICULTIES = {
    quick: { label: '快速', threshold: 15 },
    normal: { label: '普通', threshold: 30 },
    hard: { label: '棘手', threshold: 60 }
  };
  var INVESTIGATOR_CONFIG = {
    rigsby: { activity: 0.78, min: 1, max: 15 },
    vanpelt: { activity: 0.74, min: 1, max: 15 },
    lisbon: { activity: 0.62, min: 8, max: 15 },
    cho: { activity: 0.64, min: 8, max: 15 },
    jane: { activity: 0.06, min: 50, max: 100 }
  };
  var DEFAULT_COMMISSION_POOL = [
    {
      id: 'commission_lisbon_no_spend',
      title: '带新人熟悉报销',
      task: '替Lisbon看一遍她第一次提交的CBI经费单，指出需要修改的地方。',
      issuer: 'lisbon',
      brief: 'Boss，我不确定CBI这几栏的要求。你有空时教我一次吗？',
      completion: 'Lisbon按Boss标出的地方逐项改好，把最终版本先交给他确认。',
      rewardGems: 2,
      rewardAffinity: 2,
      repeatable: true,
      cooldownDays: 7
    },
    {
      id: 'commission_jane_sink',
      title: '处理异常气味',
      task: '清理洗手池。',
      issuer: 'jane',
      brief: 'Boss，你家的洗手池闻起来像下水道。',
      completion: 'Jane重新闻了一下，宣布这里暂时恢复了居住资格。',
      rewardGems: 2,
      rewardAffinity: 2,
      repeatable: true,
      cooldownDays: 7
    }
  ];

  function text(value) {
    return value == null ? '' : String(value);
  }

  function number(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (fallback || 0);
  }

  function bool(value, fallback) {
    return value === undefined ? !!fallback : !!value;
  }

  function stringList(value) {
    if (Array.isArray(value)) return value.map(text).map(function (item) { return item.trim(); }).filter(Boolean);
    return text(value).split(/[，,\n]/).map(function (item) { return item.trim(); }).filter(Boolean);
  }

  function uniqueList(value, allowed) {
    var result = [];
    stringList(value).forEach(function (item) {
      if (allowed && allowed.indexOf(item) < 0) return;
      if (result.indexOf(item) < 0) result.push(item);
    });
    return result;
  }

  function createId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function scoreMap(value) {
    var source = value && typeof value === 'object' ? value : {};
    var result = {};
    SCORE_IDS.forEach(function (id) { result[id] = Math.max(0, Math.floor(number(source[id], 0))); });
    return result;
  }

  function affinityMap(value) {
    var source = value && typeof value === 'object' ? value : {};
    var result = {};
    CBI_CHARACTERS.forEach(function (id) { result[id] = Math.max(0, Math.floor(number(source[id], 0))); });
    return result;
  }

  function emptyCaseFund() {
    return {
      charFunds: affinityMap(),
      investigations: [],
      logs: []
    };
  }

  function cloneDefaultCommissions() {
    return DEFAULT_COMMISSION_POOL.map(function (item) { return Object.assign({}, item); });
  }

  function emptyWork() {
    return {
      salary: 0,
      commissionGems: 0,
      affinity: affinityMap(),
      habits: [],
      habitRecords: {},
      actions: [],
      anonymousCases: [],
      culpritScores: scoreMap(),
      majorCaseStepCost: 500,
      majorCaseProgress: {},
      caseFund: emptyCaseFund(),
      commissionPool: cloneDefaultCommissions(),
      commissionOffer: null,
      activeCommissions: [],
      commissionHistory: [],
      deployments: {},
      shop: {
        customItems: [],
        owned: [],
        purchaseLog: [],
        reactionsSeen: []
      }
    };
  }

  function emptyDB() {
    return {
      schemaVersion: SCHEMA_VERSION,
      canonVersion: CANON_VERSION,
      currentCaseId: null,
      cases: [],
      personnel: [],
      work: emptyWork()
    };
  }

  function normalizeCase(item) {
    item = item && typeof item === 'object' ? item : {};
    return {
      id: text(item.id) || createId('case'),
      episodeCode: text(item.episodeCode),
      date: text(item.date),
      title: text(item.title),
      status: ['active', 'closed', 'archive'].indexOf(item.status) >= 0 ? item.status : 'closed',
      summary: text(item.summary),
      characters: stringList(item.characters),
      mainlineStatus: text(item.mainlineStatus),
      body: text(item.body),
      longTermChanges: text(item.longTermChanges),
      createdAt: text(item.createdAt) || new Date().toISOString(),
      updatedAt: text(item.updatedAt) || new Date().toISOString()
    };
  }

  function normalizePerson(item) {
    item = item && typeof item === 'object' ? item : {};
    return {
      id: text(item.id) || createId('person'),
      name: text(item.name),
      role: text(item.role),
      profile: text(item.profile),
      timeline: text(item.timeline),
      abilities: text(item.abilities),
      relationships: text(item.relationships),
      longTermStatus: text(item.longTermStatus),
      createdAt: text(item.createdAt) || new Date().toISOString(),
      updatedAt: text(item.updatedAt) || new Date().toISOString()
    };
  }

  function canonKeyForPerson(item) {
    var value = (text(item && item.id) + ' ' + text(item && item.name)).toLowerCase();
    if (/(^|\s)(boss|milo|hayes)(\s|$)|米洛/.test(value)) return 'boss';
    if (/(patrick\s*)?jane|简恩|简\b/.test(value)) return 'jane';
    if (/kimball\s*cho|\bcho\b|周探员/.test(value)) return 'cho';
    if (/wayne\s*rigsby|\brigsby\b|里格斯比/.test(value)) return 'rigsby';
    if (/teresa\s*lisbon|\blisbon\b|里斯本/.test(value)) return 'lisbon';
    if (/grace\s*van\s*pelt|\bvan\s*pelt\b|\bvanpelt\b|范佩尔特/.test(value)) return 'vanpelt';
    return '';
  }

  function restoreCanonPersonnel(value) {
    var source = Array.isArray(value) ? value.map(normalizePerson) : [];
    var matched = {};
    var extras = [];
    source.forEach(function (item) {
      var key = canonKeyForPerson(item);
      if (key) {
        if (!matched[key]) matched[key] = item;
        return;
      }
      extras.push(item);
    });
    var now = new Date().toISOString();
    var core = CANON_PERSONNEL.map(function (canon) {
      var previous = matched[canon.id];
      return normalizePerson(Object.assign({}, canon, {
        createdAt: previous && previous.createdAt ? previous.createdAt : now,
        updatedAt: now
      }));
    });
    return core.concat(extras);
  }

  function restoreCanonWork(work) {
    var replacement = DEFAULT_COMMISSION_POOL.find(function (item) { return item.id === 'commission_lisbon_no_spend'; });
    work.commissionPool = work.commissionPool.map(function (item) {
      return item.id === replacement.id ? normalizeCommission(Object.assign({}, item, replacement)) : item;
    });
    work.activeCommissions = work.activeCommissions.map(function (item) {
      if (item.poolId !== replacement.id) return item;
      return normalizeActiveCommission(Object.assign({}, item, replacement, {
        id: item.id,
        poolId: item.poolId,
        acceptedAt: item.acceptedAt
      }));
    });
    return work;
  }

  function normalizeHabit(item) {
    item = item && typeof item === 'object' ? item : {};
    return {
      id: text(item.id) || createId('habit'),
      name: text(item.name).trim(),
      description: text(item.description),
      type: item.type === 'interval' ? 'interval' : 'count',
      interval: Math.max(1, Math.min(365, Math.floor(number(item.interval, 1)))),
      salary: Math.max(0, Math.floor(number(item.salary, 10))),
      createdAt: text(item.createdAt) || new Date().toISOString()
    };
  }

  function normalizeAction(item) {
    item = item && typeof item === 'object' ? item : {};
    var difficulty = Object.prototype.hasOwnProperty.call(ACTION_DIFFICULTIES, item.difficulty) ? item.difficulty : 'normal';
    return {
      id: text(item.id) || createId('action'),
      title: text(item.title).trim(),
      description: text(item.description),
      dueDate: text(item.dueDate),
      difficulty: difficulty,
      status: ['planned', 'active', 'completed'].indexOf(item.status) >= 0 ? item.status : 'planned',
      anonymousCaseId: text(item.anonymousCaseId) || null,
      createdAt: text(item.createdAt) || new Date().toISOString(),
      startedAt: text(item.startedAt),
      completedAt: text(item.completedAt)
    };
  }

  function normalizeReport(item) {
    item = item && typeof item === 'object' ? item : {};
    return {
      date: text(item.date),
      characterId: CBI_CHARACTERS.indexOf(item.characterId) >= 0 ? item.characterId : '',
      found: !!item.found,
      delta: Math.max(0, Math.floor(number(item.delta, 0))),
      total: Math.max(0, Math.min(100, Math.floor(number(item.total, 0)))),
      at: text(item.at)
    };
  }

  function normalizeAnonymousCase(item) {
    item = item && typeof item === 'object' ? item : {};
    var threshold = Math.max(1, Math.min(100, Math.floor(number(item.threshold, 100))));
    var progress = {};
    var lastRollByCharacter = {};
    CBI_CHARACTERS.forEach(function (id) {
      progress[id] = Math.max(0, Math.min(threshold, Math.floor(number(item.progress && item.progress[id], 0))));
      lastRollByCharacter[id] = text(item.lastRollByCharacter && item.lastRollByCharacter[id]);
    });
    return {
      id: text(item.id) || createId('anonymous'),
      actionId: text(item.actionId),
      status: item.status === 'closed' ? 'closed' : 'active',
      threshold: threshold,
      progress: progress,
      lastRollByCharacter: lastRollByCharacter,
      reports: Array.isArray(item.reports) ? item.reports.map(normalizeReport).filter(function (entry) { return entry.characterId; }) : [],
      winners: uniqueList(item.winners, CBI_CHARACTERS),
      bossWon: !!item.bossWon,
      settled: !!item.settled,
      createdAt: text(item.createdAt) || new Date().toISOString(),
      closedAt: text(item.closedAt)
    };
  }

  function normalizeCommission(item) {
    item = item && typeof item === 'object' ? item : {};
    var issuer = CBI_CHARACTERS.indexOf(item.issuer) >= 0 ? item.issuer : 'jane';
    return {
      id: text(item.id) || createId('commission'),
      title: text(item.title).trim(),
      task: text(item.task).trim(),
      issuer: issuer,
      brief: text(item.brief),
      completion: text(item.completion),
      rewardGems: Math.max(0, Math.floor(number(item.rewardGems, 1))),
      rewardAffinity: Math.max(0, Math.floor(number(item.rewardAffinity, 1))),
      repeatable: bool(item.repeatable, true),
      cooldownDays: Math.max(0, Math.floor(number(item.cooldownDays, 7)))
    };
  }

  function normalizeActiveCommission(item) {
    item = item && typeof item === 'object' ? item : {};
    var snapshot = normalizeCommission(item);
    snapshot.id = text(item.id) || createId('active_commission');
    snapshot.poolId = text(item.poolId);
    snapshot.acceptedAt = text(item.acceptedAt) || new Date().toISOString();
    return snapshot;
  }

  function normalizeCommissionHistory(item) {
    item = item && typeof item === 'object' ? item : {};
    return {
      id: text(item.id) || createId('commission_log'),
      poolId: text(item.poolId),
      title: text(item.title),
      task: text(item.task),
      issuer: CBI_CHARACTERS.indexOf(item.issuer) >= 0 ? item.issuer : 'jane',
      rewardGems: Math.max(0, Math.floor(number(item.rewardGems, 0))),
      rewardAffinity: Math.max(0, Math.floor(number(item.rewardAffinity, 0))),
      completedAt: text(item.completedAt) || new Date().toISOString(),
      completedDate: text(item.completedDate)
    };
  }

  function normalizeDeployment(item, dateKey) {
    item = item && typeof item === 'object' ? item : {};
    var mode = ['office', 'temporary_field', 'full_field'].indexOf(item.bossMode) >= 0 ? item.bossMode : 'office';
    var fieldAgents = uniqueList(item.fieldAgents, CBI_CHARACTERS);
    var returnedAgents = uniqueList(item.returnedAgents, CBI_CHARACTERS);
    var withBoss = mode === 'office' ? CBI_CHARACTERS.filter(function (id) { return fieldAgents.indexOf(id) < 0; }) : fieldAgents;
    var mealLead = withBoss.indexOf(item.mealLead) >= 0 ? item.mealLead : '';
    return {
      date: text(item.date) || text(dateKey),
      bossMode: mode,
      fieldAgents: fieldAgents,
      returnedAgents: returnedAgents,
      mealLead: mealLead,
      approvedBudget: Math.max(0, Math.floor(number(item.approvedBudget, 0))),
      returnedAt: text(item.returnedAt),
      updatedAt: text(item.updatedAt) || new Date().toISOString()
    };
  }

  function normalizeShopItem(item) {
    item = item && typeof item === 'object' ? item : {};
    return {
      id: text(item.id) || createId('shop_item'),
      name: text(item.name).trim(),
      description: text(item.description),
      series: text(item.series) || '自选',
      category: ['clothing', 'accessory', 'gift'].indexOf(item.category) >= 0 ? item.category : 'clothing',
      wearers: uniqueList(item.wearers, ['boss'].concat(CBI_CHARACTERS)),
      price: Math.max(1, Math.floor(number(item.price, 50))),
      color: /^#[0-9a-f]{6}$/i.test(text(item.color)) ? text(item.color) : '#E8B96A',
      reaction: text(item.reaction),
      builtIn: !!item.builtIn
    };
  }

  function normalizeShop(value) {
    var source = value && typeof value === 'object' ? value : {};
    return {
      customItems: Array.isArray(source.customItems) ? source.customItems.map(normalizeShopItem).filter(function (item) { return item.name; }) : [],
      owned: uniqueList(source.owned),
      purchaseLog: Array.isArray(source.purchaseLog) ? source.purchaseLog.map(function (entry) {
        entry = entry && typeof entry === 'object' ? entry : {};
        return { itemId: text(entry.itemId), price: Math.max(0, Math.floor(number(entry.price, 0))), purchasedAt: text(entry.purchasedAt) };
      }).filter(function (entry) { return entry.itemId; }) : [],
      reactionsSeen: uniqueList(source.reactionsSeen)
    };
  }

  function normalizeInvestigation(item) {
    item = item && typeof item === 'object' ? item : {};
    return {
      id: text(item.id) || createId('investigation'),
      date: text(item.date) || workDayKey(),
      characterId: CBI_CHARACTERS.indexOf(item.characterId) >= 0 ? item.characterId : 'rigsby',
      caseId: text(item.caseId),
      title: text(item.title),
      detail: text(item.detail),
      amount: Math.max(0, Math.floor(number(item.amount, 0))),
      status: ['pending', 'approved', 'declined'].indexOf(item.status) >= 0 ? item.status : 'pending',
      reply: text(item.reply),
      sceneId: text(item.sceneId),
      progressDelta: Math.max(0, Math.floor(number(item.progressDelta, 0))),
      progressBase: Math.max(0, Math.floor(number(item.progressBase, 0))),
      progressRoll: Math.max(-2, Math.min(2, Math.floor(number(item.progressRoll, 0)))),
      progressLine: text(item.progressLine),
      createdAt: text(item.createdAt) || new Date().toISOString(),
      resolvedAt: text(item.resolvedAt)
    };
  }

  function normalizeCaseFundLog(item) {
    item = item && typeof item === 'object' ? item : {};
    return {
      id: text(item.id) || createId('fund_log'),
      date: text(item.date) || workDayKey(),
      type: ['allocation', 'investigation', 'manual'].indexOf(item.type) >= 0 ? item.type : 'manual',
      characterId: CBI_CHARACTERS.indexOf(item.characterId) >= 0 ? item.characterId : '',
      caseId: text(item.caseId),
      content: text(item.content),
      createdAt: text(item.createdAt) || new Date().toISOString()
    };
  }

  function normalizeCaseFund(value) {
    var source = value && typeof value === 'object' ? value : {};
    return {
      charFunds: affinityMap(source.charFunds),
      investigations: Array.isArray(source.investigations) ? source.investigations.map(normalizeInvestigation) : [],
      logs: Array.isArray(source.logs) ? source.logs.map(normalizeCaseFundLog).filter(function (item) { return item.content; }) : []
    };
  }

  function normalizeMajorCaseScene(item) {
    item = item && typeof item === 'object' ? item : {};
    var allowed = ['boss'].concat(CBI_CHARACTERS);
    return {
      id: text(item.id) || createId('case_scene'),
      characterId: allowed.indexOf(item.characterId) >= 0 ? item.characterId : 'boss',
      line: text(item.line),
      delta: Math.max(0, Math.floor(number(item.delta, 0))),
      cost: Math.max(0, Math.floor(number(item.cost, 0))),
      createdAt: text(item.createdAt) || new Date().toISOString()
    };
  }

  function normalizeMajorCaseProgress(value) {
    var source = value && typeof value === 'object' ? value : {};
    var result = {};
    Object.keys(source).forEach(function (caseId) {
      var entry = source[caseId] && typeof source[caseId] === 'object' ? source[caseId] : {};
      result[caseId] = {
        progress: Math.max(0, Math.min(100, Math.floor(number(entry.progress, 0)))),
        scenes: Array.isArray(entry.scenes) ? entry.scenes.map(normalizeMajorCaseScene) : [],
        archivedAt: text(entry.archivedAt)
      };
    });
    return result;
  }

  function normalizeHabitRecords(value) {
    var source = value && typeof value === 'object' ? value : {};
    var result = {};
    Object.keys(source).forEach(function (dateKey) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !source[dateKey] || typeof source[dateKey] !== 'object') return;
      result[dateKey] = {};
      Object.keys(source[dateKey]).forEach(function (habitId) {
        var record = source[dateKey][habitId] || {};
        result[dateKey][habitId] = {
          value: Math.max(0, number(record.value, 0)),
          events: Array.isArray(record.events) ? record.events.map(function (event) {
            event = event && typeof event === 'object' ? event : {};
            return {
              value: Math.max(0, number(event.value, 0)),
              salary: Math.max(0, Math.floor(number(event.salary, 0))),
              at: text(event.at)
            };
          }) : []
        };
      });
    });
    return result;
  }

  function normalizeWork(value) {
    var source = value && typeof value === 'object' ? value : {};
    var defaults = emptyWork();
    var deployments = {};
    if (source.deployments && typeof source.deployments === 'object') {
      Object.keys(source.deployments).forEach(function (dateKey) {
        deployments[dateKey] = normalizeDeployment(source.deployments[dateKey], dateKey);
      });
    }
    var commissionPool = source.commissionPool === undefined
      ? defaults.commissionPool
      : (Array.isArray(source.commissionPool) ? source.commissionPool.map(normalizeCommission).filter(function (item) { return item.title && item.task; }) : []);
    var offer = null;
    if (source.commissionOffer && typeof source.commissionOffer === 'object') {
      offer = {
        date: text(source.commissionOffer.date),
        poolId: text(source.commissionOffer.poolId),
        issuer: CBI_CHARACTERS.indexOf(source.commissionOffer.issuer) >= 0 ? source.commissionOffer.issuer : ''
      };
    }
    return {
      salary: Math.max(0, Math.floor(number(source.salary, 0))),
      commissionGems: Math.max(0, Math.floor(number(source.commissionGems, 0))),
      affinity: affinityMap(source.affinity),
      habits: Array.isArray(source.habits) ? source.habits.map(normalizeHabit).filter(function (item) { return item.name; }) : [],
      habitRecords: normalizeHabitRecords(source.habitRecords),
      actions: Array.isArray(source.actions) ? source.actions.map(normalizeAction).filter(function (item) { return item.title; }) : [],
      anonymousCases: Array.isArray(source.anonymousCases) ? source.anonymousCases.map(normalizeAnonymousCase) : [],
      culpritScores: scoreMap(source.culpritScores),
      majorCaseStepCost: Math.max(1, Math.floor(number(source.majorCaseStepCost, 500))),
      majorCaseProgress: normalizeMajorCaseProgress(source.majorCaseProgress),
      caseFund: normalizeCaseFund(source.caseFund),
      commissionPool: commissionPool,
      commissionOffer: offer,
      activeCommissions: Array.isArray(source.activeCommissions) ? source.activeCommissions.map(normalizeActiveCommission) : [],
      commissionHistory: Array.isArray(source.commissionHistory) ? source.commissionHistory.map(normalizeCommissionHistory) : [],
      deployments: deployments,
      shop: normalizeShop(source.shop)
    };
  }

  function normalize(value) {
    var source = value && typeof value === 'object' ? value : {};
    var needsCanonRestore = Math.floor(number(source.canonVersion, 0)) < CANON_VERSION;
    var hadCurrentCase = Object.prototype.hasOwnProperty.call(source, 'currentCaseId');
    var result = emptyDB();
    result.cases = Array.isArray(source.cases) ? source.cases.map(normalizeCase) : [];
    result.personnel = Array.isArray(source.personnel) ? source.personnel.map(normalizePerson) : [];
    if (needsCanonRestore) result.personnel = restoreCanonPersonnel(result.personnel);
    result.canonVersion = CANON_VERSION;
    result.currentCaseId = text(source.currentCaseId) || null;
    result.work = normalizeWork(source.work);
    if (needsCanonRestore) result.work = restoreCanonWork(result.work);
    if (!result.cases.some(function (item) { return item.id === result.currentCaseId && item.status === 'active'; })) result.currentCaseId = null;
    var active = result.cases.find(function (item) { return item.status === 'active'; });
    if (!hadCurrentCase && !result.currentCaseId && active) result.currentCaseId = active.id;
    return result;
  }

  function load() {
    var raw = null;
    try { raw = global.localStorage.getItem(STORAGE_KEY); } catch (error) {}
    if (!raw) return emptyDB();
    try {
      var parsed = JSON.parse(raw);
      var normalized = normalize(parsed);
      if (Math.floor(number(parsed.schemaVersion, 0)) < SCHEMA_VERSION || Math.floor(number(parsed.canonVersion, 0)) < CANON_VERSION) {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      }
      return normalized;
    } catch (error) { return emptyDB(); }
  }

  function save(value) {
    var normalized = normalize(value);
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    } catch (error) {
      return null;
    }
  }

  function episodeParts(code) {
    var match = /^S(\d+)E(\d+)$/i.exec(text(code).trim());
    if (match) return [Number(match[1]), Number(match[2])];
    var archive = /^ARCHIVE\s*(\d+)$/i.exec(text(code).trim());
    if (archive) return [-1, Number(archive[1])];
    return [9999, 9999];
  }

  function compareCases(left, right) {
    var leftDate = text(left && left.date);
    var rightDate = text(right && right.date);
    if (leftDate && rightDate && leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    if (leftDate && !rightDate) return -1;
    if (!leftDate && rightDate) return 1;
    var a = episodeParts(left && left.episodeCode);
    var b = episodeParts(right && right.episodeCode);
    if (a[0] !== b[0]) return a[0] - b[0];
    if (a[1] !== b[1]) return a[1] - b[1];
    return text(left && left.createdAt).localeCompare(text(right && right.createdAt));
  }

  function sortedCases(cases, descending) {
    var result = (cases || []).slice().sort(compareCases);
    return descending ? result.reverse() : result;
  }

  function mainlineEntries(cases) {
    return sortedCases(cases, false).filter(function (item) {
      return text(item.mainlineStatus).trim();
    });
  }

  function workDayKey(value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return text(value);
    var date = value instanceof Date ? new Date(value.getTime()) : new Date(value || Date.now());
    date.setHours(date.getHours() - 4);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function stableUnit(seed) {
    var hash = 2166136261;
    var value = text(seed);
    for (var index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967296;
  }

  function rollAnonymousCaseDay(caseItem, dateKey) {
    var report = [];
    if (!caseItem || caseItem.status !== 'active') return report;
    CBI_CHARACTERS.forEach(function (characterId) {
      if (caseItem.progress[characterId] >= caseItem.threshold) return;
      if (caseItem.lastRollByCharacter[characterId] === dateKey) return;
      var config = INVESTIGATOR_CONFIG[characterId];
      var found = stableUnit(caseItem.id + '|' + dateKey + '|' + characterId + '|activity') < config.activity;
      var delta = 0;
      if (found) {
        var span = config.max - config.min + 1;
        delta = config.min + Math.floor(stableUnit(caseItem.id + '|' + dateKey + '|' + characterId + '|progress') * span);
        caseItem.progress[characterId] = Math.min(caseItem.threshold, caseItem.progress[characterId] + delta);
      }
      caseItem.lastRollByCharacter[characterId] = dateKey;
      var entry = {
        date: dateKey,
        characterId: characterId,
        found: found,
        delta: delta,
        total: caseItem.progress[characterId],
        at: new Date().toISOString()
      };
      caseItem.reports.push(entry);
      report.push(entry);
    });
    return report;
  }

  function advanceAnonymousCases(value, dateValue) {
    var db = normalize(value);
    var dateKey = workDayKey(dateValue);
    var reports = [];
    db.work.anonymousCases.forEach(function (caseItem) {
      rollAnonymousCaseDay(caseItem, dateKey).forEach(function (entry) { reports.push(Object.assign({ caseId: caseItem.id }, entry)); });
    });
    return { db: db, date: dateKey, reports: reports };
  }

  function addAction(value, data) {
    var db = normalize(value);
    var item = normalizeAction(Object.assign({}, data, { id: createId('action'), status: 'planned' }));
    db.work.actions.push(item);
    return { db: db, action: item };
  }

  function startAction(value, actionId, dateValue) {
    var db = normalize(value);
    var action = db.work.actions.find(function (item) { return item.id === actionId; });
    if (!action || action.status !== 'planned') return { db: db, action: action || null, caseItem: null, reports: [] };
    var now = new Date().toISOString();
    var caseItem = normalizeAnonymousCase({
      id: createId('anonymous'),
      actionId: action.id,
      status: 'active',
      threshold: ACTION_DIFFICULTIES[action.difficulty].threshold,
      createdAt: now
    });
    action.status = 'active';
    action.startedAt = now;
    action.anonymousCaseId = caseItem.id;
    db.work.anonymousCases.push(caseItem);
    var reports = rollAnonymousCaseDay(caseItem, workDayKey(dateValue));
    return { db: db, action: action, caseItem: caseItem, reports: reports };
  }

  function completeAction(value, actionId, dateValue) {
    var advanced = advanceAnonymousCases(value, dateValue);
    var db = advanced.db;
    var action = db.work.actions.find(function (item) { return item.id === actionId; });
    if (!action || action.status === 'completed') return { db: db, action: action || null, caseItem: null, reports: advanced.reports };
    var caseItem = db.work.anonymousCases.find(function (item) { return item.id === action.anonymousCaseId; });
    var now = new Date().toISOString();
    action.status = 'completed';
    action.completedAt = now;
    if (!caseItem) return { db: db, action: action, caseItem: null, reports: advanced.reports };
    caseItem.status = 'closed';
    caseItem.closedAt = now;
    caseItem.winners = CBI_CHARACTERS.filter(function (characterId) { return caseItem.progress[characterId] >= caseItem.threshold; });
    caseItem.bossWon = caseItem.winners.length === 0;
    if (!caseItem.settled) {
      if (caseItem.bossWon) db.work.culpritScores.boss += 1;
      else caseItem.winners.forEach(function (characterId) { db.work.culpritScores[characterId] += 1; });
      caseItem.settled = true;
    }
    return { db: db, action: action, caseItem: caseItem, reports: advanced.reports };
  }

  function dayOrdinal(dateKey) {
    var parts = text(dateKey).split('-').map(Number);
    return parts.length === 3 ? Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000) : 0;
  }

  function commissionEligible(work, item, dateKey) {
    if (work.activeCommissions.some(function (active) { return active.poolId === item.id; })) return false;
    var history = work.commissionHistory.filter(function (entry) { return entry.poolId === item.id; });
    if (!item.repeatable && history.length) return false;
    if (item.repeatable && history.length && item.cooldownDays > 0) {
      var last = history.slice().sort(function (a, b) { return text(a.completedDate).localeCompare(text(b.completedDate)); }).pop();
      if (dayOrdinal(dateKey) - dayOrdinal(last.completedDate) < item.cooldownDays) return false;
    }
    return true;
  }

  function ensureCommissionOffer(value, dateValue) {
    var db = normalize(value);
    var dateKey = workDayKey(dateValue);
    if (db.work.activeCommissions.length || db.work.commissionHistory.some(function (entry) { return entry.completedDate === dateKey; })) {
      db.work.commissionOffer = null;
      return { db: db, offer: null };
    }
    var existing = db.work.commissionOffer;
    if (existing && existing.date === dateKey && db.work.commissionPool.some(function (item) { return item.id === existing.poolId; })) {
      return { db: db, offer: existing };
    }
    var candidates = db.work.commissionPool.filter(function (item) { return commissionEligible(db.work, item, dateKey); });
    if (!candidates.length) {
      db.work.commissionOffer = null;
      return { db: db, offer: null };
    }
    var seed = 'cbi-commission|' + dateKey + '|' + candidates.map(function (item) { return item.id; }).join(',');
    var chosen = candidates[Math.floor(stableUnit(seed) * candidates.length)];
    db.work.commissionOffer = { date: dateKey, poolId: chosen.id, issuer: chosen.issuer };
    return { db: db, offer: db.work.commissionOffer };
  }

  function acceptCommission(value, dateValue) {
    var offered = ensureCommissionOffer(value, dateValue);
    var db = offered.db;
    if (!offered.offer || db.work.activeCommissions.length) return { db: db, active: db.work.activeCommissions[0] || null };
    var poolItem = db.work.commissionPool.find(function (item) { return item.id === offered.offer.poolId; });
    if (!poolItem) return { db: db, active: null };
    var active = normalizeActiveCommission(Object.assign({}, poolItem, {
      id: createId('active_commission'),
      poolId: poolItem.id,
      acceptedAt: new Date().toISOString()
    }));
    db.work.activeCommissions.push(active);
    db.work.commissionOffer = null;
    return { db: db, active: active };
  }

  function completeCommission(value, activeId, dateValue) {
    var db = normalize(value);
    var index = db.work.activeCommissions.findIndex(function (item) { return item.id === activeId; });
    if (index < 0) return { db: db, completed: null };
    var active = db.work.activeCommissions[index];
    var completedDate = workDayKey(dateValue);
    db.work.commissionGems += active.rewardGems;
    db.work.affinity[active.issuer] += active.rewardAffinity;
    var history = normalizeCommissionHistory({
      id: createId('commission_log'),
      poolId: active.poolId,
      title: active.title,
      task: active.task,
      issuer: active.issuer,
      rewardGems: active.rewardGems,
      rewardAffinity: active.rewardAffinity,
      completedAt: new Date().toISOString(),
      completedDate: completedDate
    });
    db.work.commissionHistory.push(history);
    db.work.activeCommissions.splice(index, 1);
    db.work.commissionOffer = null;
    return { db: db, completed: history, completion: active.completion };
  }

  function sharedFundFromWallet(value) {
    var wallet = value && typeof value === 'object' ? value : {};
    var categories = Array.isArray(wallet.categories) ? wallet.categories : [];
    var records = Array.isArray(wallet.records) ? wallet.records : [];
    var byDate = {};
    records.forEach(function (record) {
      if (!record || !record.date || !record.category) return;
      if (!byDate[record.date]) byDate[record.date] = {};
      if (!byDate[record.date][record.category]) byDate[record.date][record.category] = { spent: 0, earned: 0 };
      if (record.type === 'expense') byDate[record.date][record.category].spent += Math.max(0, number(record.amount, 0));
      else byDate[record.date][record.category].earned += Math.max(0, number(record.amount, 0));
    });
    var total = 0;
    Object.keys(byDate).forEach(function (dateKey) {
      categories.forEach(function (category) {
        var current = byDate[dateKey][category.id] || { spent: 0, earned: 0 };
        total += Math.max(0, number(category.dailyBudget, 0)) - current.spent + current.earned;
      });
    });
    var charFunds = wallet.charFunds && typeof wallet.charFunds === 'object' ? wallet.charFunds : {};
    Object.keys(charFunds).forEach(function (id) { total -= Math.max(0, number(charFunds[id], 0)); });
    (Array.isArray(wallet.outings) ? wallet.outings : []).forEach(function (outing) { total -= Math.max(0, number(outing && outing.cost, 0)); });
    total += Math.max(0, number(wallet.legacyDebtWaiver, 0));
    return Math.max(0, Math.floor(total));
  }

  function majorCaseSpend(value) {
    var db = normalize(value);
    var total = 0;
    Object.keys(db.work.majorCaseProgress).forEach(function (caseId) {
      db.work.majorCaseProgress[caseId].scenes.forEach(function (scene) { total += scene.cost; });
    });
    return total;
  }

  function availableCaseFund(value, walletValue) {
    return Math.max(0, sharedFundFromWallet(walletValue) - majorCaseSpend(value));
  }

  function allocatedCaseFund(value) {
    var db = normalize(value);
    return CBI_CHARACTERS.reduce(function (total, characterId) {
      return total + Math.max(0, number(db.work.caseFund.charFunds[characterId], 0));
    }, 0);
  }

  function unassignedCaseFund(value, walletValue) {
    return Math.max(0, availableCaseFund(value, walletValue) - allocatedCaseFund(value));
  }

  function addCaseFundLog(value, options) {
    var db = normalize(value);
    options = options && typeof options === 'object' ? options : { content: options };
    var log = normalizeCaseFundLog({
      id: options.id,
      date: options.date || workDayKey(),
      type: options.type || 'manual',
      characterId: options.characterId,
      caseId: options.caseId,
      content: options.content,
      createdAt: options.createdAt
    });
    if (!log.content.trim()) return { db: db, log: null };
    db.work.caseFund.logs.push(log);
    return { db: db, log: log };
  }

  function allocateCaseFund(value, characterId, amount, walletValue, dateValue) {
    var db = normalize(value);
    var normalizedAmount = Math.max(0, Math.floor(number(amount, 0)));
    if (CBI_CHARACTERS.indexOf(characterId) < 0 || !normalizedAmount) {
      return { db: db, allocation: null, reason: 'invalid_allocation' };
    }
    if (normalizedAmount > unassignedCaseFund(db, walletValue)) {
      return { db: db, allocation: null, reason: 'insufficient_fund' };
    }
    db.work.caseFund.charFunds[characterId] += normalizedAmount;
    var logged = addCaseFundLog(db, {
      date: workDayKey(dateValue),
      type: 'allocation',
      characterId: characterId,
      content: '指定调查经费 ¥' + normalizedAmount
    });
    return {
      db: logged.db,
      allocation: { characterId: characterId, amount: normalizedAmount },
      reason: ''
    };
  }

  var MAJOR_CASE_CONFIG = {
    boss: { weight: 0.55, min: 5, max: 15, lines: ['我重新看了一遍现场资料：这里有个顺序不对。', '我把最不像线索的那一项圈了出来。先查这个。'] },
    rigsby: { weight: 0.78, min: 1, max: 15, lines: ['Boss，我跑了三处地址。第三个地点终于有人肯开口。', 'Boss，邻居记得一辆车。描述不完整，但时间能对上。'] },
    vanpelt: { weight: 0.74, min: 1, max: 15, lines: ['Boss，数据库里有一条关联记录，我已经标出来了。', 'Boss，我把通话记录和时间线叠在一起，找到一处重合。'] },
    lisbon: { weight: 0.62, min: 8, max: 15, lines: ['Boss，我把时间线重新排了一遍，有一处说法对不上。', 'Boss，证词里有个细节反复变过。你要我再问一次吗？'] },
    cho: { weight: 0.64, min: 8, max: 15, lines: ['Boss，找到一段遗漏的记录。时间能对上。', 'Boss，两份证词用了同一句话。不是巧合。'] },
    jane: { weight: 0.06, min: 50, max: 100, lines: ['Boss，他们一直在看答案旁边的东西。', '你已经发现了，对吧？凶手拼命让人看的那个细节，正好挡住了真正重要的部分。'] }
  };

  var INVESTIGATION_REQUEST_CONFIG = {
    rigsby: {
      weight: 30,
      min: 300,
      max: 700,
      requests: [
        { title: '前往证人住所取证', detail: '短途车费与停车费' },
        { title: '补查邻居口供', detail: '跨区交通费' }
      ]
    },
    vanpelt: {
      weight: 25,
      min: 1500,
      max: 2400,
      requests: [
        { title: '调取电子记录', detail: '数据检索与设备使用费用' },
        { title: '核对通讯时间线', detail: '档案调阅与数据处理费用' }
      ]
    },
    lisbon: {
      weight: 20,
      min: 900,
      max: 1400,
      requests: [
        { title: '补充走访关键证人', detail: '停车与交通费用' },
        { title: '返回现场复核证词', detail: '往返交通与现场协调费用' }
      ]
    },
    cho: {
      weight: 20,
      min: 800,
      max: 1300,
      requests: [
        { title: '核查监控来源', detail: '往返交通与资料复制费用' },
        { title: '追查车辆登记地址', detail: '燃油与通行费用' }
      ]
    },
    jane: {
      weight: 5,
      min: 5000,
      max: 8500,
      requests: [
        { title: '非正式接触嫌疑人', detail: '临时场地、餐饮与诱导布置费用' },
        { title: '安排一次反应测试', detail: '魔术道具、交通与无法说明的杂费' }
      ]
    }
  };

  function createInvestigationRequest(value, options) {
    var db = normalize(value);
    options = options && typeof options === 'object' ? options : {};
    var pending = db.work.caseFund.investigations.find(function (item) { return item.status === 'pending'; });
    if (pending) return { db: db, request: pending, created: false, reason: 'pending_exists' };
    var activeCases = db.cases.filter(function (item) {
      var state = db.work.majorCaseProgress[item.id];
      return item.status === 'active' && (!state || state.progress < 100);
    });
    if (!activeCases.length) return { db: db, request: null, created: false, reason: 'no_active_case' };
    var date = workDayKey(options.date);
    var seedBase = date + '|investigation|' + db.work.caseFund.investigations.length;
    var caseItem = activeCases.find(function (item) { return item.id === db.currentCaseId; });
    if (!caseItem) caseItem = activeCases[Math.floor(stableUnit(seedBase + '|case') * activeCases.length)];
    var allowed = uniqueList(options.availableCharacters, CBI_CHARACTERS);
    if (!allowed.length) allowed = CBI_CHARACTERS.slice();
    var hasWallet = Object.prototype.hasOwnProperty.call(options, 'wallet');
    var totalFund = hasWallet ? availableCaseFund(db, options.wallet) : Infinity;
    var openFund = hasWallet ? unassignedCaseFund(db, options.wallet) : Infinity;
    if (hasWallet) {
      allowed = allowed.filter(function (id) {
        var personal = Math.max(0, number(db.work.caseFund.charFunds[id], 0));
        return Math.min(totalFund, personal + openFund) >= INVESTIGATION_REQUEST_CONFIG[id].min;
      });
      if (!allowed.length) return { db: db, request: null, created: false, reason: 'insufficient_fund' };
    }
    var totalWeight = allowed.reduce(function (sum, id) { return sum + INVESTIGATION_REQUEST_CONFIG[id].weight; }, 0);
    var target = stableUnit(seedBase + '|' + caseItem.id + '|character') * totalWeight;
    var characterId = allowed[0];
    allowed.some(function (id) {
      target -= INVESTIGATION_REQUEST_CONFIG[id].weight;
      if (target <= 0) { characterId = id; return true; }
      return false;
    });
    var config = INVESTIGATION_REQUEST_CONFIG[characterId];
    var template = config.requests[Math.floor(stableUnit(seedBase + '|template') * config.requests.length)];
    var personalFund = Math.max(0, number(db.work.caseFund.charFunds[characterId], 0));
    var spendable = hasWallet ? Math.min(totalFund, personalFund + openFund) : config.max;
    var ceiling = Math.min(config.max, Math.floor(spendable / 50) * 50);
    if (ceiling < config.min) return { db: db, request: null, created: false, reason: 'insufficient_fund' };
    var amountSteps = Math.floor((ceiling - config.min) / 50);
    var amount = config.min + Math.floor(stableUnit(seedBase + '|amount') * (amountSteps + 1)) * 50;
    var request = normalizeInvestigation({
      date: date,
      characterId: characterId,
      caseId: caseItem.id,
      title: template.title,
      detail: template.detail,
      amount: amount,
      status: 'pending'
    });
    db.work.caseFund.investigations.push(request);
    return { db: db, request: request, created: true, reason: '' };
  }

  function advanceMajorCase(value, caseId, options) {
    var db = normalize(value);
    var caseItem = db.cases.find(function (item) { return item.id === caseId; });
    if (!caseItem) return { db: db, caseItem: null, progress: null, scene: null };
    var progress = db.work.majorCaseProgress[caseId] || { progress: 0, scenes: [], archivedAt: '' };
    db.work.majorCaseProgress[caseId] = progress;
    if (progress.progress >= 100) return { db: db, caseItem: caseItem, progress: progress, scene: null };
    options = options && typeof options === 'object' ? options : {};
    var allowed = uniqueList(options.availableCharacters, Object.keys(MAJOR_CASE_CONFIG));
    if (!allowed.length) allowed = ['boss'];
    var totalWeight = allowed.reduce(function (sum, id) { return sum + MAJOR_CASE_CONFIG[id].weight; }, 0);
    var seed = caseId + '|major|' + progress.scenes.length + '|' + text(options.seed || workDayKey());
    var target = stableUnit(seed + '|character') * totalWeight;
    var characterId = allowed[0];
    for (var index = 0; index < allowed.length; index += 1) {
      target -= MAJOR_CASE_CONFIG[allowed[index]].weight;
      if (target <= 0) { characterId = allowed[index]; break; }
    }
    var config = MAJOR_CASE_CONFIG[characterId];
    var forcedDelta = Number(options.progressDelta);
    var delta = Number.isFinite(forcedDelta) && forcedDelta > 0
      ? Math.floor(forcedDelta)
      : config.min + Math.floor(stableUnit(seed + '|delta') * (config.max - config.min + 1));
    delta = Math.min(delta, 100 - progress.progress);
    var line = config.lines[Math.floor(stableUnit(seed + '|line') * config.lines.length)];
    var scene = normalizeMajorCaseScene({
      id: createId('case_scene'),
      characterId: characterId,
      line: line,
      delta: delta,
      cost: Math.max(0, Math.floor(number(options.cost, db.work.majorCaseStepCost))),
      createdAt: new Date().toISOString()
    });
    progress.progress += delta;
    progress.scenes.push(scene);
    return { db: db, caseItem: caseItem, progress: progress, scene: scene };
  }

  function approveInvestigation(value, investigationId, walletValue, options) {
    var db = normalize(value);
    options = options && typeof options === 'object' ? options : {};
    var request = db.work.caseFund.investigations.find(function (item) { return item.id === investigationId; });
    if (!request || request.status !== 'pending') return { db: db, request: request || null, scene: null, reason: 'not_pending' };
    var caseItem = db.cases.find(function (item) { return item.id === request.caseId && item.status === 'active'; });
    if (!caseItem) return { db: db, request: request, scene: null, reason: 'no_active_case' };
    var personal = Math.max(0, number(db.work.caseFund.charFunds[request.characterId], 0));
    var openFund = unassignedCaseFund(db, walletValue);
    var totalFund = availableCaseFund(db, walletValue);
    if (request.amount > totalFund || request.amount > personal + openFund) return { db: db, request: request, scene: null, reason: 'insufficient_fund' };
    var progressBase = Math.max(1, Math.round(request.amount / 100));
    var progressRoll = Math.floor(stableUnit(request.id + '|paid-progress') * 5) - 2;
    var progressDelta = Math.max(1, progressBase + progressRoll);
    var advanced = advanceMajorCase(db, request.caseId, {
      availableCharacters: [request.characterId],
      cost: request.amount,
      progressDelta: progressDelta,
      seed: request.id
    });
    if (!advanced.scene) return { db: db, request: request, scene: null, reason: 'no_progress' };
    db = advanced.db;
    var usedPersonal = Math.min(personal, request.amount);
    db.work.caseFund.charFunds[request.characterId] = Math.max(0, personal - usedPersonal);
    request = db.work.caseFund.investigations.find(function (item) { return item.id === investigationId; });
    request.status = 'approved';
    request.reply = text(options.reply).trim();
    request.sceneId = advanced.scene.id;
    request.progressDelta = advanced.scene.delta;
    request.progressBase = progressBase;
    request.progressRoll = progressRoll;
    request.progressLine = advanced.scene.line;
    request.resolvedAt = new Date().toISOString();
    var content = request.title + ' · 批准 ¥' + request.amount;
    if (request.reply) content += ' · Boss：' + request.reply;
    var logged = addCaseFundLog(db, {
      date: request.date,
      type: 'investigation',
      characterId: request.characterId,
      caseId: request.caseId,
      content: content
    });
    return { db: logged.db, request: request, scene: advanced.scene, reason: '' };
  }

  function setCaseFocus(value, caseId) {
    var db = normalize(value);
    var target = db.cases.find(function (item) { return item.id === caseId && item.status === 'active'; });
    db.currentCaseId = target ? target.id : null;
    return db;
  }

  function archiveMajorCase(value, caseId) {
    var db = normalize(value);
    var caseItem = db.cases.find(function (item) { return item.id === caseId; });
    var progress = db.work.majorCaseProgress[caseId];
    if (!caseItem || !progress || progress.progress < 100) return { db: db, caseItem: caseItem || null, archived: false };
    caseItem.status = 'closed';
    caseItem.updatedAt = new Date().toISOString();
    progress.archivedAt = new Date().toISOString();
    if (db.currentCaseId === caseId) db.currentCaseId = null;
    return { db: db, caseItem: caseItem, archived: true };
  }

  global.CBIData = Object.freeze({
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    CBI_CHARACTERS: CBI_CHARACTERS.slice(),
    ACTION_DIFFICULTIES: ACTION_DIFFICULTIES,
    INVESTIGATOR_CONFIG: INVESTIGATOR_CONFIG,
    DEFAULT_COMMISSION_POOL: cloneDefaultCommissions(),
    emptyDB: emptyDB,
    emptyWork: emptyWork,
    normalize: normalize,
    normalizeCase: normalizeCase,
    normalizePerson: normalizePerson,
    normalizeWork: normalizeWork,
    normalizeCommission: normalizeCommission,
    normalizeShopItem: normalizeShopItem,
    normalizeDeployment: normalizeDeployment,
    normalizeInvestigation: normalizeInvestigation,
    normalizeCaseFund: normalizeCaseFund,
    stringList: stringList,
    load: load,
    save: save,
    createId: createId,
    compareCases: compareCases,
    sortedCases: sortedCases,
    mainlineEntries: mainlineEntries,
    workDayKey: workDayKey,
    stableUnit: stableUnit,
    advanceAnonymousCases: advanceAnonymousCases,
    addAction: addAction,
    startAction: startAction,
    completeAction: completeAction,
    ensureCommissionOffer: ensureCommissionOffer,
    acceptCommission: acceptCommission,
    completeCommission: completeCommission,
    sharedFundFromWallet: sharedFundFromWallet,
    majorCaseSpend: majorCaseSpend,
    availableCaseFund: availableCaseFund,
    allocatedCaseFund: allocatedCaseFund,
    unassignedCaseFund: unassignedCaseFund,
    addCaseFundLog: addCaseFundLog,
    allocateCaseFund: allocateCaseFund,
    createInvestigationRequest: createInvestigationRequest,
    approveInvestigation: approveInvestigation,
    setCaseFocus: setCaseFocus,
    advanceMajorCase: advanceMajorCase,
    archiveMajorCase: archiveMajorCase
  });
})(window);
