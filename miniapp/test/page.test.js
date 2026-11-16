// 在电脑上用 node 模拟微信接口，跑一遍主页面和家长页的流程（不需要开发者工具）。node miniapp/test/page.test.js
'use strict';
const assert = require('assert');
const path = require('path');
const MP = path.join(__dirname, '..', 'miniprogram');

let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------- 假的微信接口 ----------
const storage = {}, played = [];
let recResult = 'temp.mp3', evalReply = null, modalConfirm = true, cloudCalls = [];
const audioCtx = () => {
  const h = { ended: [], error: [], stop: [] };
  const fire = k => h[k].slice().forEach(f => f());
  return {
    src: '', playbackRate: 1,
    play() { played.push(this.src.replace(/^.*\//, '').replace('.mp3', '')); setTimeout(() => fire('ended'), 1); },
    stop() { fire('stop'); },
    onEnded: f => h.ended.push(f), offEnded: f => { h.ended = h.ended.filter(x => x !== f); },
    onError: f => h.error.push(f), offError: f => { h.error = h.error.filter(x => x !== f); },
    onStop: f => h.stop.push(f), offStop: f => { h.stop = h.stop.filter(x => x !== f); },
  };
};
let recStop = null;
global.wx = {
  getStorageSync: k => storage[k], setStorageSync: (k, v) => { storage[k] = JSON.parse(JSON.stringify(v)); },
  createInnerAudioContext: audioCtx, setInnerAudioOption() {},
  getRecorderManager: () => ({ onStop: f => { recStop = f; }, onError() {}, start: o => setTimeout(() => recStop({ tempFilePath: recResult, duration: o.duration }), 5) }),
  getSetting: o => o.success({ authSetting: {} }), authorize: o => o.success(),
  showModal: o => o.success({ confirm: modalConfirm }), showToast() {}, navigateTo() {},
  getFileSystemManager: () => ({ readFile: o => o.success({ data: Buffer.alloc(3000).toString('base64') }) }),
  cloud: { init() {}, callFunction: async o => { cloudCalls.push(o); return { result: evalReply }; } },
};
let pageDef = null;
global.Page = def => { pageDef = def; };
function mount() {
  const p = Object.assign({}, pageDef);
  p.data = JSON.parse(JSON.stringify(pageDef.data));
  p.setData = function (d) { Object.assign(this.data, d); };
  return p;
}

// 配好发音地址（真实是云存储前缀）
const config = require(path.join(MP, 'config'));
config.AUDIO_BASE = 'cloud://env/audio/';

(async () => {
  require(path.join(MP, 'pages/index/index'));
  const P = mount();
  P.onShow();
  const tap = k => P.tapKey({ currentTarget: { dataset: { k } } });

  // 1. 开始：随便按出 A，读整句
  P.start(); await wait(20);
  ok(P.data.started && P.data.letter === 'A' && played.includes('p_A0'), '开始后出现 A 并读 p_A0');
  ok(P.data.mic === 'idle', '随便按有跟读按钮');
  tap('B'); await wait(10);
  ok(P.data.letter === 'B' && P.data.parts.hl === 'B' && played.includes('p_B0'), '按 B 显示 Ball 并读');
  tap('B'); await wait(10);
  ok(played.includes('p_B1'), '再按 B 换第二个单词');
  tap('3'); await wait(10);
  ok(P.data.pic === '⭐⭐⭐' && P.data.mic === 'hide', '数字 3 出三颗星，不显示跟读');

  // 2. 拼单词：敲完整个词计入统计、读「耶」
  P.setMode({ currentTarget: { dataset: { mode: 'spell' } } }); await wait(10);
  const word = P.data.tiles.map(t => t.key).join('');
  ok(word.length >= 2 && P.data.keys.flat().find(k => k.hint).k === word[0], '拼单词：第一个字母的键亮着');
  tap(word[0] === 'Z' ? 'Q' : 'Z'); await wait(10);
  ok(P.data.tiles[0].cls === 'now', '敲错不前进');
  played.length = 0;
  for (const c of word) { tap(c); await wait(5); }
  await wait(20);
  const today = storage.abc_stats[Object.keys(storage.abc_stats)[0]];
  ok(today.words.length === 1 && today.words[0].toUpperCase() === word, '拼对的单词记进统计');
  ok(played.includes('zh_ye'), '拼完说「耶」');

  // 3. 找字母：按错提示，按对加星
  await wait(4300); // 等拼单词自动换下一个结束
  P.setMode({ currentTarget: { dataset: { mode: 'find' } } }); await wait(10);
  const t = P.data.letter.toUpperCase();
  ok(P.data.mic === 'hide' && played.includes(`f_${t}`), '找字母出题并读题');
  tap(t === 'Q' ? 'W' : 'Q'); await wait(10);
  ok(P.data.keys.flat().find(k => k.hint).k === t, '按错后亮提示键');
  const s0 = P.data.stars; tap(t); await wait(10);
  ok(P.data.stars === s0 + 1 && P.data.prompt.includes('太棒'), '按对加星');

  // 4. 跟我读：第一次弹家长说明；评测 2 档并标出要练的字母
  await wait(3300);
  P.setMode({ currentTarget: { dataset: { mode: 'free' } } }); await wait(10);
  tap('A'); await wait(10); // A → Ant
  evalReply = { ok: true, data: { level: 2, total: 68, weak: { phone: 'ae', letter: 'a' } } };
  played.length = 0;
  await P.followMe();
  ok(storage.abc_mic_ok === 1, '家长同意说明后记住');
  ok(cloudCalls.length === 1 && cloudCalls[0].name === 'soe' && cloudCalls[0].data.word === P.data.parts.pre + P.data.parts.hl + P.data.parts.post, '录音交给云函数 soe 评测');
  ok(P.data.result.level === 2 && P.data.result.part.hl.toLowerCase() === 'a', '2 档并标出要练的字母 a');
  ok(['zh_follow', 'zh_yourturn', 'zh_hear', 'temp', 'zh_score2', 'zh_listenpart'].every(x => played.includes(x)), '示范 → 该你读 → 回放 → 鼓励 → 纠音 的顺序都放了');
  ok(P.data.mic === 'idle', '跟读完按钮恢复');

  // 5. 读得很好：3 档，不挑毛病
  evalReply = { ok: true, data: { level: 3, total: 91, weak: null } };
  played.length = 0; await P.followMe();
  ok(P.data.result.starsTxt === '⭐⭐⭐' && played.includes('zh_score3') && !played.includes('zh_listenpart'), '3 档只表扬');

  // 6. 没配评测（云函数报错）：退回只放示范，不出分数
  evalReply = { ok: false, error: '评测还没配置' };
  P.setData({ result: null }); played.length = 0; await P.followMe();
  ok(P.data.result === null && played.filter(x => /^w_/.test(x)).length >= 2, '没配评测时再放一遍示范');

  // 7. 家长页：答题门槛、统计
  require(path.join(MP, 'pages/parent/parent'));
  const Q = mount(); Q.onLoad();
  Q.input({ detail: { value: '1' } }); Q.check();
  ok(!Q.data.ok && Q.data.wrong, '答错进不去');
  Q.input({ detail: { value: String(Q.answer) } }); Q.check();
  ok(Q.data.ok && Q.data.cards[0].n === 1, '答对进入，显示拼对 1 个单词');
  ok(Q.data.evals.length === 2 && Q.data.cards.find(c => c.s === '跟读平均分').n === 80, '跟读评测 2 条，平均分 (68+91)/2≈80');
  ok(Q.data.bars.length === 7 && Q.data.bars[6].n === 1, '7 天柱状图，今天 1');

  // 8. 限时：剩 1 分钟提醒，到点休息，家长加时间后恢复
  require(path.join(MP, 'pages/index/index')); // 已加载过，重新挂一个实例看时间
  const st = storage.abc_stats; const k = Object.keys(st)[0];
  const stats = require(path.join(MP, 'utils/stats'));
  stats.today().sec = stats.allowSec() - 61; played.length = 0;
  P.tick();
  ok(played.includes('zh_1min'), '剩 1 分钟语音提醒');
  stats.today().sec = stats.allowSec() - 1; P.tick(); await wait(5);
  await wait(20);
  ok(P.data.resting && ['zh_rest', 'zh_today', 'zh_n_1', 'zh_words_end'].every(x => played.includes(x)), '到点出现休息页，并读出「今天你拼对了一个单词」');
  played.length = 0; P.tapRest(); await wait(20);
  ok(played.includes('zh_n_1'), '点休息页再读一遍');
  const before = stats.today().letters; tap('C');
  ok(stats.today().letters === before, '休息时按键无效');
  Q.plus5(); P.checkRest();
  ok(!P.data.resting, '家长加 5 分钟后恢复');
  ok(k, '统计按日期存');

  P.onUnload();
  console.log(`小程序页面流程：${pass} 项全部通过`);
  process.exit(0);
})().catch(e => { console.error('失败：', e.message); process.exit(1); });
