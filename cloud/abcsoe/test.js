// 本地测试网页评测云函数的 HTTP 外壳（来源、单词表、限流、CORS），评测本体用假的。node cloud/abcsoe/test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
// 部署脚本会复制这两个文件；测试时也复制一份
fs.copyFileSync(path.join(ROOT, 'miniapp', 'cloudfunctions', 'soe', 'index.js'), path.join(__dirname, 'soe.js'));
fs.copyFileSync(path.join(ROOT, 'tools', 'words.json'), path.join(__dirname, 'words.json'));
const soe = require('./soe');
let got = null;
soe.main = async ev => { got = ev; return { ok: true, data: { level: 3, total: 90 } }; };
const fn = require('./index');

let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const req = (body, origin = 'https://greelywlof.github.io', extra = {}) => fn.main(Object.assign({ httpMethod: 'POST', headers: { origin, 'x-real-ip': '1.2.3.4' }, body: JSON.stringify(body) }, extra));

(async () => {
  let r = await fn.main({ httpMethod: 'OPTIONS', headers: { origin: 'https://greelywlof.github.io' } });
  ok(r.statusCode === 204 && r.headers['Access-Control-Allow-Origin'] === 'https://greelywlof.github.io', '预检请求放行');
  r = await req({ word: 'Apple', audio: 'xx' }, 'https://evil.example.com');
  ok(r.statusCode === 403, '别的网站不能调用');
  r = await req({ word: 'hello world', audio: 'xx' });
  ok(r.statusCode === 400, '单词表以外的词不评测');
  r = await req({ word: 'Ice cream', audio: 'abc' }, 'https://zhihuixiaoyua-d5gkkwykq944c4980-1399652577.tcloudbaseapp.com');
  ok(r.statusCode === 200 && JSON.parse(r.body).data.level === 3, '腾讯云网页来源、多词单词能评测');
  ok(got.format === 'wav' && got.coeff === 1 && got.word === 'Ice cream', '按 wav、最宽松系数交给评测');
  r = await req({ word: 'Cat', audio: 'x'.repeat(300001) });
  ok(r.statusCode === 400, '录音过大被拒');
  r = await fn.main({ httpMethod: 'POST', headers: { origin: 'https://greelywlof.github.io' }, body: Buffer.from(JSON.stringify({ word: 'Cat', audio: 'a' })).toString('base64'), isBase64Encoded: true });
  ok(r.statusCode === 200, 'base64 编码的请求体也能解析');
  let last;
  for (let i = 0; i < 25; i++) last = await req({ word: 'Cat', audio: 'a' }, 'https://greelywlof.github.io', { headers: { origin: 'https://greelywlof.github.io', 'x-real-ip': '9.9.9.9' } });
  ok(last.statusCode === 429, '同一 IP 一分钟超过 20 次被限流');
  console.log(`abcsoe 云函数：${pass} 项全部通过`);
})().catch(e => { console.error('失败：', e.message); process.exit(1); });
