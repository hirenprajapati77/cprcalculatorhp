-- CreateTable
CREATE TABLE "BrokerToken" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "broker" TEXT NOT NULL DEFAULT 'fyers',
    "accessToken" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
