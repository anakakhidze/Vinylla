"""The music agent: Gemini decides which tools to use, then returns a reply and song suggestions."""
import json
import os
import re

from google import genai
from google.genai import types

from vinylla_tools import make_tools

SYSTEM = """You are the music assistant of Vinylla, a music app.
Help with moods, genres (pop, jazz, classical, lo-fi, calm, workout...) and answer general questions briefly and kindly.
When the user wants music:
1. Use search_music to find real songs for the request (search a genre, mood, or artist).
2. Use my_library when the user asks for something personal, and top_today for what is popular now.
3. Pick 3 to 6 songs and use find_audio on each one; only keep songs that are found.
Reply ONLY with JSON: {"reply": "a short friendly message", "songs": [{"title": "...", "artist": "..."}]}.
Use an empty songs array when no songs are needed. Never invent links."""


def _parse(text):
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            p = json.loads(m.group(0))
            songs = [
                {"title": str(x.get("title", "")), "artist": str(x.get("artist", ""))}
                for x in (p.get("songs") or []) if x.get("title")
            ][:6]
            return {"reply": str(p.get("reply", "")), "songs": songs}
        except Exception:
            pass
    return {"reply": text, "songs": []}


def run_agent(history, cookie=None):
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not set in agent/.env")
    model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    client = genai.Client(api_key=key)
    contents = [
        types.Content(role="model" if m["role"] == "assistant" else "user", parts=[types.Part(text=m["content"])])
        for m in history
    ]
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM,
        tools=make_tools(cookie),
        temperature=0.7,
        max_output_tokens=900,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(maximum_remote_calls=6),
    )
    import time
    response = None
    for attempt in range(4):
        try:
            response = client.models.generate_content(model=model, contents=contents, config=config)
            break
        except Exception as e:
            busy = "503" in str(e) or "429" in str(e) or "UNAVAILABLE" in str(e)
            if not busy or attempt == 3:
                raise
            time.sleep(2 ** attempt * 2)
    return _parse((response.text or "").strip())
