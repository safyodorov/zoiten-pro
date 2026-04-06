-- Карточки товаров Wildberries
CREATE TABLE "WbCard" (
    "id" TEXT NOT NULL,
    "nmId" INTEGER NOT NULL,
    "article" TEXT NOT NULL,
    "barcode" TEXT,
    "barcodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "photoUrl" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hasVideo" BOOLEAN NOT NULL DEFAULT false,
    "rating" DOUBLE PRECISION,
    "reviewsTotal" INTEGER,
    "reviews1" INTEGER,
    "reviews2" INTEGER,
    "reviews3" INTEGER,
    "reviews4" INTEGER,
    "reviews5" INTEGER,
    "price" DOUBLE PRECISION,
    "label" VARCHAR(100),
    "availability" TEXT NOT NULL DEFAULT 'IN_STOCK',
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WbCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WbCard_nmId_key" ON "WbCard"("nmId");
