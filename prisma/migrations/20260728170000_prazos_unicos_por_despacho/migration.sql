-- Fase 5: prazos automáticos.
-- 1. Unicidade (despacho, tipo) para re-rodar a ingestão recalcular o mesmo prazo
--    em vez de criar uma segunda linha.
-- 2. ON DELETE CASCADE: o ingest apaga e regrava os despachos de uma edição já
--    processada; sem cascade a FK do prazo bloquearia a regravação.

-- DropForeignKey
ALTER TABLE "prazos" DROP CONSTRAINT "prazos_despacho_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "prazos_despacho_id_tipo_key" ON "prazos"("despacho_id", "tipo");

-- AddForeignKey
ALTER TABLE "prazos" ADD CONSTRAINT "prazos_despacho_id_fkey" FOREIGN KEY ("despacho_id") REFERENCES "despachos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
