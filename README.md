# Vinylla

Vinylla is a 3D music web app. A vinyl turntable plays songs from YouTube, with live synced lyrics, search, a home carousel of top songs, playlists, favourites, accounts, friends, and an AI music assistant that can suggest and play songs.

## Features

- **3D turntable player** with a record, tonearm, and volume knob, drawn with Three.js
- **Live lyrics** synced to playback, with a karaoke-style word fill
- **Search and browse** through the YouTube Data API, with album covers from Deezer, MusicBrainz, and Cover Art Archive
- **Home carousel** of the day's most played songs
- **Playlists and favourites**, with public or private playlists
- **Accounts** with avatars, sign-in sessions, and password hashing (scrypt)
- **Social features:** find and follow people, friends list, block users, and like other people's playlists
- **AI music assistant** that answers questions and plays the songs it suggests

## Built with

- **Frontend:** HTML, CSS, vanilla JavaScript, Three.js for the 3D turntable, and the YouTube IFrame player for playback
- **Backend:** Node.js, Express, and PostgreSQL (through the `pg` package)
- **AI assistant:** Python, FastAPI, Uvicorn, and Google's Gemini SDK
- **Data sources:** YouTube Data API, LRCLIB (lyrics), MusicBrainz and Cover Art Archive (covers), and Deezer (covers)

## Project structure

```
Vinylla/
├── frontend/              Static site (HTML, CSS, vanilla JavaScript, 3D models and fonts)
├── backend/               Node.js + Express API, PostgreSQL database
│   ├── server.js          Main server: search, lyrics, covers, songs, and the frontend
│   ├── accounts.js        Accounts, sessions, libraries, people, and likes
│   ├── assistant.js       Forwards assistant chats to the agent
│   └── migrations/        SQL files, applied automatically at startup
└── agent/                 Python FastAPI service for the AI music assistant
    ├── main.py            HTTP endpoint for the agent
    ├── agent.py           Agent logic, instructions, and retries
    ├── vinylla_tools.py   Tools the agent uses to search and read the app's data
    └── eval.py            Test runner for the agent's answers
```

## Requirements

- Node.js 18 or newer
- Python 3.10 or newer
- PostgreSQL 16
- A free YouTube Data API key
- A free Google Gemini API key

## Setup

### 1. Database

Create a PostgreSQL database and user named `vinylla`. The migrations create all tables the first time the backend starts.

### 2. Backend

```powershell
cd backend
copy .env.example .env
npm install
```

Open `backend/.env` and fill in:

| Variable | Purpose |
| --- | --- |
| `YOUTUBE_API_KEY` | YouTube Data API key for search and charts |
| `DATABASE_URL` | PostgreSQL connection string |
| `MB_CONTACT` | Your email or app name, sent with MusicBrainz requests |

### 3. Agent

```powershell
cd agent
copy .env.example .env
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Open `agent/.env` and fill in:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Your free Gemini API key |
| `GEMINI_MODEL` | Model name, for example `gemini-3.5-flash-lite` |
| `VINYLLA_URL` | Address of the backend, normally `http://127.0.0.1:3000` |

Never commit the real `.env` files. Git ignores them, and only the `.env.example` templates belong on GitHub.

## Running

Start the backend and the agent in two separate terminals.

Backend:

```powershell
cd backend
node server.js
```

Agent:

```powershell
cd agent
.venv\Scripts\activate
python -m uvicorn main:app --port 8001
```

Then open <http://localhost:3000> in your browser. The backend serves the frontend itself.

## Notes

- The backend and the agent must be restarted after their code or `.env` files change. The frontend only needs a page reload.
- Lyrics come from the free LRCLIB service. They are synced per line, not per word, and some songs have no lyrics.
- The assistant needs the agent to be running on port 8001. If it is not, the chat shows an unavailable message.
- Some data comes from free public services with rate limits, so the first load of covers and lyrics can be slower.

## License

No license has been chosen yet.
