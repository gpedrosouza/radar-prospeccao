---
tags: [adr]
---

# ADR-004: Cloudflare R2 para storage de arquivos de exportação

**Status:** aceito
**Data:** 2026-06

## Contexto
A v1 salvava os arquivos `.csv.gz` de exportação em disco local (`CNPJ_EXPORT_DIR`), com a ressalva documentada de que, em deploy horizontal com múltiplas instâncias, isso exigiria storage compartilhado.

## Decisão
Usar Cloudflare R2 (S3-compatível) para todos os arquivos de exportação, desde o MVP — mesmo rodando numa única VPS.

## Alternativas consideradas
1. **Manter disco local, resolver storage compartilhado só quando escalar horizontalmente** — rejeitado: o custo de migrar depois (mudar todo o código de escrita/leitura de arquivo) é maior que integrar com object storage desde o início, que já é simples via SDK S3-compatível.
2. **AWS S3** — rejeitado: cobra taxa de egress por download; como bankers vão baixar CSVs com frequência, isso geraria custo crescente sem necessidade. R2 não cobra egress.
3. **DigitalOcean Spaces** — alternativa viável, mas R2 tem o melhor custo para o padrão de uso esperado (muito download, pouco armazenamento simultâneo).

## Consequências
- Nenhum arquivo de export fica acoplado à instância que o gerou — facilita escalar `apps/workers` horizontalmente depois sem mudança de código
- Download via URL pré-assinada, sem o processo `web` precisar servir o arquivo
- Custo previsto: próximo de zero no MVP (10GB grátis cobre o volume esperado)

## Links relacionados
- [[01-Arquitetura/Arquitetura-Geral]]
- [[02-Custos/Custo-Mensal-Consolidado]]
