-- CreateTable
CREATE TABLE "BreakoutAlertState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "hadBreakout" BOOLEAN NOT NULL DEFAULT false,
    "lastAlerted" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "BreakoutAlertState_symbol_key" ON "BreakoutAlertState"("symbol");
