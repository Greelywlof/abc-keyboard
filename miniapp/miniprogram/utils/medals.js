// 由 tools/sync-words.js 从仓库根目录 medals.js 复制，不要手改
// 勋章和成长档案（网页 index.html 和小程序共用；改完运行 node tools/sync-words.js 同步到小程序）
// 原则：只要来玩就有奖，只鼓励不批评；档案每天一条小结，长期保存（每天几十字节）。
(function (root) {
  'use strict';

  // 每天一枚：休息时按今天的表现颁发
  const DAILY = [
    { id: 'gold', emoji: '🥇', name: '金牌', clip: 'zh_medal_gold', ok: d => d.words >= 6 && d.reads >= 6 },
    { id: 'silver', emoji: '🥈', name: '银牌', clip: 'zh_medal_silver', ok: d => d.words >= 3 || d.reads >= 5 },
    { id: 'bronze', emoji: '🥉', name: '铜牌', clip: 'zh_medal_bronze', ok: d => d.letters > 0 || d.words > 0 || d.reads > 0 || d.finds > 0 },
  ];

  // 收集徽章：每个只拿一次
  const BADGES = [
    { id: 'first_word', emoji: '🌟', name: '第一次拼对单词', ok: a => a.totalWords >= 1 },
    { id: 'first_3star', emoji: '🎤', name: '第一次读到三颗星', ok: a => a.best3 >= 1 },
    { id: 'words10', emoji: '📗', name: '学会 10 个单词', ok: a => a.learned >= 10 },
    { id: 'words26', emoji: '📘', name: '学会 26 个单词', ok: a => a.learned >= 26 },
    { id: 'words52', emoji: '📚', name: '学会全部 52 个单词', ok: a => a.learned >= 52 },
    { id: 'abc', emoji: '🔤', name: '26 个字母全按过', ok: a => a.lettersSeen.length >= 26 },
    { id: 'streak3', emoji: '🔥', name: '连续来玩 3 天', ok: a => a.streak >= 3 },
    { id: 'streak7', emoji: '🏆', name: '连续来玩 7 天', ok: a => a.streak >= 7 },
    { id: 'avg90', emoji: '💯', name: '一天跟读平均 90 分', ok: a => a.bestAvg >= 90 },
  ];

  function blank() {
    return { v: 1, days: {}, learned: {}, lettersSeen: '', badges: {}, best3: 0, bestAvg: 0, streakBest: 0 };
  }

  // 今天的统计 → 一条小结
  function summarize(day) {
    const evals = day.evals || [];
    const scored = evals.filter(e => e.level > 0);
    const avg = scored.length ? Math.round(scored.reduce((s, e) => s + e.total, 0) / scored.length) : 0;
    return {
      words: (day.words || []).length, uniq: [...new Set(day.words || [])], letters: day.letters || 0, finds: day.finds || 0,
      reads: day.reads || 0, evals: evals.length, avg, best: evals.reduce((m, e) => Math.max(m, e.level || 0), 0),
      min: Math.floor((day.sec || 0) / 60),
    };
  }

  function dailyMedal(s) { return DAILY.find(m => m.ok(s)) || null; }

  // 连续天数：从 today 往前数，有记录的日子连着
  function streakOf(days, todayKey) {
    let n = 0; const d = new Date(todayKey + 'T12:00:00');
    while (days[key(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  const pad = n => String(n).padStart(2, '0');
  const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // 用今天的统计更新档案；返回 { medal, newBadges, summary }。同一天反复调用只会覆盖当天小结，徽章不会重复发
  function update(archive, todayKey, day) {
    const a = archive || blank();
    const s = summarize(day);
    const played = s.letters || s.words || s.reads || s.finds;
    if (!played) return { archive: a, medal: null, newBadges: [], summary: s };
    const medal = dailyMedal(s);
    a.days[todayKey] = { m: medal ? medal.id : '', w: s.words, r: s.reads, l: s.letters, f: s.finds, a: s.avg, t: s.min };
    // learned：每个词拼对过几天（按天记去重列表再汇总，同一天反复更新不会重复算）
    a.wordDays = a.wordDays || {}; a.wordDays[todayKey] = s.uniq;
    a.learned = {};
    Object.values(a.wordDays).forEach(list => list.forEach(w => { a.learned[w] = (a.learned[w] || 0) + 1; }));
    const seen = new Set((a.lettersSeen || '').split(''));
    (day.seen || '').split('').forEach(c => c && seen.add(c));
    a.lettersSeen = [...seen].sort().join('');
    if (s.best >= 3) a.best3 = 1; // 读到过三颗星
    if (s.evals >= 3) a.bestAvg = Math.max(a.bestAvg || 0, s.avg);
    const streak = streakOf(a.days, todayKey);
    a.streakBest = Math.max(a.streakBest || 0, streak);
    const stat = totals(a); stat.streak = streak;
    const newBadges = [];
    BADGES.forEach(b => { if (!a.badges[b.id] && b.ok(stat)) { a.badges[b.id] = todayKey; newBadges.push(b); } });
    return { archive: a, medal, newBadges, summary: s };
  }

  // 档案总计（家长页用）
  function totals(a) {
    const days = Object.values(a.days || {});
    const medals = { gold: 0, silver: 0, bronze: 0 };
    days.forEach(d => { if (medals[d.m] != null) medals[d.m]++; });
    const avgs = days.filter(d => d.a > 0).map(d => d.a);
    return {
      days: days.length, totalWords: days.reduce((s, d) => s + d.w, 0), learned: Object.keys(a.learned || {}).length,
      reads: days.reduce((s, d) => s + d.r, 0), minutes: days.reduce((s, d) => s + (d.t || 0), 0),
      avg: avgs.length ? Math.round(avgs.reduce((s, x) => s + x, 0) / avgs.length) : 0,
      medals, lettersSeen: a.lettersSeen || '', best3: a.best3 || 0, bestAvg: a.bestAvg || 0, streakBest: a.streakBest || 0,
      streak: 0,
    };
  }

  const Medals = { DAILY, BADGES, blank, summarize, dailyMedal, update, totals, streakOf, key };
  if (typeof module !== 'undefined' && module.exports) module.exports = Medals;
  else root.Medals = Medals;
})(this);
