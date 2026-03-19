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

    // 错题本筛选
    document.getElementById('wrongBookSubject')?.addEventListener('change', () => this.renderWrongBook());
    document.getElementById('wrongBookStatus')?.addEventListener('change', () => this.renderWrongBook());

    // 专项训练
    document.getElementById('analyzeWeakBtn')?.addEventListener('click', () => this.analyzeWeakPoints());
    document.getElementById('targetedPracticeBtn')?.addEventListener('click', () => this.startTargetedPractice());
    document.getElementById('targetedNextBtn')?.addEventListener('click', () => this.nextTargetedQuestion());
    document.getElementById('targetedFinishBtn')?.addEventListener('click', () => this.finishTargetedPractice());

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

    const resp = await fetch(this.AI_API_URL, {
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
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `API 请求失败 (${resp.status})`);
    }

    const data = await resp.json();
    return data.choices[0].message.content;
  }

  // ==================== 做题练习 ====================

  async startPractice() {
    if (!this.checkApiKey()) return;

    const subject = document.getElementById('practiceSubject').value;
    const difficulty = document.getElementById('practiceDifficulty').value;
    const count = parseInt(document.getElementById('practiceCount').value) || 5;
    const topic = document.getElementById('practiceTopic').value.trim();

    const btn = document.getElementById('startPracticeBtn');
    btn.disabled = true;
    btn.textContent = '🤔 AI 正在出题...';
    const stages = ['🤔 AI 正在构思...', '✍️ 正在组织题目...', '🧠 正在打磨选项...', '📝 即将完成...'];
    let stageIdx = 0;
    const stageTimer = setInterval(() => {
      stageIdx = Math.min(stageIdx + 1, stages.length - 1);
      btn.textContent = stages[stageIdx];
    }, 3000);

    try {
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
      const prompt = `请为中国大陆${this.settings.grade}学生出${count}道${subject}题目${topicHint}。

❗❗❗ 课程范围约束（最重要）：
${gradeScope}

难度要求：${difficulty} —— ${difficultyDesc[difficulty] || '中等难度'}

严格按以下JSON格式返回，不要返回其他内容：
[
  {
    "question": "题目内容",
    "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
    "answer": "A",
    "explanation": "解析说明",
    "topic": "知识点名称"${needsDiagram ? ',\n    "diagramDesc": "配图描述或空字符串"' : ''}
  }
]

要求：
1. 每道题必须有4个选项，answer只填A/B/C/D
2. 题目必须完全在上述课程范围内，绝对不能超纲
3. 题目风格参考中国大陆${this.settings.grade.startsWith('初') ? '中考' : '高考'}真题
4. explanation要详细清晰，用${this.settings.grade}学生能理解的方式解释
5. topic精确到具体知识点${needsDiagram ? `
6. 如果题目需要配图，在diagramDesc填纯文字描述，不需配图则填空字符串
7. diagramDesc只填纯文字描述，不要填SVG代码` : ''}`;

      const reply = await this.callAI([
        { role: 'system', content: `你是一个专业的中国大陆${this.settings.grade}教师，精通人教版教材，擅长按照课程标准出题。严格按照课程范围出题，绝对不能超纲。只返回JSON数组。` },
        { role: 'user', content: prompt }
      ], 0.5);

      // 解析题目
      const jsonMatch = reply.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('AI返回格式有误，请重试');

      let questions;
      try {
        questions = JSON.parse(jsonMatch[0]);
      } catch (e1) {
        // AI经常在字符串值里放未转义的引号/换行, 尝试修复
        let fixed = jsonMatch[0]
          .replace(/\r?\n/g, ' ')
          .replace(/,\s*([}\]])/g, '$1')
          .replace(/"diagramDesc"\s*:\s*"((?:[^"\\]|\\.)*)"/g, (m, v) => {
            // 确保diagramDesc值里的引号被转义
            return `"diagramDesc":"${v.replace(/(?<!\\)"/g, '\\"')}"`;
          });
        try {
          questions = JSON.parse(fixed);
        } catch (e2) {
          // 逐题提取
          const items = [];
          const re = /\{[^{}]*"question"\s*:\s*"[^"]*"[^{}]*\}/g;
          let m;
          while ((m = re.exec(reply)) !== null) {
            try { items.push(JSON.parse(m[0])); } catch {}
          }
          if (items.length > 0) {
            questions = items;
          } else {
            throw new Error('AI返回的JSON格式有误，请重试');
          }
        }
      }
      if (!Array.isArray(questions) || questions.length === 0) throw new Error('未能生成题目');

      this.currentQuiz = {
        questions,
        currentIndex: 0,
        answers: [],
        subject,
        difficulty,
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

    // 进度
    const progText = document.getElementById(progressTextId);
    if (progText) progText.textContent = `第 ${num} / ${total} 题`;
    const progBar = document.getElementById(progressBarId);
    if (progBar) progBar.style.width = `${(num / total) * 100}%`;

    // 题目卡片
    const card = document.getElementById(containerId);
    const hasDiagramDesc = q.diagramDesc && q.diagramDesc.trim();
    const diagramPlaceholder = hasDiagramDesc ? `<div class="question-diagram" id="diagram-${quiz.currentIndex}"><p class="diagram-loading">🎨 配图生成中...</p></div>` : '';
    // 如果已经有缓存的SVG
    const cachedDiagram = q._diagramSvg ? `<div class="question-diagram">${q._diagramSvg}</div>` : diagramPlaceholder;
    // 去除题目文本中内嵌的选项(AI经常把ABCD选项写在question里导致重复)
    let questionText = q.question;
    questionText = questionText.replace(/\n\s*[A-D][.．、][\s\S]*$/m, (match) => {
      // 检查是否包含至少2个选项标记
      const optCount = (match.match(/[A-D][.．、]/g) || []).length;
      return optCount >= 2 ? '' : match;
    }).trim();
    card.innerHTML = `
      <div class="question-number">第 ${num} 题 <span class="question-topic">${this.escapeHtml(q.topic || '')}</span></div>
      <div class="question-text">${this.formatAIResponse(questionText)}</div>
      ${cachedDiagram}
      <div class="options-list">
        ${q.options.map((opt, i) => `
          <button class="option-btn" data-index="${i}" onclick="app.selectAnswer(${i}, '${containerId}', '${feedbackId}', '${nextBtnId}', '${finishBtnId}')">
            ${this.formatAIResponse(opt)}
          </button>
        `).join('')}
      </div>
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
    const correct = quiz.answers.filter(a => a.isCorrect).length;
    const total = quiz.answers.length;
    const rate = total > 0 ? Math.round((correct / total) * 100) : 0;

    // 播放结果音效 & XP
    if (rate === 100) {
      this.playSound('perfect');
      this.addXP(50);
      this.spawnCelebration(80);
      if (!this.achievements.firstPerfect) {
        this.achievements.firstPerfect = true;
        localStorage.setItem('achievements', JSON.stringify(this.achievements));
        this.showAchievement('首次全对！完美表现！', '👑');
      }
    } else if (rate >= 80) {
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
      timestamp: Date.now()
    });
    this.save('records', this.records);

    document.getElementById('practiceArea').style.display = 'none';
    const resultDiv = document.getElementById('practiceResult');
    resultDiv.style.display = 'block';

    let wrongSummary = '';
    quiz.answers.forEach((a, i) => {
      if (!a.isCorrect) {
        const q = quiz.questions[a.questionIndex];
        wrongSummary += `
          <div class="result-wrong-item">
            <div class="result-wrong-q">${i + 1}. ${this.formatAIResponse(q.question)}</div>
            <div class="result-wrong-detail">你的答案：${a.selected} | 正确答案：${a.correct}</div>
          </div>`;
      }
    });

    resultDiv.innerHTML = `
      <div class="practice-result-card">
        <h3>📊 练习结果</h3>
        <div class="result-score">
          <div class="score-circle ${rate >= 80 ? 'score-good' : rate >= 60 ? 'score-ok' : 'score-bad'}">
            <span class="score-number">${rate}%</span>
            <span class="score-label">正确率</span>
          </div>
        </div>
        <div class="result-details">
          <span>📝 共 ${total} 题</span>
          <span>✅ 正确 ${correct} 题</span>
          <span>❌ 错误 ${total - correct} 题</span>
        </div>
        ${wrongSummary ? `<div class="result-wrong-list"><h4>错题回顾</h4>${wrongSummary}</div>` : '<p style="color:#27ae60;text-align:center;margin-top:20px">🎉 全部正确！太棒了！</p>'}
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
        options: question.options,
        answer: question.answer,
        explanation: question.explanation || '',
        userAnswer,
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
      mode: 'retry'
    };

    this.switchView('practice');
    document.getElementById('practiceSetup').style.display = 'none';
    document.getElementById('practiceArea').style.display = 'block';
    document.getElementById('practiceResult').style.display = 'none';
    this.showQuestion();
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

    this.recognition.onerror = () => {
      alert('语音识别失败，请重试');
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

