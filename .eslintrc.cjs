module.exports = {
  env: { node: true, es2021: true },
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "import", "unused-imports"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
    "plugin:import/recommended",
    "plugin:import/typescript",
  ],
  settings: {
    "import/resolver": {
      node: {
        moduleDirectory: ["node_modules", "src/"],
      },
      typescript: {
        alwaysTryTypes: true,
        project: ["**/tsconfig.json"],
      },
    },
  },
  rules: {
    "import/no-relative-packages": "error",
    "import/no-unresolved": "error",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
    ],
    "require-await": "warn",
    "import/order": [
      "error",
      {
        groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
        "newlines-between": "always",
        alphabetize: {
          order: "asc",
          caseInsensitive: true,
        },
      },
    ],
    "@typescript-eslint/naming-convention": [
      "warn",
      { selector: "class", format: ["PascalCase"] },
      { selector: ["enumMember"], format: ["PascalCase"] },
    ],
    eqeqeq: ["error", "always"],
    "@typescript-eslint/no-explicit-any": "off",
  },
  parserOptions: {
    project: ["./tsconfig.json"],
    tsconfigRootDir: __dirname,
  },
}
