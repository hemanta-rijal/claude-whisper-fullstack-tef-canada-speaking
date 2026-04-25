-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `imageUrl` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `emailVerifiedAt` DATETIME(3) NULL,
    `oauthProvider` ENUM('GOOGLE', 'GITHUB') NULL,
    `oauthProviderAccountId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_oauthProviderAccountId_idx`(`oauthProviderAccountId`),
    UNIQUE INDEX `User_oauthProvider_oauthProviderAccountId_key`(`oauthProvider`, `oauthProviderAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

