export const DEFAULT_OPTIONS = {
  maxSize: 5 * 1024 * 1024, // 支持压缩的图片最大大小
  tinyUrl: [
    // 压缩图片的接口地址
    "tinyjpg.com",
    "tinypng.com",
  ],
  fileExts: [".jpg", ".png"], // 支持压缩的图片格式
  // 每次最多同时压缩 5 张图片
  maxLength: 5,
};
