-- CreateTable
CREATE TABLE "scheduled_meetings" (
    "id" UUID NOT NULL,
    "nome_lead" TEXT NOT NULL,
    "email_lead" TEXT NOT NULL,
    "telefone_lead" TEXT,
    "origem" TEXT NOT NULL,
    "campaign_id_origem" UUID,
    "session_id" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "google_event_id" TEXT NOT NULL,
    "google_meet_link" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmado',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_meetings_email_lead_idx" ON "scheduled_meetings"("email_lead");

-- CreateIndex
CREATE INDEX "scheduled_meetings_origem_idx" ON "scheduled_meetings"("origem");

-- CreateIndex
CREATE INDEX "scheduled_meetings_inicio_idx" ON "scheduled_meetings"("inicio");

-- AddForeignKey
ALTER TABLE "scheduled_meetings" ADD CONSTRAINT "scheduled_meetings_campaign_id_origem_fkey" FOREIGN KEY ("campaign_id_origem") REFERENCES "email_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
