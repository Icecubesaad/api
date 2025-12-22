-- Add missing columns to match Prisma schema

-- Create missing enums
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuthProvider') THEN
        CREATE TYPE "AuthProvider" AS ENUM ('FIREBASE', 'LOCAL', 'GOOGLE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SourceType') THEN
        CREATE TYPE "SourceType" AS ENUM ('NOTE', 'UPLOAD', 'LOG');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NoteKind') THEN
        CREATE TYPE "NoteKind" AS ENUM ('TEXT', 'VOICE', 'AI');
    END IF;
END $$;

-- Add password and authProvider to users table
ALTER TABLE "users" 
ADD COLUMN IF NOT EXISTS "password" TEXT,
ADD COLUMN IF NOT EXISTS "authProvider" "AuthProvider" NOT NULL DEFAULT 'FIREBASE';

-- Rename recurrence to recurrenceJson in reminders table and change type to JSONB
ALTER TABLE "reminders" 
DROP COLUMN IF EXISTS "recurrence",
ADD COLUMN IF NOT EXISTS "recurrenceJson" JSONB;

-- Add audioPath to notes table
ALTER TABLE "notes" 
ADD COLUMN IF NOT EXISTS "audioPath" TEXT;

-- Update daily_logs: rename columns to match schema
ALTER TABLE "daily_logs"
DROP COLUMN IF EXISTS "sourceNoteIds",
DROP COLUMN IF EXISTS "tasks",
DROP COLUMN IF EXISTS "hazards",
DROP COLUMN IF EXISTS "attachments",
ADD COLUMN IF NOT EXISTS "tasksJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "sourceRefsJson" JSONB NOT NULL DEFAULT '{}';

-- Update notes: rename type to kind (NoteType to NoteKind enum)

-- Add kind column if it doesn't exist
ALTER TABLE "notes" 
ADD COLUMN IF NOT EXISTS "kind" "NoteKind" NOT NULL DEFAULT 'TEXT';

-- Migrate data from type to kind if type column exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notes' AND column_name = 'type') THEN
        UPDATE "notes" SET "kind" = CASE 
            WHEN "type"::text = 'TEXT' THEN 'TEXT'::"NoteKind"
            WHEN "type"::text = 'VOICE' THEN 'VOICE'::"NoteKind"
            WHEN "type"::text = 'AI' THEN 'AI'::"NoteKind"
            ELSE 'TEXT'::"NoteKind"
        END;
        ALTER TABLE "notes" DROP COLUMN IF EXISTS "type";
    END IF;
END $$;

-- Update notifications: rename meta to metaJson
ALTER TABLE "notifications"
DROP COLUMN IF EXISTS "meta",
ADD COLUMN IF NOT EXISTS "metaJson" JSONB NOT NULL DEFAULT '{}';

-- Update audit_events: rename meta to metaJson
ALTER TABLE "audit_events"
DROP COLUMN IF EXISTS "meta",
ADD COLUMN IF NOT EXISTS "metaJson" JSONB NOT NULL DEFAULT '{}';

-- Update embeddings table structure to match schema
ALTER TABLE "embeddings"
DROP COLUMN IF EXISTS "uploadId",
DROP COLUMN IF EXISTS "noteId",
ADD COLUMN IF NOT EXISTS "projectId" TEXT,
ADD COLUMN IF NOT EXISTS "sourceType" "SourceType",
ADD COLUMN IF NOT EXISTS "sourceId" TEXT,
ADD COLUMN IF NOT EXISTS "date" TIMESTAMP(3);

-- Create index on embeddings if it doesn't exist
CREATE INDEX IF NOT EXISTS "embeddings_projectId_sourceType_date_idx" ON "embeddings"("projectId", "sourceType", "date");

