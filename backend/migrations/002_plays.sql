-- 002: listens per song per day, used for the "top songs today" list on the home page.
CREATE TABLE IF NOT EXISTS plays (
  video_id TEXT NOT NULL,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  count INT NOT NULL DEFAULT 0,
  track JSONB NOT NULL,
  PRIMARY KEY (video_id, day)
);

CREATE INDEX IF NOT EXISTS plays_day_count ON plays (day, count DESC);
