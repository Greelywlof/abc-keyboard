// 播放 MiniMax 预先生成的 mp3（放在云存储，见 config.AUDIO_BASE）。play() 连播几段，返回 Promise，被新的一句打断也会结束。
const { AUDIO_BASE } = require('../config');

let ctx = null, token = 0, muted = false;
function audio() {
  if (!ctx) ctx = wx.createInnerAudioContext({ useWebAudioImplement: false });
  return ctx;
}

function playSrc(src, rate) {
  return new Promise(resolve => {
    const a = audio();
    const my = token;
    let done = false;
    const fin = () => { if (done) return; done = true; a.offEnded(fin); a.offError(fin); a.offStop(fin); resolve(my === token); };
    a.stop();
    a.src = src;
    a.playbackRate = rate || 1;
    a.onEnded(fin); a.onError(fin); a.onStop(fin);
    a.play();
    setTimeout(fin, 12000); // 兜底：个别机型不触发结束事件
  });
}

// clips：['zh_find', 'f_A']；rate：语速（跟读时放慢用 0.75）
async function play(clips, rate) {
  const my = ++token;
  if (muted || !AUDIO_BASE) return;
  for (const c of clips) {
    if (my !== token) return;
    await playSrc(AUDIO_BASE + c + '.mp3', rate);
  }
}
// 播放本机录音文件
async function playFile(path) {
  const my = ++token;
  if (muted) return;
  if (my === token) await playSrc(path, 1);
}
function stop() { token++; if (ctx) ctx.stop(); }
function setMuted(m) { muted = !!m; if (muted) stop(); }
function isMuted() { return muted; }

// 叮的一声：用对 / 错的提示音（同样是 mp3，没有就不响）
module.exports = { play, playFile, stop, setMuted, isMuted };
