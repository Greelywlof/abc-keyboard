// 给家长挑音色用：每个候选音色录一小段样音（中文提示 / 英文读音），输出到指定文件夹
// 用法：node tools/voice-samples.js <输出文件夹>
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2];
const key = fs.readFileSync(path.join(ROOT, '.minimax-key'), 'utf8').replace(/^﻿/, '').split(/\r?\n/).map(s => s.trim()).find(s => s && !s.startsWith('#'));

const ZH = [
  ['female-tianmei', '现在的中文'], ['Chinese (Mandarin)_Gentle_Senior', '温柔学姐'], ['Chinese (Mandarin)_News_Anchor', '新闻女声'],
  ['Chinese (Mandarin)_Wise_Women', '阅历姐姐'], ['female-chengshu', '成熟女性'], ['Chinese (Mandarin)_Warm_Bestie', '温暖闺蜜'],
];
const EN = [
  ['Sweet_Girl', '现在的英文'], ['Serene_Woman', 'Serene Woman'], ['Charming_Lady', 'Charming Lady'], ['English_Graceful_Lady', '英式优雅女士'],
];
const ZH_TEXT = '听一听，跟我读！很不错，再读清楚一点就更好啦。';
const EN_TEXT = 'A! A is for Apple. Can you find B?';

function synth(voice, text, lang) {
  const body = JSON.stringify({
    model: 'speech-2.8-turbo', text, stream: false, output_format: 'hex', language_boost: lang,
    voice_setting: { voice_id: voice, speed: 0.85, vol: 1, pitch: 0 },
    audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
  });
  return new Promise((resolve, reject) => {
    const req = https.request('https://api.minimaxi.com/v1/t2a_v2', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Authorization: 'Bearer ' + key } }, res => {
      let s = ''; res.on('data', d => s += d); res.on('end', () => {
        try { const j = JSON.parse(s); if (j.base_resp && j.base_resp.status_code) return reject(new Error(j.base_resp.status_msg)); resolve(Buffer.from(j.data.audio, 'hex')); }
        catch (e) { reject(new Error(s.slice(0, 100))); }
      });
    });
    req.on('error', reject); req.end(body);
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let n = 0;
  for (const [v, name] of ZH) { try { fs.writeFileSync(path.join(OUT, `中文${++n}-${name}.mp3`), await synth(v, ZH_TEXT, 'Chinese')); console.log('✓', name); } catch (e) { console.log('✗', name, e.message); } }
  n = 0;
  for (const [v, name] of EN) { try { fs.writeFileSync(path.join(OUT, `英文${++n}-${name}.mp3`), await synth(v, EN_TEXT, 'English')); console.log('✓', name); } catch (e) { console.log('✗', name, e.message); } }
})();
