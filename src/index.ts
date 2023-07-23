#!/usr/bin/env node

import minimist from "minimist";
import path from "path";
import fs from "fs";
import md5 from "md5";
import https from "https";
import { logger, getHeader, getNowDate, formatSize, sleep } from "./utils";
import { DEFAULT_OPTIONS } from "./config";
import type {
  ICompressListItem,
  IFilesListItem,
  ILogger,
  IFingerprintMap,
} from "./global";
// 将命令行参数转换成对象形式
const processArgv = minimist(process.argv.slice(2));

class Tinypng {
  public logger: ILogger; // 日志对象
  public filesList: IFilesListItem[]; // 保存所有的图片列表
  public compressList: ICompressListItem[]; // 压缩后的文件列表
  public startIndex: number; // 开始索引
  public endIndex: number; // 结束索引
  public fingerprintMap: IFingerprintMap; // 文件指纹列表
  public input: string; // 压缩的入口目录
  public output: string; // 生成 md 压缩文档的输出目录
  public workDir: string; // 工作目录
  public isCompressing: boolean; // 是否正在处理图片压缩
  public compressingList: IFilesListItem[]; // 正在压缩中的图片
  constructor() {
    this.logger = logger();
    this.filesList = [];
    this.compressList = [];
    this.startIndex = 0;
    this.endIndex = DEFAULT_OPTIONS.maxLength;
    this.fingerprintMap = {};
    this.input = processArgv["input"] || "src";
    this.output = processArgv["output"] || "";
    this.workDir = process.cwd();
    this.isCompressing = false;
    this.compressingList = [];
  }
  // 入口启动函数
  async run() {
    // 获取压缩图片的目录
    const directory = this.input;
    const fullDirectory = path.resolve(this.workDir, directory);
    // 判断指定目录下是否存在文件
    if (!this.existFile(fullDirectory)) {
      this.logger.error("当前目录不存在图片文件，请更换压缩目录");
      return;
    }
    try {
      // 判断指纹文件是否存在，存在读取图片指纹数据，判断图片是否被压缩过
      const fingerprintPath = path.join(
        this.workDir,
        this.output,
        "image.json"
      );
      fs.accessSync(fingerprintPath, fs.constants.F_OK);
      this.fingerprintMap = await this.getFingerprint(fingerprintPath);
    } catch (error) {}
    // 递归读取目录下没有被压缩过的所有文件
    await this.readFileList(fullDirectory);
    const length = this.filesList.length;
    if (!length) {
      this.logger.info("无新图片可供压缩");
      return;
    }
    for (let i = 0; i <= length; i += DEFAULT_OPTIONS.maxLength) {
      const list = this.filesList.slice(i, i + DEFAULT_OPTIONS.maxLength);
      this.compressingList = list;
      await this.batcheCompressImage();
    }
    // let isFirst = true;
    // // （第一次压缩 || 目前压缩的图片结束索引 <= 没有被压缩过的图片长度）&& 不正在压缩的过程中
    // while ((isFirst || this.endIndex <= length) && !this.isCompressing) {
    //   const list = this.filesList.slice(this.startIndex, this.endIndex);
    //   this.batcheCompressImage(list);
    //   isFirst = false;
    //   this.startIndex += DEFAULT_OPTIONS.maxLength;
    //   this.endIndex += DEFAULT_OPTIONS.maxLength; // 5, 10; 10, 15
    // }
  }
  /**
   * 递归判断该目录下否存在文件
   * @param {*} dirPath 文件目录
   */
  existFile(dirPath: string): boolean {
    try {
      const fileNames = fs.readdirSync(dirPath);
      return fileNames.some((fileName: string) => {
        const fullFilePath = path.join(dirPath, fileName);
        const fileStat = fs.statSync(fullFilePath);
        if (fileStat.isFile()) {
          // 是文件
          return true;
        } else if (fileStat.isDirectory()) {
          // 文件夹
          return this.existFile(fullFilePath);
        } else {
          return false;
        }
      });
    } catch (error) {
      return false;
    }
  }
  /**
   * 获取图片指纹文件
   * @param {*} fingerprintPath 图片指纹文件路径
   */
  getFingerprint(fingerprintPath: string): Promise<IFingerprintMap> {
    return new Promise((resolve, reject) => {
      const data = fs.readFileSync(fingerprintPath, "utf-8");
      const { fingerprintMap = {} } = JSON.parse(data);
      this.logger.success(`${fingerprintPath} 指纹文件读取成功`);
      resolve(fingerprintMap);
    });
  }
  /**
   * 递归读取所有的文件
   * @param {*} dirPath 目录的绝对路径
   */
  readFileList(dirPath: string): void {
    const fileNames = fs.readdirSync(dirPath);
    fileNames.forEach((fileName) => {
      // 获取文件的绝对路径
      const fullFilePath = path.join(dirPath, fileName);
      // 获取文件信息状态
      const fileStat = fs.statSync(fullFilePath);
      // 如果是文件
      if (fileStat.isFile()) {
        // 获取文件后缀名
        const fileExt = path.extname(fileName);
        const key = md5(fullFilePath + fileStat.size);
        // 判断是否超出最大压缩限制
        if (fileStat.size > DEFAULT_OPTIONS.maxSize) {
          this.logger.warning(`文件${fileName}超出5M的压缩限制`);
        }
        // 判断是否符合压缩图片类型
        if (!DEFAULT_OPTIONS.fileExts.includes(fileExt)) {
          this.logger.warning(`文件${fileName}不符合 .png 或 .jpg 图片要求`);
        }
        if (
          fileStat.size < DEFAULT_OPTIONS.maxSize &&
          DEFAULT_OPTIONS.fileExts.includes(fileExt) &&
          (!this.fingerprintMap[fullFilePath] ||
            (this.fingerprintMap[fullFilePath] &&
              this.fingerprintMap[fullFilePath] !== key))
        ) {
          this.filesList.push({
            size: fileStat.size,
            name: fileName,
            path: fullFilePath,
          });
        }
      } else if (fileStat.isDirectory()) {
        // 文件夹
        this.readFileList(fullFilePath);
      }
    });
  }
  /**
   * 分批压缩图片
   * @param list 从 fileList 中取出的待压缩的图片列表
   */
  async batcheCompressImage() {
    const compressListPromise = await this.compressImage(this.compressingList);
    Promise.all(compressListPromise).then((compressList) => {
      this.compressList = [...this.compressList, ...compressList];
      this.isCompressing = false;
      console.log(this.compressList, "-----------------compressList");
      if (this.compressList.length >= this.filesList.length) {
        this.generateFingerprint();
        this.outputDocument();
      }
    });
  }
  /**
   * 压缩图片的逻辑
   * @param {*} fileList 压缩的图片列表
   */
  compressImage(fileList: IFilesListItem[]): Promise<ICompressListItem[]> {
    return new Promise((resolve, reject) => {
      try {
        this.isCompressing = true;
        const compressList = fileList.map(async (file) => {
          this.logger.info(`正在压缩图片 ${file.path}`);
          const fileContent = fs.readFileSync(file.path, "binary");
          const result: any = await this.uploadImage(fileContent, file.path);
          const { url, size, ratio } = result.output;
          if (!url) return;
          const data = await this.downloadImage(url, file.path);
          if (!data) return;
          fs.writeFileSync(file.path, data as any, "binary");
          return { ...file, miniSize: size, ratio };
        });
        resolve(compressList as any);
      } catch (error) {
        console.log(error, "error--------------");
        // 这里如果上传图片和下载图片报错了，需要重试
        sleep(5).then(() => {
          this.batcheCompressImage();
        });
        reject(error);
      }
    });
  }
  /**
   * 上传图片
   * @param {*} fileContent 图片内容
   * @param {*} filePath 图片路径
   */
  uploadImage(fileContent: any, filePath: string) {
    const options = getHeader();
    return new Promise((resolve, reject) => {
      const req = https.request(options as any, (res) => {
        res.on("data", (buffer) => {
          const obj = JSON.parse(buffer.toString());
          if (obj.error) {
            this.logger.error(
              `[${filePath}]：压缩失败！报错信息：${obj.message}`
            );
            reject(obj.message);
          } else {
            resolve(obj);
          }
        });
      });
      req.on("error", (error) => {
        this.logger.error(`[${filePath}]：上传图片请求失败！`);
        reject(error);
      });
      req.write(fileContent, "binary");
      req.end();
    });
  }
  /**
   * 下载图片
   * @param {*} imageUrl 线上图片地址
   * @param {*} filePath 本地图片路径
   */
  downloadImage(imageUrl: string, filePath: string) {
    const options = new URL(imageUrl);
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let file = "";
        res.setEncoding("binary");
        res.on("data", (chunk) => (file += chunk));
        res.on("end", () => resolve(file));
      });
      req.on("error", (e) => {
        this.logger.error(`[${filePath}]：下载失败！报错：${e.message}`);
        reject(e);
      });
      req.end();
    });
  }
  /**
   * 生成图片指纹文件
   */
  generateFingerprint() {
    const result = this.compressList.reduce(
      (memo: any, current: ICompressListItem) => {
        const { name, miniSize } = current;
        memo[path.join(this.input, name)] = md5(name + miniSize);
        return memo;
      },
      {}
    );
    this.output && this.mkdirRecursion(this.output);
    const outputPath = path.join(this.workDir, this.output, "image.json");
    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        { fingerprintMap: { ...this.fingerprintMap, ...result } },
        null,
        "\t"
      )
    );
    this.logger.success(`图片指纹文件写入成功, 所在目录 ${outputPath}`);
  }
  /**
   * 递归创建文件夹目录
   * @param dir
   */
  mkdirRecursion(dir: string) {
    if (fs.existsSync(dir)) {
      return true;
    } else {
      if (this.mkdirRecursion(path.dirname(dir))) {
        fs.mkdirSync(dir);
        return true;
      }
    }
  }
  /**
   * 输出压缩文档
   */
  outputDocument() {
    let str = `# 项目原始图片对比\n
## 图片压缩信息 ${getNowDate()}\n
| 文件名 | 文件体积 | 压缩后体积 | 压缩比 | 文件路径 |\n| -- | -- | -- | -- | -- |\n`;
    for (let i = 0; i < this.compressList.length; i++) {
      const {
        name,
        path: filePath,
        size,
        miniSize,
        ratio,
      } = this.compressList[i];
      const fileSize = `${formatSize(size)}`;
      const compressionSize = `${formatSize(miniSize)}`;
      const compressionRatio = `${((1 - ratio) as any).toFixed(2) * 100}%`;
      const desc = `| ${name} | ${fileSize} | ${compressionSize} | ${compressionRatio} | ${path.join(
        this.input,
        name
      )} |\n`;
      str += desc;
    }
    let sizeTotal = 0;
    let miniSizeToal = 0;
    let ratioTotal = 0;
    this.compressList.forEach((item) => {
      sizeTotal += item.size;
      miniSizeToal += item.miniSize;
      ratioTotal += 1 - item.ratio;
    });
    const totalStr = `\n## 总体积变化信息 ${getNowDate()}\n
| 原始总大小 | 压缩后总大小 | 总压缩比 |\n| -- | -- | -- |\n| ${formatSize(
      sizeTotal
    )} | ${formatSize(miniSizeToal)} | ${
      (ratioTotal as any).toFixed(2) * 100
    }% |`;
    str = str + totalStr;
    const imageRatioPath = path.join(
      this.workDir,
      this.output,
      "图片压缩比.md"
    );
    fs.appendFileSync(imageRatioPath, str, "utf-8");
    this.logger.success(`压缩文档写入成功，目录 ${imageRatioPath}`);
  }
}

const app = new Tinypng();
app.run();
