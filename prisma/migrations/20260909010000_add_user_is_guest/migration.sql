-- Guest access: mark throwaway guest accounts so they can be distinguished
-- (e.g. for cleanup) from real registered users. Defaults false for existing rows.
ALTER TABLE "User" ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false;
