(function (global) {
  'use strict';

  var STORAGE_KEY = 'cbi_db';
  var SCHEMA_VERSION = 8;
  var CANON_VERSION = 2;
  var TIMELINE_VERSION = 1;
  var CBI_CHARACTERS = ['jane', 'cho', 'rigsby', 'lisbon', 'vanpelt'];
  var SCORE_IDS = ['boss'].concat(CBI_CHARACTERS);
  var CANON_PERSONNEL = [
    {
      id: 'boss',
      name: 'Milo Hayes',
      role: 'CBI 重案组组长 / 现场总指挥 / 小组导师',
      profile: '27岁。大学提前毕业，已有6—7年调查、审讯与现场经验；大学时期便处理过人质谈判。现任CBI重案组组长，履历与重大现场经验厚于组内几名年轻探员。',
      timeline: '大学提前毕业 → 大学时期的人质谈判经历 → 6—7年一线与重案经验 → 组建并带领现小组。开局时27岁，领导资历与重大现场经验都在Lisbon、Rigsby和Van Pelt之上。',
      abilities: '擅长现场指挥、审讯、谈判、推理、识人和培养新人。组员可以在各自分工内独立判断；叙事上，Milo已经找出的线索与完成的行动不得被后文否定、降级成“记错了”或改写成别人重新发现。',
      relationships: 'Jane：Milo亲自留下、最偏爱也最重要的人；Jane的感情归属与“家”最终都指向Milo。Cho：年长而可靠，但主动选择服从Milo的领导。Rigsby：Milo看见并培养他的独立能力。Lisbon：因Milo留下Jane造成的空缺而提前调入；Milo是她进入CBI后的第一位重要导师。Van Pelt：Milo给她最初的重要任务与信任，把她带成真正的探员。',
      longTermStatus: '故事主角与小组关系中心。他组建并带领这支队伍，也会被成员各自的能力和选择反过来影响；大家拥有自己的性格与工作节奏，主要成长线则与他建立的信任相连。涉及全组方向时由Milo拍板，日常台词不必反复声明。'
    },
    {
      id: 'jane',
      name: 'Patrick Jane',
      role: 'CBI 顾问 / Milo亲自留下的人',
      profile: '观察与操纵天赋极高的顾问，不属于探员编制，也不负责人员或流程调度。开局时因Milo坚持留下他而继续待在CBI；这个决定直接造成一个人员空缺，并让Lisbon提前获得调入机会。',
      timeline: 'Milo坚持留下Jane → 原成员被气走、出现空缺 → Lisbon提前调入。关系前期，Jane只把Milo的暧昧理解成惯常调情；低自我价值感使他不敢相信Milo会认真选择自己。Milo约一年后不再和别人约会并继续为Jane留在CBI，Jane才在长期相处中逐渐看懂。',
      abilities: '天才级观察、读人和心理操纵；可以提出反常判断、挑战常规并独立找到线索，但不得否定或重做Milo已经完成的高光。关键场面里，他对Milo的反应往往比对结论本身更在意。',
      relationships: 'Milo是Jane最重要的关系、最终的归属与不肯承认的“家”。他可以欣赏其他人的能力，却不会把任何人放到比Milo更核心的位置；“Jane早已知道Milo认真却故意无视”不是本世界事实。',
      longTermStatus: 'Boss家的猫。当前仍不相信Milo对自己是认真的，关系要通过Milo一次次选择、保护和留下他慢慢建立；不能提前写成已知情后的冷处理。'
    },
    {
      id: 'cho',
      name: 'Kimball Cho',
      role: 'CBI 探员 / Milo麾下资深骨干',
      profile: '33岁左右，比Milo年长约六岁，冷静、稳定、现场经验扎实。他认可Milo的能力，合作中自然接受这位年轻组长的分工，不把自己摆在导师或监护人的位置。',
      timeline: '积累一线经验 → 与Rigsby搭档并共同办出真正的大案 → 调入Milo的小组。开局时是可靠骨干，与Rigsby配合默契。',
      abilities: '执行、观察、审讯和风险判断稳定；能在任务范围内独立作出判断、推进调查并处理突发情况。',
      relationships: '对Milo的核心关系是经过判断后的主动服从与忠诚。对Rigsby是搭档，不替他决定人生，也不会把小组变成自己的班底。',
      longTermStatus: '小组稳定的执行支柱，也拥有自己的判断与高光。他比Milo年长，但这份成熟表现为可靠合作，而不是接管、监督或教育组长。'
    },
    {
      id: 'rigsby',
      name: 'Wayne Rigsby',
      role: 'CBI 探员 / 外勤骨干',
      profile: '27岁，与Milo同龄。有一定地方警务与现场经验，但在与Cho搭档之前没有经手过真正的大案。体能、走访和现场执行突出，仍需要有人把他从“Cho的搭档”看成能独当一面的探员。',
      timeline: '地方与现场工作 → 与Cho搭档 → 两人共同办出一宗重要案件 → 被调入Milo的小组。年龄与Milo相同，但领导经验、重案履历与全局判断明显少于Milo。',
      abilities: '追踪、走访、现场保护、体力执行与建立证人信任。接到任务后可以自主选择方法，也会主动追查自己认为值得继续的方向。',
      relationships: 'Milo是第一个真正把重要责任交给他、让他证明自己不只是Cho附属的人。Cho是搭档；Van Pelt与他有四岁年龄差。',
      longTermStatus: '在Milo交给他的责任与信任中长成独立骨干。他可以有完整的个人高光；两人的成长线通过一次次托付和兑现自然相连。'
    },
    {
      id: 'lisbon',
      name: 'Teresa Lisbon',
      role: 'CBI 新调入探员 / Milo的学生',
      profile: '25岁。大学毕业后在地方警局工作三年，明显比同龄人优秀，但小地方缺少大案和施展空间，年轻女性也很难获得上升机会。她本来还不到调入CBI的时候；Milo坚持留下Jane气走一名成员后出现空缺，她听说年轻组长很难相处，仍闭眼抓住了这个机会。',
      timeline: '大学毕业 → 地方警局三年 → 因小组临时空缺而提前数年进入CBI。调入前没有重要导师，也没有办成过大案要案；原作中成熟强悍的Lisbon是她在Milo带领下会抵达的终点，不是开局状态。',
      abilities: '潜力高、学习快、认真、倔强，努力用程序意识和准备充分掩饰紧张。第一次面对疑似Red John现场时也会紧张，只是比Van Pelt更会藏。她能独立整理线索、完成审问，也会直接提出质疑和程序担忧。',
      relationships: 'Milo是她进入CBI后的组长、真正的导师和最重要的职业关系。她想向他证明自己值得这次破格机会，是一只年轻、倔强、要Boss亲手带出来的小Kitty；不是照管Boss的妈妈、姐姐或行政上级。',
      longTermStatus: '年轻探员，日常可以有主见并主动推进自己的工作；但开局尚无核查组长流程、索要全员名单、调动全组或自行接管全局的职位权限。她会在Milo的教导、信任和逐步放权中成长。'
    },
    {
      id: 'vanpelt',
      name: 'Grace Van Pelt',
      role: 'CBI 新人探员 / Milo带教成员',
      profile: '23岁。大学毕业后完成一年专项培训，刚正式入职。聪明、认真、技术能力好，但还没有足以让她在重大现场完全镇定的经验。',
      timeline: '大学毕业 → 一年专项培训 → 23岁进入Milo的小组。与Rigsby相差四岁。第一次看到疑似Red John现场时会明显紧张，需要在任务与信任中慢慢站稳。',
      abilities: '资料检索、通讯与数据整理潜力突出；能自行归纳关联记录并标出可疑之处，当前仍需要明确任务、反馈和现场带教。',
      relationships: 'Milo是给她第一份重要任务、第一份真正信任并把她培养成探员与未来领导者的人。她与其他成员可以建立关系，但职业成长的主轴必须经过Milo。',
      longTermStatus: '年轻新人，不被写成已经完成成长的成熟探员。她会在Milo给出的任务与保护中慢慢建立判断，也努力成为能被继续托付的人。'
    }
  ];
  var CANON_TIMELINE = [
    {
      id: 'timeline_red_john_transfer',
      sortDate: '2003-10-01',
      timeLabel: '2003年秋冬',
      episodeCode: '',
      type: 'career',
      title: 'Red John 专案增援',
      summary: 'Angela与Charlotte遇害，Jane入院。CBI原本就在考虑为Red John连环案增援；案件舆论压力骤升后，Milo被正式调入，Minelli同时表达了以后让他独立带组的意向。Milo申请询问Jane被医院拒绝。此后线索耗尽，专案组解散，案件转为长期悬案。',
      characters: ['Milo', 'Jane', 'Minelli'],
      continuity: 'Milo此时只是被提前调入增援，尚未独立带组；他与Jane没有正式见面。'
    },
    {
      id: 'timeline_boss_promoted',
      sortDate: '2004-03-01',
      timeLabel: '2004年春',
      episodeCode: '',
      type: 'career',
      title: 'Milo独立带组',
      summary: '调入CBI约半年后，Milo创纪录地晋升组长，开始建立自己的小组。',
      characters: ['Milo', 'Minelli'],
      continuity: '这是之后所有成员进入同一支team的组织起点。'
    },
    {
      id: 'timeline_cho_rigsby_join',
      sortDate: '2005-06-01',
      timeLabel: '2005年',
      episodeCode: '',
      type: 'team',
      title: 'Cho与Rigsby加入小组',
      summary: 'Cho主动申请进入Milo的小组；此前已经与Cho搭档的Rigsby也跟着调入。Rigsby已有约五年现场经验，Cho则明显年长且资深，但两人仍选择加入这位年轻组长的team。',
      characters: ['Milo', 'Cho', 'Rigsby'],
      continuity: 'Cho与Milo早已相识，但这段旧识的具体内容此时不对其他人公开。'
    },
    {
      id: 'timeline_jane_joins',
      sortDate: '2006-01-05',
      timeLabel: '2006年初 · S01E01前',
      episodeCode: '回忆集 01',
      type: 'flashback',
      title: 'Jane加入CBI',
      summary: 'Jane出院后来CBI索要Red John资料，被拒后在走廊遇见Milo。Milo让仍处于创伤、自卑与胆怯状态的Jane跟去现场；Jane不敢靠近尸体、说着许多“也许”，却仍找出关键线索。Milo因此坚持把他留下做顾问。',
      characters: ['Milo', 'Jane'],
      continuity: 'Jane还没有恢复成后来从容嚣张的样子；他把Milo的调戏理解成不太合时宜的玩笑。'
    },
    {
      id: 'timeline_jane_meets_team',
      sortDate: '2006-01-12',
      timeLabel: '2006年初 · S01E01前',
      episodeCode: '回忆集 02',
      type: 'flashback',
      title: '“只是觉得这个人值得”',
      summary: 'Jane逐渐与组员混熟，大部分时间住在CBI。他看出Cho有过帮派经历，也察觉Cho与Milo早已认识；追问Cho为什么愿意进入这支年轻小组时，只得到一句“有时候就是觉得这个人值得”。',
      characters: ['Milo', 'Jane', 'Cho', 'Rigsby'],
      continuity: 'Jane只确认Cho与Milo是旧识；两人如何相识、为什么Cho很早就相信Milo，仍然没有揭晓。'
    },
    {
      id: 'timeline_jane_not_ready',
      sortDate: '2006-01-20',
      timeLabel: '2006年初 · S01E01前',
      episodeCode: '回忆集 03',
      type: 'relationship',
      title: '“你怎么不追我了？”',
      summary: 'Milo最近交了女朋友，对Jane的调戏随之减少。Jane开玩笑问他为什么不追了，Milo坦然回答：因为觉得Jane还没有准备好进入下一段恋情，需要时间。',
      characters: ['Milo', 'Jane'],
      continuity: 'Jane只把这句话当成带着真诚关心的玩笑，完全没有意识到Milo一句玩笑都没开。'
    },
    {
      id: 'timeline_s01e01_start',
      sortDate: '2006-02-01',
      timeLabel: '2006年初',
      episodeCode: 'S01E01',
      type: 'mainline',
      title: '主线开场 · 两名新探员入组',
      summary: 'Lisbon与Van Pelt同日调入Milo的小组；重启版主线从这里正式开始。',
      characters: ['Milo', 'Jane', 'Cho', 'Rigsby', 'Lisbon', 'Van Pelt'],
      continuity: 'Jane加入CBI、逐渐混熟以及此前关系变化都作为回忆集穿插，不挤占S01E01的当前开场。'
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
      completion: 'Lisbon按标出的地方逐项改好，终于把第一张CBI经费单送进了系统。',
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

  function wishRefreshDateMap(value) {
    var source = value && typeof value === 'object' ? value : {};
    var result = {};
    CBI_CHARACTERS.forEach(function (id) { result[id] = text(source[id]); });
    return result;
  }

  function emptyCaseFund() {
    return {
      charFunds: affinityMap(),
      investigations: [],
      wishRefreshDates: wishRefreshDateMap(),
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
        projects: [],
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
      timelineVersion: TIMELINE_VERSION,
      currentCaseId: null,
      cases: [],
      timeline: cloneCanonTimeline(),
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

  function normalizeTimelineItem(item) {
    item = item && typeof item === 'object' ? item : {};
    var allowedTypes = ['career', 'team', 'flashback', 'relationship', 'mainline', 'other'];
    return {
      id: text(item.id) || createId('timeline'),
      sortDate: text(item.sortDate),
      timeLabel: text(item.timeLabel),
      episodeCode: text(item.episodeCode),
      type: allowedTypes.indexOf(item.type) >= 0 ? item.type : 'other',
      title: text(item.title),
      summary: text(item.summary),
      characters: stringList(item.characters),
      continuity: text(item.continuity),
      createdAt: text(item.createdAt) || new Date().toISOString(),
      updatedAt: text(item.updatedAt) || new Date().toISOString()
    };
  }

  function cloneCanonTimeline() {
    return CANON_TIMELINE.map(function (item) { return normalizeTimelineItem(item); });
  }

  function restoreCanonTimeline(value) {
    var source = Array.isArray(value) ? value.map(normalizeTimelineItem) : [];
    var ids = {};
    source.forEach(function (item) { ids[item.id] = true; });
    cloneCanonTimeline().forEach(function (item) {
      if (!ids[item.id]) source.push(item);
    });
    return source;
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

  function normalizeShopProjectItem(item) {
    item = item && typeof item === 'object' ? item : {};
    var targets = item.targetIds || item.wearers || (item.target ? [item.target] : []);
    var image = text(item.img || item.image || item.cover);
    return {
      id: text(item.id) || createId('shop_item'),
      name: text(item.name).trim(),
      note: text(item.note || item.description),
      description: text(item.description || item.note),
      img: image,
      image: image,
      price: Math.max(0, Math.floor(number(item.price, 0))),
      targetIds: uniqueList(targets, ['boss'].concat(CBI_CHARACTERS)),
      reaction: text(item.reaction),
      acquiredAt: text(item.acquiredAt),
      collected: !!item.collected || !!text(item.acquiredAt),
      itemType: 'shopping',
      order: Math.max(0, Math.floor(number(item.order, 0)))
    };
  }

  function normalizeShopSection(section, index) {
    section = section && typeof section === 'object' ? section : {};
    var tagColor = text(section.tagColor);
    return {
      id: text(section.id) || createId('shop_section'),
      name: text(section.name),
      count: Math.max(0, Math.floor(number(section.count, 0))),
      cols: Math.max(1, Math.min(5, Math.floor(number(section.cols, 3)))),
      tagText: text(section.tagText),
      tagColor: /^#[0-9a-f]{6}$/i.test(tagColor) ? tagColor : '#E8B96A',
      order: Math.max(0, Math.floor(number(section.order, index || 0)))
    };
  }

  function normalizeShopDuty(value, colorValue, fallbackTarget) {
    value = value && typeof value === 'object' ? value : {};
    var allowed = ['boss'].concat(CBI_CHARACTERS);
    var type = allowed.indexOf(value.type) >= 0 ? value.type : (allowed.indexOf(fallbackTarget) >= 0 ? fallbackTarget : '');
    var color = text(value.color || colorValue);
    return {
      type: type || (value.type === 'custom' ? 'custom' : ''),
      name: text(value.name),
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#A9A39A'
    };
  }

  function normalizeShopProject(project, index) {
    project = project && typeof project === 'object' ? project : {};
    var color = text(project.color);
    var icon = text(project.icon || project.cover || project.image);
    var items = Array.isArray(project.items) ? project.items.map(normalizeShopProjectItem) : [];
    var firstTarget = items.reduce(function (found, item) { return found || (item.targetIds && item.targetIds[0]) || ''; }, '');
    var duty = normalizeShopDuty(project.duty, color, firstTarget);
    var sections = Array.isArray(project.sections) ? project.sections.map(normalizeShopSection) : [];
    if (!sections.length && items.length) sections = [normalizeShopSection({ name: '', count: items.length, cols: 3, tagColor: duty.color }, 0)];
    var sectionCount = sections.reduce(function (total, section) { return total + section.count; }, 0);
    if (sectionCount < items.length) {
      if (!sections.length) sections.push(normalizeShopSection({ name: '', count: items.length, cols: 3, tagColor: duty.color }, 0));
      else sections[sections.length - 1].count += items.length - sectionCount;
    }
    return {
      id: text(project.id) || createId('shop_project'),
      name: text(project.name).trim(),
      category: text(project.category).trim() || '未分类',
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : duty.color,
      icon: icon,
      cover: icon,
      iconPositionX: Math.max(0, Math.min(100, number(project.iconPositionX, 50))),
      iconPositionY: Math.max(0, Math.min(100, number(project.iconPositionY, 50))),
      note: text(project.note || project.description),
      duty: duty,
      sections: sections,
      order: Math.max(0, Math.floor(number(project.order, index || 0))),
      items: items
    };
  }

  function migrateLegacyShopProjects(items) {
    var categoryNames = { clothing: '服装类', accessory: '配饰类', gift: '物品类' };
    var groups = [];
    items.forEach(function (item) {
      var category = categoryNames[item.category] || '未分类';
      var name = item.series || '旧商城自选';
      var group = groups.find(function (entry) { return entry.category === category && entry.name === name; });
      if (!group) {
        group = {
          id: 'legacy_project_' + item.id,
          name: name,
          category: category,
          color: item.color,
          cover: '',
          note: '由旧商城自选商品迁移',
          order: groups.length,
          items: []
        };
        groups.push(group);
      }
      group.items.push(normalizeShopProjectItem(item));
    });
    return groups;
  }

  function normalizeShop(value) {
    var source = value && typeof value === 'object' ? value : {};
    var customItems = Array.isArray(source.customItems) ? source.customItems.map(normalizeShopItem).filter(function (item) { return item.name; }) : [];
    var projects = Array.isArray(source.projects)
      ? source.projects.map(normalizeShopProject).filter(function (project) { return project.name; })
      : migrateLegacyShopProjects(customItems);
    var ownedFromItems = [];
    projects.forEach(function (project) {
      project.items.forEach(function (item) { if (item.collected || item.acquiredAt) ownedFromItems.push(item.id); });
    });
    return {
      projects: projects,
      customItems: customItems,
      owned: uniqueList((Array.isArray(source.owned) ? source.owned : []).concat(ownedFromItems)),
      purchaseLog: Array.isArray(source.purchaseLog) ? source.purchaseLog.map(function (entry) {
        entry = entry && typeof entry === 'object' ? entry : {};
        return {
          itemId: text(entry.itemId),
          price: Math.max(0, Math.floor(number(entry.price, 0))),
          purchasedAt: text(entry.purchasedAt || entry.acquiredAt),
          source: text(entry.source)
        };
      }).filter(function (entry) { return entry.itemId; }) : [],
      reactionsSeen: uniqueList(source.reactionsSeen)
    };
  }

  function normalizeInvestigation(item) {
    item = item && typeof item === 'object' ? item : {};
    var source = ['wishlist', 'legacy_case'].indexOf(item.source) >= 0
      ? item.source
      : (text(item.caseId) ? 'legacy_case' : 'wishlist');
    return {
      id: text(item.id) || createId('investigation'),
      date: text(item.date) || workDayKey(),
      characterId: CBI_CHARACTERS.indexOf(item.characterId) >= 0 ? item.characterId : 'rigsby',
      caseId: text(item.caseId),
      source: source,
      title: text(item.title),
      detail: text(item.detail),
      amount: Math.max(0, Math.floor(number(item.amount, 0))),
      status: ['pending', 'approved', 'auto', 'declined'].indexOf(item.status) >= 0 ? item.status : 'pending',
      reply: text(item.reply),
      reaction: text(item.reaction),
      spentFrom: ['public', 'personal', 'mixed'].indexOf(item.spentFrom) >= 0 ? item.spentFrom : '',
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
      type: ['allocation', 'investigation', 'wish', 'autonomous', 'manual'].indexOf(item.type) >= 0 ? item.type : 'manual',
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
      wishRefreshDates: wishRefreshDateMap(source.wishRefreshDates),
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
        archivedAt: text(entry.archivedAt),
        lastAdvancedDate: text(entry.lastAdvancedDate)
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
    var needsTimelineRestore = Math.floor(number(source.timelineVersion, 0)) < TIMELINE_VERSION;
    var hadCurrentCase = Object.prototype.hasOwnProperty.call(source, 'currentCaseId');
    var result = emptyDB();
    result.cases = Array.isArray(source.cases) ? source.cases.map(normalizeCase) : [];
    result.timeline = Array.isArray(source.timeline) ? source.timeline.map(normalizeTimelineItem) : [];
    if (needsTimelineRestore) result.timeline = restoreCanonTimeline(result.timeline);
    result.timelineVersion = TIMELINE_VERSION;
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
      if (Math.floor(number(parsed.schemaVersion, 0)) < SCHEMA_VERSION || Math.floor(number(parsed.canonVersion, 0)) < CANON_VERSION || Math.floor(number(parsed.timelineVersion, 0)) < TIMELINE_VERSION) {
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

  function timelineDateValue(item) {
    var direct = text(item && (item.sortDate || item.date)).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
    if (/^\d{4}-\d{2}$/.test(direct)) return direct + '-01';
    if (/^\d{4}$/.test(direct)) return direct + '-01-01';
    var year = /((?:19|20)\d{2})/.exec(text(item && item.timeLabel));
    return year ? year[1] + '-07-01' : '9999-12-31';
  }

  function compareTimelineEntries(left, right) {
    var leftDate = timelineDateValue(left);
    var rightDate = timelineDateValue(right);
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    var a = episodeParts(left && left.episodeCode);
    var b = episodeParts(right && right.episodeCode);
    if (a[0] !== b[0]) return a[0] - b[0];
    if (a[1] !== b[1]) return a[1] - b[1];
    return text(left && left.createdAt).localeCompare(text(right && right.createdAt));
  }

  function timelineEntries(value) {
    var db = value && typeof value === 'object' ? value : {};
    var entries = (Array.isArray(db.timeline) ? db.timeline : []).map(function (item) {
      var normalized = normalizeTimelineItem(item);
      return Object.assign({ source: 'event', sourceId: normalized.id }, normalized);
    });
    (Array.isArray(db.cases) ? db.cases : []).forEach(function (item) {
      entries.push({
        id: 'case:' + text(item.id),
        source: 'case',
        sourceId: text(item.id),
        sortDate: text(item.date),
        timeLabel: text(item.date),
        episodeCode: text(item.episodeCode),
        type: 'case',
        title: text(item.title) || '未命名案件',
        summary: text(item.mainlineStatus).trim() || text(item.summary),
        characters: stringList(item.characters),
        continuity: text(item.longTermChanges),
        createdAt: text(item.createdAt),
        updatedAt: text(item.updatedAt)
      });
    });
    return entries.sort(compareTimelineEntries);
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

  function walletCategoryAccount(category, index, total) {
    category = category && typeof category === 'object' ? category : {};
    if (category.account === 'living' || category.account === 'entertainment') return category.account;
    var marker = text(category.id) + ' ' + text(category.name);
    if (/日用|饮食|生活|吃饭|食物|food|daily|餐/.test(marker)) return 'living';
    if (/手账|手帐|文具|谷子|娃|周边|娱乐|爱好|stationery|goods|doll|hobby/.test(marker)) return 'entertainment';
    if (total === 2) return index === 0 ? 'living' : 'entertainment';
    return index === 0 ? 'living' : 'entertainment';
  }

  function walletAccountSurplus(value, account) {
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
      categories.forEach(function (category, index) {
        if (walletCategoryAccount(category, index, categories.length) !== account) return;
        if (text(category.activeFrom) && dateKey < text(category.activeFrom)) return;
        var current = byDate[dateKey][category.id] || { spent: 0, earned: 0 };
        total += Math.max(0, number(category.dailyBudget, 0)) - current.spent + current.earned;
      });
    });
    return Math.floor(total);
  }

  function sharedFundFromWallet(value) {
    var wallet = value && typeof value === 'object' ? value : {};
    var total = walletAccountSurplus(wallet, 'living');
    var charFunds = wallet.charFunds && typeof wallet.charFunds === 'object' ? wallet.charFunds : {};
    Object.keys(charFunds).forEach(function (id) { total -= Math.max(0, number(charFunds[id], 0)); });
    (Array.isArray(wallet.outings) ? wallet.outings : []).forEach(function (outing) { total -= Math.max(0, number(outing && outing.cost, 0)); });
    total += Math.max(0, number(wallet.legacyDebtWaiver, 0));
    return Math.max(0, Math.floor(total));
  }

  function entertainmentFundFromWallet(value) {
    return Math.max(0, walletAccountSurplus(value, 'entertainment'));
  }

  function reimbursementFundFromWallet(value) {
    return Math.max(0, walletAccountSurplus(value, 'living'));
  }

  function shopSpend(value) {
    var db = normalize(value);
    return db.work.shop.purchaseLog.reduce(function (total, entry) {
      return total + Math.max(0, Math.floor(number(entry && entry.price, 0)));
    }, 0);
  }

  function availableShopFund(value, walletValue) {
    return Math.max(0, entertainmentFundFromWallet(walletValue) - shopSpend(value));
  }

  function majorCaseSpend(value) {
    var db = normalize(value);
    var total = 0;
    Object.keys(db.work.majorCaseProgress).forEach(function (caseId) {
      db.work.majorCaseProgress[caseId].scenes.forEach(function (scene) { total += scene.cost; });
    });
    return total;
  }

  function wishSpend(value) {
    var db = normalize(value);
    return db.work.caseFund.investigations.reduce(function (total, request) {
      return total + (['approved', 'auto'].indexOf(request.status) >= 0 ? request.amount : 0);
    }, 0);
  }

  function allowanceSpend(value) {
    var db = normalize(value);
    var wishlistTotal = 0;
    var legacyRequestTotal = 0;
    db.work.caseFund.investigations.forEach(function (request) {
      if (['approved', 'auto'].indexOf(request.status) < 0) return;
      if (request.source === 'legacy_case') legacyRequestTotal += request.amount;
      else wishlistTotal += request.amount;
    });
    // Legacy approvals stored one payment twice: once on the request and once on
    // its case scene. Keep the larger legacy total, then add every new wish in full.
    return wishlistTotal + Math.max(majorCaseSpend(db), legacyRequestTotal);
  }

  function availableAllowance(value, walletValue) {
    return Math.max(0, reimbursementFundFromWallet(walletValue) - allowanceSpend(value));
  }

  function availableCaseFund(value, walletValue) {
    return availableAllowance(value, walletValue);
  }

  function allocatedAllowance(value) {
    var db = normalize(value);
    return CBI_CHARACTERS.reduce(function (total, characterId) {
      return total + Math.max(0, number(db.work.caseFund.charFunds[characterId], 0));
    }, 0);
  }

  function allocatedCaseFund(value) {
    return allocatedAllowance(value);
  }

  function unassignedAllowance(value, walletValue) {
    return Math.max(0, availableAllowance(value, walletValue) - allocatedAllowance(value));
  }

  function unassignedCaseFund(value, walletValue) {
    return unassignedAllowance(value, walletValue);
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

  function settlePersonalWishes(value, characterId, walletValue, dateValue) {
    var db = normalize(value);
    var purchases = [];
    db.work.caseFund.investigations.filter(function (request) {
      return request.status === 'pending' && request.source === 'wishlist' && request.characterId === characterId;
    }).sort(function (left, right) {
      return text(left.createdAt).localeCompare(text(right.createdAt));
    }).forEach(function (request) {
      var personal = Math.max(0, number(db.work.caseFund.charFunds[characterId], 0));
      if (request.amount > personal || request.amount > availableAllowance(db, walletValue)) return;
      db.work.caseFund.charFunds[characterId] = personal - request.amount;
      request.status = 'auto';
      request.spentFrom = 'personal';
      request.resolvedAt = new Date().toISOString();
      db.work.caseFund.logs.push(normalizeCaseFundLog({
        date: request.date || workDayKey(dateValue),
        type: 'autonomous',
        characterId: characterId,
        content: request.title + ' · 自由额度支出 ¥' + request.amount
      }));
      purchases.push(request);
    });
    return { db: db, purchases: purchases };
  }

  function allocateAllowance(value, characterId, amount, walletValue, dateValue) {
    var db = normalize(value);
    var normalizedAmount = Math.floor(number(amount, 0));
    if (CBI_CHARACTERS.indexOf(characterId) < 0 || !normalizedAmount) {
      return { db: db, allocation: null, reason: 'invalid_allocation' };
    }
    if (normalizedAmount < 0) {
      var currentPersonal = Math.max(0, Math.floor(number(db.work.caseFund.charFunds[characterId], 0)));
      if (!currentPersonal) return { db: db, allocation: null, reason: 'insufficient_personal_fund' };
      var reclaimed = Math.min(Math.abs(normalizedAmount), currentPersonal);
      db.work.caseFund.charFunds[characterId] = currentPersonal - reclaimed;
      var reclaimedLog = addCaseFundLog(db, {
        date: workDayKey(dateValue),
        type: 'allocation',
        characterId: characterId,
        content: '收回自由额度 ¥' + reclaimed
      });
      return {
        db: reclaimedLog.db,
        allocation: { characterId: characterId, amount: -reclaimed },
        autoPurchases: [],
        clamped: reclaimed < Math.abs(normalizedAmount),
        reason: ''
      };
    }
    if (normalizedAmount > unassignedAllowance(db, walletValue)) {
      return { db: db, allocation: null, reason: 'insufficient_fund' };
    }
    db.work.caseFund.charFunds[characterId] += normalizedAmount;
    var logged = addCaseFundLog(db, {
      date: workDayKey(dateValue),
      type: 'allocation',
      characterId: characterId,
      content: '划拨自由额度 ¥' + normalizedAmount
    });
    var settled = settlePersonalWishes(logged.db, characterId, walletValue, dateValue);
    return {
      db: settled.db,
      allocation: { characterId: characterId, amount: normalizedAmount },
      autoPurchases: settled.purchases,
      reason: ''
    };
  }

  function allocateCaseFund(value, characterId, amount, walletValue, dateValue) {
    return allocateAllowance(value, characterId, amount, walletValue, dateValue);
  }

  var MAJOR_CASE_CONFIG = {
    boss: { weight: 0.55, min: 5, max: 15, lines: ['我重新看了一遍现场资料：这里有个顺序不对。', '我把最不像线索的那一项圈了出来。先查这个。'] },
    rigsby: { weight: 0.78, min: 1, max: 15, lines: ['我跑了三处地址。第三个地点终于有人肯开口。', '邻居记得一辆车。描述不完整，但时间能对上。'] },
    vanpelt: { weight: 0.74, min: 1, max: 15, lines: ['数据库里有一条关联记录，我已经标出来了。', '我把通话记录和时间线叠在一起，找到一处重合。'] },
    lisbon: { weight: 0.62, min: 8, max: 15, lines: ['我把时间线重新排了一遍，有一处说法对不上。', '证词里有个细节反复变过。我想再问一次。'] },
    cho: { weight: 0.64, min: 8, max: 15, lines: ['找到一段遗漏的记录。时间能对上。', '两份证词用了同一句话。不是巧合。'] },
    jane: { weight: 0.06, min: 50, max: 100, lines: ['你们一直在看答案旁边的东西。', '凶手拼命让人看的那个细节，正好挡住了真正重要的部分。'] }
  };

  var WISH_REQUEST_CONFIG = {
    rigsby: {
      weight: 30,
      frequency: 0.32,
      requests: [
        { title: '去吃一次日式烤肉', detail: 'Rigsby认真研究了菜单，把牛舌、横膈膜和“续一碗米饭”都圈了出来', amount: 4800, reaction: '这个世界对烤肉的理解很有道理。Boss，下次能试试那种自己烤的吗？' },
        { title: '试试日本便利店的冬季关东煮', detail: '他对收银台旁边那一锅观察了很久，最后列了六样想尝的东西', amount: 1200, reaction: '萝卜比我想象得好吃。Cho没评价，但他把最后一颗蛋拿走了。' }
      ]
    },
    vanpelt: {
      weight: 25,
      frequency: 0.24,
      requests: [
        { title: '亲手看看未来的手机', detail: 'Van Pelt想试试触屏、相机和地图，申请末尾还加了一行“不会拆开研究”', amount: 1800, reaction: '它居然没有按键。Boss，我们那个年代的取证软件突然显得更古老了。' },
        { title: '拍一组日式大头贴', detail: '她对机器自动放大眼睛这件事半信半疑，但已经悄悄挑好了边框', amount: 1600, reaction: '照片可以留下。至于机器加的猫耳……请不要贴到办公室白板上。' }
      ]
    },
    lisbon: {
      weight: 20,
      frequency: 0.18,
      requests: [
        { title: '试试自动贩卖机的罐装咖啡', detail: 'Lisbon不太相信一台放在路边的机器能在半夜交出热咖啡', amount: 900, reaction: '确实是热的。味道……能喝。Jane不许把这句话理解成推荐。' },
        { title: '看看日本警察使用的便携手帐', detail: '她想比较内页结构和记录习惯，已经提前准备好不抄任何敏感内容', amount: 2200, reaction: '分区很清楚。我只借鉴格式——以及这个能塞进口袋的尺寸。' }
      ]
    },
    cho: {
      weight: 20,
      frequency: 0.16,
      requests: [
        { title: '要一本甜点封面的日本小本子', detail: 'Cho的愿望仍然只有品名、规格和金额，完全没有解释为什么选了甜点封面', amount: 1200, reaction: '能写。封面不影响使用。合作警局的人也没有意见。' },
        { title: '尝一份日式提拉米苏', detail: '他看了照片几秒，只写了“可以试一次”，没有添加其他说明', amount: 1400, reaction: '不错。Rigsby问了三次剩下那一半归不归他。' }
      ]
    },
    jane: {
      weight: 5,
      frequency: 0.20,
      requests: [
        { title: '尝尝那块“和我一模一样”的栗子派', detail: 'Jane对照片里的卷曲奶油表示异议，但仍然把店名和商品名抄得很完整', amount: 950, reaction: '我拒绝承认相似。派可以留下，照片删掉。' },
        { title: '带回日本旧书店里的魔术史', detail: '他只写了书名、书架位置和一行“另一个世界的版本”，价格藏在最下面', amount: 3200, reaction: '内容有几处荒唐得很有意思。现在它归我了——书是，Boss暂时也是。' }
      ]
    }
  };

  function createWishForCharacter(value, characterId, date, options) {
    var db = normalize(value);
    options = options && typeof options === 'object' ? options : {};
    date = workDayKey(date);
    db.work.caseFund.wishRefreshDates[characterId] = date;
    var existing = db.work.caseFund.investigations.find(function (item) {
      return item.source === 'wishlist' && item.date === date && item.characterId === characterId;
    });
    if (existing) return { db: db, request: existing, created: false, autoPurchased: existing.status === 'auto', reason: 'character_today_exists' };
    var seedBase = date + '|wish|' + characterId + '|' + db.work.caseFund.investigations.length;
    var config = WISH_REQUEST_CONFIG[characterId];
    var template = config.requests[Math.floor(stableUnit(seedBase + '|template') * config.requests.length)];
    var amount = Math.max(0, Math.floor(number(template.amount, 0)));
    var request = normalizeInvestigation({
      date: date,
      characterId: characterId,
      source: 'wishlist',
      title: template.title,
      detail: template.detail,
      reaction: template.reaction,
      amount: amount,
      status: 'pending'
    });
    db.work.caseFund.investigations.push(request);
    var settled = Object.prototype.hasOwnProperty.call(options, 'wallet')
      ? settlePersonalWishes(db, characterId, options.wallet, options.date || date)
      : { db: db, purchases: [] };
    request = settled.db.work.caseFund.investigations.find(function (item) { return item.id === request.id; });
    return { db: settled.db, request: request, created: true, autoPurchased: request.status === 'auto', reason: '' };
  }

  function createWishRequest(value, options) {
    var db = normalize(value);
    options = options && typeof options === 'object' ? options : {};
    var date = workDayKey(options.date);
    var allowed = uniqueList(options.availableCharacters, CBI_CHARACTERS);
    if (!allowed.length) allowed = CBI_CHARACTERS.slice();
    var seedBase = date + '|wish|' + db.work.caseFund.investigations.length;
    var totalWeight = allowed.reduce(function (sum, id) { return sum + WISH_REQUEST_CONFIG[id].weight; }, 0);
    var target = stableUnit(seedBase + '|character') * totalWeight;
    var characterId = allowed[0];
    allowed.some(function (id) {
      target -= WISH_REQUEST_CONFIG[id].weight;
      if (target <= 0) { characterId = id; return true; }
      return false;
    });
    return createWishForCharacter(db, characterId, date, options);
  }

  function refreshWishRequests(value, options) {
    var db = normalize(value);
    options = options && typeof options === 'object' ? options : {};
    var date = workDayKey(options.date);
    var allowed = uniqueList(options.availableCharacters, CBI_CHARACTERS);
    if (!allowed.length) allowed = CBI_CHARACTERS.slice();
    var frequencies = options.frequencies && typeof options.frequencies === 'object' ? options.frequencies : {};
    var checkedCharacters = [];
    var requests = [];
    var autoPurchases = [];
    allowed.forEach(function (characterId) {
      if (db.work.caseFund.wishRefreshDates[characterId] === date) return;
      db.work.caseFund.wishRefreshDates[characterId] = date;
      checkedCharacters.push(characterId);
      var configured = Object.prototype.hasOwnProperty.call(frequencies, characterId)
        ? number(frequencies[characterId], 0)
        : WISH_REQUEST_CONFIG[characterId].frequency;
      var frequency = Math.max(0, Math.min(1, configured));
      if (stableUnit(date + '|wish-frequency|' + characterId) >= frequency) return;
      var childOptions = { date: options.date || date };
      if (Object.prototype.hasOwnProperty.call(options, 'wallet')) childOptions.wallet = options.wallet;
      var created = createWishForCharacter(db, characterId, date, childOptions);
      db = created.db;
      if (!created.created) return;
      requests.push(created.request);
      if (created.autoPurchased) autoPurchases.push(created.request);
    });
    return {
      db: db,
      date: date,
      checkedCharacters: checkedCharacters,
      requests: requests,
      autoPurchases: autoPurchases,
      reason: checkedCharacters.length ? '' : 'already_refreshed'
    };
  }

  function createInvestigationRequest(value, options) {
    return createWishRequest(value, options);
  }

  function advanceMajorCase(value, caseId, options) {
    var db = normalize(value);
    var caseItem = db.cases.find(function (item) { return item.id === caseId; });
    if (!caseItem) return { db: db, caseItem: null, progress: null, scene: null };
    var progress = db.work.majorCaseProgress[caseId] || { progress: 0, scenes: [], archivedAt: '', lastAdvancedDate: '' };
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
      cost: Math.max(0, Math.floor(number(options.cost, 0))),
      createdAt: new Date().toISOString()
    });
    progress.progress += delta;
    progress.scenes.push(scene);
    return { db: db, caseItem: caseItem, progress: progress, scene: scene };
  }

  function advanceMajorCaseDay(value, caseId, options) {
    var db = normalize(value);
    options = options && typeof options === 'object' ? options : {};
    var date = workDayKey(options.date);
    var caseItem = db.cases.find(function (item) { return item.id === caseId && item.status === 'active'; });
    if (!caseItem) return { db: db, caseItem: caseItem || null, progress: null, scene: null, reason: 'no_active_case', date: date };
    var progress = db.work.majorCaseProgress[caseId] || { progress: 0, scenes: [], archivedAt: '', lastAdvancedDate: '' };
    db.work.majorCaseProgress[caseId] = progress;
    if (progress.progress >= 100) return { db: db, caseItem: caseItem, progress: progress, scene: null, reason: 'complete', date: date };
    if (progress.lastAdvancedDate === date) return { db: db, caseItem: caseItem, progress: progress, scene: null, reason: 'already_advanced', date: date };
    var advanced = advanceMajorCase(db, caseId, {
      availableCharacters: options.availableCharacters || ['boss'].concat(CBI_CHARACTERS),
      cost: 0,
      seed: 'case-day|' + date
    });
    if (!advanced.scene) return { db: advanced.db, caseItem: caseItem, progress: advanced.progress, scene: null, reason: 'complete', date: date };
    advanced.progress.lastAdvancedDate = date;
    return { db: advanced.db, caseItem: advanced.caseItem, progress: advanced.progress, scene: advanced.scene, reason: '', date: date };
  }

  function approveWishRequest(value, investigationId, walletValue, options) {
    var db = normalize(value);
    options = options && typeof options === 'object' ? options : {};
    var request = db.work.caseFund.investigations.find(function (item) { return item.id === investigationId; });
    if (!request || request.status !== 'pending') return { db: db, request: request || null, reason: 'not_pending' };
    var personal = Math.max(0, number(db.work.caseFund.charFunds[request.characterId], 0));
    var openFund = unassignedAllowance(db, walletValue);
    var totalFund = availableAllowance(db, walletValue);
    if (request.amount > totalFund || request.amount > personal + openFund) return { db: db, request: request, reason: 'insufficient_fund' };
    var usedPersonal = Math.min(personal, request.amount);
    db.work.caseFund.charFunds[request.characterId] = Math.max(0, personal - usedPersonal);
    request = db.work.caseFund.investigations.find(function (item) { return item.id === investigationId; });
    request.status = 'approved';
    request.reply = text(options.reply).trim();
    request.spentFrom = usedPersonal === request.amount ? 'personal' : (usedPersonal ? 'mixed' : 'public');
    request.resolvedAt = new Date().toISOString();
    var content = request.title + ' · 同意报销 ¥' + request.amount;
    if (request.reply) content += ' · Boss：' + request.reply;
    var logged = addCaseFundLog(db, {
      date: request.date,
      type: 'wish',
      characterId: request.characterId,
      caseId: request.caseId,
      content: content
    });
    request = logged.db.work.caseFund.investigations.find(function (item) { return item.id === investigationId; });
    return { db: logged.db, request: request, reason: '' };
  }

  function approveInvestigation(value, investigationId, walletValue, options) {
    return approveWishRequest(value, investigationId, walletValue, options);
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
    normalizeTimelineItem: normalizeTimelineItem,
    normalizeWork: normalizeWork,
    normalizeCommission: normalizeCommission,
    normalizeShopItem: normalizeShopItem,
    normalizeShop: normalizeShop,
    normalizeShopProject: normalizeShopProject,
    normalizeShopProjectItem: normalizeShopProjectItem,
    normalizeShopSection: normalizeShopSection,
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
    compareTimelineEntries: compareTimelineEntries,
    timelineEntries: timelineEntries,
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
    walletAccountSurplus: walletAccountSurplus,
    entertainmentFundFromWallet: entertainmentFundFromWallet,
    reimbursementFundFromWallet: reimbursementFundFromWallet,
    shopSpend: shopSpend,
    availableShopFund: availableShopFund,
    majorCaseSpend: majorCaseSpend,
    wishSpend: wishSpend,
    allowanceSpend: allowanceSpend,
    availableAllowance: availableAllowance,
    availableCaseFund: availableCaseFund,
    allocatedAllowance: allocatedAllowance,
    allocatedCaseFund: allocatedCaseFund,
    unassignedAllowance: unassignedAllowance,
    unassignedCaseFund: unassignedCaseFund,
    addCaseFundLog: addCaseFundLog,
    allocateAllowance: allocateAllowance,
    allocateCaseFund: allocateCaseFund,
    settlePersonalWishes: settlePersonalWishes,
    createWishRequest: createWishRequest,
    refreshWishRequests: refreshWishRequests,
    createInvestigationRequest: createInvestigationRequest,
    approveWishRequest: approveWishRequest,
    approveInvestigation: approveInvestigation,
    setCaseFocus: setCaseFocus,
    advanceMajorCase: advanceMajorCase,
    advanceMajorCaseDay: advanceMajorCaseDay,
    archiveMajorCase: archiveMajorCase
  });
})(window);
