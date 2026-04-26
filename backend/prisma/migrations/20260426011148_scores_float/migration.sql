/*
  Warnings:

  - You are about to alter the column `overallScore` on the `TestResult` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `sectionAScore` on the `TestResult` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `sectionBScore` on the `TestResult` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `lexicalRichness` on the `TestResult` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `taskFulfillment` on the `TestResult` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `grammar` on the `TestResult` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `coherence` on the `TestResult` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.

*/
-- AlterTable
ALTER TABLE `TestResult` MODIFY `overallScore` DOUBLE NOT NULL,
    MODIFY `sectionAScore` DOUBLE NULL,
    MODIFY `sectionBScore` DOUBLE NULL,
    MODIFY `lexicalRichness` DOUBLE NOT NULL,
    MODIFY `taskFulfillment` DOUBLE NOT NULL,
    MODIFY `grammar` DOUBLE NOT NULL,
    MODIFY `coherence` DOUBLE NOT NULL;
