-- 005: liked playlists. A like points at another user's public playlist.
CREATE TABLE IF NOT EXISTS playlist_likes (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  playlist_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, owner_id, playlist_id),
  CHECK (user_id <> owner_id)
);
