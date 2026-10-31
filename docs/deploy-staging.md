# Staging

A separate copy of Sandar for automation practice. It has its own Supabase project and
its own Netlify site, follows the `staging` branch, and sends no email. It never shares
data with the live app.

- App: `https://sandar-staging.netlify.app`
- Ops: `https://sandar-staging.netlify.app/ops`. `OPS_BASE_URL` stays unset, so there is one host.

## Updating

```bash
git push origin master:staging
```

After a change to the database, run setup again as well.

## Setup, on a fresh project

Local `.env.staging`, which git ignores:

```bash
DATABASE_URL=<session pooler string of the staging project>
APP_BASE_URL=https://sandar-staging.netlify.app
```

```bash
set -a && . ./.env.staging && set +a && export DATABASE_CA_CERT="$(cat .local/supabase-ca.crt)"
npm run staging:setup
```

`staging:setup` refuses the live databases and addresses. It writes, to `.local/` only:

- `staging-credentials.md`: test accounts and the read-only database login
- `sandar-staging.postman_environment.json`: environment for Postman or Bruno

Netlify site variables: `SANDAR_API_MODE=in-process`, `APP_BASE_URL`, `DATABASE_URL`,
`DATABASE_CA_CERT`, `DATA_ENCRYPTION_KEY` (its own key, never the live one),
`STAGING_EMAIL_CAPTURE=on`, `VISITOR_IP_HEADER=x-nf-client-connection-ip`. Build settings
match the live site: empty package path and the `@netlify/plugin-nextjs` plugin.

## Testing

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
