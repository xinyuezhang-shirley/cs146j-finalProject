# ECHO — Computational Text Art Studio

A minimalist text art studio where users paste prose and transform it into interactive word-based visualizations. Saved pieces persist in **Supabase** through Echo's Express API.

## Project Structure

```
├── backend/
│   ├── server.js              # Express API (analysis, art data, gallery works)
│   ├── supabaseClient.js      # Supabase service-role client (backend only)
│   ├── sql/echo_works.sql     # Gallery table schema
│   ├── lib/
│   │   ├── analyzeText.js
│   │   ├── worksApi.js        # Save/load/delete gallery works
│   │   └── …
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── index.html             # Studio
│   ├── gallery.html           # Gallery + fixed preview
│   ├── main.js
│   ├── gallery.js
│   └── helperJS/
│       ├── apiClient.js       # fetch() client for /api/*
│       ├── renderMode.js      # Shared renderer dispatch (Studio + Gallery)
│       └── …
├── .env.example
└── package.json
```

## Pages

| Page | Path | Description |
|------|------|-------------|
| Studio | `index.html` | Compose, transform, visualize, **Save to Gallery** |
| Gallery | `gallery.html` | Saved works from Supabase + sticky preview |
| About | `about.html` | Project overview |

## Setup

### 1. Supabase

1. Create a [Supabase](https://supabase.com) project.
2. In the SQL Editor, run `backend/sql/echo_works.sql`.
3. Copy **Project URL** and **service role key** (Settings → API).  
   **Never** put the service role key in frontend code.

### 2. Environment variables

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PORT=3000
```

### 3. Install & run

From the project root:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

The frontend calls Echo's API under `/api/*` via `apiClient.js`. Gallery save/load requires Supabase env vars on the server. Text analysis can still fall back locally if the API is offline.

## Gallery flow

1. **Studio** — enter text, click **TRANSFORM**, adjust mode/sliders.
2. Click **Save to Gallery** (enabled after a successful transform).
3. **Gallery** — fetches works from `GET /api/works`.
4. Select a card — bottom preview regenerates the visualization from saved data.
5. **Delete** removes a work via `DELETE /api/works/:id`.

## Echo API Routes

| Route | Description |
|-------|-------------|
| `POST /api/analyze-text` | Full text analysis |
| `POST /api/art/network` | Network art data |
| `POST /api/art/soup` | Soup art data |
| `POST /api/art/ascii` | ASCII art data |
| `POST /api/art/vortex` | Vortex art data |
| `POST /api/art/orbit` | Orbit art data |
| `POST /api/works` | Save work to Supabase |
| `GET /api/works` | List saved works (newest first) |
| `GET /api/works/:id` | Get one work |
| `DELETE /api/works/:id` | Delete a work |

### Save work body (POST `/api/works`)

```json
{
  "originalText": "your passage",
  "coreWords": [],
  "relatedWords": [],
  "particles": [],
  "mode": "network",
  "density": 0.6,
  "motion": 0.4,
  "intensity": 0.4,
  "options": {},
  "analysisData": {}
}
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SUPABASE_URL` | — | Supabase project URL (backend only) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Service role key (backend only) |
| `USE_DATAMUSE` | `false` | Global Datamuse enrichment |
| `NETWORK_DATAMUSE` | `true` | Datamuse for network mode only |
| `PORT` | `3000` | Server port |

## Deployment notes

- Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your host's environment (Render, Railway, etc.).
- Run the SQL migration on your Supabase project before going live.
- Serve the app with `npm start` from the repo root (runs `backend/server.js`).
- Keep the service role key server-side only; the browser never talks to Supabase directly.

## License

MIT
