module.exports = {
  extends: ["../../.eslintrc.cjs"],
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  env: {
    node: true,
    es2021: true,
  },
}
