// 上线前要填的两项（见 miniapp/README.md）
module.exports = {
  // 云开发环境 ID（开发者工具「云开发」控制台里能看到）。留空就用默认环境
  ENV: '',
  // 发音 mp3 放在哪：把仓库根目录的 audio/ 整个上传到云存储根目录后，
  // 填「云存储里 audio 文件夹的 File ID 前缀」，形如 'cloud://xxx-1234.7878-xxx-1234-1300000000/audio/'
  AUDIO_BASE: '',
  // 每天最多评测几次（控制费用；家长页能看到用了几次）
  EVAL_PER_DAY: 60,
};
