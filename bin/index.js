#!/usr/bin/env node
'use strict';

var minimist = require('minimist');
var path = require('path');
var fs = require('fs');
var md5 = require('md5');
var https = require('https');
var chalk = require('chalk');
var figures = require('figures');

const DEFAULT_OPTIONS = {
    maxSize: 5 * 1024 * 1024,
    tinyUrl: "api.tinify.com",
    fileExts: [".jpg", ".png", ".webp"],
    // 每次最多同时压缩 5 张图片
    maxLength: 5,
    keys: [ // 这里需要填入自己 api keys
    ]
};

/**
 * 补零函数
 * @param {*} num
 */
const fillZero = (num) => {
    return num <= 9 ? `0${num}` : num;
};
/**
 * 获取当前的时间
 * @returns 返回 yyyy-mm-dd hh:mm:ss
 */
const getNowDate = () => {
    const date = new Date();
    const year = date.getFullYear(); // 年
    const month = date.getMonth() + 1; // 月
    const day = date.getDate(); // 日
    const hour = date.getHours(); // 时
    const minutes = date.getMinutes(); // 分
    const seconds = date.getSeconds(); //秒
    return `${year}-${fillZero(month)}-${fillZero(day)} ${fillZero(hour)}:${fillZero(minutes)}:${fillZero(seconds)}`;
};
/**
 * 给图片大小增加单位
 * @param size 图片大小
 * @returns
 */
const formatSize = (size) => {
    return size > 1024 ? (size / 1024).toFixed(2) + "KB" : size + "B";
};
/**
 * 定义日志函数
 * @returns
 */
const logger = () => {
    const success = (msg) => {
        console.log(chalk.green(`${figures.tick}  ${msg}`));
    };
    const error = (msg) => {
        console.log(chalk.red(`${figures.cross}  ${msg}`));
    };
    const info = (msg) => {
        console.log(chalk.blue(`${figures.info}  ${msg}`));
    };
    const warning = (msg) => {
        console.log(chalk.hex("#FFA500")(`${figures.warning}  ${msg}`));
    };
    return {
        success,
        error,
        info,
        warning,
    };
};
/**
 * 获取随机 IP 地址
 * @returns
 */
const getRandomIp = () => {
    return new Array(4)
        .fill(0)
        .map(() => parseInt((Math.random() * 255).toString()))
        .join(".");
};
/**
 * 获取 大于等于min 且小于 max 之间的随机数
 * @param min
 * @param max
 * @returns
 */
const getRandomArbitrary = (min, max) => {
    return Math.random() * (max - min) + min;
};
/**
 * 实现 sleep 延迟执行函数
 * @param time 秒
 * @returns
 */
const sleep = (time) => {
    const loggerIns = logger();
    return new Promise((resolve) => {
        let remainingTime = time;
        const interval = setInterval(() => {
            loggerIns.warning(`失败重连中，请等待${remainingTime}s ...`);
            remainingTime--;
            if (remainingTime === 0) {
                clearInterval(interval);
                resolve(true);
            }
        }, 1000);
    });
};
/**
 * 获取上传图片的请求头
 * @returns
 */
const getHeader = () => {
    const index = Math.round(getRandomArbitrary(0, DEFAULT_OPTIONS.keys.length - 1));
    return {
        hostname: DEFAULT_OPTIONS.tinyUrl,
        method: "POST",
        path: "/shrink",
        rejectUnauthorized: false,
        auth: `api:${DEFAULT_OPTIONS.keys[index]}`,
        headers: {
            "Cache-Control": "no-cache",
            "Content-Type": "application/x-www-form-urlencoded",
            "Postman-Token": Date.now(),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36",
            "X-Forwarded-For": getRandomIp(),
        },
    };
};

// 将命令行参数转换成对象形式
const processArgv = minimist(process.argv.slice(2));
class Tinypng {
    logger; // 日志对象
    filesList; // 保存所有的图片列表
    compressList; // 压缩后的文件列表
    fingerprintMap; // 文件指纹列表
    input; // 压缩的入口目录
    output; // 生成 md 压缩文档的输出目录
    workDir; // 工作目录
    generateStart = false; // 正在开始生成指纹
    currentIndex = 0; // 记录当前压缩图片的索引，失败重试使用
    failWaitTime = 10; // 失败需等待的时间
    secret; // 秘钥的路径
    constructor() {
        this.logger = logger();
        this.filesList = [];
        this.compressList = [];
        this.fingerprintMap = {};
        this.input = processArgv["input"] || "src";
        this.output = processArgv["output"] || "";
        this.secret = processArgv["secret"] || "";
        this.workDir = process.cwd();
    }
    // 入口启动函数
    async run() {
        // 获取压缩图片的目录
        const directory = this.input;
        const fullDirectory = path.resolve(this.workDir, directory);
        // 合并秘钥
        if (this.secret) {
            const secretPath = path.resolve(this.workDir, this.secret);
            const data = fs.readFileSync(secretPath, "utf-8");
            const result = JSON.parse(data);
            DEFAULT_OPTIONS.keys = [...DEFAULT_OPTIONS.keys, ...result];
        }
        // 判断指定目录下是否存在文件
        if (!this.existFile(fullDirectory)) {
            this.logger.error("当前目录不存在图片文件，请更换压缩目录");
            return;
        }
        try {
            // 判断指纹文件是否存在，存在读取图片指纹数据，判断图片是否被压缩过
            const fingerprintPath = path.join(this.workDir, this.output, "image.json");
            fs.accessSync(fingerprintPath, fs.constants.F_OK);
            this.fingerprintMap = await this.getFingerprint(fingerprintPath);
        }
        catch (error) { }
        // 递归读取目录下没有被压缩过的所有文件
        await this.readFileList(fullDirectory);
        if (!this.filesList.length) {
            this.logger.info("无新图片可供压缩");
            return;
        }
        this.logger.info(`待压缩的图片总共 ${this.filesList.length} 张`);
        this.startCompress();
    }
    /**
     * 开始压缩图片，失败后重试同样调用此函数
     */
    async startCompress() {
        const length = this.filesList.length;
        for (let i = this.currentIndex; i <= length; i += DEFAULT_OPTIONS.maxLength) {
            const list = this.filesList.slice(i, i + DEFAULT_OPTIONS.maxLength);
            this.currentIndex += DEFAULT_OPTIONS.maxLength;
            const compressList = await this.compressImage(list);
            this.compressList = [...this.compressList, ...compressList];
            if (this.compressList.length >= this.filesList.length &&
                !this.generateStart) {
                this.generateStart = true;
                this.generateFingerprint();
                this.outputDocument();
            }
        }
    }
    /**
     * 递归判断该目录下否存在文件
     * @param {*} dirPath 文件目录
     */
    existFile(dirPath) {
        try {
            const fileNames = fs.readdirSync(dirPath);
            return fileNames.some((fileName) => {
                const fullFilePath = path.join(dirPath, fileName);
                const fileStat = fs.statSync(fullFilePath);
                if (fileStat.isFile()) {
                    // 是文件
                    return true;
                }
                else if (fileStat.isDirectory()) {
                    // 文件夹
                    return this.existFile(fullFilePath);
                }
                else {
                    return false;
                }
            });
        }
        catch (error) {
            return false;
        }
    }
    /**
     * 获取图片指纹文件
     * @param {*} fingerprintPath 图片指纹文件路径
     */
    getFingerprint(fingerprintPath) {
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
    readFileList(dirPath) {
        const fileNames = fs.readdirSync(dirPath);
        fileNames.forEach((fileName) => {
            // 获取文件的绝对路径
            const fullFilePath = path.join(dirPath, fileName);
            // 去除系统路径后文件在项目下的路径
            const filePath = path.join(this.input, fullFilePath.split(this.input)[1]);
            // 获取文件信息状态
            const fileStat = fs.statSync(fullFilePath);
            // 如果是文件
            if (fileStat.isFile()) {
                // 获取文件后缀名
                const fileExt = path.extname(fileName);
                const key = md5(filePath + fileStat.size);
                // 判断是否超出最大压缩限制
                if (fileStat.size > DEFAULT_OPTIONS.maxSize) {
                    this.logger.warning(`文件${fileName}超出5M的压缩限制`);
                }
                // 判断是否符合压缩图片类型
                if (!DEFAULT_OPTIONS.fileExts.includes(fileExt)) {
                    this.logger.warning(`文件${fileName}不符合 .png 或 .jpg 图片要求`);
                }
                if (fileStat.size < DEFAULT_OPTIONS.maxSize &&
                    DEFAULT_OPTIONS.fileExts.includes(fileExt) &&
                    (!this.fingerprintMap[filePath] ||
                        (this.fingerprintMap[filePath] &&
                            this.fingerprintMap[filePath] !== key))) {
                    this.filesList.push({
                        size: fileStat.size,
                        name: fileName,
                        path: filePath,
                    });
                }
            }
            else if (fileStat.isDirectory()) {
                // 文件夹
                this.readFileList(fullFilePath);
            }
        });
    }
    /**
     * 压缩图片的逻辑
     * @param {*} fileList 压缩的图片列表
     */
    compressImage(fileList) {
        return new Promise(async (resolve, reject) => {
            // 保存压缩后的图片信息
            const compressList = [];
            try {
                while (fileList.length) {
                    const currentFile = fileList.pop();
                    this.logger.info(`正在压缩图片 ${currentFile.path}`);
                    const fileContent = fs.readFileSync(currentFile.path, "binary");
                    const result = await this.uploadImage(fileContent, currentFile.path);
                    const { url, size, ratio } = result.output;
                    if (!url)
                        return;
                    const data = await this.downloadImage(url, currentFile.path);
                    if (!data)
                        return;
                    fs.writeFileSync(currentFile.path, data, "binary");
                    compressList.push({ ...currentFile, miniSize: size, ratio });
                }
                resolve(compressList);
            }
            catch (error) {
                // 这里如果上传图片和下载图片报错了，需要重试
                if (this.failWaitTime < 60) {
                    this.failWaitTime += 10;
                }
                sleep(this.failWaitTime).then(() => {
                    // 这里将 currentIndex 的值减去 maxLength，是为了重新获取失败的图片组
                    this.currentIndex -= DEFAULT_OPTIONS.maxLength;
                    this.startCompress();
                });
            }
        });
    }
    /**
     * 上传图片
     * @param {*} fileContent 图片内容
     * @param {*} filePath 图片路径
     */
    uploadImage(fileContent, filePath) {
        const options = getHeader();
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                res.on("data", (buffer) => {
                    const obj = JSON.parse(buffer.toString());
                    if (obj.error) {
                        this.logger.error(`[${filePath}]：压缩失败！报错信息：${obj.message}`);
                        reject(obj.message);
                    }
                    else {
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
    downloadImage(imageUrl, filePath) {
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
        const result = this.compressList.reduce((memo, current) => {
            const { miniSize, path } = current;
            memo[path] = md5(path + miniSize);
            return memo;
        }, {});
        this.output && this.mkdirRecursion(this.output);
        const outputPath = path.join(this.workDir, this.output, "image.json");
        fs.writeFileSync(outputPath, JSON.stringify({ fingerprintMap: { ...this.fingerprintMap, ...result } }, null, "\t"));
        this.logger.success(`图片指纹文件写入成功, 所在目录 ${outputPath}`);
    }
    /**
     * 递归创建文件夹目录
     * @param dir
     */
    mkdirRecursion(dir) {
        if (fs.existsSync(dir)) {
            return true;
        }
        else {
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
            const { name, path: filePath, size, miniSize, ratio, } = this.compressList[i];
            const fileSize = `${formatSize(size)}`;
            const compressionSize = `${formatSize(miniSize)}`;
            const compressionRatio = `${(1 - ratio).toFixed(2) * 100}%`;
            const desc = `| ${name} | ${fileSize} | ${compressionSize} | ${compressionRatio} | ${filePath} |\n`;
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
| 原始总大小 | 压缩后总大小 | 总压缩比 |\n| -- | -- | -- |\n| ${formatSize(sizeTotal)} | ${formatSize(miniSizeToal)} | ${ratioTotal.toFixed(2) * 100}% |`;
        str = str + totalStr;
        const imageRatioPath = path.join(this.workDir, this.output, "图片压缩比.md");
        fs.appendFileSync(imageRatioPath, str, "utf-8");
        this.logger.success(`压缩文档写入成功，目录 ${imageRatioPath}`);
    }
}
const app = new Tinypng();
app.run();
