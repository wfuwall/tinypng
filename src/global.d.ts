export interface IFilesListItem {
  size: number;
  name: string;
  path: string;
}

export interface ICompressListItem extends IFilesListItem {
  miniSize: number;
  ratio: number;
}

export interface ILogger {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
  warning: (msg: string) => void;
}

export interface IFingerprintMap {
  [key: string]: string;
}

export interface IGetHeader {
  hostname: string;
  method: string;
  path: string;
  rejectUnauthorized: boolean;
  auth: string;
  headers: {
    "Cache-Control": string;
    "Content-Type": string;
    "Postman-Token": number;
    "User-Agent": string;
    "X-Forwarded-For": string;
  };
}

export interface IDefaultOptions {
  maxSize: number;
  tinyUrl: string;
  fileExts: string[];
  maxLength: number;
  keys: string[]
}