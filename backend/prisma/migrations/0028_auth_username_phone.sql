-- Additive: legacy accounts retain their credentials and email login.
ALTER TABLE "User" ADD COLUMN "username" text, ADD COLUMN "phoneNumber" text;
ALTER TABLE "User" ADD CONSTRAINT "User_username_format_ck"
  CHECK ("username" IS NULL OR "username" ~ '^[a-z][a-z0-9_]{2,29}$');
CREATE UNIQUE INDEX "User_username_uq" ON "User" ("username");
ALTER TABLE "User" ADD CONSTRAINT "User_phone_format_ck"
  CHECK ("phoneNumber" IS NULL OR "phoneNumber" ~ '^\+[1-9][0-9]{7,14}$');
INSERT INTO "Country" (id, code, name) VALUES
  (gen_random_uuid(), 'SA', 'Saudi Arabia') ON CONFLICT (code) DO NOTHING;
