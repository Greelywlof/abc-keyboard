// 勋章规则测试：node tools/medals.test.js
'use strict';
const assert = require('assert');
const M = require('../medals');
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const day = o => Object.assign({ sec: 600, letters: 0, words: [], finds: 0, reads: 0, evals: [], seen: '' }, o);

// 每天的奖牌
ok(M.update(null, '2026-11-16', day({})).medal === null, '一点没玩：不发');
ok(M.update(null, '2026-11-16', day({ letters: 3 })).medal.id === 'bronze', '来玩了：铜牌');
ok(M.update(null, '2026-11-16', day({ words: ['Cat', 'Dog', 'Sun'] })).medal.id === 'silver', '拼对 3 个：银牌');
ok(M.update(null, '2026-11-16', day({ reads: 5 })).medal.id === 'silver', '跟读 5 次：银牌');
ok(M.update(null, '2026-11-16', day({ words: ['a', 'b', 'c', 'd', 'e', 'f'], reads: 6 })).medal.id === 'gold', '拼对 6 个 + 跟读 6 次：金牌');

// 徽章只发一次
let r = M.update(null, '2026-11-16', day({ words: ['Cat'], letters: 3, reads: 2, evals: [{ level: 3, total: 95 }, { level: 2, total: 88 }, { level: 3, total: 97 }] }));
const ids = r.newBadges.map(b => b.id);
ok(ids.includes('first_word') && ids.includes('first_3star') && ids.includes('avg90'), '第一次拼对、第一次三颗星、平均 93 分');
r = M.update(r.archive, '2026-11-16', day({ words: ['Cat', 'Dog'], letters: 5, reads: 3 }));
ok(!r.newBadges.some(b => b.id === 'first_word'), '同一天再更新不重复发徽章');
ok(Object.keys(r.archive.days).length === 1 && r.archive.days['2026-11-16'].w === 2, '同一天只保留一条最新小结');

// 连续天数和学会的单词
let a = null;
['2026-11-14', '2026-11-15', '2026-11-16'].forEach((k, i) => { a = M.update(a, k, day({ words: [`W${i}`, 'Cat'], letters: 1, seen: 'ABC' })).archive; });
const t = M.totals(a);
ok(a.badges.streak3 === '2026-11-16', '连续 3 天的徽章在第 3 天发');
ok(t.learned === 4 && a.learned.Cat === 3, '学会 4 个不同单词，Cat 拼对过 3 天');
ok(t.days === 3 && t.totalWords === 6 && t.medals.bronze === 3, '总计：3 天、6 个词次、3 枚铜牌');
ok(M.update(a, '2026-11-18', day({ letters: 1 })).archive && M.streakOf(a.days, '2026-11-18') === 1, '中间断一天，连续天数重新算');

// 26 个字母全按过
r = M.update(null, '2026-11-16', day({ letters: 26, seen: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' }));
ok(r.newBadges.some(b => b.id === 'abc'), '26 个字母都按过');

console.log(`勋章规则：${pass} 项全部通过`);
