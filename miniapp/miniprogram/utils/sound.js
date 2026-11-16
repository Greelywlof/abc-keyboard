// 播放 MiniMax 预先生成的 mp3（放在云存储，见 config.AUDIO_BASE）。play() 连播几段，返回 Promise，被新的一句打断也会结束。
// 声音包：家长页可以换（存 abc_voice）；男声夸奖 m_* 和群喊「耶」各包共用，放在 audio/ 根目录
const { AUDIO_BASE, VOICE_PACKS } = require('../config');

let ctx = null, token = 0, muted = false;
function audio() {
  if (!ctx) ctx = wx.createInnerAudioContext({ useWebAudioImplement: false });
  return ctx;
}
function packId() { try { return wx.getStorageSync('abc_voice') || VOICE_PACKS[0].id; } catch (e) { return VOICE_PACKS[0].id; } }
function setPack(id) { try { wx.setStorageSync('abc_voice', id); } catch (e) {} }
const shared = c => /^m_/.test(c) || c === 'zh_ye_crowd';
function srcOf(c) {
  const p = VOICE_PACKS.find(x => x.id === packId()) || VOICE_PACKS[0];
  return AUDIO_BASE + (shared(c) ? '' : p.dir) + c + '.mp3';
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
  for (const c of clips.filter(Boolean)) {
    if (my !== token) return;
    await playSrc(srcOf(c), rate);
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

module.exports = { play, playFile, stop, setMuted, isMuted, packId, setPack, VOICE_PACKS, srcOf };
