-- Migration: adiciona 'falhou' ao enum RecipientStatus
-- Necessário para marcar destinatários cujo envio falhou individualmente sem
-- abortar a campanha inteira. ALTER TYPE ... ADD VALUE é backward-compatible
-- e não bloqueia leituras ou escritas existentes.

ALTER TYPE "RecipientStatus" ADD VALUE 'falhou';
