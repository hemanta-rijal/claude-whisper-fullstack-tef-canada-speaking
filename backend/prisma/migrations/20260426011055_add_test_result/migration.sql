-- CreateTable
CREATE TABLE `TestResult` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sections` VARCHAR(191) NOT NULL,
    `overallScore` INTEGER NOT NULL,
    `sectionAScore` INTEGER NULL,
    `sectionBScore` INTEGER NULL,
    `lexicalRichness` INTEGER NOT NULL,
    `taskFulfillment` INTEGER NOT NULL,
    `grammar` INTEGER NOT NULL,
    `coherence` INTEGER NOT NULL,
    `feedback` TEXT NOT NULL,
    `suggestions` TEXT NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `completedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TestResult_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TestResult` ADD CONSTRAINT `TestResult_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
