class StudyApp {
  constructor() {
    // 数据
    this.settings = this.load('settings') || { grade: '初二', name: '同学' };
    this.questions = this.load('questions') || [];       // 所有做过的题
    this.wrongBook = this.load('wrongBook') || [];       // 错题本
    this.records = this.load('records') || [];           // 每日学习记录

    // AI
    this.AI_API_KEY = localStorage.getItem('ai_api_key') || '';
    this.AI_API_URL = 'https://api.deepseek.com/chat/completions';
    this.AI_MODEL = 'deepseek-chat';
    this.chatHistory = this.load('chatHistory') || [];

    // 当前做题状态
    this.currentQuiz = null;   // { questions, currentIndex, answers, subject, mode }
    this.combo = 0;            // 连续答对计数

    // 音效系统
    this.audioCtx = null;
    this.soundEnabled = true;

    // 游戏系统
    this.xp = parseInt(localStorage.getItem('game_xp')) || 0;
    this.particles = [];
    this.particleCanvas = null;
    this.particleCtx = null;
    this.bgmPlaying = false;
    this.bgmSource = null;
    this.bgmGain = null;
    this.achievements = JSON.parse(localStorage.getItem('achievements') || '{}');

    this.init();
  }

  // ==================== 音效系统 ====================

  getAudioCtx() {
    if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return this.audioCtx;
  }

  playSound(type) {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.getAudioCtx();
      const now = ctx.currentTime;

      switch (type) {
        case 'correct': {
          // 叮哚~上升音
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523, now);    // C5
          osc.frequency.setValueAtTime(659, now + 0.1); // E5
          osc.frequency.setValueAtTime(784, now + 0.2); // G5
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
          osc.start(now); osc.stop(now + 0.4);
          break;
        }
        case 'wrong': {
          // 嘧嘧~下降音
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(300, now);
          osc.frequency.exponentialRampToValueAtTime(150, now + 0.3);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
          osc.start(now); osc.stop(now + 0.35);
          break;
        }
        case 'combo': {
          // 连击！激励音
          [523, 659, 784, 1047].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.08);
            gain.gain.setValueAtTime(0.25, now + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.15);
            osc.start(now + i * 0.08); osc.stop(now + i * 0.08 + 0.15);
          });
          break;
        }
        case 'levelup': {
          // 升级！完成练习
          const notes = [523, 659, 784, 1047, 784, 1047, 1319];
          notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = i < 4 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.1);
            gain.gain.setValueAtTime(0.25, now + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.2);
            osc.start(now + i * 0.1); osc.stop(now + i * 0.1 + 0.2);
          });
          break;
        }
        case 'start': {
          // 开始出题
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.setValueAtTime(554, now + 0.12);
          osc.frequency.setValueAtTime(659, now + 0.24);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
          osc.start(now); osc.stop(now + 0.4);
          break;
        }
        case 'click': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(800, now);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
          osc.start(now); osc.stop(now + 0.05);
          break;
        }
        case 'perfect': {
          // 全对！超级奖励音
          const melody = [523, 659, 784, 1047, 1319, 1568, 1319, 1568, 2093];
          melody.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = i < 6 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.1);
            gain.gain.setValueAtTime(0.2, now + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.25);
            osc.start(now + i * 0.1); osc.stop(now + i * 0.1 + 0.25);
          });
          break;
        }
      }
    } catch {}
  }

  // ==================== 各学科题型分类 ====================

  getSubjectQuestionTypes(subject) {
    const types = {
      '数学': [
        { value: 'choice',    label: '选择题',   icon: '🔘', desc: '四选一，考查基础概念和计算' },
        { value: 'fillblank', label: '填空题',   icon: '✏️', desc: '直接填写答案，无选项提示' },
        { value: 'calculate', label: '计算题',   icon: '🧮', desc: '列式计算、求解方程等' },
        { value: 'bigq',      label: '解答大题', icon: '📐', desc: '综合性大题，需详细解题步骤' }
      ],
      '物理': [
        { value: 'choice',     label: '选择题',   icon: '🔘', desc: '四选一，考查物理概念和规律' },
        { value: 'fillblank',  label: '填空题',   icon: '✏️', desc: '填写物理量、公式结果等' },
        { value: 'calculate',  label: '计算题',   icon: '🧮', desc: '物理公式计算，需写出步骤' },
        { value: 'experiment', label: '实验题',   icon: '🔬', desc: '实验设计、数据分析、误差讨论' }
      ],
      '英语': [
        { value: 'choice',     label: '单项选择',   icon: '🔘', desc: '语法、词汇、句型辨析' },
        { value: 'cloze',      label: '完形填空',   icon: '📝', desc: '阅读短文选词填空' },
        { value: 'reading',    label: '阅读理解',   icon: '📖', desc: '阅读短文回答问题' },
        { value: 'writing',    label: '书面表达',   icon: '✍️', desc: '根据提示写英语短文' }
      ],
      '语文': [
        { value: 'choice',     label: '选择题',     icon: '🔘', desc: '字词、病句、文学常识等' },
        { value: 'reading',    label: '现代文阅读', icon: '📖', desc: '阅读文章回答问题' },
        { value: 'classical',  label: '文言文阅读', icon: '📜', desc: '文言文翻译与理解' },
        { value: 'poetry',     label: '古诗词鉴赏', icon: '🏮', desc: '古诗词赏析与理解' },
        { value: 'writing',    label: '作文',       icon: '✍️', desc: '命题作文、材料作文等' }
      ],
      '化学': [
        { value: 'choice',     label: '选择题',   icon: '🔘', desc: '四选一，考查化学概念和反应' },
        { value: 'fillblank',  label: '填空题',   icon: '✏️', desc: '填写化学式、现象、结论等' },
        { value: 'calculate',  label: '计算题',   icon: '🧮', desc: '化学方程式相关计算' },
        { value: 'experiment', label: '实验题',   icon: '🔬', desc: '实验方案、操作步骤与现象分析' }
      ]
    };
    return types[subject] || types['数学'];
  }

  // 获取题型的答题模式 (choice / fillblank / subjective)
  getAnswerMode(questionType) {
    const modeMap = {
      'choice':     'choice',
      'fillblank':  'fillblank',
      'calculate':  'subjective',
      'bigq':       'subjective',
      'experiment': 'subjective',
      'cloze':      'choice',      // 完形填空每空选择
      'reading':    'subjective',  // 阅读理解简答
      'writing':    'subjective',  // 作文/书面表达
      'classical':  'subjective',  // 文言文
      'poetry':     'subjective'   // 古诗词
    };
    return modeMap[questionType] || 'choice';
  }

  // ==================== 各学科年级知识点列表 ====================

  // 按题型+学科+年级返回知识点（按考试频率从高到低排序）
  getTopicList(subject, questionType) {
    const grade = this.settings.grade;
    const qType = questionType || this.selectedQuestionType || 'choice';

    // 题型专属知识点映射：{ 学科: { 年级: { 题型: [知识点按频率排序] } } }
    // 未在映射中的题型使用 '_default' 回退
    const topicMap = {
      '数学': {
        '初一': {
          '_default': ['一元一次方程', '有理数', '不等式与不等式组', '整式加减', '相交线与平行线', '平面直角坐标系', '线段与角', '三角形初步', '数据收集与整理'],
          'fillblank': ['一元一次方程', '有理数运算', '整式化简求值', '不等式', '坐标与图形', '线段角计算'],
          'calculate': ['一元一次方程应用题', '有理数混合运算', '整式化简求值', '不等式组求解']
        },
        '初二': {
          '_default': ['全等三角形', '一次函数', '勾股定理', '分式', '二次根式', '平行四边形', '等腰三角形', '直角三角形', '矩形', '菱形', '正方形', '方差', '轴对称', '中心对称'],
          'fillblank': ['一次函数解析式', '勾股定理计算', '全等三角形条件', '分式化简', '二次根式化简', '四边形性质'],
          'calculate': ['一次函数应用', '勾股定理计算', '分式方程', '二次根式运算', '全等三角形证明'],
          'bigq': ['全等三角形综合', '一次函数与几何综合', '四边形综合证明', '勾股定理综合']
        },
        '初三': {
          '_default': ['二次函数', '圆', '相似三角形', '锐角三角函数', '反比例函数', '概率', '弧与扇形'],
          'fillblank': ['二次函数解析式', '圆的性质', '三角函数值', '反比例函数'],
          'calculate': ['二次函数应用题', '圆的计算', '三角函数计算', '概率计算'],
          'bigq': ['二次函数综合', '圆与三角形综合', '函数与几何压轴', '相似三角形综合']
        },
        '高一': {
          '_default': ['函数的性质', '集合', '指数函数', '对数函数', '三角函数', '函数概念', '函数的应用'],
          'fillblank': ['函数定义域值域', '指数对数运算', '三角函数值', '集合运算'],
          'calculate': ['函数解析式求法', '指数对数方程', '三角函数化简', '集合问题'],
          'bigq': ['函数性质综合', '三角函数综合', '函数应用题']
        },
        '高二': {
          '_default': ['解析几何', '数列', '立体几何', '圆锥曲线', '不等式', '概率统计', '等差数列', '等比数列'],
          'fillblank': ['数列通项公式', '圆锥曲线方程', '立体几何计算', '概率计算'],
          'calculate': ['数列求和', '圆锥曲线焦点弦', '立体几何体积', '概率期望'],
          'bigq': ['解析几何综合', '数列综合', '立体几何证明与计算', '导数应用']
        },
        '高三': {
          '_default': ['函数与导数', '解析几何', '数列', '三角函数', '立体几何', '概率统计', '集合与逻辑', '不等式'],
          'fillblank': ['导数计算', '数列通项', '三角函数值', '概率计算', '解析几何方程'],
          'calculate': ['导数应用', '数列求和', '解析几何计算', '概率分布'],
          'bigq': ['导数综合压轴', '解析几何压轴', '数列与不等式综合', '概率综合']
        }
      },
      '物理': {
        '初一': { '_default': ['科学入门'] },
        '初二': {
          '_default': ['压强', '浮力', '力', '光的反射与折射', '凸透镜成像', '密度', '速度', '声音', '物态变化', '功与功率', '机械效率', '简单机械', '牛顿第一定律', '二力平衡', '重力', '弹力', '摩擦力'],
          'fillblank': ['密度计算', '速度计算', '压强计算', '浮力计算', '功与功率计算', '凸透镜成像规律'],
          'calculate': ['密度综合计算', '压强综合计算', '浮力综合计算', '功率效率计算', '速度路程时间'],
          'experiment': ['凸透镜成像实验', '密度测量实验', '摩擦力探究', '压强探究实验', '浮力探究实验', '平面镜成像实验', '声音特性探究', '物态变化观察']
        },
        '初三': {
          '_default': ['欧姆定律', '电功率', '电路分析', '焦耳定律', '内能与比热容', '磁场与电磁', '家庭电路', '安全用电', '电荷与电流', '电压与电阻'],
          'fillblank': ['欧姆定律计算', '电功率计算', '焦耳定律计算', '比热容计算', '电路分析'],
          'calculate': ['欧姆定律综合', '电功率综合', '焦耳定律应用', '比热容计算', '电路故障分析'],
          'experiment': ['电流与电压关系实验', '电阻测量实验', '电功率测量', '焦耳定律验证', '串并联电路探究', '电磁铁磁性探究', '比热容实验']
        },
        '高一': {
          '_default': ['牛顿第二定律', '受力分析', '匀变速直线运动', '力的合成与分解', '曲线运动', '万有引力', '自由落体', '牛顿第一定律', '牛顿第三定律'],
          'fillblank': ['运动学公式计算', '力的分解计算', '牛顿第二定律计算', '万有引力计算'],
          'calculate': ['牛顿第二定律应用', '匀变速运动综合', '力的合成分解', '曲线运动计算', '万有引力应用'],
          'experiment': ['探究加速度与力和质量关系', '验证牛顿第二定律', '研究匀变速运动', '力的合成实验', '自由落体验证']
        },
        '高二': {
          '_default': ['电磁感应', '磁场', '电场', '电路', '安培力', '洛伦兹力', '电势与电容', '交变电'],
          'fillblank': ['电场强度计算', '磁感应强度', '感应电动势', '电路计算'],
          'calculate': ['电场综合计算', '磁场力计算', '电磁感应计算', '交变电计算'],
          'experiment': ['电阻测量(伏安法)', '电动势与内阻测量', '电磁感应现象探究', '描绘电场线']
        },
        '高三': {
          '_default': ['力电综合', '电磁学综合', '力学综合', '运动学综合', '能量动量'],
          'fillblank': ['力学计算', '电磁学计算', '运动学计算'],
          'calculate': ['力电综合计算', '能量动量综合', '电磁感应综合'],
          'experiment': ['力学实验综合', '电学实验综合', '设计型实验']
        }
      },
      '英语': {
        '初一': {
          '_default': ['一般现在时', 'be动词', '名词复数', '形容词', '介词', '日常交际用语', '基础词汇', '简单句型'],
          'cloze': ['日常交际用语', '基础词汇', '简单句型', '介词用法'],
          'reading': ['日常生活话题', '人物介绍', '学校活动', '基础阅读'],
          'writing': ['自我介绍', '日常活动描述', '简单书信']
        },
        '初二': {
          '_default': ['现在完成时', '过去时', '将来时', '比较级最高级', '定语从句', '宾语从句', '情态动词', '读写综合'],
          'cloze': ['时态语境', '词汇辨析', '上下文逻辑', '固定搭配'],
          'reading': ['人物故事', '文化差异', '科普文章', '日常话题', '观点态度'],
          'writing': ['记叙文', '书信邮件', '看图写话', '话题讨论']
        },
        '初三': {
          '_default': ['被动语态', '复合句', '主谓一致', '中考词汇综合', '语法填空', '短文改错'],
          'cloze': ['语境词汇', '逻辑推断', '固定搭配', '词性转换'],
          'reading': ['社会热点', '科普知识', '人生哲理', '文化交流', '观点判断'],
          'writing': ['话题作文', '图表作文', '书信建议', '活动通知']
        },
        '高一': {
          '_default': ['定语从句', '名词性从句', '状语从句', '非谓语动词', '时态语态综合'],
          'cloze': ['篇章逻辑', '词汇辨析', '语法语境', '固定搭配'],
          'reading': ['社会话题', '科技发展', '自然环境', '人物传记', '文学摘要'],
          'writing': ['建议信', '申请信', '邀请信', '感谢信']
        },
        '高二': {
          '_default': ['虚拟语气', '倒装句', '强调句型', '高考词汇', '语法填空', '短文改错'],
          'cloze': ['深层语境', '情感态度', '篇章结构', '词义辨析'],
          'reading': ['议论文阅读', '说明文阅读', '新闻报道', '学术话题', '推断主旨'],
          'writing': ['议论文', '读后续写', '概要写作', '正反观点']
        },
        '高三': {
          '_default': ['语法综合', '完形填空', '阅读理解', '七选五', '书面表达', '词汇综合'],
          'cloze': ['综合语境', '高频词汇', '篇章逻辑', '情感线索', '固定搭配'],
          'reading': ['主旨大意', '细节理解', '推理判断', '词义猜测', '七选五'],
          'writing': ['应用文综合', '读后续写', '概要写作', '高考热点话题']
        }
      },
      '语文': {
        '初一': {
          '_default': ['基础字词', '修辞手法', '记叙文基础', '古诗词鉴赏', '文言文入门', '标点符号'],
          'reading': ['记叙文阅读', '写人叙事', '景物描写理解', '中心思想概括'],
          'classical': ['课内文言文', '实词虚词', '文言文断句', '文言文翻译'],
          'poetry': ['课内古诗词', '意象理解', '情感把握', '名句赏析'],
          'writing': ['记叙文写作', '写人记事', '景物描写', '读后感']
        },
        '初二': {
          '_default': ['说明文', '议论文入门', '文言文阅读', '古诗词鉴赏', '修辞手法', '病句修改', '名著导读', '句子排序'],
          'reading': ['说明文阅读', '议论文阅读入门', '小说阅读', '散文阅读', '中心论点'],
          'classical': ['课内文言文', '词类活用', '一词多义', '文言文翻译', '古今异义', '特殊句式'],
          'poetry': ['课内古诗词', '写景抒情', '借物言志', '意境分析', '表现手法'],
          'writing': ['命题作文', '半命题作文', '记叙文深化', '说明文写作']
        },
        '初三': {
          '_default': ['记叙文阅读', '议论文阅读', '文言文综合', '古诗文鉴赏', '说明文阅读', '名著阅读', '作文', '语言运用'],
          'reading': ['记叙文主旨', '议论文论证', '说明文方法', '小说人物形象', '散文情感', '概括归纳'],
          'classical': ['课外文言文', '实词虚词综合', '文言翻译', '特殊句式', '内容理解', '人物评价'],
          'poetry': ['课内外古诗词', '情感主旨', '表现手法', '炼字赏析', '意象意境', '对比分析'],
          'writing': ['命题作文', '材料作文', '半命题作文', '中考热点话题']
        },
        '高一': {
          '_default': ['现代文阅读', '古代诗文', '文言文翻译', '议论文写作', '小说阅读', '散文阅读'],
          'reading': ['小说情节与人物', '散文主旨与手法', '论述文逻辑', '信息筛选整合'],
          'classical': ['文言实词', '文言虚词', '文言翻译', '文言断句', '内容概括', '古代文化常识'],
          'poetry': ['意象与意境', '表达技巧', '思想感情', '比较鉴赏', '诗歌题材分类'],
          'writing': ['议论文立论', '论据选择', '议论文结构', '时评写作']
        },
        '高二': {
          '_default': ['散文鉴赏', '小说鉴赏', '古代诗歌鉴赏', '文言文综合', '议论文', '实用类文本'],
          'reading': ['散文艺术手法', '小说叙事技巧', '实用类文本筛选', '论述文论证分析'],
          'classical': ['文言翻译综合', '文言断句', '文言概括分析', '古代文化常识', '文言虚词辨析'],
          'poetry': ['表达技巧鉴赏', '思想内容理解', '语言风格', '比较阅读', '典故运用'],
          'writing': ['任务驱动型作文', '材料作文审题', '议论文深化', '读写结合']
        },
        '高三': {
          '_default': ['论述类文本', '文学类文本', '实用类文本', '文言文综合', '古代诗歌', '语言文字运用', '作文'],
          'reading': ['论述类文本逻辑', '文学类文本手法', '实用类文本信息', '主观题答题规范'],
          'classical': ['文言翻译高考真题', '文言断句', '古文概括分析', '文化常识', '高考标准答题格式'],
          'poetry': ['高考诗歌鉴赏', '表达技巧综合', '情感主旨综合', '比较鉴赏', '古代诗歌流派'],
          'writing': ['高考作文审题', '新材料作文', '任务驱动型', '高考热点话题', '议论文升格']
        }
      },
      '化学': {
        '初一': { '_default': ['科学入门'] },
        '初二': { '_default': ['科学入门'] },
        '初三': {
          '_default': ['酸碱盐', '化学方程式', '金属', '空气与氧气', '溶液溶解度', '碳和碳的化合物', '分子和原子', '元素', '化学式', '水'],
          'fillblank': ['化学方程式书写', '化学式计算', '溶解度曲线', '金属活动性', '酸碱盐性质'],
          'calculate': ['化学方程式计算', '溶质质量分数', '相对分子质量', '混合物计算'],
          'experiment': ['氧气制取实验', '二氧化碳制取', '金属活动性探究', '酸碱盐性质实验', '溶液配制', '气体检验与除杂']
        },
        '高一': {
          '_default': ['离子反应', '氧化还原反应', '物质的量', '钠及其化合物', '铁及其化合物', '铝及其化合物', '氯', '硫', '氮', '硅'],
          'fillblank': ['离子方程式', '氧化还原配平', '物质的量计算', '元素化合物性质'],
          'calculate': ['物质的量综合', '氧化还原计算', '混合物计算', '气体摩尔体积'],
          'experiment': ['离子检验实验', '氧化还原实验', '钠的性质实验', '铁离子转化实验', '气体制备实验', '蒸馏与过滤']
        },
        '高二': {
          '_default': ['化学平衡', '化学反应速率', '电离平衡', '盐类水解', '有机化学基础', '烃', '烃的衍生物', '结构化学'],
          'fillblank': ['平衡常数', '反应速率计算', '电离常数', '有机物结构简式'],
          'calculate': ['化学平衡计算', '反应速率计算', '电离平衡计算', '有机产率计算'],
          'experiment': ['反应速率影响因素', '化学平衡移动实验', '中和滴定', '有机物性质实验', '蒸馏萃取']
        },
        '高三': {
          '_default': ['化学反应原理', '元素化合物', '有机化学', '物质的量综合', '离子反应综合', '氧化还原', '实验综合'],
          'fillblank': ['化学原理计算', '有机推断', '离子检验', '实验操作'],
          'calculate': ['盖斯定律', '化学平衡综合', '电化学计算', '有机合成'],
          'experiment': ['综合实验设计', '实验方案评价', '定量实验', '物质的制备与检验']
        }
      }
    };

    // 获取对应知识点：先查题型专属，再查默认
    const subjectData = topicMap[subject];
    if (!subjectData) return ['综合'];
    const gradeData = subjectData[grade];
    if (!gradeData) return ['综合'];

    return gradeData[qType] || gradeData['_default'] || ['综合'];
  }

  // ==================== 年级课程范围 ====================

  getGradeScope(subject) {
    const grade = this.settings.grade;
    const scopes = {
      '物理': {
        '初二': '人教版八年级物理范围：机械运动与参照物、速度、声音的产生与传播、声音的特性、温度、物态变化（熔化凝固汽化液化升华凝华）、光的直线传播、光的反射、平面镜成像、光的折射、透镜与凸透镜成像、质量、密度、力、弹力、重力、摩擦力、牛顿第一定律、二力平衡、压强、压力、液体压强、大气压强、浮力、浮沉条件、简单机械、功、功率、机械效率。严禁超纲：不要涉及高中物理内容（如加速度计算、动能定理、动量、电磁感应、万有引力等）',
        '初三': '人教版九年级物理范围：内能、比热容、热机、电荷、电流、电压、电阻、欧姆定律、电功率、电能、焦耳定律、家庭电路、安全用电、磁场、电生磁、电磁铁、电动机、磁生电、发电机、能量守恒。严禁超纲',
        '初一': '初一不开设物理课，请出科学入门级别的基础题',
        '高一': '高一物理：运动学（匀变速直线运动、自由落体）、力学（牛顿三定律、受力分析、力的合成与分解）、曲线运动、万有引力',
        '高二': '高二物理：电场、电路、磁场、电磁感应、交变电',
        '高三': '高三物理：全部高中物理知识综合复习'
      },
      '数学': {
        '初一': '人教版七年级数学：有理数、整式的加减乘除、一元一次方程、几何初步（线段角三角形）、相交线平行线、平面直角坐标系、不等式与不等式组、数据的收集与整理',
        '初二': '人教版八年级数学：三角形（全等、等腰、直角三角形）、分式、二次根式、勾股定理、四边形（平行四边形、矩形、菱形、正方形）、一次函数、数据分析（中位数、众数、方差）、轴对称与中心对称。严禁超纲：不要涉及二次函数、圆、概率等初三内容',
        '初三': '人教版九年级数学：二次函数、旋转（圆、弧、扇形）、概率、相似三角形、锐角三角函数、反比例函数',
        '高一': '高一数学：集合、函数概念、指数函数、对数函数、三角函数',
        '高二': '高二数学：数列、不等式、立体几何、解析几何、概率统计',
        '高三': '高三数学：全部高中数学知识综合复习'
      },
      '化学': {
        '初一': '初一不开设化学课，请出科学入门级别基础题',
        '初二': '初二不开设化学课，请出科学入门级别基础题',
        '初三': '人教版九年级化学：空气与氧气、分子原子、元素、化学式、化学方程式、水、溶液溶解度、酸碱盐、金属、碳和碳的化合物',
        '高一': '高一化学：物质的量、离子反应、氧化还原反应、金属及其化合物、非金属',
        '高二': '高二化学：化学反应速率、化学平衡、有机化学、结构化学',
        '高三': '高三化学：全部高中化学综合复习'
      },
      '英语': {
        '初一': '人教版七年级英语：be动词、一般现在时、名词复数、形容词、介词、日常交际用语、基础词汇',
        '初二': '人教版八年级英语：过去时、将来时、现在完成时、比较级最高级、情态动词、定语从句、宣词从句、读写综合',
        '初三': '人教版九年级英语：被动语态、主谓一致、复合句、中考词汇综合',
        '高一': '高一英语：定语从句、名词性从句、状语从句、非谓语动词',
        '高二': '高二英语：虚拟语气、倒装句、强调句型、高考词汇',
        '高三': '高三英语：全部高中英语语法词汇综合复习'
      },
      '语文': {
        '初一': '人教版七年级语文：记叙文基础、古诗词鉴赏、文言文入门、基础字词',
        '初二': '人教版八年级语文：说明文、议论文入门、文言文阅读、名著导读、古诗词鉴赏、修辞手法、病句修改',
        '初三': '人教版九年级语文：中考阅读理解、文言文综合、议论文、记叙文、古诗文鉴赏、作文',
        '高一': '高一语文：现代文阅读、古代诗文、文言文、议论文写作',
        '高二': '高二语文：散文小说阅读、古代诗歌鉴赏、文言文翻译、议论文',
        '高三': '高三语文：全部高中语文综合复习'
      }
    };
    return scopes[subject]?.[grade] || `${grade}${subject}，按照中国大陆人教版教材范围出题，严禁超纲`;
  }

  // ==================== 工具方法 ====================

  escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }

  save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  showModal(id) { document.getElementById(id).style.display = 'flex'; }
  closeModal(id) { document.getElementById(id).style.display = 'none'; }

  sanitizeSvg(svgStr) {
    if (!svgStr || typeof svgStr !== 'string') return '';
    const svgMatch = svgStr.match(/<svg[\s\S]*?<\/svg>/i);
    if (!svgMatch) return '';
    let svg = svgMatch[0]
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/on\w+\s*=\s*'[^']*'/gi, '');
    // 手机适配：确保viewBox存在，去掉固定宽高让SVG自适应容器
    const wMatch = svg.match(/width\s*=\s*["'](\d+)/i);
    const hMatch = svg.match(/height\s*=\s*["'](\d+)/i);
    if (!svg.includes('viewBox') && wMatch && hMatch) {
      svg = svg.replace(/<svg/, `<svg viewBox="0 0 ${wMatch[1]} ${hMatch[1]}"`);
    }
    // 去掉固定宽高，用CSS控制尺寸
    svg = svg.replace(/(<svg[^>]*?)\s*width\s*=\s*["']\d+[^"']*["']/i, '$1');
    svg = svg.replace(/(<svg[^>]*?)\s*height\s*=\s*["']\d+[^"']*["']/i, '$1');
    return svg;
  }

  formatAIResponse(text) {
    let html = this.escapeHtml(text)
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    if (typeof katex !== 'undefined') {
      html = html.replace(/\$\$(.+?)\$\$/gs, (_, tex) => {
        try { return katex.renderToString(tex.replace(/<br>/g, '\n'), { displayMode: true, throwOnError: false }); }
        catch { return `$$${tex}$$`; }
      });
      html = html.replace(/\$(.+?)\$/g, (_, tex) => {
        try { return katex.renderToString(tex, { displayMode: false, throwOnError: false }); }
        catch { return `$${tex}$`; }
      });
    }
    return html;
  }

  // ==================== 初始化 ====================

  init() {
    this.setupEventListeners();
    this.updateGradeDisplay();
    this.updateStats();
    this.renderWrongBook();
    this.initParticles();
    this.updateXPBar();
    this.updateDifficultyOptions();
    this.updateQuestionTypeGrid();
    this.restoreChatMessages();
  }

  updateGradeDisplay() {
    document.getElementById('gradeDisplay').textContent = `${this.settings.name} · ${this.settings.grade}`;
  }

  setupEventListeners() {
    // 导航切换
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', (e) => this.switchView(e.target.dataset.view));
    });

    // 做题练习
    document.getElementById('startPracticeBtn')?.addEventListener('click', () => this.startPractice());
    document.getElementById('nextQuestionBtn')?.addEventListener('click', () => this.nextQuestion());
    document.getElementById('finishPracticeBtn')?.addEventListener('click', () => this.showPracticeResult());

    // 科目切换时更新题型
    document.getElementById('practiceSubject')?.addEventListener('change', () => this.updateQuestionTypeGrid());

    // 错题本筛选
    document.getElementById('wrongBookSubject')?.addEventListener('change', () => this.renderWrongBook());
    document.getElementById('wrongBookStatus')?.addEventListener('change', () => this.renderWrongBook());

    // 专项训练
    document.getElementById('analyzeWeakBtn')?.addEventListener('click', () => this.analyzeWeakPoints());
    document.getElementById('targetedPracticeBtn')?.addEventListener('click', () => this.startTargetedPractice());
    document.getElementById('targetedNextBtn')?.addEventListener('click', () => this.nextTargetedQuestion());
    document.getElementById('targetedFinishBtn')?.addEventListener('click', () => this.finishTargetedPractice());

    // 查漏补缺诊断
    document.getElementById('startDiagnosticBtn')?.addEventListener('click', () => this.startDiagnostic());
    document.getElementById('diagnosticNextBtn')?.addEventListener('click', () => this.nextDiagnosticQuestion());
    document.getElementById('diagnosticFinishBtn')?.addEventListener('click', () => this.showDiagnosticReport());
    document.getElementById('diagnosticVoiceBtn')?.addEventListener('click', () => this.startDiagnosticVoice());

    // AI辅导
    document.querySelectorAll('.ai-func-tab').forEach(tab => {
      tab.addEventListener('click', (e) => this.switchAIFunc(e.target.dataset.func));
    });
    document.getElementById('chatSendBtn')?.addEventListener('click', () => this.sendChat());
    document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendChat(); }
    });
    document.getElementById('reviewBtn')?.addEventListener('click', () => this.reviewWrongAnswer());
    document.getElementById('summaryBtn')?.addEventListener('click', () => this.generateSummary());

    // 语音输入
    this.setupVoiceInput();
  }

  switchView(viewName) {
    const viewMap = {
      'practice': 'practiceView',
      'wrong-book': 'wrongBookView',
      'targeted': 'targetedView',
      'ai-tutor': 'aiTutorView',
      'stats': 'statsView'
    };

    Object.values(viewMap).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    const target = document.getElementById(viewMap[viewName]);
    if (target) target.style.display = 'block';

    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.nav-tab[data-view="${viewName}"]`)?.classList.add('active');

    // 切换时刷新数据
    if (viewName === 'wrong-book') this.renderWrongBook();
    if (viewName === 'stats') this.updateStats();
    if (viewName === 'ai-tutor') this.updateReviewSelect();
  }

  switchAIFunc(funcName) {
    document.querySelectorAll('.ai-func-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.ai-func-tab').forEach(t => t.classList.remove('active'));

    const panel = document.getElementById('aiFunc' + funcName.charAt(0).toUpperCase() + funcName.slice(1));
    if (panel) panel.style.display = 'block';

    document.querySelector(`.ai-func-tab[data-func="${funcName}"]`)?.classList.add('active');

    if (funcName === 'review') this.updateReviewSelect();
  }

  // ==================== 设置 ====================

  showSettings() { 
    document.getElementById('settingsGrade').value = this.settings.grade;
    document.getElementById('settingsName').value = this.settings.name;
    this.showModal('settingsModal'); 
  }

  saveSettings() {
    this.settings.grade = document.getElementById('settingsGrade').value;
    this.settings.name = document.getElementById('settingsName').value.trim() || '同学';
    this.save('settings', this.settings);
    this.updateGradeDisplay();
    this.updateDifficultyOptions();
    this.updateTopicTags();
    this.closeModal('settingsModal');
  }

  clearAllData() {
    if (!confirm('确定要清除所有学习数据吗？这将删除你的错题本、练习记录等所有数据，无法恢复！')) return;
    this.questions = [];
    this.wrongBook = [];
    this.records = [];
    this.save('questions', []);
    this.save('wrongBook', []);
    this.save('records', []);
    this.closeModal('settingsModal');
    this.updateStats();
    this.renderWrongBook();
    alert('数据已清除');
  }

  // ==================== AI API ====================

  checkApiKey() {
    if (!this.AI_API_KEY) {
      this.changeApiKey();
      return false;
    }
    return true;
  }

  changeApiKey() {
    const status = document.getElementById('apiKeyStatus');
    status.textContent = this.AI_API_KEY ? '✅ 已配置' : '❌ 未配置';
    status.style.color = this.AI_API_KEY ? '#27ae60' : '#e74c3c';
    document.getElementById('apiKeyInput').value = '';
    this.showModal('apiKeyModal');
  }

  saveApiKey() {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (!key) { alert('请输入 API Key'); return; }
    this.AI_API_KEY = key;
    localStorage.setItem('ai_api_key', key);
    document.getElementById('apiKeyStatus').textContent = '✅ 已配置';
    document.getElementById('apiKeyStatus').style.color = '#27ae60';
    document.getElementById('apiKeyInput').value = '';
    alert('API Key 已保存！');
    this.closeModal('apiKeyModal');
  }

  clearApiKey() {
    localStorage.removeItem('ai_api_key');
    this.AI_API_KEY = '';
    document.getElementById('apiKeyStatus').textContent = '❌ 未配置';
    document.getElementById('apiKeyStatus').style.color = '#e74c3c';
    alert('API Key 已清除');
  }

  async callAI(messages, temperature = 0.7, maxTokens = 2000) {
    if (!this.checkApiKey()) throw new Error('未配置 API Key');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    let resp;
    try {
      resp = await fetch(this.AI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.AI_API_KEY}`
        },
        body: JSON.stringify({
          model: this.AI_MODEL,
          messages,
          temperature,
          max_tokens: maxTokens
        }),
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') throw new Error('AI 响应超时（60秒），请重试');
      throw new Error('网络连接失败，请检查网络后重试');
    }
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `API 请求失败 (${resp.status})`);
    }

    const data = await resp.json();
    const content = data.choices[0].message.content;
    // 检查是否因 token 限制被截断
    if (data.choices[0].finish_reason === 'length') {
      this._aiTruncated = true;
    } else {
      this._aiTruncated = false;
    }
    return content;
  }

  // ==================== 做题练习 ====================

  // 根据题型生成不同的AI prompt
  buildQuestionPrompt(subject, count, difficulty, topic, questionType) {
    const topicHint = topic ? `，知识点范围：${topic}` : '';
    const needsDiagram = ['物理', '数学', '化学'].includes(subject);
    const gradeScope = this.getGradeScope(subject);
    const schoolLevel = this.getSchoolLevel();
    const exam = schoolLevel === '初中' ? '中考' : '高考';
    const difficultyDesc = {
      '基础': `${schoolLevel}课内基础题，考察基本概念记忆和简单应用`,
      '提高': `${schoolLevel}课内提高题，需要理解和灵活运用知识点`,
      '考试': `${exam}真题难度，考察综合运用多个知识点的能力`,
      '压轴': `${exam}压轴题难度，考察深度理解和复杂推理，但不能超纲`
    };
    const answerMode = this.getAnswerMode(questionType);
    const types = this.getSubjectQuestionTypes(subject);
    const typeInfo = types.find(t => t.value === questionType) || types[0];
    const typeLabel = typeInfo.label;

    let formatInstructions = '';
    let jsonTemplate = '';

    if (answerMode === 'choice') {
      // 选择题 / 完形填空
      if (questionType === 'cloze') {
        formatInstructions = `题型：完形填空
要求：
1. 给出一篇适合${this.settings.grade}水平的英语短文（100-200词），在其中设置${count}个空
2. 每个空有4个选项A/B/C/D
3. passage字段放完整短文（用 ___1___, ___2___ 等标记空位）
4. 每个question字段写"第X空"
5. answer只填A/B/C/D`;
        jsonTemplate = `[
  {
    "passage": "完整短文内容，用___1___标记空位",
    "question": "第1空",
    "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
    "answer": "A",
    "explanation": "解析：为什么选这个答案",
    "topic": "考查知识点"
  }
]`;
      } else {
        formatInstructions = `题型：${typeLabel}（选择题）
要求：
1. 每道题必须有4个选项，answer只填A/B/C/D
2. explanation要详细清晰
3. topic精确到具体知识点${needsDiagram ? `
4. 如果题目需要配图，在diagramDesc填纯文字描述，不需配图则填空字符串` : ''}`;
        jsonTemplate = `[
  {
    "question": "题目内容",
    "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
    "answer": "A",
    "explanation": "解析说明",
    "topic": "知识点名称"${needsDiagram ? ',\n    "diagramDesc": "配图描述或空字符串"' : ''}
  }
]`;
      }
    } else if (answerMode === 'fillblank') {
      formatInstructions = `题型：${typeLabel}（填空题）
要求：
1. question中用"____"标记需要填写的空位
2. answer填写标准答案（多个空用"；"分隔）
3. explanation要详细解释解题步骤
4. 不要有选项options字段${needsDiagram ? `
5. 如果题目需要配图，在diagramDesc填纯文字描述` : ''}`;
      jsonTemplate = `[
  {
    "question": "题目内容，其中____处需要填写",
    "answer": "标准答案（多空用；分隔）",
    "explanation": "详细解析",
    "topic": "知识点名称"${needsDiagram ? ',\n    "diagramDesc": "配图描述或空字符串"' : ''}
  }
]`;
    } else {
      // subjective: 计算题/大题/实验题/阅读理解/作文/古诗词鉴赏/文言文
      let subjectiveHint = '';
      if (questionType === 'calculate') {
        subjectiveHint = `出${typeLabel}，要求列出完整计算步骤。`;
      } else if (questionType === 'bigq') {
        subjectiveHint = `出综合性${typeLabel}，需要详细的推导和证明过程。`;
      } else if (questionType === 'experiment') {
        subjectiveHint = `出${typeLabel}，包含实验目的、步骤、数据分析或误差讨论等。`;
      } else if (questionType === 'reading') {
        subjectiveHint = subject === '英语'
          ? `出英语阅读理解题，包含一篇适合${this.settings.grade}水平的英语短文（150-250词），然后针对短文提出问题。`
          : `出现代文阅读理解题，包含一段适合${this.settings.grade}水平的文章片段，然后提出阅读理解问题。`;
      } else if (questionType === 'classical') {
        subjectiveHint = `出文言文阅读题，包含一段文言文原文，要求翻译、解释重点字词或回答理解性问题。`;
      } else if (questionType === 'poetry') {
        subjectiveHint = `出古诗词鉴赏题，给出一首古诗词，要求赏析手法、情感或意象等。`;
      } else if (questionType === 'writing') {
        subjectiveHint = subject === '英语'
          ? `出英语书面表达题，给出写作要求和提示，让学生写一篇英语短文。`
          : `出作文题，给出写作主题、要求和字数限制。`;
      }

      formatInstructions = `题型：${typeLabel}
${subjectiveHint}
要求：
1. question字段写题目总述/大题引导语
2. 如有阅读材料/文章/诗词，放在passage字段中
3. 把每道小问/子题放到subQuestions数组中，每个小问包含:
   - q: 小问题目文字。
     • 填空类：在需要学生填写的位置用"____"标记（可以有多个空）
       例如："(1) 渔人甚异之 异：____\\n(2) 阡陌交通 交通：____"
     • 选择类：题目中用"（  ）"标记选项填入的位置
   - type: "blank"(填空，题目中有____标记) 或 "choice"(选择题，需要提供options) 或 "text"(主观作答，如翻译、赏析、简答)
   - answer: 该小问的参考答案（选择题只填字母如"A"）
   - points: 该小问的评分要点
   - options: 仅当type为"choice"时需要，["A. xxx", "B. xxx", "C. xxx", "D. xxx"]
4. 重要：一个小问中如果有多个空位（如解释4个词），就在q中用多个____标记，answer用"；"分隔各空答案
5. 如果题目确实只有1个问题（如作文），subQuestions里只放1个元素即可
6. answer字段写全部参考答案的汇总
7. explanation字段写详细解析${needsDiagram ? `
8. 如果题目需要配图，在diagramDesc填纯文字描述` : ''}`;
      jsonTemplate = `[
  {
    "question": "阅读下面的文言文，完成题目。",
    "passage": "文言文/文章/诗词原文（无材料填空字符串）",
    "subQuestions": [
      {"q": "解释下列加点词：\\n(1) 渔人甚异之 异：____\\n(2) 阡陌交通 交通：____", "type": "blank", "answer": "对……感到惊异；交错相通", "points": "每词1分"},
      {"q": "下列句子中加点词的意义和用法相同的一项是（  ）", "type": "choice", "options": ["A. xxx/xxx", "B. xxx/xxx", "C. xxx/xxx", "D. xxx/xxx"], "answer": "B", "points": "选对得分"},
      {"q": "翻译：率妻子邑人来此绝境。", "type": "text", "answer": "带领妻子儿女和乡邻来到这个与世隔绝的地方。", "points": "关键词采分"}
    ],
    "answer": "全部参考答案汇总",
    "scoringPoints": "总评分要点",
    "explanation": "详细解析",
    "topic": "知识点名称"${needsDiagram ? ',\n    "diagramDesc": "配图描述或空字符串"' : ''}
  }
]`;
    }

    return `请为中国大陆${this.settings.grade}学生出${count}道${subject}${typeLabel}${topicHint}。

❗❗❗ 课程范围约束（最重要）：
${gradeScope}

难度要求：${difficulty} —— ${difficultyDesc[difficulty] || '中等难度'}

${formatInstructions}

题目风格参考中国大陆${exam}真题。
用${this.settings.grade}学生能理解的方式编写。

严格按以下JSON格式返回，不要返回其他内容：
${jsonTemplate}`;
  }

  // 健壮的JSON解析：处理AI返回的各种格式问题
  _parseQuestionJSON(reply) {
    if (!reply) return null;

    // 第一步：提取 JSON 数组
    const jsonMatch = reply.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    let raw = jsonMatch[0];

    // 第一层：直接解析
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch {}

    // 第二层：修复常见格式问题
    try {
      let fixed = raw
        .replace(/\r?\n/g, ' ')              // 换行 -> 空格
        .replace(/,\s*([}\]])/g, '$1')        // 去尾部逗号
        .replace(/'/g, '"')                   // 单引号 -> 双引号（谨慎）
        .replace(/\t/g, ' ');                 // tab -> 空格
      const arr = JSON.parse(fixed);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch {}

    // 第三层：如果被截断（末尾没闭合），尝试手动闭合
    try {
      let truncated = raw.replace(/\r?\n/g, ' ');
      // 数有多少个未闭合的 { 和 [
      let braceCount = 0, bracketCount = 0;
      let inString = false, escape = false;
      for (const ch of truncated) {
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') braceCount++;
        if (ch === '}') braceCount--;
        if (ch === '[') bracketCount++;
        if (ch === ']') bracketCount--;
      }
      // 去掉最后一个不完整的对象（如果在对象内被截断）
      if (braceCount > 0) {
        // 找到最后一个完整的 } 后面的逗号，截断
        const lastBrace = truncated.lastIndexOf('}');
        if (lastBrace > 0) {
          truncated = truncated.substring(0, lastBrace + 1);
          // 重新计算括号
          braceCount = 0; bracketCount = 0; inString = false; escape = false;
          for (const ch of truncated) {
            if (escape) { escape = false; continue; }
            if (ch === '\\') { escape = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === '{') braceCount++;
            if (ch === '}') braceCount--;
            if (ch === '[') bracketCount++;
            if (ch === ']') bracketCount--;
          }
        }
      }
      // 补上缺失的闭合符号
      for (let i = 0; i < braceCount; i++) truncated += '}';
      for (let i = 0; i < bracketCount; i++) truncated += ']';
      // 去尾逗号
      truncated = truncated.replace(/,\s*([}\]])/g, '$1');
      const arr = JSON.parse(truncated);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch {}

    // 第四层：正则逐题提取（支持嵌套 subQuestions）
    try {
      const items = [];
      let depth = 0, start = -1;
      let inStr = false, esc = false;
      for (let i = 0; i < reply.length; i++) {
        const ch = reply[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') { if (depth === 0) start = i; depth++; }
        if (ch === '}') {
          depth--;
          if (depth === 0 && start >= 0) {
            const obj = reply.substring(start, i + 1);
            try {
              const parsed = JSON.parse(obj);
              if (parsed.question) items.push(parsed);
            } catch {}
            start = -1;
          }
        }
      }
      if (items.length > 0) return items;
    } catch {}

    return null;
  }

  async startPractice() {
    if (!this.checkApiKey()) return;

    const subject = document.getElementById('practiceSubject').value;
    const difficulty = document.getElementById('practiceDifficulty').value;
    const count = parseInt(document.getElementById('practiceCount').value) || 5;
    const topic = this.getSelectedTopicString();
    const questionType = this.selectedQuestionType || 'choice';

    const btn = document.getElementById('startPracticeBtn');
    btn.disabled = true;
    btn.textContent = '🤔 AI 正在出题...';
    const stages = ['🤔 AI 正在构思...', '✍️ 正在组织题目...', '🧠 正在打磨题目...', '📝 即将完成...'];
    let stageIdx = 0;
    const stageTimer = setInterval(() => {
      stageIdx = Math.min(stageIdx + 1, stages.length - 1);
      btn.textContent = stages[stageIdx];
    }, 3000);

    try {
      const prompt = this.buildQuestionPrompt(subject, count, difficulty, topic, questionType);

      // 根据题型决定合适的 token 上限
      const subjectiveTypes = ['writing', 'reading', 'classical', 'poetry', 'experiment', 'bigq', 'calculate'];
      const isSubjective = subjectiveTypes.includes(questionType);
      const tokenLimit = isSubjective ? 4096 : 2000;

      const reply = await this.callAI([
        { role: 'system', content: `你是一个专业的中国大陆${this.settings.grade}教师，精通人教版教材，擅长按照课程标准出题。严格按照课程范围出题，绝对不能超纲。只返回JSON数组，不要返回任何其他文字。` },
        { role: 'user', content: prompt }
      ], 0.5, tokenLimit);

      // 解析题目
      let questions = this._parseQuestionJSON(reply);
      if (!questions || questions.length === 0) {
        // 如果被截断，尝试减少题目数重试一次
        if (this._aiTruncated && count > 1) {
          const retryCount = Math.max(1, Math.floor(count / 2));
          const retryPrompt = this.buildQuestionPrompt(subject, retryCount, difficulty, topic, questionType);
          const retryReply = await this.callAI([
            { role: 'system', content: `你是一个专业的中国大陆${this.settings.grade}教师。只返回JSON数组，确保JSON完整闭合。` },
            { role: 'user', content: retryPrompt }
          ], 0.5, tokenLimit);
          questions = this._parseQuestionJSON(retryReply);
        }
        if (!questions || questions.length === 0) throw new Error('AI返回格式有误，请重试');
      }

      this.currentQuiz = {
        questions,
        currentIndex: 0,
        answers: [],
        subject,
        difficulty,
        questionType,
        mode: 'practice'
      };

      document.getElementById('practiceSetup').style.display = 'none';
      document.getElementById('practiceArea').style.display = 'block';
      document.getElementById('practiceResult').style.display = 'none';
      this.combo = 0;
      this.playSound('start');
      this.showQuestion();

      // 并行生成所有配图（不阻塞做题）
      this.batchGenerateDiagrams(questions);

    } catch (err) {
      alert('出题失败：' + err.message);
    }

    clearInterval(stageTimer);
    btn.disabled = false;
    btn.textContent = '🚀 开始出题';
  }

  showQuestion(containerId = 'questionCard', feedbackId = 'answerFeedback', nextBtnId = 'nextQuestionBtn', finishBtnId = 'finishPracticeBtn', progressTextId = 'practiceProgressText', progressBarId = 'practiceProgressBar') {
    const quiz = this.currentQuiz;
    const q = quiz.questions[quiz.currentIndex];
    const total = quiz.questions.length;
    const num = quiz.currentIndex + 1;
    let answerMode = this.getAnswerMode(quiz.questionType || 'choice');

    // 诊断模式：根据每道题的实际结构判断答题模式
    if (quiz.mode === 'diagnostic' || quiz.mode === 'diagnostic-practice') {
      if (q.options && q.options.length > 0) answerMode = 'choice';
      else if (q.subQuestions && q.subQuestions.length > 0) answerMode = 'subjective';
      else answerMode = 'fillblank';
    }

    // 进度
    const progText = document.getElementById(progressTextId);
    if (progText) progText.textContent = `第 ${num} / ${total} 题`;
    const progBar = document.getElementById(progressBarId);
    if (progBar) progBar.style.width = `${(num / total) * 100}%`;

    // 配图
    const card = document.getElementById(containerId);
    const hasDiagramDesc = q.diagramDesc && q.diagramDesc.trim();
    const diagramPlaceholder = hasDiagramDesc ? `<div class="question-diagram" id="diagram-${quiz.currentIndex}"><p class="diagram-loading">🎨 配图生成中...</p></div>` : '';
    const cachedDiagram = q._diagramSvg ? `<div class="question-diagram">${q._diagramSvg}</div>` : diagramPlaceholder;

    // 阅读材料/文章
    const passageHtml = q.passage && q.passage.trim()
      ? `<div class="passage-area"><div class="passage-title">📄 阅读材料</div>${this.formatAIResponse(q.passage)}</div>`
      : '';

    // 题目文本（去除选择题重复选项）
    let questionText = q.question;
    if (answerMode === 'choice' && q.options) {
      questionText = questionText.replace(/\n\s*[A-D][.．、][\s\S]*$/m, (match) => {
        const optCount = (match.match(/[A-D][.．、]/g) || []).length;
        return optCount >= 2 ? '' : match;
      }).trim();
    }

    // 题型标签
    const types = this.getSubjectQuestionTypes(quiz.subject || '数学');
    const typeInfo = types.find(t => t.value === (quiz.questionType || 'choice'));
    const typeLabel = typeInfo ? `${typeInfo.icon} ${typeInfo.label}` : '';

    let answerAreaHtml = '';

    if (answerMode === 'choice') {
      // 选择题
      answerAreaHtml = `
        <div class="options-list">
          ${(q.options || []).map((opt, i) => `
            <button class="option-btn" data-index="${i}" onclick="app.selectAnswer(${i}, '${containerId}', '${feedbackId}', '${nextBtnId}', '${finishBtnId}')">
              ${this.formatAIResponse(opt)}
            </button>
          `).join('')}
        </div>`;
    } else if (answerMode === 'fillblank') {
      // 填空题
      answerAreaHtml = `
        <div class="subjective-answer-area">
          <label>✏️ 请填写答案（多个空用"；"分隔）</label>
          <input type="text" id="fillblankInput-${quiz.currentIndex}" placeholder="在此输入答案...">
          <button class="btn-submit-answer" onclick="app.submitFillblank('${containerId}', '${feedbackId}', '${nextBtnId}', '${finishBtnId}')">✅ 提交答案</button>
        </div>`;
    } else {
      // 主观题 — 每个小问单独渲染，支持内联填空/选择/文本
      const subQs = q.subQuestions || [];
      if (subQs.length > 0) {
        answerAreaHtml = `<div class="sub-questions-area">` +
          subQs.map((sq, si) => {
            if (sq.type === 'choice') {
              // 选择题小问：显示题目 + ABCD按钮，点击后答案填入括号
              const qText = this.formatAIResponse(sq.q);
              const optionsHtml = (sq.options || []).map((opt, oi) => {
                const letter = String.fromCharCode(65 + oi);
                return `<button class="sub-q-option-btn" data-letter="${this.escapeHtml(letter)}" data-si="${si}" onclick="app.selectSubQOption(this, ${quiz.currentIndex}, ${si})">
                  ${this.formatAIResponse(opt)}
                </button>`;
              }).join('');
              return `<div class="sub-question-item sub-q-choice-item" data-si="${si}">
                <div class="sub-q-label" id="subQLabel-${quiz.currentIndex}-${si}">${qText}</div>
                <div class="sub-q-options">${optionsHtml}</div>
                <input type="hidden" id="subQ-${quiz.currentIndex}-${si}" value="">
              </div>`;
            } else if (sq.type === 'blank') {
              // 填空题小问：先格式化文字，再把 ____ 替换为内联 input
              let blankIndex = 0;
              const formatted = this.formatAIResponse(sq.q);
              const processed = formatted.replace(/_{2,}/g, () => {
                const id = `subQBlank-${quiz.currentIndex}-${si}-${blankIndex}`;
                blankIndex++;
                return `<input type="text" class="inline-blank-input" id="${id}" placeholder="填写">`;
              });
              // 保存每个小问有多少个空
              return `<div class="sub-question-item sub-q-blank-item" data-si="${si}" data-blank-count="${blankIndex}">
                <div class="sub-q-label sub-q-inline-blanks">${processed}</div>
              </div>`;
            } else {
              // text类型：主观作答 textarea
              return `<div class="sub-question-item">
                <div class="sub-q-label">${this.formatAIResponse(sq.q)}</div>
                <textarea class="sub-q-textarea" id="subQ-${quiz.currentIndex}-${si}" placeholder="在此写出你的答案..." rows="3"></textarea>
              </div>`;
            }
          }).join('') +
          `<button class="btn-submit-answer" id="submitSubjectiveBtn" onclick="app.submitSubjective('${containerId}', '${feedbackId}', '${nextBtnId}', '${finishBtnId}')">📤 提交并批改</button>
          </div>`;
      } else {
        // 兜底：无小问结构，用旧的 textarea
        const placeholder = quiz.questionType === 'writing'
          ? '在此写你的作文/短文...'
          : '在此写你的答案、解题步骤...';
        answerAreaHtml = `
          <div class="subjective-answer-area">
            <label>📝 请写出你的答案</label>
            <textarea id="subjectiveInput-${quiz.currentIndex}" placeholder="${placeholder}" rows="6"></textarea>
            <button class="btn-submit-answer" id="submitSubjectiveBtn" onclick="app.submitSubjective('${containerId}', '${feedbackId}', '${nextBtnId}', '${finishBtnId}')">📤 提交并批改</button>
          </div>`;
      }
    }

    card.innerHTML = `
      <div class="question-number">第 ${num} 题 <span class="question-topic">${typeLabel} · ${this.escapeHtml(q.topic || '')}</span></div>
      ${passageHtml}
      <div class="question-text">${this.formatAIResponse(questionText)}</div>
      ${cachedDiagram}
      ${answerAreaHtml}
    `;

    // 异步生成配图
    if (hasDiagramDesc && !q._diagramSvg) {
      this.generateDiagramForQuestion(quiz.currentIndex, q, containerId);
    }

    // 隐藏反馈和按钮
    document.getElementById(feedbackId).style.display = 'none';
    document.getElementById(nextBtnId).style.display = 'none';
    document.getElementById(finishBtnId).style.display = 'none';
  }

  // 填空题提交
  submitFillblank(containerId, feedbackId, nextBtnId, finishBtnId) {
    const quiz = this.currentQuiz;
    const q = quiz.questions[quiz.currentIndex];
    const input = document.getElementById(`fillblankInput-${quiz.currentIndex}`);
    const userAnswer = (input?.value || '').trim();
    if (!userAnswer) { alert('请填写答案'); return; }

    input.disabled = true;
    const submitBtn = input.parentElement.querySelector('.btn-submit-answer');
    if (submitBtn) submitBtn.disabled = true;

    // 简单比较答案（去空格、全角半角统一）
    const normalize = (s) => s.replace(/\s+/g, '').replace(/；/g, ';').replace(/，/g, ',').toLowerCase();
    const isCorrect = normalize(userAnswer) === normalize(q.answer);

    // 记录答案
    quiz.answers.push({
      questionIndex: quiz.currentIndex,
      selected: userAnswer,
      correct: q.answer,
      isCorrect
    });

    // 显示反馈
    const feedback = document.getElementById(feedbackId);
    feedback.style.display = 'block';
    feedback.className = `answer-feedback ${isCorrect ? 'feedback-correct' : 'feedback-wrong'}`;

    if (isCorrect) {
      this.combo++;
      this.combo >= 3 ? this.playSound('combo') : this.playSound('correct');
      const diffBonus = { '基础': 0, '提高': 5, '考试': 10, '压轴': 15 };
      const xpGain = 10 + (diffBonus[quiz.difficulty] || 0) + (this.combo * 2);
      this.addXP(xpGain, feedback);
      this.spawnCelebration(30);
    } else {
      this.combo = 0;
      this.playSound('wrong');
      this.addXP(2, feedback);
      this.screenShake();
    }

    const comboHtml = this.combo >= 2 ? `<div class="combo-badge">🔥 ${this.combo} 连击！</div>` : '';
    feedback.innerHTML = `
      ${comboHtml}
      <div class="feedback-header">${isCorrect ? '✅ 回答正确！' : '❌ 回答错误'}</div>
      <div class="feedback-answer">你的答案：${this.escapeHtml(userAnswer)}</div>
      <div class="feedback-answer">正确答案：${this.escapeHtml(q.answer)}</div>
      <div class="feedback-explanation">${this.formatAIResponse(q.explanation || '')}</div>
    `;

    if (!isCorrect) {
      this.addToWrongBook(q, userAnswer, quiz.subject);
    }

    const isLast = quiz.currentIndex >= quiz.questions.length - 1;
    document.getElementById(nextBtnId).style.display = isLast ? 'none' : 'inline-block';
    document.getElementById(finishBtnId).style.display = isLast ? 'inline-block' : 'none';
  }

  // 主观题提交 (AI批改)
  async submitSubjective(containerId, feedbackId, nextBtnId, finishBtnId) {
    const quiz = this.currentQuiz;
    const q = quiz.questions[quiz.currentIndex];
    const subQs = q.subQuestions || [];
    const hasSubQs = subQs.length > 0;

    // 收集答案
    let userAnswer = '';
    let subAnswers = [];
    if (hasSubQs) {
      for (let i = 0; i < subQs.length; i++) {
        const sq = subQs[i];
        let val = '';
        if (sq.type === 'blank') {
          // 收集内联填空的所有 input
          const item = document.querySelector(`.sub-q-blank-item[data-si="${i}"]`);
          const blankCount = parseInt(item?.dataset.blankCount || '0');
          const blanks = [];
          for (let b = 0; b < blankCount; b++) {
            const inp = document.getElementById(`subQBlank-${quiz.currentIndex}-${i}-${b}`);
            blanks.push((inp?.value || '').trim());
            if (inp) inp.disabled = true;
          }
          val = blanks.join('；');
        } else if (sq.type === 'choice') {
          const hiddenInput = document.getElementById(`subQ-${quiz.currentIndex}-${i}`);
          val = (hiddenInput?.value || '').trim();
          // 禁用所有选项按钮
          const container = document.querySelector(`.sub-q-choice-item[data-si="${i}"]`);
          container?.querySelectorAll('.sub-q-option-btn').forEach(b => b.disabled = true);
        } else {
          const el = document.getElementById(`subQ-${quiz.currentIndex}-${i}`);
          val = (el?.value || '').trim();
          if (el) el.disabled = true;
        }
        subAnswers.push(val);
      }
      if (subAnswers.every(a => !a)) { alert('请至少回答一个小问'); return; }
      userAnswer = subAnswers.map((a, i) => `(${i + 1}) ${a}`).join('\n');
    } else {
      const textarea = document.getElementById(`subjectiveInput-${quiz.currentIndex}`);
      userAnswer = (textarea?.value || '').trim();
      if (!userAnswer) { alert('请写出你的答案'); return; }
      textarea.disabled = true;
    }

    const submitBtn = document.getElementById('submitSubjectiveBtn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '🤔 AI 批改中...'; }

    const feedback = document.getElementById(feedbackId);
    feedback.style.display = 'block';
    feedback.className = 'answer-feedback';
    feedback.innerHTML = '<div class="feedback-header">🤔 AI 正在逐题批改你的答案...</div>';

    try {
      // 构建逐小问批改的 prompt
      let studentAnswerSection = '';
      let subQSection = '';
      if (hasSubQs) {
        subQSection = subQs.map((sq, i) =>
          `小问${i + 1}：${sq.q}\n参考答案：${sq.answer}\n评分要点：${sq.points || ''}`
        ).join('\n\n');
        studentAnswerSection = subAnswers.map((a, i) =>
          `小问${i + 1}的学生答案：${a || '（未作答）'}`
        ).join('\n');
      } else {
        subQSection = `题目：${q.question}\n参考答案：${q.answer}`;
        studentAnswerSection = `学生答案：${userAnswer}`;
      }

      const gradingPrompt = `请批改以下学生的答案。

题目：${q.question}
${q.passage ? `阅读材料：${q.passage}` : ''}

${subQSection}

${q.scoringPoints ? `总评分要点：${q.scoringPoints}` : ''}

${studentAnswerSection}

请按以下JSON格式返回批改结果，不要返回其他内容：
{
  "totalScore": 0到100的总分,
  "level": "correct"或"partial"或"wrong",
  "subResults": [
    {
      "index": 1,
      "score": 0到100,
      "status": "correct"或"partial"或"wrong",
      "comment": "该小问的批改意见"
    }
  ],
  "overallFeedback": "总体评价",
  "weakPoints": "薄弱知识点分析（分析学生哪些知识点掌握不好）",
  "recommendation": "针对薄弱项的专项练习建议（推荐具体的练习方向和知识点）"
}
${hasSubQs ? `subResults数组必须有${subQs.length}个元素，对应每个小问。` : 'subResults数组放1个元素即可。'}`;

      const gradingReply = await this.callAI([
        { role: 'system', content: `你是${this.settings.grade}${quiz.subject}教师，正在逐题批改学生的答案。严格但鼓励，指出具体问题。只返回JSON。` },
        { role: 'user', content: gradingPrompt }
      ], 0.3, 2000);

      let grading;
      try {
        const jsonMatch = gradingReply.match(/\{[\s\S]*\}/);
        grading = JSON.parse(jsonMatch[0]);
      } catch {
        grading = { totalScore: 50, level: 'partial', subResults: [], overallFeedback: gradingReply, weakPoints: '', recommendation: '' };
      }

      const score = grading.totalScore || 0;
      const isCorrect = score >= 80;
      const isPartial = score >= 40 && score < 80;

      quiz.answers.push({
        questionIndex: quiz.currentIndex,
        selected: userAnswer,
        correct: q.answer,
        isCorrect,
        score,
        subResults: grading.subResults || [],
        weakPoints: grading.weakPoints || '',
        recommendation: grading.recommendation || ''
      });

      if (isCorrect) {
        this.combo++;
        this.combo >= 3 ? this.playSound('combo') : this.playSound('correct');
        const xpGain = Math.round(score / 10) + (this.combo * 2);
        this.addXP(xpGain, feedback);
        this.spawnCelebration(30);
      } else {
        this.combo = 0;
        this.playSound(isPartial ? 'click' : 'wrong');
        this.addXP(Math.max(2, Math.round(score / 20)), feedback);
        if (!isPartial) this.screenShake();
      }

      // 渲染逐小问批改结果
      const subResultsHtml = (grading.subResults || []).map((sr, i) => {
        const sq = hasSubQs ? subQs[i] : null;
        const studentAns = hasSubQs ? (subAnswers[i] || '未作答') : userAnswer;
        const refAns = sq ? sq.answer : q.answer;
        const statusIcon = sr.status === 'correct' ? '✅' : sr.status === 'partial' ? '⚠️' : '❌';
        const statusClass = sr.status === 'correct' ? 'sub-result-correct' : sr.status === 'partial' ? 'sub-result-partial' : 'sub-result-wrong';
        return `<div class="sub-result-item ${statusClass}">
          <div class="sub-result-header">${statusIcon} 小问${sr.index || (i + 1)} <span class="sub-result-score">${sr.score || 0}分</span></div>
          <div class="sub-result-student">你的答案：${this.escapeHtml(studentAns)}</div>
          <div class="sub-result-ref">参考答案：${this.formatAIResponse(refAns)}</div>
          <div class="sub-result-comment">${this.formatAIResponse(sr.comment || '')}</div>
        </div>`;
      }).join('');

      const comboHtml = this.combo >= 2 ? `<div class="combo-badge">🔥 ${this.combo} 连击！</div>` : '';
      const gradingClass = isCorrect ? '' : isPartial ? 'grading-partial' : 'grading-wrong';

      feedback.className = `answer-feedback ${isCorrect ? 'feedback-correct' : 'feedback-wrong'}`;
      feedback.innerHTML = `
        ${comboHtml}
        <div class="ai-grading-result ${gradingClass}">
          <div class="grading-header">${isCorrect ? '✅ 优秀！' : isPartial ? '⚠️ 部分正确' : '❌ 需要改进'} 总分：${score}/100</div>
          ${subResultsHtml ? `<div class="sub-results-list">${subResultsHtml}</div>` : ''}
          <div class="feedback-explanation" style="margin-top:10px"><strong>📝 总体评价：</strong>${this.formatAIResponse(grading.overallFeedback || '')}</div>
          ${grading.weakPoints ? `<div class="weak-points-box"><strong>🎯 薄弱点分析：</strong>${this.formatAIResponse(grading.weakPoints)}</div>` : ''}
          ${grading.recommendation ? `<div class="recommendation-box"><strong>📋 专项练习建议：</strong>${this.formatAIResponse(grading.recommendation)}</div>` : ''}
        </div>
        ${q.explanation ? `<div class="feedback-explanation" style="margin-top:12px"><strong>📖 解析：</strong>${this.formatAIResponse(q.explanation)}</div>` : ''}
      `;

      // 标记每个小问的对错状态到 UI 上
      if (hasSubQs && grading.subResults) {
        grading.subResults.forEach((sr, i) => {
          const sq = subQs[i];
          const statusCls = sr.status === 'correct' ? 'input-correct' : sr.status === 'partial' ? 'input-partial' : 'input-wrong';
          if (sq?.type === 'blank') {
            // 内联填空：标记每个 blank input
            const item = document.querySelector(`.sub-q-blank-item[data-si="${i}"]`);
            item?.querySelectorAll('.inline-blank-input').forEach(inp => inp.classList.add(statusCls));
            item?.classList.add(statusCls.replace('input-', 'item-'));
          } else if (sq?.type === 'choice') {
            // 选择题：标记整个题目容器
            const item = document.querySelector(`.sub-q-choice-item[data-si="${i}"]`);
            item?.classList.add(statusCls.replace('input-', 'item-'));
          } else {
            const el = document.getElementById(`subQ-${quiz.currentIndex}-${i}`);
            if (el) el.classList.add(statusCls);
          }
        });
      }

      if (!isCorrect) {
        this.addToWrongBook(q, userAnswer, quiz.subject);
      }
    } catch (err) {
      quiz.answers.push({
        questionIndex: quiz.currentIndex,
        selected: userAnswer,
        correct: q.answer,
        isCorrect: false,
        score: 0
      });

      feedback.className = 'answer-feedback feedback-wrong';
      feedback.innerHTML = `
        <div class="feedback-header">⚠️ AI批改失败：${this.escapeHtml(err.message)}</div>
        <div class="feedback-answer"><strong>📋 参考答案：</strong></div>
        <div class="feedback-explanation">${this.formatAIResponse(q.answer || '')}</div>
        ${q.explanation ? `<div class="feedback-explanation"><strong>📖 解析：</strong>${this.formatAIResponse(q.explanation)}</div>` : ''}
      `;
    }

    const isLast = quiz.currentIndex >= quiz.questions.length - 1;
    document.getElementById(nextBtnId).style.display = isLast ? 'none' : 'inline-block';
    document.getElementById(finishBtnId).style.display = isLast ? 'inline-block' : 'none';
  }

  // 小问选择题点击选项
  selectSubQOption(btnEl, qIdx, si) {
    const letter = btnEl.dataset.letter;
    const container = btnEl.closest('.sub-q-choice-item');
    // 取消同小问其他按钮的选中状态
    container.querySelectorAll('.sub-q-option-btn').forEach(b => b.classList.remove('selected'));
    btnEl.classList.add('selected');
    // 把选项写入hidden input
    const hiddenInput = document.getElementById(`subQ-${qIdx}-${si}`);
    if (hiddenInput) hiddenInput.value = letter;
    // 把字母填入题目中的括号
    const label = document.getElementById(`subQLabel-${qIdx}-${si}`);
    if (label) {
      label.innerHTML = label.innerHTML.replace(/（\s*[A-D]?\s*）/g, `（ ${this.escapeHtml(letter)} ）`);
    }
  }

  selectAnswer(optIndex, containerId, feedbackId, nextBtnId, finishBtnId) {
    const quiz = this.currentQuiz;
    const q = quiz.questions[quiz.currentIndex];
    const answerLetter = ['A', 'B', 'C', 'D'][optIndex];
    const isCorrect = answerLetter === q.answer;

    // 记录答案
    quiz.answers.push({
      questionIndex: quiz.currentIndex,
      selected: answerLetter,
      correct: q.answer,
      isCorrect
    });

    // 高亮选项
    const options = document.getElementById(containerId).querySelectorAll('.option-btn');
    options.forEach((btn, i) => {
      btn.disabled = true;
      const letter = ['A', 'B', 'C', 'D'][i];
      if (letter === q.answer) btn.classList.add('option-correct');
      if (i === optIndex && !isCorrect) btn.classList.add('option-wrong');
    });

    // 反馈
    const feedback = document.getElementById(feedbackId);
    feedback.style.display = 'block';
    feedback.className = `answer-feedback ${isCorrect ? 'feedback-correct' : 'feedback-wrong'}`;

    // 音效 & 连击
    if (isCorrect) {
      this.combo++;
      if (this.combo >= 3) {
        this.playSound('combo');
      } else {
        this.playSound('correct');
      }
      // XP gain
      const diffBonus = { '基础': 0, '提高': 5, '考试': 10, '压轴': 15 };
      const xpGain = 10 + (diffBonus[quiz.difficulty] || 0) + (this.combo * 2);
      this.addXP(xpGain, feedback);
      // Celebration particles
      this.spawnCelebration(30);
      // Achievements
      if (!this.achievements.firstCorrect) {
        this.achievements.firstCorrect = true;
        localStorage.setItem('achievements', JSON.stringify(this.achievements));
        this.showAchievement('首次命中！继续加油！', '🎯');
      }
      if (this.combo === 3 && !this.achievements.firstCombo) {
        this.achievements.firstCombo = true;
        localStorage.setItem('achievements', JSON.stringify(this.achievements));
        this.showAchievement('首次三连击！势不可挡！', '🔥');
      }
      if (this.combo === 5) this.showAchievement('五连击！无人能挡！', '⚡');
      if (this.combo === 10) this.showAchievement('十连击！！！神级操作！', '💎');
    } else {
      this.combo = 0;
      this.playSound('wrong');
      this.addXP(2, feedback);
      this.screenShake();
    }
    // Adjust BGM intensity
    this.adjustMusicIntensity(this.combo);

    const comboHtml = this.combo >= 2 ? `<div class="combo-badge">🔥 ${this.combo} 连击！</div>` : '';
    feedback.innerHTML = `
      ${comboHtml}
      <div class="feedback-header">${isCorrect ? '✅ 回答正确！' : '❌ 回答错误'}</div>
      <div class="feedback-answer">正确答案：${this.escapeHtml(q.answer)}</div>
      <div class="feedback-explanation">${this.formatAIResponse(q.explanation || '')}</div>
    `;

    // 收录错题
    if (!isCorrect) {
      this.addToWrongBook(q, answerLetter, quiz.subject);
    }

    // 显示下一步按钮
    const isLast = quiz.currentIndex >= quiz.questions.length - 1;
    document.getElementById(nextBtnId).style.display = isLast ? 'none' : 'inline-block';
    document.getElementById(finishBtnId).style.display = isLast ? 'inline-block' : 'none';

    // 配图已在 batchGenerateDiagrams 中并行生成，无需单独预加载
  }

  nextQuestion() {
    this.currentQuiz.currentIndex++;
    this.showQuestion();
  }

  showPracticeResult() {
    const quiz = this.currentQuiz;
    const answerMode = this.getAnswerMode(quiz.questionType || 'choice');
    const hasScores = answerMode === 'subjective';
    const correct = quiz.answers.filter(a => a.isCorrect).length;
    const total = quiz.answers.length;
    const rate = total > 0 ? Math.round((correct / total) * 100) : 0;

    // 主观题平均分
    let avgScore = 0;
    if (hasScores) {
      const totalScore = quiz.answers.reduce((s, a) => s + (a.score || 0), 0);
      avgScore = total > 0 ? Math.round(totalScore / total) : 0;
    }

    // 播放结果音效 & XP
    const displayRate = hasScores ? avgScore : rate;
    if (displayRate === 100) {
      this.playSound('perfect');
      this.addXP(50);
      this.spawnCelebration(80);
      if (!this.achievements.firstPerfect) {
        this.achievements.firstPerfect = true;
        localStorage.setItem('achievements', JSON.stringify(this.achievements));
        this.showAchievement('首次全对！完美表现！', '👑');
      }
    } else if (displayRate >= 80) {
      this.playSound('levelup');
      this.addXP(20);
    } else {
      this.playSound('wrong');
      this.addXP(10);
    }

    // 记录学习记录
    this.records.push({
      date: new Date().toISOString().split('T')[0],
      subject: quiz.subject,
      total,
      correct,
      difficulty: quiz.difficulty,
      questionType: quiz.questionType,
      timestamp: Date.now()
    });
    this.save('records', this.records);

    document.getElementById('practiceArea').style.display = 'none';
    const resultDiv = document.getElementById('practiceResult');
    resultDiv.style.display = 'block';

    // 题型信息
    const types = this.getSubjectQuestionTypes(quiz.subject || '数学');
    const typeInfo = types.find(t => t.value === (quiz.questionType || 'choice'));
    const typeLabel = typeInfo ? `${typeInfo.icon} ${typeInfo.label}` : '';

    let wrongSummary = '';
    quiz.answers.forEach((a, i) => {
      if (!a.isCorrect) {
        const q = quiz.questions[a.questionIndex];
        const userDisplay = (a.selected || '').length > 50 ? (a.selected.substring(0, 50) + '...') : (a.selected || '');
        const correctDisplay = (a.correct || '').length > 50 ? (a.correct.substring(0, 50) + '...') : (a.correct || '');
        wrongSummary += `
          <div class="result-wrong-item">
            <div class="result-wrong-q">${i + 1}. ${this.formatAIResponse(q.question.substring(0, 120))}${q.question.length > 120 ? '...' : ''}</div>
            <div class="result-wrong-detail">你的答案：${this.escapeHtml(userDisplay)} | 正确答案：${this.escapeHtml(correctDisplay)}${a.score !== undefined ? ` | 得分：${a.score}` : ''}</div>
          </div>`;
      }
    });

    const scoreDisplay = hasScores
      ? `<span class="score-number">${avgScore}</span><span class="score-label">平均分</span>`
      : `<span class="score-number">${rate}%</span><span class="score-label">正确率</span>`;

    const detailsDisplay = hasScores
      ? `<span>📝 共 ${total} 题</span><span>📊 平均分 ${avgScore}/100</span><span>✅ 优秀(≥80分) ${quiz.answers.filter(a => (a.score || 0) >= 80).length} 题</span>`
      : `<span>📝 共 ${total} 题</span><span>✅ 正确 ${correct} 题</span><span>❌ 错误 ${total - correct} 题</span>`;

    // 汇总薄弱点分析
    let weakPointsHtml = '';
    if (hasScores) {
      const allWeakPoints = quiz.answers.filter(a => a.weakPoints).map(a => a.weakPoints);
      const allRecommendations = quiz.answers.filter(a => a.recommendation).map(a => a.recommendation);
      if (allWeakPoints.length > 0 || allRecommendations.length > 0) {
        weakPointsHtml = `<div class="result-analysis-box">
          <h4>🎯 薄弱点综合分析</h4>
          ${allWeakPoints.map(w => `<div class="analysis-item">${this.formatAIResponse(w)}</div>`).join('')}
          ${allRecommendations.length > 0 ? `<h4 style="margin-top:12px">📋 专项练习建议</h4>
          ${allRecommendations.map(r => `<div class="analysis-item">${this.formatAIResponse(r)}</div>`).join('')}` : ''}
        </div>`;
      }
    }

    resultDiv.innerHTML = `
      <div class="practice-result-card">
        <h3>📊 练习结果 <span style="font-size:0.8em;color:#666">${typeLabel}</span></h3>
        <div class="result-score">
          <div class="score-circle ${displayRate >= 80 ? 'score-good' : displayRate >= 60 ? 'score-ok' : 'score-bad'}">
            ${scoreDisplay}
          </div>
        </div>
        <div class="result-details">
          ${detailsDisplay}
        </div>
        ${wrongSummary ? `<div class="result-wrong-list"><h4>错题回顾</h4>${wrongSummary}</div>` : '<p style="color:#27ae60;text-align:center;margin-top:20px">🎉 全部正确！太棒了！</p>'}
        ${weakPointsHtml}
        <button class="btn-ai" onclick="app.resetPractice()" style="margin-top:20px;width:100%">🔄 再来一组</button>
      </div>
    `;
  }

  resetPractice() {
    this.currentQuiz = null;
    document.getElementById('practiceSetup').style.display = 'block';
    document.getElementById('practiceArea').style.display = 'none';
    document.getElementById('practiceResult').style.display = 'none';
  }

  // ==================== 错题本 ====================

  addToWrongBook(question, userAnswer, subject) {
    // 检查是否已存在相同题目
    const exists = this.wrongBook.find(w => w.question === question.question);
    if (exists) {
      exists.attempts++;
      exists.lastWrong = Date.now();
    } else {
      this.wrongBook.push({
        id: Date.now(),
        subject,
        topic: question.topic || '未分类',
        question: question.question,
        passage: question.passage || '',
        options: question.options,
        answer: question.answer,
        subQuestions: question.subQuestions || null,
        explanation: question.explanation || '',
        userAnswer,
        questionType: this.currentQuiz?.questionType || 'choice',
        attempts: 1,
        mastered: false,
        addedAt: Date.now(),
        lastWrong: Date.now()
      });
    }
    this.save('wrongBook', this.wrongBook);
  }

  renderWrongBook() {
    const subjectFilter = document.getElementById('wrongBookSubject')?.value || 'all';
    const statusFilter = document.getElementById('wrongBookStatus')?.value || 'all';

    let filtered = this.wrongBook;
    if (subjectFilter !== 'all') filtered = filtered.filter(w => w.subject === subjectFilter);
    if (statusFilter === 'mastered') filtered = filtered.filter(w => w.mastered);
    if (statusFilter === 'unmastered') filtered = filtered.filter(w => !w.mastered);

    // 统计
    const total = this.wrongBook.length;
    const mastered = this.wrongBook.filter(w => w.mastered).length;
    document.getElementById('wrongTotal').textContent = total;
    document.getElementById('wrongUnmastered').textContent = total - mastered;
    document.getElementById('wrongMastered').textContent = mastered;
    document.getElementById('wrongMasteryRate').textContent = total > 0 ? Math.round((mastered / total) * 100) + '%' : '0%';

    const list = document.getElementById('wrongBookList');
    if (filtered.length === 0) {
      list.innerHTML = '<p class="empty-hint">暂无错题</p>';
      return;
    }

    list.innerHTML = filtered.map(w => `
      <div class="wrong-item ${w.mastered ? 'wrong-mastered' : ''}">
        <div class="wrong-item-header">
          <span class="wrong-subject">${this.escapeHtml(w.subject)}</span>
          <span class="wrong-topic">${this.escapeHtml(w.topic)}</span>
          <span class="wrong-attempts">错 ${w.attempts} 次</span>
          ${w.mastered ? '<span class="wrong-badge mastered">✅ 已掌握</span>' : '<span class="wrong-badge unmastered">❌ 未掌握</span>'}
        </div>
        <div class="wrong-item-question">${this.formatAIResponse(w.question)}</div>
        <div class="wrong-item-answer">
          <span class="wrong-your">你的答案：${this.escapeHtml(w.userAnswer)}</span>
          <span class="wrong-correct">正确答案：${this.escapeHtml(w.answer)}</span>
        </div>
        <div class="wrong-item-actions">
          <button class="btn-small" onclick="app.retryWrong(${w.id})">🔄 重做</button>
          <button class="btn-small" onclick="app.toggleMastered(${w.id})">${w.mastered ? '↩️ 取消掌握' : '✅ 标记掌握'}</button>
          <button class="btn-small btn-danger" onclick="app.deleteWrong(${w.id})">🗑️ 删除</button>
        </div>
      </div>
    `).join('');
  }

  toggleMastered(id) {
    const item = this.wrongBook.find(w => w.id === id);
    if (item) {
      item.mastered = !item.mastered;
      this.save('wrongBook', this.wrongBook);
      this.renderWrongBook();
    }
  }

  deleteWrong(id) {
    this.wrongBook = this.wrongBook.filter(w => w.id !== id);
    this.save('wrongBook', this.wrongBook);
    this.renderWrongBook();
  }

  retryWrong(id) {
    const w = this.wrongBook.find(w => w.id === id);
    if (!w) return;

    this.currentQuiz = {
      questions: [{
        question: w.question,
        options: w.options,
        answer: w.answer,
        explanation: w.explanation,
        topic: w.topic
      }],
      currentIndex: 0,
      answers: [],
      subject: w.subject,
      questionType: w.options && w.options.length > 0 ? 'choice' : (w.questionType || 'choice'),
      mode: 'retry'
    };

    this.switchView('practice');
    document.getElementById('practiceSetup').style.display = 'none';
    document.getElementById('practiceArea').style.display = 'block';
    document.getElementById('practiceResult').style.display = 'none';
    this.showQuestion();
  }

  // ==================== 查漏补缺诊断 ====================

  async startDiagnostic() {
    if (!this.checkApiKey()) return;

    const subject = document.getElementById('diagnosticSubject').value;
    const context = document.getElementById('diagnosticContext').value.trim();
    if (!context) {
      alert('请描述你的情况，比如考试范围、最近学到哪里等');
      return;
    }

    const btn = document.getElementById('startDiagnosticBtn');
    btn.disabled = true;
    btn.textContent = '🔬 AI 正在生成诊断题目...';
    const stages = ['🔬 分析你的情况...', '📋 设计知识点覆盖...', '✍️ 正在出题...', '🧠 优化题目质量...'];
    let stageIdx = 0;
    const stageTimer = setInterval(() => {
      stageIdx = Math.min(stageIdx + 1, stages.length - 1);
      btn.textContent = stages[stageIdx];
    }, 3000);

    const gradeScope = this.getGradeScope(subject);
    const schoolLevel = this.getSchoolLevel();

    const prompt = `你是一个专业的中国大陆${this.settings.grade}${subject}教师，现在需要为学生做一次"查漏补缺"诊断测试。

学生情况描述：${context}

课程范围约束：
${gradeScope}

诊断要求：
1. 根据学生描述的范围，全面覆盖涉及的所有重要知识点
2. 每个知识点至少出1道题，总共出8-10道题
3. 题目从基础到综合递进，难度由浅入深
4. 每道题必须标明考查的具体知识点（topic字段）
5. 题型以选择题为主，可混合少量填空题
6. 题目要有区分度，能准确检测学生是否掌握该知识点

严格按以下JSON格式返回，不要返回任何其他文字：
[
  {
    "question": "题目内容",
    "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
    "answer": "A",
    "explanation": "解析说明",
    "topic": "具体知识点名称",
    "difficulty": "基础/提高/综合"
  }
]

对于填空题（没有options），格式为：
{
  "question": "题目内容，其中____处需要填写",
  "answer": "标准答案",
  "explanation": "解析",
  "topic": "知识点",
  "difficulty": "基础/提高/综合"
}`;

    try {
      const reply = await this.callAI([
        { role: 'system', content: `你是一个专业的中国大陆${this.settings.grade}${subject}教师，精通人教版教材。只返回JSON数组，不要返回其他内容。` },
        { role: 'user', content: prompt }
      ], 0.5, 4096);

      let questions = this._parseQuestionJSON(reply);
      if (!questions || questions.length === 0) {
        if (this._aiTruncated) {
          const retryReply = await this.callAI([
            { role: 'system', content: `你是一个专业的${this.settings.grade}${subject}教师。只返回JSON数组，确保JSON完整闭合。题目不超过6道。` },
            { role: 'user', content: prompt }
          ], 0.5, 4096);
          questions = this._parseQuestionJSON(retryReply);
        }
        if (!questions || questions.length === 0) throw new Error('AI返回格式有误，请重试');
      }

      // 为每道题标记答题模式
      questions.forEach(q => {
        q._mode = (q.options && q.options.length > 0) ? 'choice' : 'fillblank';
      });

      this.currentQuiz = {
        questions,
        currentIndex: 0,
        answers: [],
        subject,
        questionType: 'choice',
        mode: 'diagnostic',
        diagnosticContext: context
      };

      document.getElementById('diagnosticSetup').style.display = 'none';
      document.getElementById('diagnosticArea').style.display = 'block';
      document.getElementById('diagnosticResult').style.display = 'none';
      this.showQuestion('diagnosticQuestionCard', 'diagnosticFeedback', 'diagnosticNextBtn', 'diagnosticFinishBtn', 'diagnosticProgressText', null);

    } catch (err) {
      alert('诊断出题失败：' + err.message);
    }

    clearInterval(stageTimer);
    btn.disabled = false;
    btn.textContent = '🔬 开始诊断测试';
  }

  nextDiagnosticQuestion() {
    this.currentQuiz.currentIndex++;
    this.showQuestion('diagnosticQuestionCard', 'diagnosticFeedback', 'diagnosticNextBtn', 'diagnosticFinishBtn', 'diagnosticProgressText', null);
  }

  async showDiagnosticReport() {
    const quiz = this.currentQuiz;
    if (!quiz) return;

    // 如果是薄弱点专练模式，显示简单结果
    if (quiz.mode === 'diagnostic-practice') {
      const total = quiz.answers.length;
      const correct = quiz.answers.filter(a => a.isCorrect).length;
      document.getElementById('diagnosticArea').style.display = 'none';
      document.getElementById('diagnosticResult').style.display = 'block';
      document.getElementById('diagnosticResult').innerHTML = `
        <div class="diagnostic-report">
          <div class="report-header"><h3>🎯 薄弱点专练结果</h3></div>
          <div class="report-score-panel">
            <div class="report-score-ring" style="--score-pct:${Math.round(correct/total*100)}%;">
              <span class="report-score-num">${Math.round(correct/total*100)}<small>分</small></span>
            </div>
            <div class="report-score-detail">
              <p>答对 <strong>${correct}</strong> / ${total} 题</p>
              <p class="report-level">${correct === total ? '🌟 全部正确！' : correct >= total * 0.7 ? '👍 进步明显！' : '💪 继续加油！'}</p>
            </div>
          </div>
          <div class="report-actions">
            <button class="btn-ai" onclick="app.resetDiagnostic()">🔄 返回诊断</button>
          </div>
        </div>`;
      this.records.push({ date: new Date().toISOString().split('T')[0], subject: quiz.subject + '（专练）', total, correct, difficulty: '针对性', timestamp: Date.now() });
      this.save('records', this.records);
      this.currentQuiz = null;
      return;
    }

    const total = quiz.answers.length;
    const correct = quiz.answers.filter(a => a.isCorrect).length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;

    // 按知识点分组统计
    const topicStats = {};
    quiz.answers.forEach((a, i) => {
      const q = quiz.questions[i];
      const topic = q.topic || '未分类';
      const difficulty = q.difficulty || '基础';
      if (!topicStats[topic]) {
        topicStats[topic] = { total: 0, correct: 0, difficulty, questions: [] };
      }
      topicStats[topic].total++;
      if (a.isCorrect) topicStats[topic].correct++;
      topicStats[topic].questions.push({
        question: q.question,
        userAnswer: a.userAnswer,
        correctAnswer: q.answer,
        isCorrect: a.isCorrect,
        explanation: q.explanation
      });
    });

    // 分类：掌握/薄弱/未掌握
    const mastered = [];
    const weak = [];
    const notMastered = [];

    Object.entries(topicStats).forEach(([topic, stat]) => {
      const rate = stat.total > 0 ? stat.correct / stat.total : 0;
      const item = { topic, ...stat, rate };
      if (rate >= 1) mastered.push(item);
      else if (rate >= 0.5) weak.push(item);
      else notMastered.push(item);
    });

    // 生成 AI 分析
    let aiAnalysis = '';
    try {
      const summaryText = Object.entries(topicStats)
        .map(([topic, s]) => `${topic}：${s.correct}/${s.total}（${s.difficulty}）`)
        .join('\n');

      aiAnalysis = await this.callAI([
        { role: 'system', content: '你是一个专业的学习诊断分析师，擅长分析学生的知识掌握情况。输出清晰简洁的分析报告。' },
        { role: 'user', content: `我是${this.settings.grade}学生，刚完成了${quiz.subject}的查漏补缺诊断测试。

学生描述的情况：${quiz.diagnosticContext}

各知识点得分情况：
${summaryText}

总分：${correct}/${total}

请给出：
1. 整体水平评估（一两句话）
2. 薄弱知识点分析（列出需要重点加强的知识点，说明为什么薄弱）
3. 具体学习建议（针对每个薄弱知识点给出学习方法和练习建议）
4. 推荐复习顺序（先补哪个后补哪个）` }
      ], 0.4);
    } catch (e) {
      aiAnalysis = '（AI分析生成失败，请参考下方知识点得分情况）';
    }

    // 构建报告HTML
    const reportHTML = `
      <div class="diagnostic-report">
        <div class="report-header">
          <h3>📋 诊断报告 · ${this.escapeHtml(quiz.subject)}</h3>
          <p class="report-context">测试范围：${this.escapeHtml(quiz.diagnosticContext)}</p>
        </div>

        <div class="report-score-panel">
          <div class="report-score-ring" style="--score-pct:${score}%;">
            <span class="report-score-num">${score}<small>分</small></span>
          </div>
          <div class="report-score-detail">
            <p>答对 <strong>${correct}</strong> / ${total} 题</p>
            <p class="report-level">${score >= 90 ? '🌟 掌握优秀' : score >= 70 ? '👍 掌握良好' : score >= 50 ? '⚠️ 有待提高' : '🚨 需要重点加强'}</p>
          </div>
        </div>

        <div class="report-topic-section">
          <h4>📊 知识点掌握情况</h4>
          ${notMastered.length > 0 ? `
            <div class="report-category report-cat-bad">
              <h5>🚨 未掌握（需重点学习）</h5>
              ${notMastered.map(t => this._renderTopicBar(t)).join('')}
            </div>` : ''}
          ${weak.length > 0 ? `
            <div class="report-category report-cat-warn">
              <h5>⚠️ 薄弱（需加强练习）</h5>
              ${weak.map(t => this._renderTopicBar(t)).join('')}
            </div>` : ''}
          ${mastered.length > 0 ? `
            <div class="report-category report-cat-good">
              <h5>✅ 已掌握</h5>
              ${mastered.map(t => this._renderTopicBar(t)).join('')}
            </div>` : ''}
        </div>

        <div class="report-ai-analysis">
          <h4>🤖 AI 诊断分析</h4>
          <div class="ai-response-content">${this.formatAIResponse(aiAnalysis)}</div>
        </div>

        ${notMastered.length + weak.length > 0 ? `
        <div class="report-actions">
          <button class="btn-ai" style="background:#e74c3c;" onclick="app.startWeakPointsPractice()">🎯 一键针对薄弱点练习</button>
          <button class="btn-ai" onclick="app.resetDiagnostic()">🔄 重新诊断</button>
        </div>` : `
        <div class="report-actions">
          <button class="btn-ai" onclick="app.resetDiagnostic()">🔄 再做一次诊断</button>
        </div>`}
      </div>
    `;

    document.getElementById('diagnosticArea').style.display = 'none';
    document.getElementById('diagnosticResult').style.display = 'block';
    document.getElementById('diagnosticResult').innerHTML = reportHTML;

    // 保存诊断记录
    this.records.push({
      date: new Date().toISOString().split('T')[0],
      subject: quiz.subject + '（诊断）',
      total,
      correct,
      difficulty: '诊断',
      timestamp: Date.now()
    });
    this.save('records', this.records);

    // 保存薄弱点数据供后续专练使用
    this._lastDiagnosticWeakPoints = [...notMastered, ...weak].map(t => ({
      topic: t.topic,
      rate: t.rate,
      subject: quiz.subject
    }));
  }

  _renderTopicBar(topicData) {
    const pct = Math.round(topicData.rate * 100);
    const color = pct >= 100 ? '#27ae60' : pct >= 50 ? '#f39c12' : '#e74c3c';
    return `
      <div class="report-topic-item">
        <div class="report-topic-label">
          <span>${this.escapeHtml(topicData.topic)}</span>
          <span class="report-topic-score">${topicData.correct}/${topicData.total}</span>
        </div>
        <div class="report-topic-bar">
          <div class="report-topic-bar-fill" style="width:${pct}%;background:${color};"></div>
        </div>
      </div>`;
  }

  async startWeakPointsPractice() {
    if (!this._lastDiagnosticWeakPoints || this._lastDiagnosticWeakPoints.length === 0) {
      alert('没有发现薄弱知识点');
      return;
    }

    const subject = this._lastDiagnosticWeakPoints[0].subject;
    const weakTopics = this._lastDiagnosticWeakPoints.map(w => w.topic).join('、');
    const gradeScope = this.getGradeScope(subject);

    const btn = document.querySelector('.report-actions .btn-ai');
    if (btn) { btn.disabled = true; btn.textContent = '🎯 正在出题...'; }

    try {
      const reply = await this.callAI([
        { role: 'system', content: `你是一个专业的中国大陆${this.settings.grade}${subject}教师，精通人教版教材。只返回JSON数组，不要返回其他内容。` },
        { role: 'user', content: `我是${this.settings.grade}学生，以下知识点比较薄弱：${weakTopics}。

课程范围约束：
${gradeScope}

请针对这些薄弱知识点出6道针对性练习题，从简单到难递进。
每个薄弱知识点至少1道题。

严格按JSON格式返回：
[{"question":"题目","options":["A. xx","B. xx","C. xx","D. xx"],"answer":"A","explanation":"解析","topic":"知识点"}]` }
      ], 0.5, 3000);

      let questions = this._parseQuestionJSON(reply);
      if (!questions || questions.length === 0) throw new Error('出题失败，请重试');

      this.currentQuiz = {
        questions,
        currentIndex: 0,
        answers: [],
        subject,
        questionType: 'choice',
        mode: 'diagnostic-practice'
      };

      document.getElementById('diagnosticResult').style.display = 'none';
      document.getElementById('diagnosticArea').style.display = 'block';
      this.showQuestion('diagnosticQuestionCard', 'diagnosticFeedback', 'diagnosticNextBtn', 'diagnosticFinishBtn', 'diagnosticProgressText', null);

    } catch (err) {
      alert('出题失败：' + err.message);
    }

    if (btn) { btn.disabled = false; btn.textContent = '🎯 一键针对薄弱点练习'; }
  }

  resetDiagnostic() {
    document.getElementById('diagnosticSetup').style.display = 'block';
    document.getElementById('diagnosticArea').style.display = 'none';
    document.getElementById('diagnosticResult').style.display = 'none';
    this.currentQuiz = null;
  }

  // 诊断语音输入
  startDiagnosticVoice() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('你的浏览器不支持语音识别');
      return;
    }

    const btn = document.getElementById('diagnosticVoiceBtn');
    const status = document.getElementById('diagnosticVoiceStatus');

    // 如果正在录音，停止
    if (this._diagRecording) {
      this._diagRecognition?.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';
    this._diagRecognition = recognition;

    let finalTranscript = '';
    let interimTranscript = '';

    recognition.onstart = () => {
      this._diagRecording = true;
      btn.classList.add('recording');
      btn.textContent = '⏹️';
      btn.title = '停止录音';
      status.style.display = 'block';
      status.innerHTML = '<span class="voice-recording-indicator">🔴 正在录音，请说话...说完点击停止</span>';
    };

    recognition.onresult = (event) => {
      interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      // 实时预览
      status.innerHTML = `<span class="voice-recording-indicator">🔴 录音中...</span>
        <div class="voice-preview">${this.escapeHtml(finalTranscript)}${interimTranscript ? '<span class="voice-interim">' + this.escapeHtml(interimTranscript) + '</span>' : ''}</div>`;
    };

    recognition.onend = () => {
      this._diagRecording = false;
      btn.classList.remove('recording');
      btn.textContent = '🎤';
      btn.title = '语音输入';
      this._diagRecognition = null;

      const rawText = finalTranscript.trim();
      if (!rawText) {
        status.innerHTML = '<span style="color:#e74c3c;">未检测到语音，请重试</span>';
        setTimeout(() => { status.style.display = 'none'; }, 2000);
        return;
      }

      // 用AI整理语音识别的文字
      this._cleanupDiagnosticVoiceText(rawText);
    };

    recognition.onerror = (event) => {
      this._diagRecording = false;
      btn.classList.remove('recording');
      btn.textContent = '🎤';
      btn.title = '语音输入';
      this._diagRecognition = null;

      const msgs = {
        'not-allowed': '麦克风权限被拒绝，请在浏览器设置中允许麦克风访问',
        'no-speech': '未检测到语音，请靠近麦克风重试',
        'audio-capture': '未找到麦克风设备，请检查麦克风连接',
        'network': '语音识别需要网络连接，请检查网络',
        'aborted': ''
      };
      const msg = msgs[event.error] || `语音识别失败（${event.error || '未知错误'}）`;
      if (msg) {
        status.style.display = 'block';
        status.innerHTML = `<span style="color:#e74c3c;">${this.escapeHtml(msg)}</span>`;
        setTimeout(() => { status.style.display = 'none'; }, 3000);
      } else {
        status.style.display = 'none';
      }
    };

    recognition.start();
  }

  async _cleanupDiagnosticVoiceText(rawText) {
    const status = document.getElementById('diagnosticVoiceStatus');
    const textarea = document.getElementById('diagnosticContext');
    const subject = document.getElementById('diagnosticSubject').value;

    status.style.display = 'block';
    status.innerHTML = `<div class="voice-cleanup-progress">
      <span>🤖 AI 正在整理语音内容...</span>
      <div class="voice-raw-text">原始语音：${this.escapeHtml(rawText)}</div>
    </div>`;

    try {
      const cleaned = await this.callAI([
        { role: 'system', content: `你是一个文本整理助手。学生通过语音描述了自己的学习情况，语音识别的文字可能有口语化表述、重复、语气词等。
请将其整理成简洁清晰的文字描述，保留所有关键信息（科目、年级、考试范围、单元章节、薄弱知识点、考试时间等），去掉口语化的废话和语气词。

规则：
1. 只返回整理后的纯文字，不要加引号、标签或解释
2. 保持学生的原意，不要添加学生没说过的信息
3. 用简洁的短句，关键信息用顿号或逗号分隔
4. 如果提到具体知识点或章节，保持原样` },
        { role: 'user', content: `学生说的是${subject}科目。语音识别的原文：\n${rawText}` }
      ], 0.3, 300);

      const cleanedText = cleaned.replace(/^["'"']|["'"']$/g, '').trim();
      textarea.value = cleanedText;

      status.innerHTML = `<div class="voice-cleanup-done">
        <div class="voice-cleanup-row">
          <span class="voice-label">🎤 原始语音：</span>
          <span class="voice-raw">${this.escapeHtml(rawText)}</span>
        </div>
        <div class="voice-cleanup-row">
          <span class="voice-label">✅ AI 整理后：</span>
          <span class="voice-cleaned">${this.escapeHtml(cleanedText)}</span>
        </div>
      </div>`;

      setTimeout(() => { status.style.display = 'none'; }, 5000);
    } catch (err) {
      // AI整理失败就直接用原文
      textarea.value = rawText;
      status.innerHTML = `<span style="color:#f39c12;">⚠️ AI整理失败，已填入原始语音文字</span>`;
      setTimeout(() => { status.style.display = 'none'; }, 3000);
    }
  }

  // ==================== 专项训练 ====================

  async analyzeWeakPoints() {
    if (!this.checkApiKey()) return;

    const unmasteredWrong = this.wrongBook.filter(w => !w.mastered);
    if (unmasteredWrong.length === 0) {
      document.getElementById('weakPointsList').innerHTML = '<p class="empty-hint">你还没有错题，先去做题练习吧！</p>';
      return;
    }

    const btn = document.getElementById('analyzeWeakBtn');
    btn.disabled = true;
    btn.textContent = '🔍 分析中...';

    try {
      // 整理错题数据
      const wrongData = {};
      unmasteredWrong.forEach(w => {
        const key = `${w.subject}-${w.topic}`;
        if (!wrongData[key]) wrongData[key] = { subject: w.subject, topic: w.topic, count: 0 };
        wrongData[key].count += w.attempts;
      });

      const wrongSummary = Object.values(wrongData)
        .sort((a, b) => b.count - a.count)
        .map(d => `${d.subject} - ${d.topic}：错${d.count}次`)
        .join('\n');

      const reply = await this.callAI([
        { role: 'system', content: '你是一个专业的学习分析师，擅长分析学生薄弱点并给出针对性建议。输出格式要清晰。' },
        { role: 'user', content: `我是${this.settings.grade}学生，以下是我的错题统计：\n${wrongSummary}\n\n请分析我的薄弱知识点，按严重程度排序，并给出每个知识点的学习建议。` }
      ], 0.4);

      document.getElementById('weakPointsList').innerHTML = `
        <div class="ai-response-content">${this.formatAIResponse(reply)}</div>
        <div class="weak-stats">
          <h4>错题分布</h4>
          ${Object.values(wrongData).sort((a, b) => b.count - a.count).map(d => `
            <div class="weak-stat-item">
              <span class="weak-stat-label">${this.escapeHtml(d.subject)} · ${this.escapeHtml(d.topic)}</span>
              <span class="weak-stat-count">错 ${d.count} 次</span>
              <div class="weak-stat-bar"><div style="width:${Math.min(100, d.count * 20)}%;background:${d.count >= 4 ? '#e74c3c' : d.count >= 2 ? '#f39c12' : '#3498db'}"></div></div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      document.getElementById('weakPointsList').innerHTML = `<p style="color:#e74c3c">分析失败：${this.escapeHtml(err.message)}</p>`;
    }

    btn.disabled = false;
    btn.textContent = '🔍 AI 分析薄弱点';
  }

  async startTargetedPractice() {
    if (!this.checkApiKey()) return;

    const unmasteredWrong = this.wrongBook.filter(w => !w.mastered);
    if (unmasteredWrong.length === 0) {
      alert('没有未掌握的错题，先去做题练习吧！');
      return;
    }

    const btn = document.getElementById('targetedPracticeBtn');
    btn.disabled = true;
    btn.textContent = '🎯 出题中...';

    try {
      // 提取高频错误知识点
      const topicCounts = {};
      unmasteredWrong.forEach(w => {
        const key = `${w.subject}|${w.topic}`;
        topicCounts[key] = (topicCounts[key] || 0) + w.attempts;
      });

      const weakTopics = Object.entries(topicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([key]) => key);

      const topicDesc = weakTopics.map(k => k.replace('|', '的')).join('、');

      const reply = await this.callAI([
        { role: 'system', content: `你是一个专业的中国大陆${this.settings.grade}教师，精通人教版教材。只返回JSON数组，不要返回其他内容。` },
        { role: 'user', content: `我是中国大陆${this.settings.grade}学生，以下知识点比较薄弱：${topicDesc}。

课程范围约束：必须严格按照人教版${this.settings.grade}教材范围出题，绝对不能超纲。

请针对这些薄弱知识点出5道针对性练习题，从简单到难递进。

严格按JSON格式返回：
[{"question":"题目","options":["A. xx","B. xx","C. xx","D. xx"],"answer":"A","explanation":"解析","topic":"知识点","diagramDesc":"配图描述或空字符串"}]

如果题目需要配图，在diagramDesc填纯文字描述。不需配图填空字符串。` }
      ], 0.5);

      const jsonMatch = reply.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('AI返回格式有误');

      let questions;
      try {
        questions = JSON.parse(jsonMatch[0]);
      } catch {
        let fixed = jsonMatch[0].replace(/\r?\n/g, ' ').replace(/,\s*([}\]])/g, '$1');
        try { questions = JSON.parse(fixed); } catch {
          const items = [];
          const re = /\{[^{}]*"question"\s*:\s*"[^"]*"[^{}]*\}/g;
          let m;
          while ((m = re.exec(reply)) !== null) {
            try { items.push(JSON.parse(m[0])); } catch {}
          }
          if (items.length > 0) questions = items;
          else throw new Error('AI返回的JSON格式有误，请重试');
        }
      }

      this.currentQuiz = {
        questions,
        currentIndex: 0,
        answers: [],
        subject: '专项',
        questionType: 'choice',
        mode: 'targeted'
      };

      document.getElementById('targetedArea').style.display = 'block';
      this.showQuestion('targetedQuestionCard', 'targetedFeedback', 'targetedNextBtn', 'targetedFinishBtn', 'targetedProgressText', null);

      // 并行生成所有配图
      this.batchGenerateDiagrams(questions);

    } catch (err) {
      alert('出题失败：' + err.message);
    }

    btn.disabled = false;
    btn.textContent = '🎯 针对薄弱点出题';
  }

  nextTargetedQuestion() {
    this.currentQuiz.currentIndex++;
    this.showQuestion('targetedQuestionCard', 'targetedFeedback', 'targetedNextBtn', 'targetedFinishBtn', 'targetedProgressText', null);
  }

  finishTargetedPractice() {
    const quiz = this.currentQuiz;
    const correct = quiz.answers.filter(a => a.isCorrect).length;
    const total = quiz.answers.length;

    this.records.push({
      date: new Date().toISOString().split('T')[0],
      subject: '专项训练',
      total,
      correct,
      difficulty: '针对性',
      timestamp: Date.now()
    });
    this.save('records', this.records);

    document.getElementById('targetedArea').style.display = 'none';
    alert(`专项训练完成！正确 ${correct}/${total} 题`);
    this.currentQuiz = null;
  }

  // ==================== AI 辅导 ====================

  updateReviewSelect() {
    const select = document.getElementById('reviewWrongSelect');
    if (!select) return;
    const unmastered = this.wrongBook.filter(w => !w.mastered);
    select.innerHTML = '<option value="">请选择错题</option>' +
      unmastered.map(w => `<option value="${w.id}">${this.escapeHtml(w.subject)} - ${this.escapeHtml(w.question).substring(0, 40)}...</option>`).join('');
  }

  async sendChat() {
    if (!this.checkApiKey()) return;

    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;

    const container = document.getElementById('chatMessages');

    container.innerHTML += `
      <div class="ai-message user">
        <div class="ai-avatar">👤</div>
        <div class="ai-message-content"><h4>你</h4><div>${this.escapeHtml(msg)}</div></div>
      </div>`;

    input.value = '';
    container.scrollTop = container.scrollHeight;

    // loading
    container.innerHTML += `<div class="ai-message loading-msg"><div class="ai-avatar">🤖</div><div class="ai-message-content"><p>思考中...</p></div></div>`;
    container.scrollTop = container.scrollHeight;

    this.chatHistory.push({ role: 'user', content: msg });

    try {
      const systemPrompt = this.buildChatSystemPrompt();
      const messages = [
        { role: 'system', content: systemPrompt },
        ...this.chatHistory.slice(-20)
      ];

      const reply = await this.callAI(messages);
      this.chatHistory.push({ role: 'assistant', content: reply });
      // 保存聊天记录(最多保留最近50条)
      if (this.chatHistory.length > 50) this.chatHistory = this.chatHistory.slice(-50);
      this.save('chatHistory', this.chatHistory);

      container.querySelector('.loading-msg')?.remove();
      container.innerHTML += `
        <div class="ai-message">
          <div class="ai-avatar">🤖</div>
          <div class="ai-message-content"><h4>AI 助手</h4><div>${this.formatAIResponse(reply)}</div></div>
        </div>`;
    } catch (err) {
      container.querySelector('.loading-msg')?.remove();
      container.innerHTML += `
        <div class="ai-message">
          <div class="ai-avatar">⚠️</div>
          <div class="ai-message-content"><p style="color:#e74c3c">出错了：${this.escapeHtml(err.message)}</p></div>
        </div>`;
    }

    container.scrollTop = container.scrollHeight;
  }

  buildChatSystemPrompt() {
    const g = this.settings.grade;
    const name = this.settings.name;
    const levelInfo = this.getLevelInfo();

    // 统计数据
    const totalQ = this.records.reduce((s, r) => s + r.total, 0);
    const totalCorrect = this.records.reduce((s, r) => s + r.correct, 0);
    const totalRate = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;

    // 各科统计
    const subjects = {};
    this.records.forEach(r => {
      if (r.subject === '专项训练') return;
      if (!subjects[r.subject]) subjects[r.subject] = { total: 0, correct: 0 };
      subjects[r.subject].total += r.total;
      subjects[r.subject].correct += r.correct;
    });
    const subjectSummary = Object.entries(subjects)
      .map(([s, d]) => `${s}: 共${d.total}题正确${d.correct}题(正确率${Math.round((d.correct/d.total)*100)}%)`)
      .join('\n') || '还没有做题记录';

    // 错题统计
    const unmasteredWrong = this.wrongBook.filter(w => !w.mastered);
    const masteredWrong = this.wrongBook.filter(w => w.mastered);

    // 错题知识点分布
    const wrongTopics = {};
    unmasteredWrong.forEach(w => {
      const key = `${w.subject}-${w.topic}`;
      if (!wrongTopics[key]) wrongTopics[key] = { count: 0, attempts: 0 };
      wrongTopics[key].count++;
      wrongTopics[key].attempts += w.attempts;
    });
    const topWeakPoints = Object.entries(wrongTopics)
      .sort((a, b) => b[1].attempts - a[1].attempts)
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${v.count}道错题(共错${v.attempts}次)`)
      .join('\n') || '暂无错题';

    // 最近5道错题详情
    const recentWrong = unmasteredWrong
      .sort((a, b) => b.lastWrong - a.lastWrong)
      .slice(0, 5)
      .map(w => `[科目:${w.subject}|知识点:${w.topic}] 题目:${w.question.substring(0, 60)}... 正确答案:${w.answer} 你选:${w.userAnswer} 错${w.attempts}次`)
      .join('\n') || '暂无错题';

    // 最近练习记录
    const recentRecords = [...this.records]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 8)
      .map(r => `${r.date} ${r.subject} ${r.correct}/${r.total}正确(难度:${r.difficulty || '未知'})`)
      .join('\n') || '暂无记录';

    const streak = this.calculateStreak();

    return `你是一个耐心专业的AI学习助手，正在辅导一位中国大陆${g}学生「${name}」。

━━━ 📊 学生当前学习数据 ━━━
等级: Lv.${levelInfo.level} ${levelInfo.title} (XP: ${levelInfo.xp})
连续学习: ${streak}天
总做题: ${totalQ}题，总正确: ${totalCorrect}题，总正确率: ${totalRate}%

各科详情:
${subjectSummary}

━━━ ❌ 错题情况 ━━━
未掌握错题: ${unmasteredWrong.length}道
已掌握错题: ${masteredWrong.length}道

薄弱知识点(按错误次数排序):
${topWeakPoints}

最近错题详情:
${recentWrong}

━━━ 🗓️ 最近练习记录 ━━━
${recentRecords}

━━━ 辅导规则 ━━━
1. 你能看到学生的全部学习数据，请主动根据这些数据给出针对性建议
2. 当学生问“我哪里薄弱”“我该复习什么”时，根据错题数据给出具体建议
3. 当学生问题时，引导思考而不是直接给答案，像好老师一样耐心引导
4. 适当使用数学公式（LaTeX格式 $...$ 或 $$...$$）
5. 语气亲切鼓励，像一个懂学生的好朋友+老师
6. 记住之前的对话内容，保持连贯性
7. 只讨论${g}课程范围内的内容，不要超纲`;
  }

  clearChatHistory() {
    if (!confirm('确定清除所有聊天记录吗？')) return;
    this.chatHistory = [];
    this.save('chatHistory', []);
    const container = document.getElementById('chatMessages');
    container.innerHTML = `
      <div class="ai-message">
        <div class="ai-avatar">🤖</div>
        <div class="ai-message-content">
          <h4>AI 学习助手</h4>
          <p>你好！我已经了解你的全部学习数据，可以帮你：</p>
          <ul>
            <li>📊 分析你的薄弱知识点和学习情况</li>
            <li>🔍 针对你的错题进行讲解</li>
            <li>💡 解答学习疑问、讲解知识点</li>
            <li>📋 制定复习计划和学习建议</li>
          </ul>
          <p>我会记住我们的对话，随时问我吧！</p>
        </div>
      </div>`;
  }

  restoreChatMessages() {
    if (!this.chatHistory || this.chatHistory.length === 0) return;
    const container = document.getElementById('chatMessages');
    for (const msg of this.chatHistory) {
      if (msg.role === 'user') {
        container.innerHTML += `
          <div class="ai-message user">
            <div class="ai-avatar">👤</div>
            <div class="ai-message-content"><h4>你</h4><div>${this.escapeHtml(msg.content)}</div></div>
          </div>`;
      } else if (msg.role === 'assistant') {
        container.innerHTML += `
          <div class="ai-message">
            <div class="ai-avatar">🤖</div>
            <div class="ai-message-content"><h4>AI 助手</h4><div>${this.formatAIResponse(msg.content)}</div></div>
          </div>`;
      }
    }
    container.scrollTop = container.scrollHeight;
  }

  async reviewWrongAnswer() {
    if (!this.checkApiKey()) return;

    const selectId = document.getElementById('reviewWrongSelect').value;
    if (!selectId) { alert('请先选择一道错题'); return; }

    const wrong = this.wrongBook.find(w => w.id === parseInt(selectId));
    if (!wrong) return;

    const note = document.getElementById('reviewNote').value.trim();
    const resultDiv = document.getElementById('reviewResult');
    resultDiv.innerHTML = '<p>🔍 AI 正在分析...</p>';

    try {
      const prompt = `请复盘分析这道题：

题目：${wrong.question}
选项：${wrong.options.join(' | ')}
正确答案：${wrong.answer}
我选的答案：${wrong.userAnswer}
科目：${wrong.subject}
知识点：${wrong.topic}
${note ? `我的困惑：${note}` : ''}

请从以下几个方面分析：
1. 这道题考察的核心知识点是什么
2. 正确的解题思路和步骤
3. 我选错的原因可能是什么
4. 类似题型的解题技巧
5. 需要巩固的基础知识`;

      const reply = await this.callAI([
        { role: 'system', content: `你是一个专业的${this.settings.grade}教师，擅长帮助学生分析错题原因并给出改进建议。` },
        { role: 'user', content: prompt }
      ], 0.4);

      resultDiv.innerHTML = `<div class="ai-response-content">${this.formatAIResponse(reply)}</div>`;
    } catch (err) {
      resultDiv.innerHTML = `<p style="color:#e74c3c">分析失败：${this.escapeHtml(err.message)}</p>`;
    }
  }

  async generateSummary() {
    if (!this.checkApiKey()) return;

    const period = document.getElementById('summaryPeriod').value;
    const resultDiv = document.getElementById('summaryResult');
    resultDiv.innerHTML = '<p>📊 生成中...</p>';

    // 筛选时间范围内记录
    const now = Date.now();
    const msMap = { week: 7 * 86400000, month: 30 * 86400000, all: Infinity };
    const cutoff = now - (msMap[period] || msMap.month);
    const filtered = this.records.filter(r => r.timestamp >= cutoff);
    const wrongInPeriod = this.wrongBook.filter(w => w.addedAt >= cutoff);

    if (filtered.length === 0) {
      resultDiv.innerHTML = '<p>该时间段内没有学习记录</p>';
      return;
    }

    // 统计
    const totalQ = filtered.reduce((s, r) => s + r.total, 0);
    const totalCorrect = filtered.reduce((s, r) => s + r.correct, 0);
    const subjects = {};
    filtered.forEach(r => {
      if (!subjects[r.subject]) subjects[r.subject] = { total: 0, correct: 0 };
      subjects[r.subject].total += r.total;
      subjects[r.subject].correct += r.correct;
    });

    const subjectSummary = Object.entries(subjects).map(([s, d]) => 
      `${s}：共${d.total}题，正确${d.correct}题，正确率${Math.round((d.correct/d.total)*100)}%`
    ).join('\n');

    const wrongTopics = {};
    wrongInPeriod.forEach(w => {
      wrongTopics[`${w.subject}-${w.topic}`] = (wrongTopics[`${w.subject}-${w.topic}`] || 0) + 1;
    });
    const wrongSummary = Object.entries(wrongTopics).map(([k,v]) => `${k}：${v}次`).join('\n');

    try {
      const reply = await this.callAI([
        { role: 'system', content: '你是学习分析专家，擅长给出具体可行的学习建议。' },
        { role: 'user', content: `我是${this.settings.grade}学生，以下是我${period === 'week' ? '本周' : period === 'month' ? '本月' : '全部'}的学习数据：

总做题数：${totalQ}，总正确：${totalCorrect}，正确率：${Math.round((totalCorrect/totalQ)*100)}%

各科目明细：
${subjectSummary}

错题知识点分布：
${wrongSummary || '无'}

请给出详细的学习总结，包括：1. 整体评价 2. 各科分析 3. 薄弱点分析 4. 具体改进建议 5. 下一步学习计划` }
      ], 0.4);

      resultDiv.innerHTML = `<div class="ai-response-content">${this.formatAIResponse(reply)}</div>`;
    } catch (err) {
      resultDiv.innerHTML = `<p style="color:#e74c3c">生成失败：${this.escapeHtml(err.message)}</p>`;
    }
  }

  // ==================== 学习统计 ====================

  updateStats() {
    const totalQ = this.records.reduce((s, r) => s + r.total, 0);
    const totalCorrect = this.records.reduce((s, r) => s + r.correct, 0);
    const rate = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;

    document.getElementById('statsTotalQ').textContent = totalQ;
    document.getElementById('statsCorrect').textContent = totalCorrect;
    document.getElementById('statsAccuracy').textContent = rate + '%';
    document.getElementById('statsStreak').textContent = this.calculateStreak() + '天';

    // 各科统计
    const subjects = {};
    this.records.forEach(r => {
      if (r.subject === '专项训练') return;
      if (!subjects[r.subject]) subjects[r.subject] = { total: 0, correct: 0 };
      subjects[r.subject].total += r.total;
      subjects[r.subject].correct += r.correct;
    });

    const colors = { '数学': '#4a90e2', '物理': '#e74c3c', '英语': '#27ae60', '语文': '#f39c12', '化学': '#8e44ad' };
    const statsDiv = document.getElementById('subjectStats');
    if (Object.keys(subjects).length === 0) {
      statsDiv.innerHTML = '<p class="empty-hint">还没有学习记录</p>';
    } else {
      statsDiv.innerHTML = Object.entries(subjects).map(([name, d]) => {
        const r = Math.round((d.correct / d.total) * 100);
        const color = colors[name] || '#999';
        return `
          <div class="subject-card">
            <h4 style="color:${color}">${this.escapeHtml(name)}</h4>
            <div class="subject-progress">
              <div class="subject-progress-bar" style="width:${r}%;background:${color}"></div>
            </div>
            <p>${r}% 正确率 (${d.correct}/${d.total})</p>
          </div>`;
      }).join('');
    }

    // 最近记录
    const recentDiv = document.getElementById('recentRecords');
    const recent = [...this.records].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
    if (recent.length === 0) {
      recentDiv.innerHTML = '<p class="empty-hint">还没有学习记录</p>';
    } else {
      recentDiv.innerHTML = recent.map(r => `
        <div class="record-item">
          <span class="record-date">${r.date}</span>
          <span class="record-subject">${this.escapeHtml(r.subject)}</span>
          <span class="record-detail">${r.correct}/${r.total} 正确</span>
          <span class="record-rate ${r.correct/r.total >= 0.8 ? 'rate-good' : r.correct/r.total >= 0.6 ? 'rate-ok' : 'rate-bad'}">${Math.round((r.correct/r.total)*100)}%</span>
        </div>
      `).join('');
    }
  }

  calculateStreak() {
    if (this.records.length === 0) return 0;
    const dates = [...new Set(this.records.map(r => r.date))].sort().reverse();
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (dates[0] !== today && dates[0] !== yesterday) return 0;

    let streak = 1;
    for (let i = 1; i < dates.length; i++) {
      const curr = new Date(dates[i - 1]);
      const prev = new Date(dates[i]);
      const diff = (curr - prev) / 86400000;
      if (diff === 1) streak++;
      else break;
    }
    return streak;
  }

  // ==================== 游戏系统 ====================

  getSchoolLevel() {
    const g = this.settings.grade;
    if (['初一', '初二', '初三'].includes(g)) return '初中';
    if (['高一', '高二', '高三'].includes(g)) return '高中';
    return '初中';
  }

  updateDifficultyOptions() {
    const level = this.getSchoolLevel();
    const exam = level === '初中' ? '中考' : '高考';
    const options = [
      { value: '基础', label: `📗 ${level}基础` },
      { value: '提高', label: `📘 ${level}提高` },
      { value: '考试', label: `📕 ${exam}水平` },
      { value: '压轴', label: `🏆 ${exam}压轴` }
    ];
    const select = document.getElementById('practiceDifficulty');
    if (!select) return;
    const prev = select.value;
    select.innerHTML = options.map((o, i) =>
      `<option value="${o.value}" ${i === 1 ? 'selected' : ''}>${o.label}</option>`
    ).join('');
    if (prev && options.find(o => o.value === prev)) select.value = prev;
  }

  // 渲染题型选择卡片
  updateQuestionTypeGrid() {
    const subject = document.getElementById('practiceSubject')?.value || '数学';
    const grid = document.getElementById('questionTypeGrid');
    if (!grid) return;

    const types = this.getSubjectQuestionTypes(subject);
    grid.innerHTML = types.map((t, i) => `
      <div class="question-type-card ${i === 0 ? 'selected' : ''}" data-type="${t.value}" onclick="app.selectQuestionType(this)">
        <span class="qt-icon">${t.icon}</span>
        <span class="qt-label">${t.label}</span>
        <span class="qt-desc">${t.desc}</span>
      </div>
    `).join('');

    this.selectedQuestionType = types[0]?.value || 'choice';
    this.updateTopicTags();
  }

  selectQuestionType(el) {
    document.querySelectorAll('#questionTypeGrid .question-type-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    this.selectedQuestionType = el.dataset.type;
    this.updateTopicTags();
  }

  // 渲染知识点标签
  updateTopicTags() {
    const subject = document.getElementById('practiceSubject')?.value || '数学';
    const row = document.getElementById('topicTagRow');
    if (!row) return;

    const topics = this.getTopicList(subject, this.selectedQuestionType);
    this.selectedTopics = new Set();

    row.innerHTML = `<span class="topic-tag topic-tag-random selected" data-topic="__random__" onclick="app.toggleTopicTag(this)">🎲 随机</span>` +
      topics.map(t => `<span class="topic-tag" data-topic="${this.escapeHtml(t)}" onclick="app.toggleTopicTag(this)">${this.escapeHtml(t)}</span>`).join('');

    this.updateTopicInfo();
  }

  toggleTopicTag(el) {
    const topic = el.dataset.topic;
    const row = document.getElementById('topicTagRow');
    const randomTag = row.querySelector('[data-topic="__random__"]');

    if (topic === '__random__') {
      // 点随机 → 取消所有其他选中，选中随机
      this.selectedTopics.clear();
      row.querySelectorAll('.topic-tag').forEach(t => t.classList.remove('selected'));
      el.classList.add('selected');
    } else {
      // 点具体知识点 → 取消随机
      randomTag?.classList.remove('selected');

      if (this.selectedTopics.has(topic)) {
        this.selectedTopics.delete(topic);
        el.classList.remove('selected');
      } else {
        this.selectedTopics.add(topic);
        el.classList.add('selected');
      }

      // 如果没有任何知识点被选中，重新选中随机
      if (this.selectedTopics.size === 0) {
        randomTag?.classList.add('selected');
      }
    }

    this.updateTopicInfo();
  }

  updateTopicInfo() {
    const info = document.getElementById('topicSelectedInfo');
    if (!info) return;
    if (!this.selectedTopics || this.selectedTopics.size === 0) {
      info.textContent = '当前：🎲 随机出题';
    } else {
      const list = [...this.selectedTopics].join('、');
      info.textContent = `已选 ${this.selectedTopics.size} 个知识点：${list}`;
    }
  }

  getSelectedTopicString() {
    if (!this.selectedTopics || this.selectedTopics.size === 0) return '';
    return [...this.selectedTopics].join('、');
  }

  getLevelInfo() {
    const thresholds = [0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 4000, 5500, 7500, 10000];
    const titles = ['学徒', '书生', '秀才', '举人', '贡士', '进士', '翰林', '学士', '大学士', '太傅', '帝师', '学神', '传说'];
    let level = 1;
    for (let i = 1; i < thresholds.length; i++) {
      if (this.xp >= thresholds[i]) level = i + 1;
      else break;
    }
    const currTh = thresholds[level - 1] || 0;
    const nextTh = thresholds[level] || thresholds[thresholds.length - 1] + 3000;
    const progress = ((this.xp - currTh) / (nextTh - currTh)) * 100;
    return {
      level,
      title: titles[Math.min(level - 1, titles.length - 1)],
      xp: this.xp,
      currTh,
      nextTh,
      progress: Math.min(100, Math.max(0, progress))
    };
  }

  addXP(amount, nearElement) {
    const oldInfo = this.getLevelInfo();
    this.xp += amount;
    localStorage.setItem('game_xp', this.xp);
    const newInfo = this.getLevelInfo();
    this.updateXPBar();

    // Floating XP text
    if (nearElement) {
      const float = document.createElement('div');
      float.className = 'xp-float';
      float.textContent = `+${amount} XP`;
      const rect = (nearElement.getBoundingClientRect ? nearElement : document.body).getBoundingClientRect();
      float.style.left = (rect.left + rect.width / 2) + 'px';
      float.style.top = (rect.top) + 'px';
      document.body.appendChild(float);
      setTimeout(() => float.remove(), 1300);
    }

    // Level up!
    if (newInfo.level > oldInfo.level) {
      setTimeout(() => {
        this.playSound('levelup');
        this.showAchievement(`升级！${newInfo.title} Lv.${newInfo.level}`, '🎉');
        this.spawnCelebration(80);
      }, 300);
    }
  }

  updateXPBar() {
    const info = this.getLevelInfo();
    const bar = document.getElementById('xpBar');
    const text = document.getElementById('xpText');
    const lvl = document.getElementById('levelDisplay');
    const title = document.getElementById('levelTitle');
    if (bar) bar.style.width = info.progress + '%';
    if (text) text.textContent = `${info.xp - info.currTh} / ${info.nextTh - info.currTh} XP`;
    if (lvl) lvl.textContent = `Lv.${info.level}`;
    if (title) title.textContent = info.title;
  }

  showAchievement(text, icon = '🏆') {
    const container = document.getElementById('achievementContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'achievement-toast';
    toast.innerHTML = `<span style="font-size:1.4em">${icon}</span> ${this.escapeHtml(text)}`;
    container.appendChild(toast);
    this.playSound('click');
    setTimeout(() => toast.remove(), 3200);
  }

  screenShake() {
    const el = document.querySelector('.app-container');
    if (el) {
      el.classList.add('screen-shake');
      setTimeout(() => el.classList.remove('screen-shake'), 400);
    }
  }

  // ==================== 粒子系统 ====================

  initParticles() {
    const canvas = document.getElementById('particleCanvas');
    if (!canvas) return;
    this.particleCanvas = canvas;
    this.particleCtx = canvas.getContext('2d');
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    // Ambient particles
    for (let i = 0; i < 45; i++) {
      this.particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        color: Math.random() > 0.5 ? 'rgba(0,212,255,0.35)' : 'rgba(168,85,247,0.25)',
        life: 1
      });
    }
    this.animateParticles();
  }

  animateParticles() {
    if (!this.particleCtx) return;
    const ctx = this.particleCtx;
    const c = this.particleCanvas;
    ctx.clearRect(0, 0, c.width, c.height);
    this.particles = this.particles.filter(p => p.life > 0);
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.celebration) {
        p.life -= 0.018;
        p.vy += 0.06;
      } else {
        if (p.x < 0) p.x = c.width;
        if (p.x > c.width) p.x = 0;
        if (p.y < 0) p.y = c.height;
        if (p.y > c.height) p.y = 0;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (p.celebration ? p.life : 1), 0, Math.PI * 2);
      if (p.celebration) {
        const alpha = p.life * 0.9;
        ctx.fillStyle = p.color.replace(/[\d.]+\)$/, alpha + ')');
      } else {
        ctx.fillStyle = p.color;
      }
      ctx.fill();
    });
    requestAnimationFrame(() => this.animateParticles());
  }

  spawnCelebration(count = 40) {
    if (!this.particleCanvas) return;
    const cx = this.particleCanvas.width / 2;
    const cy = this.particleCanvas.height / 2;
    const colors = [
      'rgba(0,212,255,', 'rgba(168,85,247,', 'rgba(245,158,11,',
      'rgba(16,185,129,', 'rgba(236,72,153,'
    ];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 2 + Math.random() * 5;
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: Math.random() * 4 + 2,
        color: colors[Math.floor(Math.random() * colors.length)] + '1)',
        life: 1,
        celebration: true
      });
    }
  }

  // ==================== 背景音乐 ====================

  toggleMusic() {
    if (this.bgmPlaying) {
      this.stopBGM();
    } else {
      this.startBGM();
    }
    const btn = document.getElementById('musicToggle');
    if (btn) {
      btn.classList.toggle('music-on', this.bgmPlaying);
      btn.textContent = this.bgmPlaying ? '🎶' : '🎵';
    }
  }

  startBGM() {
    try {
      const ctx = this.getAudioCtx();
      const sr = ctx.sampleRate;
      const bpm = 78;
      const beatLen = 60 / bpm;
      const barLen = beatLen * 4;
      const bars = 4;
      const duration = barLen * bars;
      const len = Math.ceil(sr * duration);
      const buffer = ctx.createBuffer(2, len, sr);
      const L = buffer.getChannelData(0);
      const R = buffer.getChannelData(1);

      // Am - F - C - G progression
      const chords = [
        [220, 261.63, 329.63],
        [174.61, 220, 261.63],
        [261.63, 329.63, 392],
        [196, 246.94, 293.66]
      ];

      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const bi = Math.floor(t / barLen) % bars;
        const chord = chords[bi];
        const barProg = (t % barLen) / barLen;

        let s = 0;
        // Pad (soft sine chords)
        chord.forEach(f => {
          s += Math.sin(2 * Math.PI * f * t) * 0.06;
        });
        // Sub bass
        const bassF = chord[0] / 2;
        const bassEnv = Math.max(0, 1 - barProg * 1.5);
        s += Math.sin(2 * Math.PI * bassF * t) * 0.08 * bassEnv;

        // Gentle arpeggio (8th notes)
        const eighthIdx = Math.floor((t % barLen) / (beatLen / 2)) % 6;
        const arpNote = chord[eighthIdx % chord.length] * 2;
        const arpPhase = (t % (beatLen / 2)) / (beatLen / 2);
        const arpEnv = Math.max(0, 1 - arpPhase * 3) * 0.03;
        s += Math.sin(2 * Math.PI * arpNote * t) * arpEnv;

        // Bar envelope
        const env = Math.min(1, barProg * 8) * Math.min(1, (1 - barProg) * 8);
        s *= env;

        L[i] = s;
        R[i] = s * 0.85 + Math.sin(2 * Math.PI * chord[1] * t) * 0.01;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();

      this.bgmSource = source;
      this.bgmGain = gain;
      this.bgmPlaying = true;
    } catch (e) {
      console.warn('BGM start failed:', e);
    }
  }

  stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmGain) {
      try {
        const ctx = this.getAudioCtx();
        this.bgmGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
        const src = this.bgmSource;
        setTimeout(() => { try { src.stop(); } catch {} }, 900);
      } catch {}
    }
    this.bgmSource = null;
    this.bgmGain = null;
  }

  adjustMusicIntensity(combo) {
    if (!this.bgmPlaying || !this.bgmGain) return;
    try {
      const ctx = this.getAudioCtx();
      const vol = Math.min(0.8, 0.5 + combo * 0.04);
      this.bgmGain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.3);
    } catch {}
  }

  // ==================== 题目配图生成 ====================

  batchGenerateDiagrams(questions) {
    const tasks = [];
    questions.forEach((q, idx) => {
      if (q.diagramDesc && q.diagramDesc.trim() && !q._diagramSvg) {
        tasks.push(this.generateDiagramForQuestion(idx, q));
      }
    });
    if (tasks.length > 0) Promise.allSettled(tasks);
  }

  async generateDiagramForQuestion(qIndex, question, containerId) {
    try {
      const desc = question.diagramDesc;
      const subject = this.currentQuiz?.subject || '';
      const prompt = `为${subject}题生成SVG配图（宽320高200）：
题目：${question.question}
描述：${desc}
要求：直接输出SVG，黑白简洁，线条#333，文字SimSun 14px，以<svg开头</svg>结尾，不要其他文字。`;

      const reply = await this.callAI([
        { role: 'system', content: '只输出SVG代码，不要任何其他文字。' },
        { role: 'user', content: prompt }
      ], 0.3, 1200);

      const svg = this.sanitizeSvg(reply);
      if (svg) {
        question._diagramSvg = svg;
        // 如果当前正在显示这道题，更新DOM
        const diagramEl = document.getElementById(`diagram-${qIndex}`);
        if (diagramEl) {
          diagramEl.innerHTML = svg;
          diagramEl.classList.remove('diagram-loading-container');
        }
      } else {
        const diagramEl = document.getElementById(`diagram-${qIndex}`);
        if (diagramEl) diagramEl.innerHTML = '<p style="color:#999;font-size:0.85rem">配图生成失败</p>';
      }
    } catch {
      const diagramEl = document.getElementById(`diagram-${qIndex}`);
      if (diagramEl) diagramEl.innerHTML = '<p style="color:#999;font-size:0.85rem">配图生成失败</p>';
    }
  }

  // ==================== 语音输入 ====================

  setupVoiceInput() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = 'zh-CN';

    this.recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      document.getElementById('voiceText').value = text;
    };

    this.recognition.onerror = (event) => {
      const msgs = {
        'not-allowed': '麦克风权限被拒绝，请在浏览器设置中允许麦克风访问',
        'no-speech': '未检测到语音，请靠近麦克风重试',
        'audio-capture': '未找到麦克风设备，请检查麦克风连接',
        'network': '语音识别需要网络连接，请检查网络',
        'aborted': '语音识别已取消'
      };
      const msg = msgs[event.error] || `语音识别失败（${event.error || '未知错误'}）`;
      if (event.error !== 'aborted') alert(msg);
    };

    document.getElementById('voiceInputBtn')?.addEventListener('click', () => {
      this.startVoiceInput();
    });

    document.getElementById('voiceRetryBtn')?.addEventListener('click', () => {
      document.getElementById('voiceText').value = '';
      this.recognition.start();
    });

    document.getElementById('voiceConfirmBtn')?.addEventListener('click', () => {
      const text = document.getElementById('voiceText').value.trim();
      if (text) {
        document.getElementById('chatInput').value = text;
        this.closeModal('voiceModal');
      }
    });
  }

  startVoiceInput() {
    if (!this.recognition) { alert('你的浏览器不支持语音识别'); return; }
    this.showModal('voiceModal');
    document.getElementById('voiceText').value = '';
    this.recognition.start();
  }
}

const app = new StudyApp();

