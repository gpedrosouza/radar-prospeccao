# Prompt 21 — Docker Compose de Produção com HTTPS (Caddy)

> Fase: 4 — Workers e Escala
> Pré-requisito: Fase 3 completa

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto.

Vamos preparar o ambiente de produção. A decisão arquitetural é: uma VPS única rodando tudo via
Docker Compose (web, worker-export, worker-enrichment, postgres, redis), com Caddy como reverse
proxy fazendo HTTPS automático via Let's Encrypt. Ver [[01-Arquitetura/Infraestrutura-e-Deploy]]
no vault para o contexto completo dessa decisão.

Crie:

1. docker-compose.prod.yml (separado do docker-compose.yml de desenvolvimento):
   - Mesmos serviços do dev, mas:
     - Sem portas expostas diretamente ao host exceto via Caddy (80/443)
     - Volumes nomeados para persistência real (não bind mounts de desenvolvimento)
     - Variáveis de ambiente vindas de um .env de produção (nunca commitado)
     - Restart policy "unless-stopped" em todos os serviços
     - Healthchecks configurados para postgres, redis, e web

2. Serviço caddy:
   - Imagem caddy:2
   - Um Caddyfile na raiz configurando: domínio do projeto -> proxy_reverse para o serviço web
     na porta interna, com HTTPS automático
   - Volume para persistir os certificados entre restarts

3. Dockerfile de produção para apps/web (multi-stage build: stage de build instala deps e
   builda o Next.js, stage final só copia o output e roda `next start`, minimizando o tamanho
   da imagem final)

4. Dockerfile de produção para apps/workers (similar, multi-stage, rodando o JS compilado)

5. Um arquivo .env.production.example documentando TODAS as variáveis necessárias em produção
   (incluindo as do R2, Google Maps, banco, Redis, NextAuth secret)

Não tenho ainda o domínio real nem a VPS provisionada neste momento — implemente tudo de forma
parametrizável (domínio via variável de ambiente no Caddyfile) e me dê o passo a passo exato
de como eu vou:
a) Provisionar a VPS (lista de requisitos minimos: specs, portas a abrir no firewall)
b) Clonar o repositório lá
c) Configurar o .env de produção
d) Rodar docker compose -f docker-compose.prod.yml up -d
e) Verificar que tudo subiu corretamente
```

## Após rodar este prompt
- Guarde o passo a passo de provisionamento em [[01-Arquitetura/Infraestrutura-e-Deploy]] do vault
- Avance para `22-ci-cd-deploy-ssh.md`
