# Staging

A separate copy of Sandar for automation practice. It has its own database and sends
no email. It never shares data with the live app.

Address: `https://staging--sandar-app.netlify.app` (Netlify branch deploy of `staging`).
Ops is at `/ops` on the same address, because `OPS_BASE_URL` stays unset.

## 1. Database (owner)

Create a new Supabase project named `sandar-staging`. Do not reuse a live project.
Copy its session pooler connection string into a local `.env.staging`, which git ignores:

```bash
DATABASE_URL=<session pooler string>
APP_BASE_URL=https://staging--sandar-app.netlify.app
```

## 2. Netlify (owner)

In Site configuration → Build & deploy → Branches, add `staging` as a branch deploy.
In Environment variables, set these for the **Branch deploys** context only, so live
values stay untouched:

| Key | Value |
| --- | --- |
| `APP_BASE_URL` | `https://staging--sandar-app.netlify.app` |
| `DATABASE_URL` | the staging string |
| `DATA_ENCRYPTION_KEY` | a new key: `openssl rand -hex 32`. Never the live one |
| `STAGING_EMAIL_CAPTURE` | `on` |
| `OPS_BASE_URL` | empty |

## 3. Set up and deploy

```bash
set -a && . ./.env.staging && set +a && export DATABASE_CA_CERT="$(cat .local/supabase-ca.crt)"
npm run staging:setup
git push origin master:staging
```

`staging:setup` refuses the live databases and addresses. It writes, to `.local/` only:

- `staging-credentials.md`: test accounts and the read-only database login
- `sandar-staging.postman_environment.json`: environment for Postman or Bruno

## 4. Testing

Import `docs/qa/api/sandar-api.postman_collection.json` and the environment. Bruno
imports both as Postman files. Run folders 01 to 05 in order. For folder 06, read the
code as below, set `opsCode`, then continue in the same session.

No email leaves staging. Read tokens and codes from the database:

```sql
SELECT recipient,template,token,code,created_at FROM staging_emails ORDER BY created_at DESC LIMIT 10;
```

The database login reads every table. It can only change `rate_limits`, so a test run
can clear them with `DELETE FROM rate_limits;`. Sensitive fields such as mood check-ins
stay encrypted.
