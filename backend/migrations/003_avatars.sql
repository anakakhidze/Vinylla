-- 003: profile photo for each user (a small resized image, stored as a data URL).
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
