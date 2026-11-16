// 跟读评测：小程序录的 mp3（16k 单声道，约 3 秒）→ 腾讯云口语评测（新版 WebSocket，单词模式）→ 分数 + 哪个音没读准。
// 密钥只放在云函数环境变量里，小程序拿不到：
//   SOE_SECRET_ID / SOE_SECRET_KEY  腾讯云子账号密钥（只授权 QcloudSOEFullAccess）
//   SOE_APPID                       这个子账号所属腾讯云账号的 AppID（控制台右上角「账号信息」里那串数字）
// 接口写法照搬 smart-edu 里已在线上用过的版本（cloudfunctions/api/ai.js 的 oralEval）。
'use strict';
const crypto = require('crypto');

const SOE_PATH = 'soe.cloud.tencent.com/soe/api/';
const userError = msg => { const e = new Error(msg); e.expose = true; return e; };
const pct = v => { const n = Number(v); if (!Number.isFinite(n) || n < 0) return 0; return Math.round(n <= 1 ? n * 100 : n); };

// 签名：参数按名字排序拼在「域名/路径?」后面，HMAC-SHA1 再 base64；URL 里的值和签名都要转义
function soeUrl(env, params) {
  const now = Math.floor(Date.now() / 1000);
  const p = Object.assign({ secretid: env.SOE_SECRET_ID, timestamp: now, expired: now + 3600, nonce: Math.floor(Math.random() * 1e9) + 1 }, params);
  const keys = Object.keys(p).sort();
  const raw = SOE_PATH + env.SOE_APPID + '?' + keys.map(k => `${k}=${p[k]}`).join('&');
  const sig = crypto.createHmac('sha1', env.SOE_SECRET_KEY).update(raw).digest('base64');
  return `wss://${SOE_PATH}${env.SOE_APPID}?${keys.map(k => `${k}=${encodeURIComponent(p[k])}`).join('&')}&signature=${encodeURIComponent(sig)}`;
}

function soeFail(m) {
  const msg = String((m && m.message) || ''), code = m && m.code;
  console.warn('soe fail', code, msg);
  if (/auth|signature|secret|permission|权限|鉴权|签名/i.test(msg)) return userError('评测密钥不对或没有权限，请家长检查云函数配置');
  if (/open|service|arrear|balance|欠费|开通|额度/i.test(msg)) return userError('评测服务没开通或额度用完了');
  return userError('评测失败了，再读一次试试');
}

// 换成测试用的假连接：test.js 里替换
let WebSocketImpl = null;
const WS = () => WebSocketImpl || require('ws');

function evaluate(env, { audio, word, coeff }) {
  if (!env.SOE_SECRET_ID || !env.SOE_SECRET_KEY || !env.SOE_APPID) return Promise.reject(userError('评测还没配置，请家长在云函数环境变量里填写密钥'));
  const url = soeUrl(env, {
    server_engine_type: '16k_en', voice_id: crypto.randomUUID(), voice_format: 2, // 2 = mp3
    eval_mode: 0,                       // 0 = 单词模式（有到每个音的结果）
    ref_text: word,
    score_coeff: coeff,                 // 1.0 最宽松（低龄），4.0 最严；4 岁用 1.0
    rec_mode: 1, text_mode: 0,          // 录好一次发过去
  });
  const Ws = WS();
  return new Promise((resolve, reject) => {
    const ws = new Ws(url);
    let done = false, sent = false;
    const finish = (err, res) => { if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch (e) { /* 已关闭 */ } err ? reject(err) : resolve(res); };
    const timer = setTimeout(() => finish(userError('评测超时了，再试一次')), 20000);
    const sendAudio = () => {
      if (sent || done) return; sent = true;
      for (let i = 0; i < audio.length; i += 16384) ws.send(audio.subarray(i, i + 16384));
      ws.send(JSON.stringify({ type: 'end' }));
    };
    ws.on('open', () => setTimeout(sendAudio, 1500)); // 先等握手消息，1.5 秒没等到也照常发
    ws.on('message', data => {
      let m; try { m = JSON.parse(data.toString()); } catch (e) { return; }
      if (m.code !== 0) return finish(soeFail(m));
      if (m.final === 1) return finish(null, typeof m.result === 'string' ? JSON.parse(m.result) : (m.result || {}));
      sendAudio();
    });
    ws.on('error', e => finish(userError('评测连接失败：' + e.message)));
    ws.on('close', () => finish(userError('评测连接断开了，再读一次试试')));
  });
}

// 把评测结果变成孩子能用的：总分 → 三档星星；找出最没读准的那个音，给出对应的字母，用来纠音
// MatchTag：0 匹配，1 多读，2 漏读，3 读错（以官方文档为准）
function summarize(r, word) {
  const words = (r.Words || []).filter(w => w.Word);
  const phones = [];
  words.forEach(w => (w.PhoneInfos || []).forEach(p => phones.push({
    phone: String(p.ReferencePhone || p.Phone || ''),
    letter: String(p.ReferenceLetter || ''),          // 有的版本会给这个音对应的字母
    score: pct(p.PronAccuracy), tag: Number(p.MatchTag) || 0,
  })));
  const total = pct(r.SuggestedScore != null ? r.SuggestedScore : r.PronAccuracy);
  const completion = pct(r.PronCompletion);
  // 什么都没读出来（完整度很低）单独提示，不算读得不好
  const heard = completion >= 30 || total > 0;
  const level = !heard ? 0 : total >= 80 ? 3 : total >= 60 ? 2 : 1;
  let weak = null;
  phones.forEach(p => {
    const bad = p.tag === 2 || p.tag === 3 || p.score < 60;
    if (bad && (!weak || p.score < weak.score)) weak = p;
  });
  return {
    word, total, accuracy: pct(r.PronAccuracy), completion, heard, level,
    weak: level >= 3 ? null : weak,   // 读得很好就不挑毛病
    phones,
  };
}

async function main(event, env) {
  const word = String(event.word || '').trim();
  if (!/^[A-Za-z][A-Za-z\- ]{0,19}$/.test(word)) throw userError('要读的单词不对');
  const b64 = String(event.audio || '');
  if (!b64) throw userError('没收到录音');
  const audio = Buffer.from(b64, 'base64');
  if (audio.length < 1500) throw userError('录音太短了，再读一次');
  if (audio.length > 400000) throw userError('录音太长了');
  const coeff = Math.min(4, Math.max(1, Number(event.coeff) || 1));
  const r = await evaluate(env, { audio, word, coeff });
  return summarize(r, word);
}

exports.main = async event => {
  try { return { ok: true, data: await main(event, process.env) }; }
  catch (e) { if (!e.expose) console.error(e); return { ok: false, error: e.expose ? e.message : '评测出错了，再试一次' }; }
};
exports._test = { summarize, soeUrl, main, setWs: w => { WebSocketImpl = w; } };
