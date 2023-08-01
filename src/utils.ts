import chalk from "chalk";
import figures from "figures";
import { DEFAULT_OPTIONS } from "./config";
import type { ILogger, IGetHeader } from "./global";

/**
 * 补零函数
 * @param {*} num
 */
export const fillZero = (num: number): string | number => {
  return num <= 9 ? `0${num}` : num;
};
/**
 * 获取当前的时间
 * @returns 返回 yyyy-mm-dd hh:mm:ss
 */
export const getNowDate = (): string => {
  const date = new Date();
  const year = date.getFullYear(); // 年
  const month = date.getMonth() + 1; // 月
  const day = date.getDate(); // 日
  const hour = date.getHours(); // 时
  const minutes = date.getMinutes(); // 分
  const seconds = date.getSeconds(); //秒
  return `${year}-${fillZero(month)}-${fillZero(day)} ${fillZero(
    hour
  )}:${fillZero(minutes)}:${fillZero(seconds)}`;
};

/**
 * 给图片大小增加单位
 * @param size 图片大小
 * @returns
 */
export const formatSize = (size: number): string => {
  return size > 1024 ? (size / 1024).toFixed(2) + "KB" : size + "B";
};

/**
 * 定义日志函数
 * @returns
 */
export const logger = (): ILogger => {
  const success = (msg: string) => {
    console.log(chalk.green(`${figures.tick}  ${msg}`));
  };
  const error = (msg: string) => {
    console.log(chalk.red(`${figures.cross}  ${msg}`));
  };
  const info = (msg: string) => {
    console.log(chalk.blue(`${figures.info}  ${msg}`));
  };
  const warning = (msg: string) => {
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
export const getRandomIp = (): string => {
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
export const getRandomArbitrary = (min: number, max: number): number => {
  return Math.random() * (max - min) + min;
};

/**
 * 实现 sleep 延迟执行函数
 * @param time 秒
 * @returns
 */
export const sleep = (time: number) => {
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
export const getHeader = (): IGetHeader => {
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
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36",
      "X-Forwarded-For": getRandomIp(),
    },
  };
};
