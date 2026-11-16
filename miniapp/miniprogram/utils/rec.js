// 跟读录音：录 3 秒 mp3（16k 单声道，腾讯云口语评测要的格式）→ 交给云函数 soe 打分。录音不上传云存储、不保存。
const rec = wx.getRecorderManager();
let pending = null;
rec.onStop(res => { const p = pending; pending = null; if (p) p.resolve(res); });
rec.onError(err => {
  const p = pending; pending = null;
  if (p) p.reject(new Error(/auth|permission|deny/i.test((err && err.errMsg) || '') ? 'nomic' : 'fail'));
});

// 麦克风权限：第一次会弹授权；拒绝过的引导家长去设置里打开
function ensureMic() {
  return new Promise(resolve => {
    wx.getSetting({
      success: s => {
        if (s.authSetting['scope.record'] === false) {
          wx.showModal({
            title: '需要麦克风', content: '「跟我读」要用麦克风听孩子读，请在设置里打开。', confirmText: '去设置',
            success: r => { if (r.confirm) wx.openSetting({ success: o => resolve(!!o.authSetting['scope.record']) }); else resolve(false); },
          });
        } else wx.authorize({ scope: 'scope.record', success: () => resolve(true), fail: () => resolve(false) });
      },
      fail: () => resolve(true),
    });
  });
}

// 录 ms 毫秒，返回本地临时文件路径
function record(ms = 3000) {
  return new Promise((resolve, reject) => {
    pending = { resolve: r => resolve(r.tempFilePath), reject };
    rec.start({ format: 'mp3', sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000, duration: ms });
  });
}

// 交给云函数打分；返回 { level 0~3, total, weak:{phone,letter} } 或 null（没配置、网络不通）
async function evaluate(path, word) {
  const audio = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({
    filePath: path, encoding: 'base64', success: r => resolve(r.data), fail: reject,
  }));
  const r = await wx.cloud.callFunction({ name: 'soe', data: { word, audio, coeff: 1 } });
  const res = r && r.result;
  if (!res || !res.ok) { console.warn('soe', res && res.error); return null; }
  return res.data;
}

module.exports = { ensureMic, record, evaluate };
