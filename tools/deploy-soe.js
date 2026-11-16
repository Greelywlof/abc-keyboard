// 部署网页版评测云函数 abcsoe 到腾讯云开发，并开 HTTP 访问路径 /abc-soe。
// 密钥从项目根目录 .soe-key 读（已在 .gitignore 里，不上传），格式：
//   SOE_SECRET_ID=AKID...
//   SOE_SECRET_KEY=...
//   SOE_APPID=1399652577        （可省略，默认就是这个账号）
// 用法：node tools/deploy-soe.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ENV = 'zhihuixiaoyua-d5gkkwykq944c4980';
const FN = path.join(ROOT, 'cloud', 'abcsoe');

const vars = { SOE_APPID: '1399652577' };
const keyFile = path.join(ROOT, '.soe-key');
if (!fs.existsSync(keyFile)) { console.log('没找到 .soe-key'); process.exit(1); }
fs.readFileSync(keyFile, 'utf8').replace(/^﻿/, '').split(/\r?\n/).forEach(l => {
  const m = l.match(/^\s*(SOE_[A-Z_]+)\s*=\s*(\S+)\s*$/); if (m) vars[m[1]] = m[2];
});
if (!vars.SOE_SECRET_ID || !vars.SOE_SECRET_KEY) { console.log('.soe-key 里缺 SOE_SECRET_ID 或 SOE_SECRET_KEY'); process.exit(1); }

// 评测逻辑和单词表从小程序那边复制过来，两边共用一份
fs.copyFileSync(path.join(ROOT, 'miniapp', 'cloudfunctions', 'soe', 'index.js'), path.join(FN, 'soe.js'));
fs.copyFileSync(path.join(ROOT, 'tools', 'words.json'), path.join(FN, 'words.json'));

// 临时配置文件（含密钥，部署完删掉）
const rc = path.join(ROOT, 'cloud', 'cloudbaserc.json');
fs.writeFileSync(rc, JSON.stringify({
  version: '2.0', envId: ENV, functionRoot: '.',
  functions: [{ name: 'abcsoe', handler: 'index.main', runtime: 'Nodejs20.19', timeout: 30, memorySize: 128, installDependency: true, envVariables: vars, ignore: ['node_modules', 'node_modules/**/*'] }],
}, null, 2));
const run = c => execSync(c, { cwd: path.join(ROOT, 'cloud'), stdio: 'inherit', env: Object.assign({}, process.env, { MSYS_NO_PATHCONV: '1' }) });
try {
  run('tcb fn deploy abcsoe --force');
  try { run(`tcb service create -p abc-soe -f abcsoe -e ${ENV}`); } catch (e) { console.log('（HTTP 访问路径可能已经建过了）'); }
} finally { fs.unlinkSync(rc); }
console.log(`\n评测地址：https://${ENV}-1399652577.ap-shanghai.app.tcloudbase.com/abc-soe`);
