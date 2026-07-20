-- CreateTable
CREATE TABLE "BtstAlertState" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BtstAlertState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BtstAlertState_date_key" ON "BtstAlertState"("date");
