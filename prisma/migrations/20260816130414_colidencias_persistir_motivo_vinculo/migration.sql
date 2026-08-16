-- CreateEnum
CREATE TYPE "MotivoVinculo" AS ENUM ('processo', 'nome', 'similaridade');

-- AlterTable
ALTER TABLE "despachos" ADD COLUMN     "motivo_vinculo" "MotivoVinculo",
ADD COLUMN     "similaridade_score" INTEGER;

-- CreateIndex
CREATE INDEX "despachos_motivo_vinculo_idx" ON "despachos"("motivo_vinculo");
