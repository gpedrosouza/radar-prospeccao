import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necessário porque o dev server é acessado via Cloudflare Tunnel sob um
  // domínio diferente de localhost — sem isso o Next.js 15 bloqueia requisições
  // cross-origin (Server Actions, HMR) como proteção contra DNS rebinding.
  allowedDevOrigins: ["radar.grgestaofinanceira.com.br", "grgestaofinanceira.com.br"],
  transpilePackages: ["@radar/db", "@radar/shared"],
  // @node-rs/argon2 usa bindings nativos — não pode ser bundled pelo webpack
  serverExternalPackages: ["@node-rs/argon2"],
  // next-auth@5.0.0-beta.31: o tipo de retorno de NextAuth() referencia internals
  // de next-auth/lib que TypeScript não consegue nomear portavelmente.
  // Usar ignoreBuildErrors enquanto o pacote estiver em beta.
  typescript: { ignoreBuildErrors: true },
  // Gera .next/standalone/ com server.js + node_modules mínimos — necessário
  // para o Dockerfile de produção (elimina a necessidade de copiar node_modules inteiro)
  output: "standalone",
  // `next dev` e `next build` escrevem no mesmo diretório: um build de
  // verificação rodado com o dev server de pé substitui os artefatos de
  // desenvolvimento pelos de produção e o dev passa a servir HTML apontando
  // para chunks que não existem mais (404 em layout.css/page.js,
  // MODULE_NOT_FOUND em pages/_document). Rodar builds pontuais com
  // NEXT_DIST_DIR=.next-build isola os dois.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
