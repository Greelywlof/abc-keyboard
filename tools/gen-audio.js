// 用 MiniMax 语音合成（t2a_v2）一次性生成网页里要用的全部发音，存到 audio/*.mp3。
// 网页只播放这些 mp3，不直接调 MiniMax —— 这样 API Key 不会出现在网页和 GitHub 上。
//
// 用法：
//   node tools/gen-audio.js voices          列出账号可用的英文音色
//   node tools/gen-audio.js [--force]       生成全部（已存在的跳过，--force 全部重做）
// Key：环境变量 MINIMAX_API_KEY，或项目根目录 .minimax-key 文件（已在 .gitignore 里）。
// 可选：MINIMAX_VOICE 指定音色，MINIMAX_TTS_MODEL 指定模型。
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'audio');
const keyFile = path.join(ROOT, '.minimax-key');
if (!process.env.MINIMAX_API_KEY && fs.existsSync(keyFile)) process.env.MINIMAX_API_KEY = (fs.readFileSync(keyFile, 'utf8').replace(/^﻿/, '').split(/\r?\n/).map(s => s.trim()).find(s => s && !s.startsWith('#')) || '');
const KEY = process.env.MINIMAX_API_KEY;
if (!KEY) { console.log('没找到 MiniMax Key：设环境变量 MINIMAX_API_KEY，或放到 .minimax-key'); process.exit(1); }

const BASES = ['https://api.minimaxi.com', 'https://api.minimax.chat'];
const MODEL = process.env.MINIMAX_TTS_MODEL || 'speech-2.8-turbo';
const VOICE = process.env.MINIMAX_VOICE || 'English_radiant_girl';
const SPEED = 0.85; // 给 4 岁小朋友，稍慢一点

function postOnce(url, body, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = https.request(url, { method: 'POST', timeout, headers: { 'Content-Type': 'application/json', 'Content-Length': data.length, Authorization: `Bearer ${KEY}` } }, res => {
      const bufs = []; res.on('data', b => bufs.push(b));
      res.on('end', () => { let j = {}; try { j = JSON.parse(Buffer.concat(bufs).toString('utf8')); } catch (e) {} resolve({ status: res.statusCode, json: j }); });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(data);
  });
}
async function post(p, body) {
  let last;
  for (const base of BASES) {
    let r; try { r = await postOnce(base + p, body); } catch (e) { last = e; continue; }
    const br = r.json.base_resp || {};
    const code = Number(br.status_code ?? (r.status === 200 ? 0 : r.status));
    if (code !== 0) { const e = new Error(`MiniMax ${code}: ${br.status_msg || r.status}`); e.code = code; throw e; }
    return r.json;
  }
  throw last || new Error('连不上 MiniMax');
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const VOICE_ZH = process.env.MINIMAX_VOICE_ZH || 'female-tianmei';
async function synth(text, zh) {
  for (let i = 0; i < 4; i++) {
    try {
      const j = await post('/v1/t2a_v2', {
        model: MODEL, text, stream: false, language_boost: zh ? 'Chinese' : 'English', output_format: 'hex',
        voice_setting: { voice_id: zh ? VOICE_ZH : VOICE, speed: SPEED, vol: 1, pitch: 0 },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
      });
      return Buffer.from(j.data.audio, 'hex');
    } catch (e) {
      if (e.code === 1002 || e.code === 1039) { await sleep(3000 * (i + 1)); continue; } // 限流就等等再试
      throw e;
    }
  }
  throw new Error('一直被限流：' + text);
}

// ---- 要生成的句子：和 index.html 里的 DATA 保持一致 ----
const DATA = require('./words.json');
const NUM = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const PRAISE = ['Great job!', 'Well done!', 'Yay!', 'Super!', 'You did it!', 'Awesome!'];

function clips() {
  const c = {};
  for (const L of Object.keys(DATA)) {
    c[`l_${L}`] = `${L}.`;                                  // 只读字母
    c[`f_${L}`] = `Can you find ${L}?`;                     // 找字母的题目
    DATA[L].forEach(([word], i) => {
      c[`w_${L}${i}`] = `${word}.`;                         // 只读单词
      c[`p_${L}${i}`] = `${L}! ${L} is for ${word}.`;       // 按键时读的整句
    });
  }
  NUM.forEach((n, i) => { c[`n_${i}`] = `${n}.`; });
  PRAISE.forEach((t, i) => { c[`g_${i}`] = t; });
  c.miss = 'Oops! Try again.';
  // 中文提示：孩子还不认字，屏幕上的中文提示都要能听到（文件名 zh_ 开头用中文音色）
  c.zh_free = '按键盘上的任何一个字母吧！';
  c.zh_find = '找一找，这个字母在哪里？';
  c.zh_try = '不对哦，看看亮起来的那个键！';
  c.zh_great = '太棒啦！';
  c.zh_spell = '跟着屏幕，把这个单词一个一个敲出来！';
  c.zh_ye = '耶！';
  c.zh_follow = '听一听，跟我读！';
  c.zh_yourturn = '该你读啦！';
  c.zh_hear = '听听你读的。';
  c.zh_1min = '还可以玩一分钟哦！';
  c.zh_rest = '今天的时间用完啦，让小眼睛休息一下，明天再来玩吧！';
  return c;
}

(async () => {
  if (process.argv[2] === 'voices') {
    const j = await post('/v1/get_voice', { voice_type: 'system' });
    (j.system_voice || []).filter(v => /english|en_/i.test(v.voice_id)).forEach(v => console.log(v.voice_id, '|', v.voice_name, '|', [].concat(v.description || []).join(' ')));
    return;
  }
  const force = process.argv.includes('--force');
  fs.mkdirSync(OUT, { recursive: true });
  const all = Object.entries(clips());
  let made = 0, skipped = 0;
  for (const [name, text] of all) {
    const f = path.join(OUT, name + '.mp3');
    if (!force && fs.existsSync(f)) { skipped++; continue; }
    fs.writeFileSync(f, await synth(text, name.startsWith('zh_')));
    made++; process.stdout.write(`\r${made + skipped}/${all.length} ${name}            `);
  }
  console.log(`\n完成：新生成 ${made} 个，跳过 ${skipped} 个。音色 ${VOICE}，模型 ${MODEL}`);
})().catch(e => { console.error('\n出错：', e.message); process.exit(1); });
