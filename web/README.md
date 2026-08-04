# Taste Engine — Web

Next.js (App Router) frontend for the Taste Engine API. Server-side rendered
throughout: pages fetch the API on the server, auth is a JWT in an httpOnly
cookie, and all mutations run as server actions.

## Run

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

The API base URL is read from `API_BASE_URL` in `.env.local`
(defaults to `http://localhost:8080`). Start the backend (`npm run dev` in the
repo root) first, or pages that hit the API render a graceful "Cannot reach the
API" notice.

## Pages

| Route | Rendering | API used |
|---|---|---|
| `/` | SSR catalogue grid, paginated, real covers | `GET /media` + AniList (batched) |
| `/media/[id]` | SSR detail page with AniList cover | `GET /media/:id` + AniList |
| nav search bar | client typeahead, fires at 3+ chars | `GET /searchCatalog` via `/api/searchCatalog` proxy |
| `/signup` | form → server action | `POST /signup`, then `POST /login` (auto sign-in) |
| `/login` | form → server action | `POST /login` |
| `/search` | SSR mood search from `?q=` params | `POST /search` (`explain:false`) |
| `/search` results | client fills AI reasons | `POST /search/why` via `/api/why` proxy |
| `/lists` | SSR, auth-guarded | `GET /me/lists` |
| add / remove / move | server actions | `POST /add/anime/:id`, `POST /remove/anime/:id` |

## Notes

- **Two kinds of search.** The nav bar is a live *title* search (`GET
  /searchCatalog`, typo-tolerant, fires at 3 characters). `/search` is the
  natural-language *mood* search (`POST /search`).
- **Cover artwork from AniList.** The catalogue stores no images — each record
  carries an `anilistId`, and `lib/anilist.ts` fetches cover art from the
  AniList GraphQL API (batched one call per grid page, cached in-memory 24h).
  `components/Cover.tsx` renders the image, falling back to a deterministic
  gradient placeholder (`components/Poster.tsx`) when AniList is unavailable.
- **Why lines are progressive.** Mood search SSRs fast with template reasons
  (`explain:false`), then the client swaps in AI `why` lines from
  `POST /search/why`. Mood cards show only title, description and why (no
  mood-hash/distance debug).
- **Auth** is an httpOnly `te_token` cookie set on login/signup; `/lists`
  redirects to `/login` when it's missing or expired.
- **Offline-hardened.** Interactive server fetches (`/media`, `/searchCatalog`)
  use a 6s timeout so a down API degrades to a graceful notice instead of
  hanging.
