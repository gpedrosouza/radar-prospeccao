import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Prefixo _ é a convenção do projeto para "existe mas não é usado de
      // propósito" (args de callback posicionais, destructuring descartado).
      // Sem isso, cada uso legítimo precisaria de um eslint-disable inline.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Impede imports cruzados entre apps/web e apps/workers
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/apps/web/**", "../web/**", "../../web/**"],
              message: "apps/workers não pode importar de apps/web — use packages/",
            },
            {
              group: ["**/apps/workers/**", "../workers/**", "../../workers/**"],
              message: "apps/web não pode importar de apps/workers — use packages/",
            },
          ],
        },
      ],
    },
  },
  {
    // Só apps/web tem React — packages/ e apps/workers são Node puro.
    //
    // Registra apenas as duas regras clássicas, não o preset
    // "recommended-latest" (v7 liga 17 regras, incluindo as do React Compiler:
    // immutability, purity, set-state-in-effect…). Estas duas são as que o
    // Next.js sempre habilitou e as únicas referenciadas por comentários
    // eslint-disable existentes no código.
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // JS puro rodando em Node (configs CommonJS, scripts standalone .mjs):
    // typescript-eslint desliga no-undef só para .ts, então aqui os globais do
    // Node precisam ser declarados — melhor que tirar os arquivos do lint.
    // globals.node cobre console/process/Buffer/module/require/__dirname.
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: { globals: globals.node },
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/generated/**",
      // Gerado pelo Next a cada build e nunca editado à mão — a própria
      // documentação diz para não tocar. Lintar não agrega nada.
      "apps/web/next-env.d.ts",
      // Exports de design (HTML/PNG + bundles marcados "GENERATED — do not
      // edit", buildados a partir de dc-runtime). Não é código do sistema.
      "docs/design/**",
    ],
  }
);
