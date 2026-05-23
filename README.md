# ECHO — Computational Text Art Studio

A minimalist text art studio where users paste prose and transform it into interactive word-based visualizations.

Echo includes a **custom Express API** (`backend/server.js`) that performs its own text analysis and art-data generation. The frontend calls that API through `frontend/helperJS/apiClient.js`. External word enrichment (Datamuse) is optional and **disabled by default**.

## Project Structure

```
├── backend/
│   ├── server.js              # My custom Express API (route definitions)
│   ├── lib/
│   │   ├── analyzeText.js     # Core text analysis (source of truth)
│   │   ├── generateNetwork.js # Network graph art data
│   │   ├── generateParticles.js # Particles + soup/vortex/orbit payloads
│   │   ├── generateAscii.js   # ASCII layout art data
│   │   ├── enrichment.js      # Optional Datamuse (USE_DATAMUSE=true only)
│   │   └── config.js          # USE_DATAMUSE flag (default: false)
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── styles.css
│   ├── main.js                # App orchestration
│   └── helperJS/
│       ├── apiClient.js       # fetch() client for my backend API
│       ├── textProcessing.js  # Optional offline fallback only
│       ├── network.js
│       ├── soup.js
│       ├── ascii.js
│       ├── vortex.js
│       ├── theme.js
│       └── controls.js
├── package.json
└── README.md
```

## Setup

From the project root:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

The frontend calls **Echo's API** under `/api/*` via `apiClient.js`. If the server is unavailable, the browser uses local fallback logic in `textProcessing.js` — it never calls Datamuse directly.

## Echo API Routes

| Route | Description |
|-------|-------------|
| `POST /api/analyze-text` | Full text analysis (words, links, particles) |
| `POST /api/art/network` | Network graph art data |
| `POST /api/art/soup` | Soup particle art data |
| `POST /api/art/ascii` | ASCII layout lines |
| `POST /api/art/vortex` | Vortex particle art data |
| `POST /api/art/orbit` | Orbit particle art data |

Request body: `{ "text": "your passage", "density": 0.6 }` (density optional, 0–1)

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_DATAMUSE` | `false` | When `true`, Echo merges optional Datamuse related words on top of its local generators |
| `PORT` | `3000` | Server port |

```bash
# Default — Echo local enrichment only
npm run dev

# Optional stretch feature — merge Datamuse related words
USE_DATAMUSE=true npm run dev
```

## License

MIT
