-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create Constituencies Table
CREATE TABLE constituencies (
  id integer PRIMARY KEY,
  name text NOT NULL,
  district text NOT NULL
);

-- Create Votes Table
CREATE TABLE votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  constituency_id integer NOT NULL REFERENCES constituencies(id),
  vote_group text NOT NULL CHECK (vote_group IN ('LDF', 'UDF', 'NDA', 'OTHER')),
  created_at timestamp with time zone DEFAULT now(),
  device_hash text NOT NULL
);

-- Create Constituency Stats Table
CREATE TABLE constituency_stats (
  constituency_id integer PRIMARY KEY REFERENCES constituencies(id),
  ldf_votes integer DEFAULT 0,
  udf_votes integer DEFAULT 0,
  nda_votes integer DEFAULT 0,
  other_votes integer DEFAULT 0,
  total_votes integer DEFAULT 0,
  leading_party text DEFAULT 'OTHER',
  updated_at timestamp with time zone DEFAULT now()
);

-- Setup Unique Constraint for strictly Database-level anti-spam!
CREATE UNIQUE INDEX unique_vote_per_device 
ON votes(device_hash);

-- Seed Stats & Config Tables automatically when a constituency is created
CREATE OR REPLACE FUNCTION seed_constituency_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO constituency_stats (constituency_id) VALUES (NEW.id);
  INSERT INTO admin_constituency_settings (constituency_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_constituency_inserted
AFTER INSERT ON constituencies
FOR EACH ROW
EXECUTE FUNCTION seed_constituency_stats();

-- Create Optimized O(1) Trigger for Votes Update - ONE SINGLE QUERY
CREATE OR REPLACE FUNCTION update_constituency_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment vote counts directly and evaluate leading party natively inside single pass
  UPDATE constituency_stats
  SET
    ldf_votes = ldf_votes + (NEW.vote_group = 'LDF')::int,
    udf_votes = udf_votes + (NEW.vote_group = 'UDF')::int,
    nda_votes = nda_votes + (NEW.vote_group = 'NDA')::int,
    other_votes = other_votes + (NEW.vote_group = 'OTHER')::int,
    total_votes = total_votes + 1,
    leading_party = (
      SELECT party FROM (
        VALUES 
          ('LDF', ldf_votes + (NEW.vote_group = 'LDF')::int),
          ('UDF', udf_votes + (NEW.vote_group = 'UDF')::int),
          ('NDA', nda_votes + (NEW.vote_group = 'NDA')::int),
          ('OTHER', other_votes + (NEW.vote_group = 'OTHER')::int)
      ) AS t(party, votes)
      ORDER BY votes DESC
      LIMIT 1
    ),
    updated_at = NOW()
  WHERE constituency_id = NEW.constituency_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_vote_inserted
AFTER INSERT ON votes
FOR EACH ROW
EXECUTE FUNCTION update_constituency_stats();


-- Enable RLS for Security
ALTER TABLE constituencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE constituency_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Anonymous users can read constituencies and stats
CREATE POLICY "Public constituencies are viewable by everyone."
  ON constituencies FOR SELECT USING (true);
  
CREATE POLICY "Public stats are viewable by everyone."
  ON constituency_stats FOR SELECT USING (true);

-- Anonymous users can insert votes, but cannot read or update them
CREATE POLICY "Anyone can insert votes."
  ON votes FOR INSERT WITH CHECK (true);

-- Admin Settings Table
CREATE TABLE admin_settings (
  id integer PRIMARY KEY DEFAULT 1,
  simulation_enabled boolean DEFAULT true,
  global_epoch timestamp with time zone DEFAULT now(),
  increment_ldf float DEFAULT 0.8,
  increment_udf float DEFAULT 0.7,
  increment_nda float DEFAULT 0.2,
  increment_oth float DEFAULT 0.05,
  poster_enabled boolean DEFAULT false,
  poster_url text DEFAULT '',
  poster_message text DEFAULT '',
  CHECK (id = 1)
);

INSERT INTO admin_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public settings are viewable by everyone" ON admin_settings FOR SELECT USING (true);
CREATE POLICY "Only authenticated admins can update settings" ON admin_settings FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Only authenticated admins can update stats" ON constituency_stats FOR UPDATE USING (auth.role() = 'authenticated');

-- Granular Constituency Level Admin Controls
CREATE TABLE admin_constituency_settings (
  constituency_id integer PRIMARY KEY REFERENCES constituencies(id),
  sim_enabled boolean DEFAULT true,
  epoch timestamp with time zone DEFAULT now(),
  inc_ldf float DEFAULT 0.0,
  inc_udf float DEFAULT 0.0,
  inc_nda float DEFAULT 0.0,
  inc_oth float DEFAULT 0.0
);

ALTER TABLE admin_constituency_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public sim settings viewable by everyone" ON admin_constituency_settings FOR SELECT USING (true);
CREATE POLICY "Only authenticated admins update sim settings" ON admin_constituency_settings FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Only authenticated admins insert sim settings" ON admin_constituency_settings FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Advanced RPC for "Baking" and Modifying safely in one transaction
CREATE OR REPLACE FUNCTION admin_save_constituency(
  p_id integer,
  f_ldf integer,
  f_udf integer,
  f_nda integer,
  f_oth integer,
  s_on boolean,
  i_ldf float,
  i_udf float,
  i_nda float,
  i_oth float
) RETURNS void AS $$
BEGIN
  -- Overwrite actual stats (Baking fake votes or Manual Override)
  UPDATE constituency_stats
  SET 
    ldf_votes = f_ldf,
    udf_votes = f_udf,
    nda_votes = f_nda,
    other_votes = f_oth,
    total_votes = f_ldf + f_udf + f_nda + f_oth,
    leading_party = (
      SELECT party FROM (
        VALUES 
          ('LDF', f_ldf),
          ('UDF', f_udf),
          ('NDA', f_nda),
          ('OTHER', f_oth)
      ) AS t(party, votes)
      ORDER BY votes DESC
      LIMIT 1
    ),
    updated_at = NOW()
  WHERE constituency_id = p_id;

  -- Reset epoch and set new rates
  UPDATE admin_constituency_settings
  SET
    sim_enabled = s_on,
    epoch = now(),
    inc_ldf = i_ldf,
    inc_udf = i_udf,
    inc_nda = i_nda,
    inc_oth = i_oth
  WHERE constituency_id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Nuke All Baked Fake Votes (Restore from actual voter hashes)
CREATE OR REPLACE FUNCTION admin_nuke_fake_votes()
RETURNS void AS $$
BEGIN
  -- 1. Reset all stats to accurately reflect ONLY genuine votes physically stored in raw votes table
  UPDATE constituency_stats cs
  SET 
    ldf_votes = COALESCE((SELECT COUNT(*)::int FROM votes v WHERE v.constituency_id = cs.constituency_id AND v.vote_group = 'LDF'), 0),
    udf_votes = COALESCE((SELECT COUNT(*)::int FROM votes v WHERE v.constituency_id = cs.constituency_id AND v.vote_group = 'UDF'), 0),
    nda_votes = COALESCE((SELECT COUNT(*)::int FROM votes v WHERE v.constituency_id = cs.constituency_id AND v.vote_group = 'NDA'), 0),
    other_votes = COALESCE((SELECT COUNT(*)::int FROM votes v WHERE v.constituency_id = cs.constituency_id AND v.vote_group = 'OTHER'), 0),
    total_votes = COALESCE((SELECT COUNT(*)::int FROM votes v WHERE v.constituency_id = cs.constituency_id), 0),
    leading_party = COALESCE(
      (
        SELECT party FROM (
          VALUES 
            ('LDF', COALESCE((SELECT COUNT(*)::int FROM votes v WHERE v.constituency_id = cs.constituency_id AND v.vote_group = 'LDF'), 0)),
            ('UDF', COALESCE((SELECT COUNT(*)::int FROM votes v WHERE v.constituency_id = cs.constituency_id AND v.vote_group = 'UDF'), 0)),
            ('NDA', COALESCE((SELECT COUNT(*)::int FROM votes v WHERE v.constituency_id = cs.constituency_id AND v.vote_group = 'NDA'), 0)),
            ('OTHER', COALESCE((SELECT COUNT(*)::int FROM votes v WHERE v.constituency_id = cs.constituency_id AND v.vote_group = 'OTHER'), 0))
        ) AS t(party, aggregateCount)
        ORDER BY aggregateCount DESC
        LIMIT 1
      ), 'OTHER'
    ),
    updated_at = NOW()
  WHERE cs.constituency_id > 0;

  -- 2. Reset the epoch to now to drop all pending client-side fake calculations uniformly
  UPDATE admin_constituency_settings
  SET epoch = now()
  WHERE constituency_id > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
