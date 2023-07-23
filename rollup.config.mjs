import babel from "@rollup/plugin-babel";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
export default {
  input: "src/index.ts",
  output: {
    file: "bin/index.js",
    format: "cjs",
    banner: "#!/usr/bin/env node",
  },
  external: ["chalk", "path", "fs", "minimist", "md5", "figures"],
  plugins: [
    babel({
      exclude: "node_modules/**",
    }),
    resolve(),
    commonjs(),
    typescript(),
  ],
};
