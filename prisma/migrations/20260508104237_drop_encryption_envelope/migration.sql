/*
  Warnings:

  - You are about to drop the column `encryption_envelope` on the `S3Object` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "S3Object" DROP COLUMN "encryption_envelope";
