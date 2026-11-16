// 做「一群小朋友一起喊耶」的音效：用 MiniMax 的几个不同声音分别喊「耶！」，错开几十毫秒、音高略有不同，再用 ffmpeg 叠在一起。
// 输出 audio/zh_ye_crowd.mp3。用法：node tools/make-crowd-ye.js（需要 .minimax-key 和 ffmpeg）
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const key = fs.readFileSync(path.join(ROOT, '.minimax-key'), 'utf8').replace(/^﻿/, '').split(/\r?\n/).map(s => s.trim()).find(s => s && !s.startsWith('#'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ye-'));

// 声音、语气、错开的毫秒、音量
const VOICES = [
  ['lovely_girl', '耶！', 0, 1.0],
  ['cute_boy', '耶——！', 40, 0.9],
  ['clever_boy', '耶！', 90, 0.85],
  ['female-shaonv', '耶！', 25, 0.8],
  ['Chinese (Mandarin)_Crisp_Girl', '耶！！', 120, 0.8],
  ['Sweet_Girl', 'Yay!', 60, 0.75],
  ['Chinese (Mandarin)_Warm_Girl', '耶！', 150, 0.7],
];

function synth(voice, text) {
  const body = JSON.stringify({
    model: 'speech-2.8-turbo', text, stream: false, output_format: 'hex', language_boost: 'auto',
    voice_setting: { voice_id: voice, speed: 1.1, vol: 1, pitch: 0, emotion: 'happy' },
    audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
  });
  return new Promise((resolve, reject) => {
    const req = https.request('https://api.minimaxi.com/v1/t2a_v2', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Authorization: 'Bearer ' + key } }, res => {
      let s = ''; res.on('data', d => s += d); res.on('end', () => {
        try { const j = JSON.parse(s); if (j.base_resp && j.base_resp.status_code) return reject(new Error(`${voice}: ${j.base_resp.status_msg}`)); resolve(Buffer.from(j.data.audio, 'hex')); }
        catch (e) { reject(new Error(voice + ': ' + s.slice(0, 120))); }
      });
    });
    req.on('error', reject); req.end(body);
  });
}

(async () => {
  const inputs = [];
  for (const [voice, text, delay, vol] of VOICES) {
    try {
      const f = path.join(TMP, `${inputs.length}.mp3`);
      fs.writeFileSync(f, await synth(voice, text));
      inputs.push({ f, delay, vol });
      console.log('✓', voice);
    } catch (e) { console.log('✗', e.message); }
  }
  if (inputs.length < 3) throw new Error('能用的声音太少');
  // 每路：延迟 + 音量；再叠加、整体响度拉平
  const args = ['-y', '-loglevel', 'error'];
  inputs.forEach(i => args.push('-i', i.f));
  const chains = inputs.map((i, n) => `[${n}:a]adelay=${i.delay}|${i.delay},volume=${i.vol}[a${n}]`);
  const mix = inputs.map((_, n) => `[a${n}]`).join('') + `amix=inputs=${inputs.length}:normalize=0,alimiter=limit=0.9,loudnorm=I=-14:TP=-1.5`;
  args.push('-filter_complex', chains.join(';') + ';' + mix, '-ar', '32000', '-ac', '1', '-b:a', '128k', path.join(ROOT, 'audio', 'zh_ye_crowd.mp3'));
  execFileSync(process.env.FFMPEG || 'ffmpeg', args, { stdio: 'inherit' });
  console.log(`已生成 audio/zh_ye_crowd.mp3（${inputs.length} 个声音叠加）`);
})().catch(e => { console.error('失败：', e.message); process.exit(1); });
