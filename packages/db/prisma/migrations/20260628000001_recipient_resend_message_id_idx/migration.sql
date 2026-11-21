-- Migration: índice em email_recipients.resend_message_id
-- O webhook do Resend faz lookup por resend_message_id a cada evento entregue.
-- Sem índice, cada webhook causaria um seq-scan sobre toda a tabela.

CREATE INDEX email_recipients_resend_message_id_idx
  ON email_recipients (resend_message_id)
  WHERE resend_message_id IS NOT NULL;
