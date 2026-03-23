CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text,
  google_id text,
  display_name text,
  preferred_size text,
  height_cm integer,
  weight_kg integer,
  body_type text,
  profile_image_url text,
  created_at timestamp DEFAULT now()
);
