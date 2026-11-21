"""Tools the agent can use. They call the Vinylla backend, forwarding the user's sign-in cookie."""
import os
import httpx

BASE = os.getenv("VINYLLA_URL", "http://127.0.0.1:3000")


def make_tools(cookie):
    headers = {"Cookie": cookie} if cookie else {}

    def _get(path, params=None):
        try:
            r = httpx.get(BASE + path, params=params, headers=headers, timeout=15)
            return r.json()
        except Exception as e:  # keep the agent going even if one tool fails
            return {"error": str(e)}

    def search_music(query: str) -> dict:
        """Search official songs by a title, artist, or genre. Returns a list of songs with title and artist."""
        d = _get("/api/yt/search", {"q": query})
        songs = (d.get("songs") or [])[:8]
        return {"songs": [{"title": s.get("t") or s.get("title"), "artist": s.get("a") or s.get("channel")} for s in songs]}

    def my_library() -> dict:
        """Return the signed-in user's favourite songs and playlist names, to tailor suggestions."""
        d = _get("/api/me/library")
        return {
            "favourites": [{"title": f.get("t"), "artist": f.get("a")} for f in (d.get("favourites") or [])][:20],
            "playlists": [p.get("name") for p in (d.get("playlists") or [])][:20],
        }

    def top_today() -> dict:
        """Return the songs listened to most today on Vinylla."""
        d = _get("/api/music/top")
        return {"songs": [{"title": i.get("title"), "artist": i.get("channel")} for i in (d.get("items") or [])]}

    def find_audio(title: str, artist: str) -> dict:
        """Check that an official audio version of a song can be played. Returns found true or false."""
        d = _get("/api/yt/audio", {"title": title, "artist": artist})
        return {"found": bool(d.get("videoId"))}

    return [search_music, my_library, top_today, find_audio]
