# Deploying MoodRoll to Fly.io (demo, Kafka off)

Four apps: **taste-db** (Postgres+pgvector), **taste-search-mr** (Meilisearch),
**taste-api** (Fastify), **taste-web** (Next.js). `api` and `web` scale to zero;
`db` and `search` stay warm (they're stateful). The LLM is either the optional
**taste-ollama** app or an external token API — see step 5.

Run everything from the **repo root**. Prereqs: `flyctl` installed and `fly auth login`.

## 1. Create the apps
```bash
fly apps create taste-db
fly apps create taste-search-mr
fly apps create taste-api
fly apps create taste-web
```

## 2. Create the volumes (match the region in each toml, e.g. lhr)
```bash
fly volumes create pgdata     -a taste-db     -r lhr -n 1 -s 3
fly volumes create meili_data -a taste-search-mr -r lhr -n 1 -s 1
```

## 3. Secrets
```bash
# pick strong values once (hex: URL-safe, so PGPASS won't break DATABASE_URL)
PGPASS=$(openssl rand -hex 32)
MEILIKEY=$(openssl rand -hex 32)
JWTSECRET=$(openssl rand -hex 32)

fly secrets set POSTGRES_PASSWORD="$PGPASS" -a taste-db
fly secrets set MEILI_MASTER_KEY="$MEILIKEY" -a taste-search-mr

fly secrets set -a taste-api \
  DATABASE_URL="postgres://taste:$PGPASS@taste-db.internal:5432/taste" \
  JWT_SECRET="$JWTSECRET" \
  MEILI_HOST="http://taste-search-mr.internal:7700" \
  MEILI_KEY="$MEILIKEY" \
  OLLAMA_HOST="https://api884.tplinkdns.com" \
  OLLAMA_TOKEN="PASTE_THE_SAME_TOKEN_AS_home-ollama/Caddyfile"   # must match exactly

fly secrets set -a taste-web \
  API_BASE_URL="https://taste-api.fly.dev" \
  SITE_URL="https://taste-web.fly.dev"               # or your custom domain
```

## 4. Deploy the data layer
```bash
fly deploy -c fly/db.toml
fly deploy -c fly/meili.toml
```

## 5. LLM — home machine over DDNS (chosen)
Ollama runs on your own machine; the Fly API calls it over the internet. You do
**not** need the `taste-ollama` Fly app — delete `fly/ollama.toml`.

> **Never port-forward 11434 directly.** Ollama has no authentication — an exposed
> port is found by scanners within days and used as a free GPU (or worse). Put a
> TLS reverse proxy with a bearer token in front, and bind Ollama to localhost.

On the home machine:
1. Keep Ollama private (its default): it listens on `127.0.0.1:11434`. Pull the
   models named in `fly/api.toml` (OLLAMA_MODEL/EXPLAIN_MODEL/EMBED_MODEL):
   ```bash
   ollama pull llama3.2:3b        # covers OLLAMA_MODEL + EXPLAIN_MODEL
   ollama pull mxbai-embed-large  # EMBED_MODEL
   ```
   If your box can run a bigger model, bump `OLLAMA_MODEL` in api.toml and pull
   that instead — the config value must exactly match a pulled model.
2. Point your DDNS hostname (`api884.tplinkdns.com`) at your home IP, and
   forward **443 and 80** (not 11434) to this machine.
3. Run the reverse proxy — a ready Caddyfile is in [`home-ollama/Caddyfile`](../home-ollama/Caddyfile).
   Set the same token you gave `OLLAMA_TOKEN` in step 3, then:
   ```bash
   caddy run --config home-ollama/Caddyfile   # auto-provisions Let's Encrypt TLS
   ```
   The app now reaches Ollama at `https://ollama.yourddns.net` and authenticates
   with the bearer token; anything without it gets a 401.

**More locked-down alternatives** (no open ports at all): a **Cloudflare Tunnel**
from the home machine, or **Tailscale** joining the Fly machine and home box to one
private network. Both avoid exposing your home IP; Caddy+DDNS is simplest and is
what the bearer-token support is built for.

**Availability:** keep the machine awake (disable sleep). If it's offline, only
*novel* (cache-miss) searches fail — cached L1/L2 results still serve, since they
don't call the LLM.

## 6. Migrations (Flyway, via a proxy from your laptop)
```bash
# 15432 avoids a local dev Postgres on 5432; bind 0.0.0.0 + host.docker.internal so
# the Flyway container can reach the proxy on Docker Desktop / WSL2.
fly proxy 15432:5432 -a taste-db --bind-addr 0.0.0.0 &      # leave running
docker run --rm --add-host=host.docker.internal:host-gateway \
  -v "$PWD/migrations:/flyway/sql" flyway/flyway:11 \
  migrate -url=jdbc:postgresql://host.docker.internal:15432/taste -user=taste -password="$PGPASS"
kill %1                                     # stop the proxy
```

## 7. Deploy + seed the API
```bash
fly deploy . -c fly/api.toml --dockerfile fly/Dockerfile.api
fly scale memory 2048 -a taste-api          # setup is heavy; give it headroom
fly ssh console -a taste-api
  # inside the machine:
  npm run setup            # ingest + enrich + embed + build taste (needs the LLM up)
  npm run search:reindex   # populate Meilisearch (this replaces the Kafka CDC path)
  exit
fly scale memory 512 -a taste-api           # back to the cheap size
```

> **Faster seed:** `setup` makes thousands of LLM calls (enrich + embed the whole
> catalogue). Running it from **your home machine** — where Ollama is local — is far
> quicker than pushing every call back through the tunnel. Clone the repo at home,
> `fly proxy 15432:5432 -a taste-db` and `fly proxy 17700:7700 -a taste-search-mr`
> in two terminals (non-default local ports so they don't clash with your local
> dev Postgres/Meili), set `DATABASE_URL=postgres://taste:$PGPASS@localhost:15432/taste`
> and `MEILI_HOST=http://localhost:17700`, `OLLAMA_HOST=http://localhost:11434`,
> then run `npm run setup && npm run search:reindex` locally. The deployed API then
> only makes occasional per-query calls.

## 8. Deploy the web app
```bash
fly deploy . -c fly/web.toml --dockerfile fly/Dockerfile.web
```
Visit `https://taste-web.fly.dev`. Done.

---

## Roughly what it costs
- **Always-on baseline:** `taste-db` (512MB) + `taste-search-mr` (256MB) ≈ **$5/mo**.
- **api + web:** scale to zero — you pay only while a request is being served
  (pennies at demo traffic).
- **LLM:** the swing factor. Token API ≈ cents/mo. Self-hosted Ollama on an 8GB
  machine is the one thing that gets expensive if left always-on — keep it
  auto-stopping, or offload.

## Custom domain
```bash
fly certs add yourdomain.com -a taste-web
```
Then set `SITE_URL=https://yourdomain.com` on `taste-web` and redeploy so
canonicals / sitemap / OG tags use the real domain.

## Going full-live later (CDC)
The Kafka path stays in the repo behind the `cdc` compose profile. On Fly you'd
add Kafka + Debezium Connect apps and run the consumer (`npm run search:sync`) as
its own always-on machine — but none of that is needed for the demo.
