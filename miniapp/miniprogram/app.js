const { ENV } = require('./config');

App({
  onLaunch() {
    if (wx.cloud) wx.cloud.init(ENV ? { env: ENV, traceUser: true } : { traceUser: true });
    // iPhone 静音开关打开时也要能出声（这是学发音的工具）
    if (wx.setInnerAudioOption) wx.setInnerAudioOption({ obeyMuteSwitch: false, mixWithOther: false });
  },
});
