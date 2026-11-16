// 主页面：三种玩法（随便按 / 找字母 / 拼单词）+ 跟我读（AI 评测、纠音）+ 每天限时
// 玩法和网页版 index.html 一样；手机上没有实体键盘，用屏幕键盘。
const G = require('../../utils/game');
const sound = require('../../utils/sound');
const stats = require('../../utils/stats');
const rec = require('../../utils/rec');
const { EVAL_PER_DAY, AUDIO_BASE } = require('../../config');

const empty = { pre: '', hl: '', post: '' };
let idx = {}, target = null, spell = null, cur = {}, busy = false, recBusy = false, timer = null, hintTimer = null, warned1 = false;

Page({
  data: {
    started: false, mode: 'free', upper: true, muted: false,
    letter: '', letterColor: '#7c6cf0', pic: '', parts: empty, cn: '', prompt: '', tiles: [],
    keys: G.keyRows(true, ''), down: '', stars: 0, pop: 0, shake: -1, // -1：页面一打开不摇
    mic: 'hide', result: null, timeLeft: '', low: false, resting: false, restText: '', noAudio: !AUDIO_BASE,
  },

  onShow() {
    clearInterval(timer);
    timer = setInterval(() => this.tick(), 1000);
    if (this.data.started) this.checkRest();
    this.showLeft();
  },
  onHide() { clearInterval(timer); stats.save(); sound.stop(); },
  onUnload() { clearInterval(timer); stats.save(); },

  // ---------- 开始 / 模式 ----------
  start() {
    this.setData({ started: true });
    this.checkRest();
    if (this.data.resting) return;
    this.freePress('A');
    setTimeout(() => { if (this.data.mode === 'free') sound.play(['zh_free']); }, 2600);
  },
  setMode(e) {
    if (recBusy || this.data.resting) return;
    const mode = e.currentTarget.dataset.mode;
    busy = false; clearTimeout(hintTimer); spell = null; target = null;
    this.setData({ mode, tiles: [], result: null });
    if (mode === 'find') this.newTarget();
    else if (mode === 'spell') this.newSpell();
    else {
      this.setData({ prompt: '🔊 点下面的任何字母吧！' }); this.freePress('A');
      setTimeout(() => { if (this.data.mode === 'free' && !recBusy) sound.play(['zh_free']); }, 2600); // 提示语也读出来
    }
  },
  toggleCase() {
    const upper = !this.data.upper;
    this.setData({ upper, keys: G.keyRows(upper, this.hintKey()) });
    if (spell) this.setData({ tiles: G.tiles(spell, upper) });
    else if (/^[A-Z]$/i.test(this.data.letter)) this.setData({ letter: upper ? this.data.letter.toUpperCase() : this.data.letter.toLowerCase() });
  },
  toggleMute() { const m = !this.data.muted; sound.setMuted(m); this.setData({ muted: m }); },
  goParent() { wx.navigateTo({ url: '/pages/parent/parent' }); },

  // ---------- 键盘 ----------
  tapKey(e) {
    const k = e.currentTarget.dataset.k;
    if (!this.data.started || this.data.resting || recBusy) return;
    this.setData({ down: k }); setTimeout(() => this.setData({ down: '' }), 150);
    if (/^[0-9]$/.test(k)) { if (this.data.mode === 'free') this.showNumber(+k); return; }
    stats.today().letters++;
    if (this.data.mode === 'free') this.freePress(k);
    else if (this.data.mode === 'find') this.findPress(k);
    else this.spellPress(k);
  },
  hintKey() { return spell && spell.pos < spell.upper.length ? spell.upper[spell.pos] : (this._hint || ''); },
  setHint(k) { this._hint = k; this.setData({ keys: G.keyRows(this.data.upper, this.hintKey()) }); },

  // ---------- 随便按 ----------
  freePress(L) {
    const list = G.DATA[L]; idx[L] = ((idx[L] == null ? -1 : idx[L]) + 1) % list.length;
    const [word, emoji, cn] = list[idx[L]];
    cur = { L, word, w: `w_${L}${idx[L]}` };
    this.setData({
      letter: this.data.upper ? L : L.toLowerCase(), letterColor: G.color(), pic: emoji, parts: G.split(word, L), cn,
      pop: this.data.pop + 1, result: null, mic: 'idle',
    });
    sound.play([`p_${L}${idx[L]}`]);
  },
  showNumber(n) {
    cur = { word: G.NUM_WORDS[n], w: `n_${n}` };
    this.setData({ letter: String(n), letterColor: G.color(), pic: n === 0 ? '🫙' : '⭐'.repeat(n), parts: { pre: G.NUM_WORDS[n], hl: '', post: '' }, cn: G.NUM_CN[n], pop: this.data.pop + 1, mic: 'hide', result: null });
    sound.play([`n_${n}`]);
  },

  // ---------- 找字母 ----------
  newTarget() {
    clearTimeout(hintTimer);
    target = G.pickTarget(target); cur = { L: target };
    this._hint = '';
    this.setData({ letter: this.data.upper ? target : target.toLowerCase(), letterColor: G.color(), pic: '❓', parts: empty, cn: '', prompt: '🔊 在键盘上找到这个字母！', pop: this.data.pop + 1, mic: 'hide', result: null, keys: G.keyRows(this.data.upper, '') });
    sound.play(['zh_find', `f_${target}`]);
    hintTimer = setTimeout(() => this.setHint(target), 8000); // 8 秒找不到就亮提示
  },
  findPress(L) {
    if (busy) return;
    if (L === target) {
      busy = true; clearTimeout(hintTimer); this._hint = '';
      const [word, emoji, cn] = G.DATA[L][0];
      cur = { L, word, w: `w_${L}0` };
      stats.today().finds++; stats.save();
      this.setData({ pic: emoji, parts: G.split(word, L), cn, prompt: '太棒啦！🎉', stars: this.data.stars + 1, keys: G.keyRows(this.data.upper, '') });
      sound.play(['zh_great', `g_${G.rand(G.PRAISE_N)}`, `p_${L}0`]);
      setTimeout(() => { busy = false; if (this.data.mode === 'find' && !this.data.resting) this.newTarget(); }, 3200);
    } else {
      this.setData({ shake: this.data.shake + 1 });
      sound.play([`l_${L}`, 'zh_try', `f_${target}`]);
      this.setHint(target);
    }
  },

  // ---------- 拼单词 ----------
  newSpell() {
    spell = G.pickSpell(spell && spell.clip);
    cur = { word: spell.word, w: spell.clip };
    this.setData({ letter: '', pic: spell.emoji, parts: empty, cn: spell.cn, prompt: '🔊 把这个单词敲出来！', tiles: G.tiles(spell, this.data.upper), keys: G.keyRows(this.data.upper, spell.upper[0]), pop: this.data.pop + 1, mic: 'idle', result: null });
    sound.play(['zh_spell', spell.clip]);
  },
  spellPress(L) {
    if (busy || !spell) return;
    const need = spell.upper[spell.pos];
    if (L !== need) { this.setData({ shake: this.data.shake + 1 }); sound.play([`l_${need}`]); return; }
    spell.pos++;
    this.setData({ tiles: G.tiles(spell, this.data.upper), keys: G.keyRows(this.data.upper, this.hintKey()) });
    if (spell.pos < spell.upper.length) { sound.play([`l_${L}`]); return; }
    busy = true;
    stats.today().words.push(spell.word); stats.save();
    this.setData({ prompt: '耶！🎉', stars: this.data.stars + 1, mic: 'hide' });
    sound.play(['zh_ye', spell.clip, spell.clip]);
    setTimeout(() => { busy = false; if (this.data.mode === 'spell' && !this.data.resting) this.newSpell(); }, 4200);
  },

  // ---------- 点一下重读 ----------
  tapLetter() {
    if (this.data.mode === 'find' && target && !busy) return sound.play(['zh_find', `f_${target}`]);
    if (cur.L) sound.play([`l_${cur.L}`]);
  },
  tapWord() { if (cur.w) sound.play([cur.w], 0.85); },
  tapTile(e) { sound.play([`l_${e.currentTarget.dataset.k}`]); },
  tapPrompt() {
    if (this.data.mode === 'find' && target) sound.play(['zh_find', `f_${target}`]);
    else if (this.data.mode === 'spell' && spell) sound.play(['zh_spell', spell.clip]);
    else sound.play(['zh_free']);
  },

  // ---------- 跟我读：示范 → 录 3 秒 → 放她读的 → AI 打分 → 纠音 ----------
  async followMe() {
    if (recBusy || !cur.w || !/^w_/.test(cur.w)) return;
    const t = stats.today();
    // 第一次用：告诉家长录音会发到腾讯云评测、不保存
    if (!wx.getStorageSync('abc_mic_ok')) {
      const ok = await new Promise(r => wx.showModal({
        title: '给家长的说明', confirmText: '同意', cancelText: '不用了',
        content: '「跟我读」会录下孩子读单词的 3 秒声音，发送到腾讯云口语评测打分，评完不保存录音，只在本机记分数。',
        success: x => r(x.confirm), fail: () => r(false),
      }));
      if (!ok) return;
      wx.setStorageSync('abc_mic_ok', 1);
    }
    if (!(await rec.ensureMic())) return;
    recBusy = true; busy = true;
    const word = cur.word, clip = cur.w;
    try {
      this.setData({ mic: 'busy', result: null });
      await sound.play(['zh_follow', clip], 0.85);
      await sound.play(['zh_yourturn']);
      this.setData({ mic: 'rec' });
      const path = await rec.record(3000);
      this.setData({ mic: 'busy' });
      t.reads++; stats.save();
      // 一边放她自己读的，一边去打分
      const canEval = (t.evals || []).length < EVAL_PER_DAY;
      const scoring = canEval ? rec.evaluate(path, word).catch(() => null) : Promise.resolve(null);
      await sound.play(['zh_hear']);
      await sound.playFile(path);
      const r = await scoring;
      await this.feedback(r, word, clip);
    } catch (e) {
      if (e && e.message === 'nomic') wx.showToast({ title: '没有麦克风权限', icon: 'none' });
    }
    recBusy = false; busy = false;
    this.setData({ mic: this.data.mode === 'find' || !cur.w || !/^w_/.test(cur.w) ? 'hide' : 'idle' });
  },
  async feedback(r, word, clip) {
    if (!r) { await sound.play([clip], 0.85); this.setData({ stars: this.data.stars + 1 }); return; } // 没配评测：再放一遍示范
    const t = stats.today();
    t.evals.push({ word, total: r.total, level: r.level, weak: r.weak ? (r.weak.letter || r.weak.phone) : '', t: Date.now() });
    stats.save();
    const starsN = r.level; // 0~3 颗
    const weakPart = r.weak ? G.splitPart(word, r.weak.letter) : empty;
    this.setData({ result: { level: r.level, starsTxt: '⭐'.repeat(starsN) + '☆'.repeat(3 - starsN), part: weakPart }, stars: this.data.stars + Math.max(1, starsN) });
    if (r.level === 0) return sound.play(['zh_noheard']);
    if (r.level === 3) return sound.play(['zh_score3']);
    await sound.play([r.level === 2 ? 'zh_score2' : 'zh_score1']);
    // 纠音：有对应字母就把那个字母标红，再慢慢放一遍示范
    if (weakPart.hl) await sound.play(['zh_listenpart']);
    await sound.play([clip], 0.75);
  },

  // ---------- 限时 ----------
  tick() {
    if (!this.data.started || this.data.resting) return;
    const t = stats.today(); t.sec++;
    if (t.sec % 10 === 0) stats.save();
    this.showLeft();
    const left = stats.allowSec() - t.sec;
    if (left === 60 && !warned1) { warned1 = true; sound.play(['zh_1min']); }
    if (left <= 0) this.goRest();
  },
  showLeft() {
    const left = stats.leftSec();
    this.setData({ timeLeft: `⏱ 还剩 ${Math.ceil(left / 60)} 分钟`, low: left <= 120 });
  },
  goRest() {
    if (this.data.resting) return;
    stats.save(); clearTimeout(hintTimer);
    const t = stats.today();
    this.setData({ resting: true, restText: `今天拼对 ${t.words.length} 个单词，按了 ${t.letters} 个字母，跟读 ${t.reads} 次 ⭐` });
    sound.play(G.restClips(t.words.length));
  },
  // 孩子不认字：点休息页任何地方再读一遍
  tapRest() { sound.play(G.restClips(stats.today().words.length)); },
  checkRest() {
    if (stats.leftSec() > 0) { if (this.data.resting) { warned1 = false; this.setData({ resting: false }); } }
    else this.goRest();
  },
});
