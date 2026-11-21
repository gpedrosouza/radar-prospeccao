-- Migration: email_campaigns
-- Schema para campanhas de e-mail com conformidade LGPD desde a modelagem:
--   - EmailBounce e EmailUnsubscribe bloqueiam destinatários permanentemente.
--   - Toda campanha rastreia criador, timestamps e métricas de bounce.
--   - EmailRecipient guarda snapshot (cnpj+uf como strings) — sem FK para
--     company_cnpj (tabela particionada com PK composta incompatível com FK).

-- ── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE "CampaignStatus"  AS ENUM ('rascunho', 'agendada', 'enviando', 'concluida', 'falhou');
CREATE TYPE "RecipientStatus" AS ENUM ('pendente', 'enviado', 'bounced', 'aberto', 'clicado', 'respondido');
CREATE TYPE "BounceType"      AS ENUM ('hard', 'soft');

-- ── email_campaigns ───────────────────────────────────────────────────────────

CREATE TABLE email_campaigns (
  id                  UUID             NOT NULL DEFAULT gen_random_uuid(),
  nome                TEXT             NOT NULL,
  usuario_id          UUID             NOT NULL,
  filtros_origem      JSONB            NOT NULL,
  assunto             TEXT             NOT NULL,
  corpo_template      TEXT             NOT NULL,
  status              "CampaignStatus" NOT NULL DEFAULT 'rascunho',
  total_destinatarios INT              NOT NULL DEFAULT 0,
  total_enviados      INT              NOT NULL DEFAULT 0,
  total_bounces       INT              NOT NULL DEFAULT 0,
  criado_em           TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enviado_em          TIMESTAMP(3),

  CONSTRAINT email_campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT email_campaigns_usuario_id_fkey
    FOREIGN KEY (usuario_id) REFERENCES users(id)
);

CREATE INDEX email_campaigns_usuario_id_idx ON email_campaigns (usuario_id);
CREATE INDEX email_campaigns_status_idx     ON email_campaigns (status);

-- ── email_recipients ──────────────────────────────────────────────────────────
-- Snapshot dos destinatários no momento da criação da campanha.
-- cnpj + uf são strings (sem FK — company_cnpj é particionada).

CREATE TABLE email_recipients (
  id                UUID               NOT NULL DEFAULT gen_random_uuid(),
  campaign_id       UUID               NOT NULL,
  cnpj              CHAR(14)           NOT NULL,
  uf                CHAR(2)            NOT NULL,
  email             TEXT               NOT NULL,
  status            "RecipientStatus"  NOT NULL DEFAULT 'pendente',
  enviado_em        TIMESTAMP(3),
  resend_message_id TEXT,

  CONSTRAINT email_recipients_pkey PRIMARY KEY (id),
  CONSTRAINT email_recipients_campaign_id_fkey
    FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE
);

CREATE INDEX email_recipients_campaign_id_idx ON email_recipients (campaign_id);
CREATE INDEX email_recipients_email_idx       ON email_recipients (email);
CREATE INDEX email_recipients_status_idx      ON email_recipients (status);

-- ── email_bounces ─────────────────────────────────────────────────────────────
-- E-mails que retornaram bounce (hard ou soft).
-- REGRA: qualquer e-mail aqui NUNCA deve ser destinatário de nova campanha.
-- Garantido em código (buildRecipientList), não via constraint de banco.

CREATE TABLE email_bounces (
  id        UUID          NOT NULL DEFAULT gen_random_uuid(),
  email     TEXT          NOT NULL,
  tipo      "BounceType"  NOT NULL,
  motivo    TEXT,
  criado_em TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT email_bounces_pkey      PRIMARY KEY (id),
  CONSTRAINT email_bounces_email_key UNIQUE (email)
);

-- ── email_unsubscribes ────────────────────────────────────────────────────────
-- E-mails que solicitaram descadastro.
-- REGRA: permanente e irrevogável — nunca enviar novamente, sem exceção.
-- campaign_id_origem é nullable (descadastro pode vir fora de campanha).

CREATE TABLE email_unsubscribes (
  id                 UUID         NOT NULL DEFAULT gen_random_uuid(),
  email              TEXT         NOT NULL,
  campaign_id_origem UUID,
  criado_em          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT email_unsubscribes_pkey      PRIMARY KEY (id),
  CONSTRAINT email_unsubscribes_email_key UNIQUE (email),
  CONSTRAINT email_unsubscribes_campaign_id_origem_fkey
    FOREIGN KEY (campaign_id_origem) REFERENCES email_campaigns(id) ON DELETE SET NULL
);
