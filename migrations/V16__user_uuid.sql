-- Move user_account off a bigint identity PK onto a v4 UUID, and repoint every
-- referencing FK (list_entry, user_taste). Existing rows are migrated in place:
-- each account is assigned a fresh UUID and its child rows are remapped by the
-- old bigint id before the old columns are dropped.
--
-- gen_random_uuid() is v4 and is in core Postgres (>= 13); pgcrypto is only a
-- fallback for older servers. New sign-ups set the id from the app (uuid lib),
-- but the column keeps a default so import paths that omit it still get a UUID.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. New UUID columns. user_account gets its values now; the FK tables get a
--    nullable staging column to backfill.
ALTER TABLE user_account ADD COLUMN id_uuid   uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE list_entry   ADD COLUMN user_uuid uuid;
ALTER TABLE user_taste   ADD COLUMN user_uuid uuid;

-- 2. Remap children by the existing bigint id.
UPDATE list_entry le SET user_uuid = ua.id_uuid FROM user_account ua WHERE le.user_id = ua.id;
UPDATE user_taste ut SET user_uuid = ua.id_uuid FROM user_account ua WHERE ut.user_id = ua.id;

-- 3. Drop FKs and PKs that depend on the old bigint columns.
ALTER TABLE list_entry DROP CONSTRAINT list_entry_user_id_fkey;
ALTER TABLE user_taste DROP CONSTRAINT user_taste_user_id_fkey;
ALTER TABLE list_entry DROP CONSTRAINT list_entry_pkey;
ALTER TABLE user_taste DROP CONSTRAINT user_taste_pkey;
ALTER TABLE user_account DROP CONSTRAINT user_account_pkey;

-- 4. Swap the columns: drop old bigint, promote the UUID to the canonical name.
ALTER TABLE list_entry   DROP COLUMN user_id;
ALTER TABLE list_entry   RENAME COLUMN user_uuid TO user_id;
ALTER TABLE list_entry   ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE user_taste   DROP COLUMN user_id;
ALTER TABLE user_taste   RENAME COLUMN user_uuid TO user_id;
ALTER TABLE user_taste   ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE user_account DROP COLUMN id;
ALTER TABLE user_account RENAME COLUMN id_uuid TO id;

-- 5. Re-establish PKs and FKs on the UUID columns.
ALTER TABLE user_account ADD PRIMARY KEY (id);
ALTER TABLE list_entry   ADD PRIMARY KEY (user_id, media_id);
ALTER TABLE list_entry   ADD CONSTRAINT list_entry_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES user_account(id) ON DELETE CASCADE;
ALTER TABLE user_taste   ADD PRIMARY KEY (user_id);
ALTER TABLE user_taste   ADD CONSTRAINT user_taste_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES user_account(id) ON DELETE CASCADE;

-- 6. Recreate the lookup index dropped with the old column.
CREATE INDEX IF NOT EXISTS list_entry_user_idx ON list_entry (user_id, status);

-- 7. Keep a server-side default so any insert path that omits id still gets a UUID.
ALTER TABLE user_account ALTER COLUMN id SET DEFAULT gen_random_uuid();
