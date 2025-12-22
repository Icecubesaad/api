CREATE TABLE IF NOT EXISTS embeddings (
    id TEXT PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    vector vector(1536),
    "chunkText" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    date TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
