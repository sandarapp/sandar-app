# Production launch runbook

First production launch: website, member web app (`app.hellosandar.com`) and
API (`api.hellosandar.com`). Members can register, onboard, read and react.
Posting and comments stay closed until moderation is staffed. No payments.

Setup: Google Cloud Run (API and web app), Neon (Postgres), Zoho Mail SMTP
(email), Cloudflare (website and DNS). Everything below fits the free tiers at
launch traffic.

## 0. Before you start

- [ ] Legal review of the Terms, Privacy Notice and Community Guidelines on the
      website (`sandar-web/src/content/legal.ts`), version `2026-11-launch`.
- [ ] Safety lead reviews `content/official-spaces.json` (spaces and opening posts).
- [ ] At least one trained moderator can see reports (until the Admin CMS
      exists, reports are read from the `content_reports` and
      `space_safety_cases` tables).
- [ ] Upgrade dependencies with security fixes once they are at least two weeks
      old, then run all tests: `next` ≥ 16.4.3 (both repos), `fastify` ≥ 5.12.6,
      `fast-uri`, `nodemailer` ≥ 10.1.4.

## 1. Region

Use one region for everything. Cloud Run can map a custom domain only in
some regions; Jakarta (`asia-southeast2`) may not offer it, so confirm in the
Cloud Run console under "Manage custom domains" before choosing it. Singapore
(`asia-southeast1`) supports it and is close to Indonesia; Neon also runs in
Singapore. The commands below use `REGION=asia-southeast1`.

## 2. Accounts (one-time)

1. Google Cloud: create project `sandar-prod`, add billing (card required; the
   free tier covers launch traffic), install the `gcloud` CLI, then:
   ```bash
   gcloud config set project sandar-prod
   gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com
   gcloud artifacts repositories create sandar --repository-format=docker --location=asia-southeast1
   ```
2. Neon: create project `sandar` in AWS Singapore. Copy the pooled connection
   string (it ends in `?sslmode=require`).
3. Zoho Mail: in `hellosandar@zohomail.com`, create an app-specific password
   (Security → App Passwords). SMTP is `smtp.zoho.com`, port 465.
   Free zohomail.com addresses have low daily limits and can land in spam;
   move to a `hellosandar.com` sender (e.g. Zoho with your own domain) once
   sign-ups grow.

## 3. Secrets

Generate once, store only in Secret Manager:
```bash
printf %s "$(openssl rand -hex 32)" | gcloud secrets create DATA_ENCRYPTION_KEY --data-file=-
printf %s "$(openssl rand -hex 32)" | gcloud secrets create BFF_SHARED_SECRET --data-file=-
printf %s "$(openssl rand -hex 32)" | gcloud secrets create EMAIL_FLUSH_SECRET --data-file=-
printf %s "<neon connection string>" | gcloud secrets create DATABASE_URL --data-file=-
printf %s "<zoho app password>" | gcloud secrets create SMTP_PASSWORD --data-file=-
```
Never reuse the development `DATA_ENCRYPTION_KEY`. Losing the production key
logs everyone out and drops unsent emails; keep a copy in a password manager.

## 4. Database

From your laptop, with the Neon connection string:
```bash
DATABASE_URL='<neon>' npm run db:migrate:prod
# After legal approval only:
DATABASE_URL='<neon>' SITE_URL=https://hellosandar.com POLICY_VERSION=2026-11-launch npm run policies:setup -- --legal-approved
DATABASE_URL='<neon>' POLICY_VERSION=2026-11-launch node_modules/.bin/tsx scripts/setup-official-spaces.ts
```
`POLICY_VERSION` must equal `legalVersion` in the website's `legal.ts`.

## 5. Build and deploy

```bash
TAG=$(git rev-parse --short HEAD)
gcloud builds submit --config cloudbuild.yaml --substitutions=_REGION=asia-southeast1,_TAG=$TAG
IMG=asia-southeast1-docker.pkg.dev/sandar-prod/sandar

gcloud run deploy sandar-api --image $IMG/api:$TAG --region asia-southeast1 --allow-unauthenticated \
  --min-instances 0 --max-instances 2 --memory 512Mi \
  --set-env-vars NODE_ENV=production,HOST=0.0.0.0,APP_BASE_URL=https://app.hellosandar.com,EMAIL_PROVIDER=smtp,SMTP_HOST=smtp.zoho.com,SMTP_PORT=465,SMTP_USER=hellosandar@zohomail.com,"EMAIL_FROM=Sandar <hellosandar@zohomail.com>",TRUST_PROXY_HOPS=1,SAFETY_MODE=human-review \
  --set-secrets DATABASE_URL=DATABASE_URL:latest,DATA_ENCRYPTION_KEY=DATA_ENCRYPTION_KEY:latest,SMTP_PASSWORD=SMTP_PASSWORD:latest,BFF_SHARED_SECRET=BFF_SHARED_SECRET:latest,EMAIL_FLUSH_SECRET=EMAIL_FLUSH_SECRET:latest

gcloud run deploy sandar-web --image $IMG/web:$TAG --region asia-southeast1 --allow-unauthenticated \
  --min-instances 0 --max-instances 2 --memory 512Mi \
  --set-env-vars APP_BASE_URL=https://app.hellosandar.com,API_INTERNAL_URL=https://api.hellosandar.com \
  --set-secrets BFF_SHARED_SECRET=BFF_SHARED_SECRET:latest
```
The API refuses to start in production without real email, the human-review
safety adapter, an HTTPS app URL and both shared secrets.

## 6. Domains

```bash
gcloud beta run domain-mappings create --service sandar-api --domain api.hellosandar.com --region asia-southeast1
gcloud beta run domain-mappings create --service sandar-web --domain app.hellosandar.com --region asia-southeast1
```
In Cloudflare DNS add the records Google shows (CNAME to
`ghs.googlehosted.com`), set to **DNS only** (grey cloud) so Google can issue
the certificates.

## 7. Email delivery

Cloud Run pauses the CPU between requests, so a scheduler drains the outbox:
```bash
gcloud scheduler jobs create http sandar-email-flush --location asia-southeast1 \
  --schedule "* * * * *" --uri https://api.hellosandar.com/internal/email/flush \
  --http-method POST --headers "x-sandar-cron=$(gcloud secrets versions access latest --secret EMAIL_FLUSH_SECRET)"
```

## 8. Website

In Cloudflare, add build variable
`NEXT_PUBLIC_MEMBER_APP_URL=https://app.hellosandar.com` and redeploy
`sandar-web`.

## 9. Smoke test (real phone and laptop)

- [ ] hellosandar.com loads; "Buat akun" opens app.hellosandar.com/register.
- [ ] Register with a real inbox; the email arrives within a minute, with no
      "EMAIL PENGEMBANGAN" line; the link verifies.
- [ ] Log in → onboarding → finish → Home lists 4 official spaces.
- [ ] Join a space, read the opening posts, react and un-react, report a post.
- [ ] "Butuh bantuan?" shows 119, 119 ext. 8 and 1500-567.
- [ ] "Register a community" on the website pre-selects Komunitas.
- [ ] Log out; app.hellosandar.com/home sends you to log in.
- [ ] Posting a message is impossible (no composer; API returns 404).

## 10. After launch

- Neon's free plan keeps only a short restore window: run a weekly
  `pg_dump` to encrypted storage until you move to a paid plan.
- Watch Cloud Run logs for `email_worker_failed` and 5xx responses.
- Opening posting for a space later: staff moderators first, then
  `UPDATE support_spaces SET posting_enabled=true, commenting_enabled=true WHERE id=...`
  (or from the Admin CMS once it exists). Every post is held for human review
  while `SAFETY_MODE=human-review`.
