# Member web app on Netlify + Supabase (no card)

The website (hellosandar.com) stays on Cloudflare. The member web app runs on
Netlify's free plan, with the Sandar API inside it (`SANDAR_API_MODE=in-process`).
Postgres is a Supabase project; email goes through Resend from
`noreply@hellosandar.com` (already verified).

Free-plan limits to know: 125,000 function requests a month, 10 s per request,
and a short wake-up (about 1–3 s) after quiet periods. Supabase's free project
pauses after 7 days with no activity; restore it from the dashboard.

## 1. Supabase (you)

1. New project `sandar-app`, region **Southeast Asia (Singapore)**. Not the old
   website project.
2. Project Settings → Data API: turn the Data API **off** (Sandar talks to
   Postgres directly; nothing should be reachable with the public key).
3. Connect → Connection String → **Session pooler** → copy.
4. Database → Settings → SSL Configuration → **Download certificate**
   (`prod-ca-2021.crt`). Check it is the CA the pooler presents:
   `openssl x509 -in prod-ca-2021.crt -noout -fingerprint -sha256` must match
   the last certificate from
   `openssl s_client -starttls postgres -connect <pooler host>:5432 -showcerts`.

## 2. Database (me, from the laptop)

```bash
# DATABASE_URL in a git-ignored .env.supabase file; the CA in .local/supabase-ca.crt
export DATABASE_CA_CERT="$(cat .local/supabase-ca.crt)"
node_modules/.bin/tsx --env-file=.env.supabase scripts/migrate.ts
SITE_URL=https://hellosandar.com POLICY_VERSION=2026-11-launch node_modules/.bin/tsx --env-file=.env.supabase scripts/setup-policies.ts --legal-approved
POLICY_VERSION=2026-11-launch node_modules/.bin/tsx --env-file=.env.supabase scripts/setup-official-spaces.ts
```
Then revoke the Data API roles on Sandar's tables as a second lock:
`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;` (and the
same for `SEQUENCES` and `FUNCTIONS`).

With `DATABASE_CA_CERT` set, the server certificate is always verified against
it, and SSL settings in `DATABASE_URL` (such as `sslmode=require`) are ignored.
Never work around a certificate error by turning verification off.

## 3. Netlify site (you, with me)

1. Sign up with GitHub (no card) → Add new site → Import from Git →
   `sandarapp/sandar-app`, branch `master`.
2. Base directory: empty (repo root). Package directory: `apps/web`.
   Build command and publish directory come from `netlify.toml`.
3. Environment variables:

| Key | Value |
| --- | --- |
| `SANDAR_API_MODE` | `in-process` |
| `APP_BASE_URL` | the site address, e.g. `https://sandar-app.netlify.app` |
| `EMAIL_FROM` | `Sandar <noreply@hellosandar.com>` |
| `VISITOR_IP_HEADER` | `x-nf-client-connection-ip` |
| `DATABASE_URL` | Supabase session pooler string (secret) |
| `DATABASE_CA_CERT` | full contents of `prod-ca-2021.crt`, BEGIN to END lines (not secret, but must be exact) |
| `DATA_ENCRYPTION_KEY` | from `.local/data-encryption-key.txt` (secret) |
| `RESEND_API_KEY` | Resend key with sending access (secret) |

4. Deploy. Every merge to `master` redeploys automatically; pull requests get
   deploy previews.

## 4. Website

Set `NEXT_PUBLIC_MEMBER_APP_URL` to the Netlify address in Cloudflare (build
variables) and redeploy the website through a pull request.

## 5. Smoke test

Same list as `deploy-production.md` §9, on the Netlify address.

## 5. Member posting and moderation

Every member post waits for a person to review it (`SAFETY_MODE=human-review`
holds them all), so posting opens only once a moderator exists. From the
laptop, with `DATABASE_URL` and `DATABASE_CA_CERT` set for Supabase:

```bash
npm run moderation:grant -- <moderator's member email>   # add --revoke to remove
npm run spaces:posting -- --open                         # --close to close again
```

Moderators review posts and reports at `/moderation` in the web app. Each
decision is written to the append-only `moderation_actions` table. Comments stay
closed.

## 6. App address

The app is served at `https://app.hellosandar.com` (Netlify custom domain;
`APP_BASE_URL` must match it, since the API only accepts requests from that
origin). `netlify.toml` redirects `sandar-app.netlify.app` there with a 301.
