# Roadmap: from launch to payments

Each phase ships on its own and has a clear "done when". A phase starts only
when the one before it is live, because each depends on the trust and tools
the previous one builds. Payments come last on purpose: money raises the
stakes for safety, support and law, so it needs moderation, verified
communities and working operations underneath it.

## Phase 1: Launch (read and react)

Website, member web app, onboarding, official spaces with team posts,
reactions, reports and blocks. Posting closed. Free.
Runbook: `docs/deploy-production.md`.

Done when: real people can sign up and use the four official spaces;
emails arrive; reports reach a moderator.

## Phase 2: Moderation tools (Admin CMS, part 1)

What the safety team needs before members can post.
- CMS sign-in with roles (M01 Access, M11 Roles) and audit log (M12).
- Reports queue and case handling (M04 Reports, M05 Cases): see report,
  hide/restore content, warn, restrict or ban, with reasons.
- Review queue for posts held by the human-review safety adapter.
- Team posts and announcements from the CMS (M10 Content), replacing the
  launch content script.
- Appeals (M06).

Done when: moderators work entirely in the CMS, with response targets agreed.

## Phase 3: Open posting and comments

- Web composer (named or anonymous), comments, edit and delete own content.
- Open spaces one at a time (`posting_enabled`, `commenting_enabled`).
- Decide on an automated safety classifier, reviewed by the safety lead, or
  keep holding every post for human review while volume is low.
- Email notifications for replies (opt-in).

Done when: posting is open in all official spaces with moderation staffed for
the hours they are active.

## Phase 4: Verified communities

- Community application form and status in the web app (status routing already exists).
- Verification review in the CMS (M03): documents, moderators, decision, appeal.
- Community pages, joining, and community moderators with the same tools.
- Discover shows verified communities as joinable (today they show "Segera").

Done when: the first partner communities are live and moderating their own spaces.

## Phase 5: Mobile app

- Release the Expo app (onboarding, Home, Discover and spaces already exist)
  to TestFlight and Google Play internal testing, then the stores.
- Make the API public for the app (already on `api.hellosandar.com`), add
  universal links for email verification.

Done when: the app is in both stores using the same accounts.

## Phase 6: Events and programs (free)

- Events in spaces: date, online link or place, capacity, registration,
  reminders, cancellation.
- Multi-session programs.
- Events tab in Home (the API already reserves `capabilities.events`).

Done when: communities and Sandar run free events end to end.

## Phase 7: Payments

Legal and operational groundwork comes first; none of it is code.
1. Company and compliance: PSE registration with Kominfo (private scope),
   tax setup for PPN on digital services, refund and cancellation policy,
   payment terms for communities and the training partner (never named in the
   product), updated Privacy Notice.
2. Payment gateway: choose Midtrans or Xendit (QRIS, virtual accounts,
   e-wallets, cards); open a merchant account; sandbox keys.
3. Catalogue: paid programs and trainings with price, seller (Sandar, a
   verified community, or Sandar selling partner training) and refund terms
   shown before payment. Turn on `ENABLE_PAID_PROGRAMS` per product.
4. Checkout and orders: hosted checkout, idempotent webhooks, order and
   enrollment records, receipts by email, failed and expired payments.
5. Refunds: member request, review in the CMS, gateway refund, audit trail.
6. Three-party split and payouts (CMS M13 Finance): Sandar fee, community
   share, training-partner share; payouts to verified communities only, with
   bank account verification, payout holds and a dispute window.
7. Finance reports and reconciliation against the gateway every day.

Done when: a member can pay for a program, attend it, get a receipt and a
refund if eligible, and the community receives its payout on schedule.
