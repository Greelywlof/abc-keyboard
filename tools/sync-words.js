// 把 tools/words.json 同步成小程序能 require 的 miniapp/miniprogram/utils/words.js
// 改了单词表后运行：node tools/sync-words.js
'use strict';
const fs = require('fs');
const path = require('path');
const data = require('./words.json');
const out = path.join(__dirname, '..', 'miniapp', 'miniprogram', 'utils', 'words.js');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `// 由 tools/sync-words.js 从 tools/words.json 生成，不要手改\nmodule.exports = ${JSON.stringify(data, null, 1)};\n`);
console.log('已写入', path.relative(process.cwd(), out));
// 勋章规则网页和小程序共用一份
const medalsOut = path.join(path.dirname(out), 'medals.js');
fs.writeFileSync(medalsOut, '// 由 tools/sync-words.js 从仓库根目录 medals.js 复制，不要手改\n' + fs.readFileSync(path.join(__dirname, '..', 'medals.js'), 'utf8'));
console.log('已写入', path.relative(process.cwd(), medalsOut));
