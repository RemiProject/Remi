-- Phase 1: Reference data (seed tables; FKs pointing here are RESTRICT)
CREATE TABLE "Country" (
  "id"   uuid PRIMARY KEY,
  "code" char(2) NOT NULL UNIQUE,
  "name" text NOT NULL,
  CONSTRAINT "Country_code_upper_ck" CHECK ("code" = upper("code"))
);

CREATE TABLE "Language" (
  "id"    uuid PRIMARY KEY,
  "code"  text NOT NULL UNIQUE,
  "name"  text NOT NULL UNIQUE,
  "isRtl" boolean NOT NULL
);

CREATE TABLE "Locale" (
  "id"         uuid PRIMARY KEY,
  "code"       text NOT NULL UNIQUE,
  "name"       text NOT NULL,
  "languageId" uuid NOT NULL REFERENCES "Language"("id") ON DELETE RESTRICT
);

CREATE TABLE "Cuisine" (
  "id"   uuid PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "name" text NOT NULL
);

CREATE TABLE "FoodCategory" (
  "id"   uuid PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "name" text NOT NULL
);
