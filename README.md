# No-call GP booking

**Live:** https://gp-booking.simonwisdom.workers.dev

Booking a GP appointment often means asking online, then waiting for the practice to phone back. If you're at work and miss the calls from an unknown number, you get a text threatening to cancel, and you end up on hold for 20 minutes.

This app removes the phone call. The patient says **when they're free** as part of the request. The practice triages it, sees which open slots fit, and texts 2–3 times. The patient taps one and they're booked.

- **User:** GP reception and triage staff, and their patients.
- **Today:** online request, then call-back tag.
- **Who pays:** the practice, per month. It saves receptionists' call-back time and cuts missed-call cancellations.

## Try it

The demo has both sides and no login. Texts aren't really sent: they appear under **Texts**, signed with the practice name.

1. **Clinic** → open *Mark Evans* (urgent, suggested from his red-flag answer) → confirm **Urgent** → the app lists open slots in his free half-days within 24 hours → **Text these times**.
2. **Texts** → open the patient link → tap a time → booked. The other held slots are freed (see **Calendar**).
3. Open *Jo Lee* → triage → offer → **Demo: expire this offer now**. The slots are released and she's back in the queue as "No reply". She's never cancelled.
4. **Patient** → make your own request and follow it through.
5. **Reset demo** at any time.

## How it works

```
Patient request + half-days free ─▶ Clinic queue (urgent first)
  ─▶ Receptionist confirms urgent/routine
  ─▶ App matches open slots to the free half-days (urgent: next 24h only)
  ─▶ Offer: up to 3 slots held, expires in 2h (urgent) / 24h (routine)
       ├─ patient taps one ─▶ booked, other holds released
       ├─ no reply ─▶ holds released, back in queue as "No reply"
       └─ nothing fits ─▶ "Ask for more times" ─▶ patient adds half-days ─▶ back in queue
```

**Data model (D1 / SQLite):** `clinicians`, `slots` (open / held / booked, linked to a request), `requests` (status new / offered / booked / needs_times / no_reply; suggested and confirmed urgency), `availability` (request × day × am/pm), `offers` (pending / accepted / expired, with `expires_at`) and `offer_slots`, `messages` (the text outbox). See `schema.sql`.

**Things that can't go wrong twice:** each state change is one D1 batch (a transaction), and each statement re-checks the current state in its `WHERE` clause. A double click, an out-of-date clinic page, or a patient tapping an expired offer gets a clear message and changes nothing. Overdue offers are expired at the start of every request, so no scheduled job is needed.

## Code

| File | What's in it |
|------|--------------|
| `src/logic.ts` | Pure rules: urgency suggestion, half-day matching, expiry, London time, form validation. Tested in `src/logic.test.ts`. |
| `src/db.ts` | Every query and state change. |
| `src/seed.ts` | Demo practice: 3 clinicians, a week of weekday slots, 3 requests in different states. |
| `src/views.tsx`, `src/index.tsx` | Server-rendered pages (Hono JSX) and routes. No client JavaScript. |

Stack: Cloudflare Workers, D1, Hono, TypeScript, Vitest.

## Run locally

```bash
npm install
npm run db:init:local
npm run dev          # http://127.0.0.1:8787
npm test
```

Deploy: create a D1 database and put its id in `wrangler.jsonc`, then `npm run db:init:remote && npm run deploy`. The app fills in its sample data on first visit.

## Left out on purpose

Login, real SMS, editing the calendar, more than one practice, matching clinician type to the reason (for example a nurse for blood tests), patient cancel or reschedule, reminders, AI.
