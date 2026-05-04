CREATE TABLE "Proxy" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "proxyParameter" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Proxy_pkey" PRIMARY KEY ("id")
);
