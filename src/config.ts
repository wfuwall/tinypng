import { IDefaultOptions } from './global'
export const DEFAULT_OPTIONS: IDefaultOptions = {
  maxSize: 5 * 1024 * 1024, // 支持压缩的图片最大大小
  tinyUrl: "api.tinify.com", // 压缩图片的接口地址
  fileExts: [".jpg", ".png", ".webp"], // 支持压缩的图片格式
  // 每次最多同时压缩 5 张图片
  maxLength: 5,
  keys: [ // 这里需要填入自己 api keys

  ]
};
