// 玩法里不依赖微信 API 的部分，方便在电脑上用 node 测试
const DATA = require('./words');

const LETTERS = Object.keys(DATA);
const COLORS = ['#ff6b6b', '#ff9f43', '#f7b731', '#26de81', '#2bcbba', '#45aaf2', '#4b7bec', '#a55eea', '#fd79a8'];
const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const NUM_CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const PRAISE_N = 6; // g_0 ~ g_5

// 拼单词只用纯字母、不太长的词
const SPELL = [];
LETTERS.forEach(L => DATA[L].forEach(([w], i) => { if (/^[A-Za-z]+$/.test(w) && w.length <= 6) SPELL.push({ L, i }); }));

const rand = n => Math.floor(Math.random() * n);
const color = () => COLORS[rand(COLORS.length)];

// 把单词拆成「前 / 高亮 / 后」三段，高亮这个字母（X 在 Fox 里是结尾）
function split(word, L) {
  const i = word.toUpperCase().indexOf(L);
  if (i < 0) return { pre: word, hl: '', post: '' };
  return { pre: word.slice(0, i), hl: word[i], post: word.slice(i + 1) };
}
// 纠音时高亮：letter 是评测给的字母（可能为空或多个字母），找不到就不高亮
function splitPart(word, letter) {
  const l = String(letter || '').toLowerCase();
  const i = l ? word.toLowerCase().indexOf(l) : -1;
  if (i < 0) return { pre: word, hl: '', post: '' };
  return { pre: word.slice(0, i), hl: word.slice(i, i + l.length), post: word.slice(i + l.length) };
}

function pickTarget(prev) { let t; do { t = LETTERS[rand(26)]; } while (t === prev); return t; }
function pickSpell(prevClip) {
  let p; do { p = SPELL[rand(SPELL.length)]; } while (SPELL.length > 1 && `w_${p.L}${p.i}` === prevClip);
  const [word, emoji, cn] = DATA[p.L][p.i];
  return { word, upper: word.toUpperCase(), emoji, cn, clip: `w_${p.L}${p.i}`, pos: 0, color: color() };
}
function tiles(sp, upper) {
  return [...sp.upper].map((c, i) => ({
    c: upper ? c : c.toLowerCase(), key: c,
    cls: i < sp.pos ? 'done' : i === sp.pos ? 'now' : '',
    bg: i < sp.pos ? sp.color : '',
  }));
}
function keyRows(upper, hintKey) {
  return ROWS.map(r => [...r].map(k => ({ k, label: upper ? k : k.toLowerCase(), hint: k === hintKey })));
}

// 休息页读的话：「时间用完啦…」+「今天你拼对了 N 个单词，真棒！」（没拼单词就只读第一句）
function restClips(n) {
  if (!n) return ['zh_rest'];
  return ['zh_rest', 'zh_today', n <= 50 ? `zh_n_${n}` : 'zh_many', 'zh_words_end'];
}

module.exports = { restClips, DATA, LETTERS, SPELL, NUM_WORDS, NUM_CN, PRAISE_N, color, rand, split, splitPart, pickTarget, pickSpell, tiles, keyRows };
