# OnlyQR

**One string in, one QR code out — as a single-`<path>` SVG.** Live at
[onlyqr.codes](https://onlyqr.codes).

Most QR tools want an account, host your files, track your scans, and offer
seventeen color schemes. This one does one thing: it takes a string and turns
it into a QR code. No sign-up, no analytics on your codes, no "premium export" —
just a clean SVG, the only format a designer or developer actually needs.

Where it differs under the hood: most generators emit SVGs built from hundreds
of stacked `<rect>` elements. OnlyQR encodes the matrix with `segno`, then uses
`shapely` to union every module into one continuous geometry — rendered as
exactly **one `<path>`**. No seams, no overdraw, a fraction of the file size,
and it scales to any size before dropping straight into Figma, Illustrator, or
your codebase. The optional centre hole (for a logo) is a real cutout
subtracted from that geometry, not a white box covering what's underneath —
and error-correction level **H** keeps the code scannable with up to 30% of it
punched out.

The dots are sharp squares on a clean grid, the way a machine-readable pattern
was meant to look. Old school by design.

- **Backend:** FastAPI wrapping the pure core in `qr.py` (`segno` + `shapely`).
- **Frontend:** Vite + React (`frontend/`).
- **Deploy:** one self-contained Docker container behind a Traefik edge proxy.

## Run locally

A single `docker-compose.yml` drives both modes. Same app either way — `dev` hot-reloads
from source, `prod` is the public-accessible build.

### Option A — Docker dev container (recommended)

One command, **one container** (`onlyqr-codes-dev`) running both backend + frontend:

```bash
docker compose build dev    # (re)build the dev image
docker compose up           # start dev (valkey + dev); add --build to do both at once
```

- **frontend** → http://localhost:5173 ← open this (Vite dev server, instant HMR)
- **api** → http://localhost:8000 (FastAPI, `--reload`; docs at `/docs`)

Both hot-reload on file edits — no rebuild. Vite proxies `/api` to the backend
(same container), so the browser only needs port 5173. Stop with `Ctrl-C`
(or `docker compose down`). Drop `--build` on later runs.

> Why one container: backend + frontend share an image (`Dockerfile.dev`, Python +
> Node) and run together via `dev-entrypoint.sh`, so `docker stats` shows a single
> container. Production is also one self-contained container (see below).
>
> macOS/Windows note: bind mounts don't emit native FS events, so the compose file
> sets `VITE_USE_POLLING=true` to keep HMR working inside the container.

### Production (self-contained)

```bash
docker compose build prod        # build the public production image
docker compose up prod -d        # run it -> http://127.0.0.1:8000
```

One container (`onlyqr-codes-prod`): gunicorn (5 workers) serves the **built React
app and `/api` from the same process** (FastAPI `StaticFiles`). The image is a
multi-stage build — a Node stage compiles the frontend, the final image bundles it.
The `prod` service sits behind the `prod` compose profile, so a bare `docker compose up`
stays on dev; naming it explicitly (`build prod` / `up prod`) brings it in.
Exposes plain HTTP on `127.0.0.1:8000`; on a multi-app host a single shared edge
reverse proxy (Caddy/Traefik) terminates TLS and routes the domain to it (M3).

### Option B — bare metal (no Docker)

Two terminals. Backend:

```bash
pip install -r requirements.txt
python3 -m uvicorn main:app --reload          # http://localhost:8000  (docs at /docs)
```

Frontend:

```bash
cd frontend
npm install
npm run dev                                    # http://localhost:5173
```

Vite proxies `/api` → `http://localhost:8000`, so open **http://localhost:5173** and go.

## API

```
GET /api/qr?url=<text>&hole=<small|medium|large>&shape=<square|circle>
```

- `url` (required, 1–500 chars) — URL or any text to encode.
- `hole` (optional) — centre hole size; omit for no hole.
- `shape` (optional, default `square`) — hole shape.

Returns `image/svg+xml`. Generation is cached (`lru_cache`); QR uses error-correction
level **H** so the hole (up to 30%) doesn't break decoding.

```bash
curl "http://localhost:8000/api/qr?url=example.com&hole=medium&shape=circle" -o qr.svg
```

## Files

| Path                 | Role                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `qr.py`              | Pure core: `build_svg()`, geometry merge, filename helper. No GUI, no file I/O.              |
| `main.py`            | FastAPI app + `/api/qr` endpoint + caching.                                                  |
| `requirements.txt`   | Backend deps.                                                                                |
| `frontend/`          | Vite + React UI.                                                                             |
| `Dockerfile`         | `dev` (backend only) + `prod` (multi-stage: builds frontend, serves frontend + API) targets. |
| `Dockerfile.dev`     | Combined dev image (Python + Node) for the single dev container.                             |
| `dev-entrypoint.sh`  | Runs uvicorn + Vite together in the dev container.                                           |
| `docker-compose.yml` | The one compose file: `dev` + `prod` (profiled) services + shared Valkey.                    |
| `segno-qr-code.py`   | Original Tkinter desktop tool (unchanged reference).                                         |
