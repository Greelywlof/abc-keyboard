// 家长页：先答一道乘法题（4 岁孩子打不开）→ 今天的统计、最近 7 天、每天时长、最近的跟读评测
const stats = require('../../utils/stats');
const { EVAL_PER_DAY } = require('../../config');

Page({
  data: { q: '', ok: false, ans: '', wrong: false, cards: [], words: '', bars: [], limit: 15, limits: [5, 10, 15, 20, 30], extra: 0, evals: [], evalLeft: 0 },
  onLoad() {
    const a = 3 + Math.floor(Math.random() * 7), b = 3 + Math.floor(Math.random() * 7);
    this.answer = a * b;
    this.setData({ q: `${a} × ${b} = ?` });
  },
  input(e) { this.setData({ ans: e.detail.value, wrong: false }); },
  check() {
    if (+this.data.ans === this.answer) { this.setData({ ok: true }); this.render(); }
    else this.setData({ ans: '', wrong: true });
  },
  render() {
    const t = stats.today();
    const avg = t.evals.length ? Math.round(t.evals.reduce((s, e) => s + e.total, 0) / t.evals.length) : '-';
    const cards = [
      [t.words.length, '拼对的单词'], [t.letters, '按的字母'], [t.finds, '找对的字母'],
      [t.reads, '跟读次数'], [avg, '跟读平均分'], [Math.floor(t.sec / 60), `已玩分钟（共 ${stats.limitMin() + t.extra}）`],
    ].map(([n, s]) => ({ n, s }));
    const uniq = [...new Set(t.words)];
    const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
    const vals = days.map(d => { const x = stats.day(stats.dayKey(d)); return x ? x.words.length : 0; });
    const max = Math.max(1, ...vals);
    const bars = days.map((d, i) => ({ n: vals[i], h: Math.round(vals[i] / max * 100), label: i === 6 ? '今天' : `${d.getMonth() + 1}/${d.getDate()}`, today: i === 6 }));
    const evals = t.evals.slice(-20).reverse().map(e => {
      const d = new Date(e.t);
      return { word: e.word, total: e.total, stars: '⭐'.repeat(e.level) || '没听清', weak: e.weak, time: `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` };
    });
    // 成长档案
    stats.save();
    const M = stats.Medals, a = stats.getArchive(), A = M.totals(a), streak = M.streakOf(a.days, stats.dayKey());
    const aCards = [
      [A.days, '玩过的天数'], [`${A.learned}/52`, '学会的单词'], [A.totalWords, '一共拼对'], [A.reads, '一共跟读'],
      [A.avg || '-', '跟读平均分'], [`${streak} / ${A.streakBest}`, '连续 / 最长天数'],
      [`🥇${A.medals.gold} 🥈${A.medals.silver} 🥉${A.medals.bronze}`, '奖牌'], [A.minutes, '一共玩了几分钟'],
    ].map(([n, s]) => ({ n, s }));
    const badges = M.BADGES.map(b => ({ e: b.emoji, n: b.name, d: a.badges[b.id] ? a.badges[b.id].slice(5) : '' }));
    const ME = { gold: '🥇', silver: '🥈', bronze: '🥉' };
    const cal = [...Array(30)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (29 - i)); const x = a.days[stats.dayKey(d)]; return { day: d.getDate(), m: x ? (ME[x.m] || '·') : '' }; });
    const emoji = {}; Object.values(require('../../utils/words')).forEach(list => list.forEach(([w, e]) => { emoji[w] = e; }));
    const learned = Object.keys(a.learned || {}).sort((x, y) => a.learned[y] - a.learned[x]).map(w => ({ w, e: emoji[w] || '', n: a.learned[w] }));
    this.setData({
      aCards, badges, cal, learned,
      cards, words: uniq.length ? `今天拼过：${uniq.join('、')}` : '今天还没有拼单词。', bars,
      limit: stats.limitMin(), extra: t.extra, evals, evalLeft: Math.max(0, EVAL_PER_DAY - t.evals.length),
    });
  },
  setLimit(e) { stats.setLimit(+e.currentTarget.dataset.m); this.render(); },
  plus5() { stats.today().extra += 5; stats.save(); this.render(); wx.showToast({ title: '今天加了 5 分钟', icon: 'none' }); },
});
