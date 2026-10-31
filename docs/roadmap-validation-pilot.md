# Roadmap: validation pilot (26 Oct – 27 Dec 2026)

Status: **plan only**. Nothing in this document is built. It records the
business decision of 25 Oct 2026 and the engineering plan that follows from it.
It supersedes the phase order of [roadmap-to-payments.md](roadmap-to-payments.md)
after Phase 1. Passing any test named here is not a claim of production
readiness.

## Why this order

For the next 8 weeks Sandar has one job: measure real interest and willingness
to pay, with numbers, at minimum cost. The first revenue is a paid group
programme, **Support Circle**: 4 weekly online sessions, 6–8 participants, a
trained facilitator, paid by a member or by an organisation. Communities join
free for 3 months as **Komunitas Pendiri** and act as distribution and
facilitator partners, not as paying customers.

So the pilot builds, in order: a way to count interest (V1), a way for
communities to run free activities and cohorts (V2), a way for members to pay
for a programme seat (V3), and a page that measures interest in a community
subscription without billing anyone (V4).

Phase 1 (launch, read and react) stays as it is and is the base for all of
this. Member posting and comments stay closed. No DM, follow or media upload.

## Business gates (measured on 27 Dec 2026)

| # | Gate | Source of truth |
|---|---|---|
| G1 | ≥ 50% of paid seats filled at a price ≥ Rp99,000, from ≥ 2 acquisition channels | `programme_orders` in state `PAID` (not refunded) against `cohorts.capacity` of paid offers with `price_idr >= 99000`; `programme_orders.channel` |
| G2 | ≥ 60% of participants attend ≥ 3 of 4 sessions | `session_attendance` for Support Circle cohorts whose 4th session ended by 27 Dec |
| G3 | ≥ 5 communities run ≥ 1 activity through Sandar | distinct `founding_communities` with ≥ 1 activity in `COMPLETED` and ≥ 1 `ATTENDED` attendance row |
| G4 | 100% of high-risk safety cases handled within SLA; 0 role-boundary violations | `pilot_safety_cases` (`severity='HIGH'`, `handled_at <= sla_due_at`); `pilot_safety_cases` with `category='ROLE_BOUNDARY'` confirmed |

Definitions the owner must confirm (see Open questions): whether G1 needs a
minimum share per channel; whether G2 counts free (V2) cohorts, paid (V3)
cohorts or both (the plan reports both separately); the G4 SLA values; what
counts as a confirmed role-boundary violation.

All gate numbers come from server-side records written by the API, never from
analytics events. Analytics only explains the funnel between them.

## Timeline

| Week (Mon) | Work | Why the date matters |
|---|---|---|
| 26 Oct | V1 build; legal and gateway groundwork for V3 starts (not code) | Interest data needs as many weeks as possible |
| 2 Nov | V1 live; V2 build | First community activities need lead time |
| 9 Nov | V2 live; V3 build in sandbox | |
| 16 Nov | V3 sandbox end-to-end; V4 build | |
| 23 Nov | V3 behind `ENABLE_PAID_PROGRAMS` turned on for the first offer, if the legal and gateway prerequisites are met | A 4-week cohort must start by **30 Nov** to finish by 27 Dec |
| 30 Nov – 27 Dec | Cohorts run; V4 live; weekly gate report | |

The critical path is not code: a cohort that starts after 30 Nov cannot count
towards G2. If a merchant account is not open by 23 Nov, G1 cannot be measured
with real payments in this pilot (see Risks).

## Conventions every V step follows

These come from the existing codebase and are not repeated in each step.

- `{data,error}` envelope; failures `{data:null,error:{code,message,field}}`
  with Indonesian `message`.
- Strict Zod schemas in `packages/contracts` (`z.strictObject`), shared by the
  API and web. Explicit response DTOs; no row serialisation.
- Parameterised SQL only. Append-only migrations from `011` upward; each
  migration is new, never an edit of an old one.
- Every route checks the current session, account state and resource scope on
  the server inside the transaction that reads or writes. Client roles,
  URLs and cached membership grant nothing.
- Analytics go only to allowlisted first-party tables with a `CHECK` on the
  event name, like `discovery_analytics`. No user id, session id, IP, user
  agent, email, free text or health data in any analytics row.
- **No third-party analytics and no advertising pixels** on any page in this
  plan: public programme pages, signup, onboarding, interest forms, intake,
  checkout, order status.
- Money is integer rupiah: `bigint` columns with `CHECK (x >= 0)` and
  `z.number().int()` contracts. No floating point anywhere, including UI
  formatting (format from the integer).
- Every new capability sits behind a feature flag that is **off by default** in
  `.env.example` and in the server config schema. When a flag is off, its
  routes return `404 NOT_FOUND` and its UI entry points are not rendered.
- Every page about programmes or activities shows the crisis block (component
  reused from the existing `copy.ts` entries):
  "Sandar adalah dukungan sebaya, bukan layanan terapi, diagnosis, atau
  darurat. Jika kamu dalam bahaya atau krisis: **Healing119.id** ·
  **119 ext. 8** (krisis emosional) · **PSC 119** (kedaruratan medis)."
- No diagnosis, therapy, treatment or emergency claims in any copy, seller
  description, activity description or facilitator profile.
- Web only (`apps/web`). `apps/mobile` is not touched by this plan.
- Each step closes with an evidence doc under `docs/` (for example
  `docs/v1-funnel-evidence.md`) in the same form as the existing epic docs:
  scope, contract table, runtime evidence, tests run, remaining risks.

### New feature flags

| Flag | Step | Default |
|---|---|---|
| `ENABLE_PROGRAMME_INTEREST` | V1 | `false` |
| `ENABLE_FOUNDING_COMMUNITIES` | V2 | `false` |
| `ENABLE_PAID_PROGRAMS` (exists in `.env.example`, not yet read by code) | V3 | `false` |
| `ENABLE_COMMUNITY_PLUS_INTEREST` | V4 | `false` |

### Pilot operations without a CMS

The Admin CMS (old Phase 2) is deferred. The pilot still needs a few privileged
actions: approve a Komunitas Pendiri, publish an activity, assign a facilitator,
handle a safety case, mark a refund. Proposal: run these as reviewed `npm run
ops:*` scripts in `scripts/`, executed by named Sandar staff against the
database, each writing an append-only `pilot_audit_log` row with the operator
and reason. No privileged web route is added. This is cheaper and has a smaller
attack surface than a staff UI, but needs database access for operators (see
Open questions).

---

## V1 Funnel instrumentation and interest forms

### Objective

Count, by acquisition channel, how many people view the Support Circle page,
say they are interested, and say what they would pay, plus how many
organisations, would-be facilitators and communities register interest.
Nobody pays and nothing is promised in V1.

### User stories

- As a visitor from Instagram, TikTok, WhatsApp, a community or an
  organisation, I can read what Support Circle is (and is not), see the crisis
  resources, and leave my contact and the price I would pay, without an
  account.
- As a signed-in member, I can register interest with my account email and
  withdraw it later.
- As an HR or CSR contact, I can say my organisation might buy seats and how
  many.
- As a community organiser, I can apply to Komunitas Pendiri.
- As a trained or aspiring facilitator, I can register interest.
- As the owner, I can see weekly counts per step and channel without any
  personal data in the analytics.

### Schema changes — `011_validation_funnel.sql`

```sql
CREATE TABLE programme_interest (
 id uuid PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN ('MEMBER','ORGANISATION','FACILITATOR','FOUNDING_COMMUNITY')),
 programme text NOT NULL DEFAULT 'SUPPORT_CIRCLE' CHECK(programme IN ('SUPPORT_CIRCLE')),
 user_id uuid REFERENCES users(id),               -- set only from a valid session
 email_ciphertext text NOT NULL, email_hash bytea NOT NULL,   -- encrypted with DATA_ENCRYPTION_KEY; hash for dedupe
 whatsapp_ciphertext text,
 city varchar(100), country char(2) CHECK(country ~ '^[A-Z]{2}$'),
 organisation_name varchar(120), seats_bucket text CHECK(seats_bucket IN ('1_5','6_20','21_50','51_PLUS')),
 community_name varchar(120), community_size_bucket text CHECK(community_size_bucket IN ('UNDER_50','50_200','201_1000','OVER_1000')),
 price_bucket text CHECK(price_bucket IN ('UNDER_49K','49K_98K','99K_149K','150K_199K','200K_PLUS','UNSURE')),
 preferred_schedule text CHECK(preferred_schedule IN ('WEEKDAY_EVENING','WEEKEND','ANY')),
 channel text NOT NULL CHECK(channel IN ('INSTAGRAM','TIKTOK','WHATSAPP','COMMUNITY','ORGANISATION','DIRECT','OTHER')),
 referral_community_id uuid,                      -- FK added in 012 once founding_communities exists
 adult_confirmed_at timestamptz NOT NULL,
 contact_consent_version varchar(40) NOT NULL,
 withdrawn_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(kind, programme, email_hash)
);
CREATE TABLE funnel_analytics (
 id uuid PRIMARY KEY,
 event text NOT NULL CHECK(event IN ('programme_page_viewed','programme_interest_form_started',
   'programme_interest_submitted','organisation_interest_submitted','facilitator_interest_submitted',
   'founding_community_interest_submitted')),
 programme text CHECK(programme IN ('SUPPORT_CIRCLE')),
 channel text CHECK(channel IN ('INSTAGRAM','TIKTOK','WHATSAPP','COMMUNITY','ORGANISATION','DIRECT','OTHER')),
 created_at timestamptz NOT NULL DEFAULT now()
);
```

No free-text "why are you interested" field: free text invites health
disclosures, so the form does not collect it. `*_submitted` events are written
by the server in the same transaction as the interest row, not by the client.

### API endpoints

| Method and path | Auth | Request | Response `data` |
|---|---|---|---|
| `POST /v1/programme-interest` | none or member session; rate-limited per IP and per email hash (existing `rate_limits`) | `{kind, programme:'SUPPORT_CIRCLE', email, whatsapp?, city?, country?, organisationName?, seatsBucket?, communityName?, communitySizeBucket?, priceBucket?, preferredSchedule?, channel, referralCode?, adultConfirmed:true, contactConsentVersion}`; fields not valid for `kind` are rejected | `202 {accepted:true}` always, including duplicates (no enumeration) |
| `GET /v1/programme-interest/me` | member session | — | `{items:[{id,kind,programme,priceBucket,preferredSchedule,createdAt,withdrawn:boolean}]}` own rows only |
| `DELETE /v1/programme-interest/me/:id` | member session | — | `{withdrawn:true}`; `404` for another user's id |
| `POST /v1/programme-interest/withdraw` | token from the confirmation email (hashed `action_tokens`, single use) | `{token}` | `{withdrawn:true}` generic |
| `POST /v1/funnel/analytics` | none | `{event:'programme_page_viewed'\|'programme_interest_form_started', programme?, channel?}` | `{recorded:true}`; server-only events rejected with `400` |

`channel` comes from an allowlisted `?src=` value kept in `sessionStorage` on
the client; unknown values become `OTHER`. `referralCode` is resolved
server-side to a Komunitas Pendiri (after V2); unknown codes are ignored,
never echoed.

### UI screens (web)

- `/program/support-circle` (public): what it is, format (4 weekly online
  sessions, 6–8 people, trained facilitator), what it is not (no therapy,
  diagnosis or emergency help), crisis block, FAQ, interest form. Price shown
  as "Harga akan diumumkan" (no price promise in V1).
- Interest form states: idle, validating, submitted ("Terima kasih. Kami akan
  menghubungimu lewat email."), rate-limited, server error.
- `/untuk-organisasi` (public): organisation form.
- `/fasilitator` (public): facilitator form.
- `/komunitas-pendiri` (public): community application form.
- Member area: a "Minat saya" card listing own interest with a withdraw
  button.

### Analytics events (allowlist)

`programme_page_viewed`, `programme_interest_form_started` (client);
`programme_interest_submitted`, `organisation_interest_submitted`,
`facilitator_interest_submitted`, `founding_community_interest_submitted`
(server). Properties: `programme`, `channel` only. Explicitly **not**
recorded: crisis-resource clicks (a distress signal), price bucket, city,
any identifier.

### Security and privacy risks

| Risk | Control |
|---|---|
| Spam and scraping of a public form | IP and email-hash rate limits; generic `202`; honeypot field; no read endpoint for anonymous callers |
| Contact data leak | Email and WhatsApp encrypted at rest; only `ops:` scripts decrypt; no contact data in logs or analytics |
| Account enumeration through duplicates | Same `202` for new and duplicate |
| Under-18 contact | Required adult confirmation; age is self-attested, not verified (stated on the page) |
| Advertising pixels added later by marketing | Content-Security-Policy on these routes allows only first-party scripts; a test asserts no third-party script tags |
| Consent | Versioned contact consent; withdrawal by member page or email token; contact only for this pilot |

### Acceptance criteria

- **Given** `ENABLE_PROGRAMME_INTEREST=false`, **when** anyone calls a V1 route
  or opens a V1 page, **then** they get `404` and no form is rendered.
- **Given** an anonymous visitor with `?src=tiktok`, **when** they submit a
  valid member interest form, **then** one `programme_interest` row with
  `channel='TIKTOK'` exists, email is stored only encrypted, one
  `programme_interest_submitted` analytics row with `channel='TIKTOK'` and no
  other properties exists, and the response is `202 {accepted:true}`.
- **Given** the same email submits twice, **when** the second request lands,
  **then** the response is identical to the first and there is still one row.
- **Given** `adultConfirmed` is missing or false, **when** the form is
  submitted, **then** `400 VALIDATION_ERROR` with `field:'adultConfirmed'` and
  an Indonesian message.
- **Given** member A, **when** A calls `DELETE /v1/programme-interest/me/:id`
  with member B's id, **then** `404` and B's row is unchanged.
- **Given** any V1 page, **when** it renders, **then** the crisis block is
  visible and no third-party script or pixel is present.
- **Given** a client sends `programme_interest_submitted` to
  `/v1/funnel/analytics`, **then** `400` and no row is written.

### Test plan

- Unit: contract schemas (per-`kind` field rules, enums, strictness).
- Integration (real PostgreSQL): submit, dedupe, rate limit, encryption at
  rest (raw column is not the plaintext), withdraw by session and by token,
  token single use, flag off → `404`.
- Authorization: anonymous cannot read; member reads only own rows;
  cross-account `DELETE` → `404` (IDOR); session for a `COMMUNITY` account
  cannot submit `kind:'MEMBER'` as a linked member row.
- Privacy: analytics table rows contain only allowlisted columns; logs for
  these routes contain no email, phone or body.
- Web: form states; crisis block present; no `<script src>` outside the app
  origin on V1 pages (Playwright).

### Out of scope

Prices, payments, accounts created from the form, email marketing tools,
CRM integration, WhatsApp automation, third-party analytics, A/B testing,
mobile.

---

## V2 Komunitas Pendiri: approved communities run free activities and cohorts

### Objective

Let up to ~10 approved communities run free activities and free Support Circle
cohorts through Sandar for 3 months, so G3 can be met and G2 and G4 can be
measured before money is involved.

### User stories

- As an approved community, I see my Komunitas Pendiri status and end date.
- As an approved community, I create an activity (a one-off online session) or
  a Support Circle cohort (4 weekly sessions, 6–8 seats), submit it for review,
  and see who registered (display names only).
- As a member, I browse published activities, register, get the private join
  link shortly before the session, and cancel.
- As a member registering for a cohort, I answer a short safety check before
  my seat is confirmed. If I need urgent help I am shown crisis resources and
  Sandar staff follow up; the community never sees my answers.
- As an assigned facilitator, I mark attendance and report a safety concern or
  a role-boundary issue after each session.
- As Sandar staff, I approve communities, publish activities, assign
  facilitators and handle safety cases within the SLA, with an audit trail.

### Schema changes — `012_founding_communities.sql`, `013_pilot_safety.sql`

`012_founding_communities.sql`

- `founding_communities(id, owner_user_id → users UNIQUE, display_name,
  referral_code UNIQUE, starts_at, ends_at CHECK(ends_at > starts_at),
  status CHECK IN ('ACTIVE','ENDED','SUSPENDED'), created_by_operator,
  created_at)`. Requires `community_application_states.status='APPROVED'`,
  checked by the `ops:` script and re-checked by every route.
- `ALTER TABLE programme_interest ADD FOREIGN KEY (referral_community_id)
  REFERENCES founding_communities(id)`.
- `activities(id, community_id → founding_communities, kind CHECK IN
  ('ACTIVITY','SUPPORT_CIRCLE_COHORT'), title varchar(120), summary
  varchar(600), format CHECK IN ('ONLINE'), capacity smallint CHECK(capacity
  BETWEEN 1 AND 100), status CHECK IN ('DRAFT','SUBMITTED','PUBLISHED',
  'CANCELLED','COMPLETED'), reviewed_by_operator, published_at, created_at,
  updated_at, CHECK(kind <> 'SUPPORT_CIRCLE_COHORT' OR capacity BETWEEN 6 AND
  8))`.
- `activity_sessions(id, activity_id, sequence smallint, starts_at,
  duration_minutes CHECK BETWEEN 30 AND 180, meeting_url_ciphertext,
  UNIQUE(activity_id, sequence))`; cohorts require exactly 4 sessions to
  publish (enforced in the publish transaction).
- `activity_facilitators(activity_id, user_id, assigned_by_operator,
  PRIMARY KEY(activity_id, user_id))`. Facilitator is a scoped assignment to
  one activity, not an account type or global role.
- `activity_registrations(id, activity_id, user_id, status CHECK IN
  ('PENDING_SAFETY_REVIEW','CONFIRMED','CANCELLED','DECLINED'), source CHECK IN
  ('FREE','PAID'), channel, created_at, UNIQUE(activity_id, user_id))`.
  Capacity is enforced under `SELECT ... FOR UPDATE` on the activity row.
- `session_attendance(session_id, registration_id, status CHECK IN
  ('ATTENDED','ABSENT'), marked_by, marked_at, PRIMARY KEY(session_id,
  registration_id))`.
- `activity_analytics(id, event CHECK IN (...), activity_kind, created_at)`.
- `pilot_audit_log(id, operator, action, target_type, target_id, reason
  varchar(300), created_at)` — append-only (no `UPDATE`/`DELETE` grant for the
  runtime role).

`013_pilot_safety.sql`

- `intake_answers(registration_id PRIMARY KEY, answers_ciphertext,
  questionnaire_version, risk_level CHECK IN ('NONE','ELEVATED','HIGH'),
  created_at)`. Answers are encrypted; only `risk_level` is plaintext, and it is
  never returned to communities or facilitators.
- `pilot_safety_cases(id, source CHECK IN ('INTAKE','FACILITATOR_REPORT'),
  category CHECK IN ('HIGH_RISK_DISCLOSURE','ROLE_BOUNDARY','CONDUCT',
  'OTHER'), severity CHECK IN ('HIGH','NORMAL'), activity_id, registration_id,
  reported_by, note_ciphertext, sla_due_at NOT NULL, acknowledged_at,
  handled_at, outcome CHECK IN ('RESOURCES_SHARED','REFERRED','NO_ACTION',
  'CONFIRMED_VIOLATION','NOT_A_VIOLATION'), handled_by_operator, created_at)`.

The intake questionnaire is a short, non-clinical check (for example "Apakah
saat ini kamu merasa tidak aman atau berpikir untuk menyakiti diri?"), written
and approved by the safety lead before V2 ships. It is not a diagnosis or
assessment, and the copy says so.

### API endpoints

Community (account type `COMMUNITY`, active `founding_communities` row owned by
the caller):

| Method and path | Request | Response `data` |
|---|---|---|
| `GET /v1/community/founding/me` | — | `{status, startsAt, endsAt, referralCode}` or `404` |
| `GET /v1/community/activities` | — | `{items:[ActivitySummary]}` own community only |
| `POST /v1/community/activities` | `{kind, title, summary, capacity, sessions:[{startsAt, durationMinutes}]}` | `ActivityDetail` in `DRAFT` |
| `PATCH /v1/community/activities/:id` | same fields, partial; `DRAFT` only | `ActivityDetail` |
| `POST /v1/community/activities/:id/submit` | — | `ActivityDetail` in `SUBMITTED` |
| `POST /v1/community/activities/:id/cancel` | `{reasonCode}` | `ActivityDetail` in `CANCELLED`; registrants notified |
| `GET /v1/community/activities/:id/registrations` | — | `{items:[{registrationId, displayName, status, attendance:[{sequence,status}]}]}` — no email, intake, risk level or safety case |

Member (completed onboarding, `ACTIVE`):

| Method and path | Request | Response `data` |
|---|---|---|
| `GET /v1/activities` | `?kind=&page=` | `{items:[{id, kind, title, communityName, startsAt, sessionCount, seatsLeft}], nextPage}` published and upcoming only |
| `GET /v1/activities/:id` | — | `{id, kind, title, summary, host:{type:'COMMUNITY', name}, sessions:[{sequence,startsAt,durationMinutes}], seatsLeft, myRegistration:{status}\|null}` |
| `POST /v1/activities/:id/registrations` | `{intake?:{questionnaireVersion, answers:{...enums}}, channel?}` — `intake` required for cohorts | `{registrationId, status:'CONFIRMED'\|'PENDING_SAFETY_REVIEW'}` + crisis resources when `PENDING_SAFETY_REVIEW` |
| `DELETE /v1/activities/:id/registrations/me` | — | `{status:'CANCELLED'}` |
| `GET /v1/activities/:id/sessions/:sequence/join` | — | `{meetingUrl}` only for a `CONFIRMED` registrant or assigned facilitator, from 30 minutes before start until the end |

Facilitator (row in `activity_facilitators` for this activity):

| Method and path | Request | Response `data` |
|---|---|---|
| `GET /v1/facilitator/activities` | — | assigned activities only |
| `PUT /v1/facilitator/activities/:id/sessions/:sequence/attendance` | `{entries:[{registrationId, status}]}`; only registrations of this activity; only after session start | `{saved:n}` |
| `POST /v1/facilitator/activities/:id/safety-reports` | `{category, registrationId?, note?(≤500)}` | `{reported:true}`; `HIGH_RISK_DISCLOSURE` creates a `HIGH` case |

Operations (scripts, not HTTP): `ops:founding-approve`, `ops:activity-publish`,
`ops:facilitator-assign`, `ops:safety-cases` (list due cases, acknowledge,
close with outcome). Each writes `pilot_audit_log`.

### UI screens (web)

- Community: "Komunitas Pendiri" dashboard (status, end date, referral link),
  activity list, create/edit form with cohort rules shown, registrations table,
  cancel dialog.
- Member: `/kegiatan` list, `/kegiatan/:id` detail with host name, sessions,
  seats and crisis block; registration flow with intake step for cohorts;
  confirmation; "Kegiatan saya" with join button (active only near start) and
  cancel.
- Facilitator: assigned activities, attendance sheet per session, "Laporkan
  kekhawatiran" form with a reminder of role boundaries (peer support only; no
  advice on diagnosis, medication or therapy; escalate to Sandar).
- Every activity and cohort page shows the crisis block.

### Analytics events (allowlist)

`activity_list_viewed`, `activity_viewed`, `activity_registration_started`
(client); `activity_registration_confirmed`, `activity_registration_cancelled`,
`community_activity_submitted`, `community_activity_published` (server).
Property: `activity_kind` only. Intake answers, risk level,
`PENDING_SAFETY_REVIEW`, safety reports and attendance are **never**
analytics.

### Security and privacy risks

| Risk | Control |
|---|---|
| Community reads another community's activity or registrants (BOLA) | Every query joins `founding_communities.owner_user_id = session user`; tests for every `:id` route |
| Community or facilitator sees health data | Registrations DTO excludes intake, risk level and cases; `risk_level` and answers never leave staff scripts |
| Facilitator marks attendance or reports on an activity not assigned to them | Assignment check in the same transaction; `404` |
| Meeting link leak | Encrypted at rest; returned only to confirmed registrants and assigned facilitators in the time window; never in lists, emails' subject lines or logs |
| High-risk intake left unhandled | Case created in the registration transaction with `sla_due_at`; the ops script lists cases nearing breach; G4 report counts breaches |
| Therapy or diagnosis claims in community copy | Activities need operator review before `PUBLISHED`; review checklist includes claims and crisis block |
| Capacity race | Row lock on activity; unique `(activity_id,user_id)` |
| Stale approval (community suspended) | Status re-checked on every route; suspension hides published activities |

### Acceptance criteria

- **Given** `ENABLE_FOUNDING_COMMUNITIES=false`, **when** any V2 route is
  called, **then** `404`.
- **Given** community A, **when** A requests
  `GET /v1/community/activities/:id/registrations` for community B's activity,
  **then** `404` and no B data appears in the body.
- **Given** a cohort draft with 3 sessions, **when** the operator runs
  `ops:activity-publish`, **then** publishing is refused and the activity stays
  `SUBMITTED`.
- **Given** a published cohort with 1 seat left, **when** two members register
  at the same time, **then** exactly one gets a seat and the other gets
  `409 ACTIVITY_FULL`.
- **Given** a member whose intake answers map to `HIGH`, **when** they register,
  **then** the registration is `PENDING_SAFETY_REVIEW`, the response shows the
  crisis resources, a `HIGH` `pilot_safety_cases` row exists with `sla_due_at`
  set, and the community's registrations list does not show this member's risk
  or answers.
- **Given** facilitator F assigned to activity X, **when** F marks attendance on
  activity Y, **then** `404`.
- **Given** a member not registered, **when** they request the join link,
  **then** `404`.
- **Given** any analytics row written during V2 tests, **then** it has no
  identifier, intake, risk or safety field.

### Test plan

- Unit: contracts; cohort rules; intake → risk mapping (table-driven, reviewed
  by the safety lead).
- Integration: full lifecycle DRAFT → SUBMITTED → PUBLISHED → COMPLETED;
  capacity race; cancel and notify; join-link window; attendance rules;
  suspension hides activities; audit rows written by every `ops:` script.
- Authorization (each endpoint): unauthenticated `401`; wrong account type
  `403`; cross-community, cross-member and cross-facilitator access `404`
  (IDOR/BOLA); member with incomplete onboarding refused.
- Privacy: DTO snapshot tests prove no intake, risk, email or meeting URL in
  community and list responses; encryption at rest of answers, notes and links.
- Web: activity pages show crisis block; intake step required for cohorts;
  pending-review state copy.

### Out of scope

Payments, community payouts, community-run posting or comments, verified
community badges, community join flows for spaces, community moderators,
in-app video, recordings, certificates, reminders by WhatsApp, mobile.

---

## V3 Member payment for programmes (behind `ENABLE_PAID_PROGRAMS`)

### Objective

Let a member pay for a seat in a Support Circle cohort, so G1 is measured with
real money at a price ≥ Rp99,000. Paid access is granted only by a verified,
idempotent server-side webhook.

### Seller

In this pilot the seller of every paid offer is **Sandar** (the operating legal
entity, named in full). Communities may host or refer, and are named as such,
but are not sellers, because community payouts and splits are not built. The
seller and the refund policy version are shown before payment and stored on
the order.

### Prerequisites (not code)

Legal entity able to take payments, merchant account with the chosen gateway
(Midtrans or Xendit; sandbox first), refund and cancellation policy v1 approved,
Terms and Privacy Notice updated for payments, PSE registration status
reviewed. V3 is not turned on in production until these are done.

### User stories

- As a member, I see the price in rupiah, who is selling, what is included,
  the session dates, the refund policy and the crisis resources before I pay.
- As a member, I complete the safety check before paying, so I am not charged
  for a seat I cannot take.
- As a member, I pay through the gateway's hosted page (QRIS, virtual account,
  e-wallet, card) and my seat is confirmed only when Sandar receives the
  gateway's confirmation.
- As a member, I see my orders and receipts and can request a refund under the
  policy.
- As Sandar staff, I reconcile orders with the gateway and process refunds with
  an audit trail.

### Schema changes — `014_programme_payments.sql`

```sql
CREATE TABLE refund_policies (version varchar(40) PRIMARY KEY, url text NOT NULL, summary_id varchar(600) NOT NULL, effective_at timestamptz NOT NULL);
CREATE TABLE programme_offers (
 id uuid PRIMARY KEY, activity_id uuid NOT NULL UNIQUE REFERENCES activities(id),
 seller_type text NOT NULL CHECK(seller_type IN ('SANDAR')),
 seller_legal_name varchar(160) NOT NULL,
 price_idr bigint NOT NULL CHECK(price_idr > 0 AND price_idr <= 100000000),
 refund_policy_version varchar(40) NOT NULL REFERENCES refund_policies(version),
 status text NOT NULL CHECK(status IN ('DRAFT','ON_SALE','CLOSED')),
 sales_close_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE programme_orders (
 id uuid PRIMARY KEY, offer_id uuid NOT NULL REFERENCES programme_offers(id), user_id uuid NOT NULL REFERENCES users(id),
 registration_id uuid NOT NULL UNIQUE REFERENCES activity_registrations(id),
 amount_idr bigint NOT NULL CHECK(amount_idr > 0),
 seller_type text NOT NULL, seller_legal_name varchar(160) NOT NULL,    -- snapshot shown to the buyer
 refund_policy_version varchar(40) NOT NULL,                           -- snapshot accepted by the buyer
 channel text NOT NULL,
 state text NOT NULL CHECK(state IN ('PENDING','PAID','EXPIRED','FAILED','REFUND_REQUESTED','REFUNDED')),
 gateway text NOT NULL, gateway_reference varchar(120) UNIQUE,
 idempotency_key uuid NOT NULL, hold_expires_at timestamptz NOT NULL,
 paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id, idempotency_key)
);
CREATE TABLE payment_events (
 gateway text NOT NULL, gateway_event_id varchar(160) NOT NULL,
 order_id uuid REFERENCES programme_orders(id), event_type varchar(60) NOT NULL,
 amount_idr bigint, signature_valid boolean NOT NULL, processed_at timestamptz,
 received_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(gateway, gateway_event_id)
);
CREATE TABLE payment_analytics (id uuid PRIMARY KEY, event text NOT NULL CHECK(event IN (
 'offer_viewed','checkout_started','checkout_redirected','payment_confirmed','payment_expired',
 'payment_failed','refund_requested','refund_completed')), price_bucket text, channel text, created_at timestamptz NOT NULL DEFAULT now());
```

Seat holds: a `PENDING` order reserves its registration's seat until
`hold_expires_at` (proposed 30 minutes). Expired holds release the seat.
The raw webhook body is not stored (it may carry buyer contact data); only the
fields above.

### API endpoints

| Method and path | Auth | Request | Response `data` |
|---|---|---|---|
| `GET /v1/programmes/offers` | member | — | `{items:[{offerId, title, priceIdr, seller:{type, legalName}, firstSessionAt, seatsLeft}]}` |
| `GET /v1/programmes/offers/:id` | member | — | `{offerId, title, summary, priceIdr, seller:{type, legalName}, host:{name}\|null, sessions, seatsLeft, refundPolicy:{version, url, summary}, salesCloseAt}` |
| `POST /v1/programmes/offers/:id/checkout` | member with `CONFIRMED` free-of-risk intake for this cohort | `{idempotencyKey, acceptedRefundPolicyVersion, sellerAcknowledged:true}`; version must equal the offer's current version | `{orderId, checkoutUrl, holdExpiresAt}`; repeat with same key returns the same order; `409` when sold out, sales closed or version changed |
| `POST /v1/payments/webhooks/:gateway` | gateway signature (Midtrans signature key or Xendit callback token, per adapter) | gateway payload | `200` once recorded; invalid signature `401` and nothing processed |
| `GET /v1/orders/me` | member | — | own orders `{items:[{orderId, title, amountIdr, seller, state, paidAt}]}` |
| `GET /v1/orders/:id` | member | — | own order only, else `404` |
| `POST /v1/orders/:id/refund-request` | member, own `PAID` order, within policy window | `{reasonCode}` (enum, no free text) | `{state:'REFUND_REQUESTED'}` |

Webhook processing, in one transaction: verify signature → insert
`payment_events` (`ON CONFLICT DO NOTHING`; a duplicate returns `200` with no
effect) → lock order → check `amount_idr` equals the order amount exactly and
the gateway reference matches → move `PENDING → PAID` (or `EXPIRED`/`FAILED`) →
confirm the registration with `source='PAID'` → write `payment_confirmed` →
queue receipt email in `email_outbox`. A webhook for an expired hold whose seat
is gone moves the order to `PAID` and flags it for an automatic full refund by
staff (no overbooking).

The gateway's return/success URL opens `/program/pesanan/:id`, which only
reads order state. **It grants nothing.**

Refunds: staff issue the refund in the gateway dashboard (`ops:refund` records
the decision and audit row); the gateway's refund webhook moves the order to
`REFUNDED` and cancels the registration.

### UI screens (web)

- Offer page `/program/support-circle/:offerId`: price formatted from the
  integer (`Rp99.000`), "Dijual oleh: <nama badan hukum Sandar>", host
  community if any, sessions, seats left, refund policy summary and version with
  link, crisis block.
- Checkout review: intake (if not done), seller and refund policy
  acknowledgement checkboxes, "Bayar Rp99.000" → gateway hosted page.
- Order status `/program/pesanan/:id`: "Menunggu konfirmasi pembayaran",
  "Pembayaran diterima — tempatmu sudah dikonfirmasi", "Kedaluwarsa",
  "Gagal"; polls `GET /v1/orders/:id`.
- "Pesanan saya": list, receipt view, refund request.
- No advertising pixels or third-party scripts on any of these pages.

### Analytics events (allowlist)

`offer_viewed`, `checkout_started`, `checkout_redirected` (client);
`payment_confirmed`, `payment_expired`, `payment_failed`, `refund_requested`,
`refund_completed` (server). Properties: `price_bucket`, `channel`. No order id,
amount, user, payment method or intake data.

### Security and privacy risks

| Risk | Control |
|---|---|
| Access granted by visiting the success URL | Return page is read-only; only the webhook transitions orders |
| Forged or replayed webhook | Signature verification per gateway; `(gateway, gateway_event_id)` primary key; amount and reference check |
| Amount tampering | Amount computed server-side from the offer; integer comparison with the gateway amount |
| Floating-point money | `bigint` columns, `z.number().int()`, integer formatting; lint rule or test that no money field is parsed with `parseFloat` |
| Reading another member's order (IDOR) | Order queries scoped by `user_id`; `404` for others |
| Double charge from double click | `idempotencyKey` unique per user; one order per registration |
| Overbooking | Seat holds under row lock; late webhook triggers refund path |
| Hidden seller or changed refund terms | Seller and policy version snapshotted on the order and shown before payment; checkout rejects a stale version |
| Gateway keys | Secrets only in the host's environment; never in the repo, logs or client bundle; sandbox keys in development |
| Health data to the gateway | Only order id, amount, item name ("Support Circle — 4 sesi") and buyer email; no intake data |

### Acceptance criteria

- **Given** `ENABLE_PAID_PROGRAMS=false`, **when** any V3 route is called,
  **then** `404`, and no price or "Bayar" button is rendered.
- **Given** an offer, **when** a member opens it, **then** the seller's legal
  name, the price from an integer, the refund policy version and the crisis
  block are visible before the pay button.
- **Given** a `PENDING` order, **when** the member opens the success URL without
  a webhook, **then** the order stays `PENDING` and no seat is confirmed.
- **Given** a valid signed `settlement` webhook with the exact amount, **when**
  it arrives twice, **then** the order is `PAID` once, one registration is
  confirmed, one receipt is queued and the second call returns `200` with no
  change.
- **Given** a webhook with an invalid signature or an amount differing by Rp1,
  **then** nothing changes and the event is recorded as invalid.
- **Given** member A, **when** A requests member B's order, **then** `404`.
- **Given** the refund policy version changed after the member opened the page,
  **when** they check out with the old version, **then** `409` and a message to
  review the new terms.
- **Given** a member whose intake is `HIGH`, **when** they try to check out,
  **then** checkout is refused and crisis resources are shown.

### Test plan

- Unit: money formatting from integers; contract schemas; signature verifiers
  with gateway sample vectors.
- Integration: checkout idempotency; hold expiry releases seat; webhook
  duplicate, out-of-order (`expire` after `settlement`), wrong amount, wrong
  reference, invalid signature; refund webhook; late payment refund path.
- Authorization: `401`/`403`/`404` per route; cross-account order read and
  refund request (IDOR); community and facilitator accounts cannot check out on
  another member's behalf.
- Sandbox end-to-end against the gateway sandbox (manual, recorded in the
  evidence doc).
- Privacy: no third-party script on offer, checkout and order pages; gateway
  request payload contains no intake data.

### Out of scope

Organisation invoicing and seat codes (organisation interest is collected in
V1; handling an organisation purchase is an open question), community as
seller, payouts, three-party splits, subscriptions, discounts and vouchers,
instalments, refunds inside the product without staff, finance CMS, mobile.

---

## V4 Community Plus interest page (no billing)

### Objective

Measure whether communities would pay for a subscription after Komunitas
Pendiri ends, and at what price, without building or charging for it.

### User stories

- As a community (approved or not), I can read what Community Plus might
  include, see an indicative price range, and say whether I would pay and how
  much.
- As the owner, I can count interest by price bucket and feature.

### Schema changes — `015_community_plus_interest.sql`

`community_plus_interest(id, user_id → users (COMMUNITY account),
founding_community_id NULL, would_pay CHECK IN ('YES','MAYBE','NO'),
price_bucket CHECK IN ('UNDER_100K','100K_249K','250K_499K','500K_PLUS'),
features text[] CHECK(features <@ ARRAY['ACTIVITY_TOOLS','COHORT_TOOLS',
'MEMBER_INSIGHTS','FACILITATOR_TRAINING','BRANDED_PAGE']), contact_consent_version,
withdrawn_at, created_at, updated_at, UNIQUE(user_id))` and
`community_plus_analytics(id, event CHECK IN ('community_plus_viewed',
'community_plus_interest_submitted'), created_at)`.

### API endpoints

| Method and path | Auth | Request | Response `data` |
|---|---|---|---|
| `PUT /v1/community-plus/interest/me` | `COMMUNITY` session | `{wouldPay, priceBucket?, features, contactConsentVersion}` | `{saved:true}` (upsert own row) |
| `GET /v1/community-plus/interest/me` | `COMMUNITY` session | — | own row or `null` |
| `DELETE /v1/community-plus/interest/me` | `COMMUNITY` session | — | `{withdrawn:true}` |
| `POST /v1/community-plus/analytics` | none | `{event:'community_plus_viewed'}` | `{recorded:true}` |

### UI screens (web)

`/komunitas/plus`: candidate features, indicative price range labelled
"Belum tersedia — kami sedang mengukur minat", no checkout, no payment method
form, short form for signed-in community accounts, sign-in prompt otherwise.

### Analytics events (allowlist)

`community_plus_viewed` (client), `community_plus_interest_submitted`
(server). No properties.

### Security and privacy risks

Misleading pre-sale (copy says clearly nothing is for sale and nothing will be
charged); member accounts writing community interest (`403`); cross-account
read or delete (`404` by construction, own row only).

### Acceptance criteria

- **Given** `ENABLE_COMMUNITY_PLUS_INTEREST=false`, **then** routes `404` and
  the page is hidden.
- **Given** a community account, **when** it submits twice, **then** one row is
  kept and updated.
- **Given** a member account, **when** it calls `PUT`, **then** `403`.
- **Given** the page, **then** there is no payment form, no card or bank field
  and no "Langganan" button.

### Test plan

Contracts; upsert; withdraw; account-type checks; cross-account isolation;
analytics allowlist; page has no payment UI (web test).

### Out of scope

Billing, plans, trials, invoices, payment methods, entitlements, any change to
what communities can do.

---

## Deferred items from roadmap-to-payments.md

Each item stays in [roadmap-to-payments.md](roadmap-to-payments.md) and is
**DEFERRED** until its evidence gate is met and the owner decides to start it.
Gate thresholds marked "proposed" need the owner's confirmation.

| Item (old phase) | Status | Evidence gate that unlocks it |
|---|---|---|
| Admin CMS part 1: roles, audit, reports queue, cases, appeals, team posts (Phase 2) | DEFERRED | Pilot `ops:` scripts become the bottleneck (proposed: > 20 operator actions per week or > 2 staff operators), **or** before open posting starts. Pilot audit log and safety case data inform its design |
| Open posting and comments (Phase 3) | DEFERRED | CMS part 1 live; G4 met for the whole pilot; moderation staffed for posting hours; safety lead signs off on the classifier-or-human-review decision |
| Verified communities: application form, verification review, community pages, joining, community moderators (Phase 4) | DEFERRED | G3 met; proposed: ≥ 3 Komunitas Pendiri ask to continue after their 3 months; verification criteria written and reviewed; CMS part 1 live |
| Mobile app store release (Phase 5) | DEFERRED | Proposed: ≥ 2 completed paid cohorts and a measured share of web visits from phones that justifies store work; PSE and store policy review done. The Expo app stays as it is |
| Events and programmes (Phase 6) | PARTLY PULLED FORWARD | V2 builds free activities and cohorts for Komunitas Pendiri only. General events in spaces, reminders and the Home events tab stay deferred until G2 and G3 are met |
| Payments catalogue and checkout (Phase 7 items 3–4) | PULLED FORWARD AS V3 | Narrowed to member payment for programmes with Sandar as seller |
| Refunds in the CMS (Phase 7 item 5) | DEFERRED | V3 handles refunds by staff with audit; CMS refunds follow CMS part 1 and more than a handful of refunds per month (proposed: > 10) |
| Community subscription (Community Plus billing) | DEFERRED | V4 shows demand (proposed: ≥ 5 communities answer `YES` at a price bucket ≥ Rp100,000 per month) and Komunitas Pendiri periods are ending |
| Three-party split and payouts (Phase 7 item 6) | DEFERRED | G1 met; a community or partner is actually required to be a seller or payee; legal and tax review of splits; ≥ 1 month of V3 reconciliation with zero unexplained differences |
| Finance reports and daily reconciliation (Phase 7 item 7) | DEFERRED (manual in pilot) | Payouts unlocked, or order volume makes manual reconciliation unreliable (proposed: > 100 orders per month) |

## Gate report

Each Monday from 30 Nov, an `ops:gate-report` script prints G1–G4 from the
tables named above plus funnel counts per step and channel from the analytics
tables. The output is copied into `docs/validation-pilot-gates.md` with the
date. It contains counts only, never personal data or case details.

## Open questions for the owner

1. Is V3's seller always Sandar in the pilot (this plan's assumption), or must a
   community be able to sell? Community as seller needs payouts, which are
   deferred.
2. Organisation-paid seats: invoice outside the product and grant seats by an
   audited staff script (conflicts with hard rule 3, which allows paid access
   only from a verified webhook), or use the gateway's payment link so a
   webhook still grants access, or leave organisation purchases out of the
   pilot?
3. G1: minimum share per channel (proposed: each counted channel ≥ 20% of paid
   seats, so one stray sale doesn't count as a channel)?
4. G2: count free cohorts, paid cohorts or both? (Plan reports both.)
5. G4: SLA values (proposed: high-risk acknowledged ≤ 1 hour during
   published session hours, ≤ 12 hours otherwise; handled ≤ 24 hours) and the
   definition of a role-boundary violation.
6. Pilot operations by `ops:` scripts with database access, or a small staff
   web page?
7. Refund policy v1 terms (window, partial refunds after session 1?).
8. Which gateway (Midtrans or Xendit), and whose legal entity is the seller?
9. Who writes and approves the intake questionnaire and the facilitator role
   boundaries (safety lead)?

## Remaining risks

- **Calendar**: cohorts must start by 30 Nov for G2. Merchant account, legal
  entity, refund policy and PSE review are outside engineering control and may
  push V3 past that date.
- **Small numbers**: 6–8 seat cohorts mean G1 and G2 rest on a few dozen
  people; results are directional, not statistically strong.
- **Self-attested age** remains unverified.
- **Safety staffing**: G4 depends on someone watching cases during and after
  every session; no on-call tooling exists beyond the ops script.
- **Operator access** to the database for `ops:` scripts is powerful; it needs
  named people, a least-privilege role and the audit log.
- **No CMS**: content review, case handling and refunds are manual and do not
  scale past the pilot.
- **Email delivery** for receipts and confirmations depends on the production
  email setup in `docs/deploy-production.md`.
- This plan has not had a security review, legal review or safety-lead review.
