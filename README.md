# ECHO — Computational Text Art Studio

A minimalist text art studio where users paste prose and transform it into interactive word-based visualizations. Saved pieces persist in a local **SQLite** database through Echo's Express API.

## Stack

- **Backend** — Node.js, Express, SQLite
- **Frontend** — static HTML/CSS/JS (D3 and other libs via CDN)
- **Text enrichment** — Datamuse API (always on during server analysis)

## Project structure

```
├── backend/
│   ├── server.js              # Express API + static frontend
│   ├── db.js                  # SQLite gallery storage
│   ├── echo.db                # created on first run
│   ├── lib/
│   │   ├── analyzeText.js     # word extraction, links, Datamuse
│   │   └── artData.js         # visualization payloads
├── frontend/
│   ├── index.html             # Studio
│   ├── gallery.html / gallery.js
│   ├── main.js
│   └── helperJS/              # renderers, apiClient, local fallback
└── package.json               # runs backend via npm scripts
```

## Run locally

From the project root:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

The server listens on port **3000** and stores gallery works in `backend/echo.db`. No config files or secrets are required.

If you open the frontend from Live Server on another port, `apiClient.js` still talks to the backend on `localhost:3000` (CORS is enabled for local dev origins).

## Pages

| Page | Path | Description |
|------|------|-------------|
| Studio | `index.html` | Compose, transform, visualize, save to gallery |
| Gallery | `gallery.html` | Saved works + preview |
| About | `about.html` | Project overview |

## Gallery flow

1. **Studio** — enter text, click **TRANSFORM**, adjust mode and sliders.
2. **Save to Gallery** (after a successful transform).
3. **Gallery** — `GET /api/works` lists saved pieces.
4. Select a card to preview; **Delete** removes via `DELETE /api/works/:id`.

## API routes

| Route | Description |
|-------|-------------|
| `POST /api/analyze-text` | Full text analysis (Datamuse + local merge) |
| `POST /api/art/network` | Network art data |
| `POST /api/art/soup` | Soup art data |
| `POST /api/art/ascii` | ASCII art data |
| `POST /api/art/vortex` | Vortex art data |
| `POST /api/art/orbit` | Orbit art data |
| `POST /api/works` | Save work |
| `GET /api/works` | List works (newest first) |
| `GET /api/works/:id` | Get one work |
| `PUT /api/works/:id` | Update sliders/options |
| `DELETE /api/works/:id` | Delete work |

## License

MIT
