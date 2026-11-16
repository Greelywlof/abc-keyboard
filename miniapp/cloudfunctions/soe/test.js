// 本地测试：用假的 WebSocket 模拟腾讯云口语评测，不联网不花钱。node test.js
'use strict';
const assert = require('assert');
const { EventEmitter } = require('events');
const soe = require('./index');
const { summarize, soeUrl, setWs } = soe._test;

let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const env = { SOE_SECRET_ID: 'AKIDtest', SOE_SECRET_KEY: 'k', SOE_APPID: '1234567' };

// 假连接：记录收到的音频，按 reply 回结果
let lastUrl = '', got = 0, reply = null;
class FakeWs extends EventEmitter {
  constructor(url) { super(); lastUrl = url; got = 0; setTimeout(() => { this.emit('open'); this.emit('message', JSON.stringify({ code: 0, final: 0 })); }, 5); }
  send(d) {
    if (typeof d === 'string') { setTimeout(() => this.emit('message', JSON.stringify(reply)), 5); return; }
    got += d.length;
  }
  close() {}
}
setWs(FakeWs);

const result = (total, phones, completion = 1) => ({ code: 0, final: 1, result: JSON.stringify({
  SuggestedScore: total, PronAccuracy: total, PronCompletion: completion,
  Words: [{ Word: 'apple', PronAccuracy: total, MatchTag: 0, PhoneInfos: phones }],
}) });
const ph = (p, s, tag = 0, letter) => ({ ReferencePhone: p, PronAccuracy: s, MatchTag: tag, ReferenceLetter: letter });

(async () => {
  // 1. 签名 URL：参数齐全、单词模式、宽松系数
  const u = soeUrl(env, { eval_mode: 0, ref_text: 'Ice cream', score_coeff: 1 });
  ok(u.startsWith('wss://soe.cloud.tencent.com/soe/api/1234567?'), 'URL 前缀');
  ok(/eval_mode=0/.test(u) && /ref_text=Ice%20cream/.test(u) && /&signature=/.test(u), 'URL 参数和签名');
  ok(/secretid=AKIDtest/.test(u), '带 secretid');

  // 2. 读得好：3 档，不挑毛病
  let s = summarize(JSON.parse(result(92, [ph('ae', 95), ph('p', 90), ph('l', 88)]).result), 'Apple');
  ok(s.level === 3 && s.weak === null && s.total === 92, '高分 3 档不挑毛病');

  // 3. 一般：2 档，找出最差的音和字母
  s = summarize(JSON.parse(result(70, [ph('ae', 40, 3, 'a'), ph('p', 85), ph('l', 55)]).result), 'Apple');
  ok(s.level === 2 && s.weak && s.weak.phone === 'ae' && s.weak.letter === 'a', '中分找到最差的音 ae / a');

  // 4. 读得差：1 档
  s = summarize(JSON.parse(result(35, [ph('ae', 30, 3), ph('p', 20, 2)]).result), 'Apple');
  ok(s.level === 1 && s.weak.phone === 'p', '低分 1 档，漏读的 p 最差');

  // 5. 什么都没读：0 档（提示大声一点，不算读得不好）
  s = summarize({ SuggestedScore: 0, PronAccuracy: 0, PronCompletion: 0, Words: [] }, 'Apple');
  ok(s.level === 0 && s.heard === false, '没读出声 0 档');

  // 6. 0~1 小数的分数也能换成百分制
  s = summarize({ SuggestedScore: 85, PronAccuracy: 85, PronCompletion: 0.9, Words: [] }, 'Cat');
  ok(s.completion === 90, '完整度 0.9 → 90');

  // 7. 完整流程：音频分片发送，结果解析
  reply = result(88, [ph('k', 90), ph('ae', 86), ph('t', 88)]);
  const audio = Buffer.alloc(40000, 1).toString('base64');
  let r = await soe.main({ word: 'Cat', audio }, {});
  ok(r.ok === false && /还没配置/.test(r.error), '没配密钥给出明确提示');
  process.env.SOE_SECRET_ID = env.SOE_SECRET_ID; process.env.SOE_SECRET_KEY = env.SOE_SECRET_KEY; process.env.SOE_APPID = env.SOE_APPID;
  r = await soe.main({ word: 'Cat', audio });
  ok(r.ok && r.data.level === 3 && r.data.word === 'Cat', '完整流程拿到 3 档');
  ok(got === 40000, '音频全部发出');
  ok(/score_coeff=1/.test(lastUrl) && /voice_format=2/.test(lastUrl), '默认最宽松系数、mp3');

  // 8. 参数校验
  r = await soe.main({ word: 'rm -rf; drop', audio }); ok(!r.ok, '奇怪的单词被拒绝');
  r = await soe.main({ word: 'Cat', audio: Buffer.alloc(100).toString('base64') }); ok(!r.ok && /太短/.test(r.error), '录音太短被拒绝');
  r = await soe.main({ word: 'Cat' }); ok(!r.ok && /没收到/.test(r.error), '没有录音被拒绝');

  // 9. 服务端报错：密钥权限
  reply = { code: 4001, message: 'AuthFailure signature invalid' };
  r = await soe.main({ word: 'Cat', audio }); ok(!r.ok && /密钥/.test(r.error), '鉴权失败给出密钥提示');

  console.log(`soe 云函数：${pass} 项全部通过`);
})().catch(e => { console.error('失败：', e.message); process.exit(1); });
