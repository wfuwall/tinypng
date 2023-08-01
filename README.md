# tinypng

压缩图片的工具包

### 使用方式

- 安装

```js
npm install @didi/tinypng -D
```
- 配置 api keys 秘钥文件 secret.json
```json
[
  "secret1",
  "secret2",
]
```

- 执行命令

```js
tinypng --input src/assets --output src/tinypng --secret src/secret.json
```

> --input  指定要压缩的目录
> --output 指定压缩文档和图片指纹的输出目录，压缩后的图片会默认替换原图片
> --secret 指定秘钥文件的目录
