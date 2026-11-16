// 网页版的跟读评测：HTTP 访问路径 /abc-soe，部署在腾讯云开发（和网页同一个环境）。
// 网页 POST { word, audio: 16k 单声道 wav 的 base64, format: 'wav' } → 返回 { ok, data: { level, total, weak } }
// 评测本体是 soe.js（部署脚本从 miniapp/cloudfunctions/soe/index.js 复制过来，小程序和网页共用一份逻辑）。
// 只认单词表里的词、限制录音大小和调用频率，避免这个公开地址被拿去随便调用花钱。
'use strict';
const soe = require('./soe');
const WORDS = require('./words.json');

const ALLOWED = new Set();
Object.values(WORDS).forEach(list => list.forEach(([w]) => ALLOWED.add(w.toLowerCase())));

const ORIGINS = [
  /^https:\/\/[a-z0-9-]+\.tcloudbaseapp\.com$/,
  /^https:\/\/greelywlof\.github\.io$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

// 每个实例里的简单限流：同一 IP 每分钟 20 次，每个实例每天 400 次（云函数会有多个实例，是粗略上限）
const perIp = new Map(); let dayKey = '', dayCount = 0;
function limited(ip) {
  const now = Date.now(), d = new Date(now + 8 * 3600e3).toISOString().slice(0, 10);
  if (d !== dayKey) { dayKey = d; dayCount = 0; }
  if (++dayCount > 400) return true;
  const list = (perIp.get(ip) || []).filter(t => now - t < 60e3);
  list.push(now); perIp.set(ip, list);
  if (perIp.size > 5000) perIp.clear();
  return list.length > 20;
}

function reply(origin, code, obj) {
  const allow = ORIGINS.some(r => r.test(origin || '')) ? origin : 'https://greelywlof.github.io';
  return {
    statusCode: code, isBase64Encoded: false,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': allow, 'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: obj == null ? '' : JSON.stringify(obj),
  };
}

exports.main = async (event = {}) => {
  const h = event.headers || {};
  const origin = h.origin || h.Origin || '';
  if ((event.httpMethod || '').toUpperCase() === 'OPTIONS') return reply(origin, 204, null);
  if (!ORIGINS.some(r => r.test(origin))) return reply(origin, 403, { ok: false, error: '不允许的来源' });
  const ip = h['x-real-ip'] || h['x-forwarded-for'] || 'x';
  if (limited(String(ip).split(',')[0])) return reply(origin, 429, { ok: false, error: '读得太快啦，休息一下再读' });
  let body = {};
  try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : (event.body || '{}')); }
  catch (e) { return reply(origin, 400, { ok: false, error: '请求格式不对' }); }
  if (!ALLOWED.has(String(body.word || '').toLowerCase())) return reply(origin, 400, { ok: false, error: '只能评测单词表里的词' });
  if (String(body.audio || '').length > 300000) return reply(origin, 400, { ok: false, error: '录音太长了' });
  const r = await soe.main({ word: body.word, audio: body.audio, format: 'wav', coeff: 1 });
  return reply(origin, 200, r);
};
exports._test = { limited, ALLOWED };
