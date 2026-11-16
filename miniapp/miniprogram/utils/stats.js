// 每日统计 + 限时，存在手机本地（wx storage）。结构和网页版一样：
// { "2026-11-16": { sec, letters, words:[], finds, reads, extra, evals:[{word,total,level,t}] } }
const KEY = 'abc_stats', LIMIT_KEY = 'abc_limit';

const pad = n => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

let stats = null;
function load() {
  if (!stats) { try { stats = wx.getStorageSync(KEY) || {}; } catch (e) { stats = {}; } }
  return stats;
}
function today() {
  const s = load(), k = dayKey();
  if (!s[k]) s[k] = { sec: 0, letters: 0, words: [], finds: 0, reads: 0, extra: 0, evals: [] };
  if (!s[k].evals) s[k].evals = [];
  return s[k];
}
function day(k) { return load()[k] || null; }
function save() {
  const s = load();
  const keys = Object.keys(s).sort();
  while (keys.length > 60) delete s[keys.shift()]; // 只留 60 天
  try { wx.setStorageSync(KEY, s); } catch (e) { /* 存不下就算了 */ }
}
function limitMin() { try { return wx.getStorageSync(LIMIT_KEY) || 15; } catch (e) { return 15; } }
function setLimit(m) { try { wx.setStorageSync(LIMIT_KEY, m); } catch (e) {} }
const allowSec = () => (limitMin() + today().extra) * 60;
const leftSec = () => Math.max(0, allowSec() - today().sec);

// 成长档案：每天一条小结 + 学会的单词 + 徽章，长期保存（规则在 utils/medals.js，和网页共用）
const Medals = require('./medals');
let archive = null;
function getArchive() {
  if (!archive) { try { archive = wx.getStorageSync('abc_archive') || Medals.blank(); } catch (e) { archive = Medals.blank(); } }
  return archive;
}
// 用今天的统计更新档案，返回 { medal, summary, archive }
function updateArchive() {
  const r = Medals.update(getArchive(), dayKey(), today());
  archive = r.archive;
  try { wx.setStorageSync('abc_archive', archive); } catch (e) {}
  return r;
}
const _save = save;
function saveAll() { _save(); updateArchive(); }

module.exports = { dayKey, today, day, save: saveAll, limitMin, setLimit, allowSec, leftSec, getArchive, updateArchive, Medals };
