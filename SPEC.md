# Spec: GP booking without phone tag

## The problem

A patient asks their GP practice for an appointment online. The practice then phones them back to agree a time. The patient is at work, misses unknown-number calls, gets a text threatening to cancel, and ends up on hold for 20 minutes.

## The product

The patient says when they're free when they ask for an appointment. The practice triages the request, and the app shows which open slots fit those times. The practice sends 2–3 slots by text, and the patient taps one to book. No calls in either direction.

**Who pays:** the GP practice, per month. It saves reception staff time on call-backs and wasted no-answer slots.

## Decisions

| Topic | Decision |
|-------|----------|
| Users | Two views of one demo: Patient and Clinic, one click apart. No login. |
| Clinic calendar | Sample data only: one practice, 3 clinicians, slots for the next 7 days, created relative to today. Not editable. |
| Patient availability | Half-day boxes for the next 7 days: morning (08:00–13:00) or afternoon (13:00–18:30). |
| Triage | The patient's answers suggest **urgent** or **routine**, and the receptionist confirms or changes it before anything is offered. |
| Urgent | Top of the queue. Only gets slots within the next 24 hours. Its offer expires after 2 hours (routine: 24 hours). |
| Offers | The clinic picks up to 3 slots. Those slots are held for this patient until the patient picks one or the offer expires. |
| SMS | Fake. Every message goes to an on-screen outbox, signed with the practice name and containing the patient's link. |
| AI | None. |
| Stack | Cloudflare Workers + D1 (Cloudflare's hosted SQLite database), Hono (a small web framework for Workers) with server-rendered HTML and plain forms, Vitest for tests. No client-side framework. |

## Core flow

1. **Patient asks.** Name, mobile, what it's about, two red-flag checkboxes, and availability boxes. Submit → a personal status link `/r/:token`. Outbox: "Riverside Surgery: we've got your request. We'll text you times to choose from. No need to call."
2. **Clinic triages.** The queue shows new requests, urgent first, then oldest first. The receptionist opens one, sees the suggested urgency, and confirms or changes it.
3. **Clinic offers.** The app lists open slots that fall inside the patient's half-days (urgent: only within 24 hours), soonest first, with the first 3 ticked. The receptionist sends them. The slots become held, and the outbox gets "Riverside Surgery: pick a time for your appointment by 15:30: link".
4. **Patient picks.** The status link shows the offered times. Tap one → booked; the other held slots are freed. Outbox: confirmation with time, clinician and practice.
5. **Exceptions.**
   - **No slot fits:** the clinic clicks "Ask for more times". The patient gets a text and adds more boxes on their link, and the request goes back to the queue.
   - **Offer expires:** the held slots are freed, and the request goes back to the queue marked "No reply". It's never cancelled automatically.

## Data model (D1)

```
clinicians   id, name, role ('GP' | 'Nurse')
slots        id, clinician_id → clinicians, starts_at, duration_min,
             status ('open' | 'held' | 'booked'),
             request_id → requests (null while open)
requests     id, token (unguessable, for the patient link), patient_name, phone,
             reason, red_flags (0/1 each: chest_or_breathing, rapidly_worse),
             suggested_urgency ('urgent' | 'routine'),
             urgency ('urgent' | 'routine' | null until triaged),
             status ('new' | 'offered' | 'booked' | 'needs_times' | 'no_reply'),
             created_at
availability request_id → requests, day (YYYY-MM-DD), half ('am' | 'pm')
             primary key (request_id, day, half)
offers       id, request_id → requests, created_at, expires_at,
             status ('pending' | 'accepted' | 'expired')
offer_slots  offer_id → offers, slot_id → slots
messages     id, request_id → requests, to_phone, body, created_at   -- the fake SMS outbox
```

Queue order: `urgency = 'urgent'` first (falling back to `suggested_urgency` before triage), then `created_at`. `new`, `needs_times` (once the patient has added times) and `no_reply` all show in the queue.

## Logic in code (the part that isn't UI)

All pure functions in `src/logic.ts`, unit-tested:

- `suggestUrgency(redFlags)` → `'urgent'` if any red flag is ticked, else `'routine'`.
- `matchSlots(openSlots, availability, urgency, now)` → slots that start after `now` and fall inside a chosen half-day. For urgent, also within `now + 24h`. Soonest first.
- `offerExpiry(urgency, now)` → `now + 2h` or `now + 24h`.
- `isExpired(offer, now)`.

State changes are in `src/db.ts`. Each one runs as a single D1 batch, and each update checks the current status in its `WHERE` clause, so a double click or a stale page can't book twice:

- `sendOffer`: the slots must still be `open` → `held`. The request → `offered`.
- `acceptOffer`: the offer must be `pending` and not expired, and the slot must be one of the offer's slots. That slot → `booked`, the rest → `open`, the offer → `accepted`, the request → `booked`.
- `expireOffers(now)`: runs at the start of every request (no cron job needed). Pending offers past `expires_at` → `expired`, their held slots → `open`, their requests → `no_reply`.

## Pages

| Path | View | What it does |
|------|------|--------------|
| `/` | both | Short pitch plus two buttons: "I'm a patient" and "I'm the clinic". Links to the outbox and "Reset demo". |
| `/request` | patient | Request form with a 999 / NHS 111 notice for emergencies. |
| `/r/:token` | patient | Status: waiting, pick a time (offer), booked, or add more times. |
| `/clinic` | clinic | Queue with urgency and status badges, plus a list of upcoming bookings. |
| `/clinic/requests/:id` | clinic | Triage (confirm urgency), matching slots, "Send offer", "Ask for more times", and a demo-only "Expire offer now" button. |
| `/clinic/calendar` | clinic | Read-only 7-day grid by clinician: open, held or booked. |
| `/outbox` | demo | The fake texts, newest first, each with its link. |
| `POST /demo/reset` | demo | Wipes the data and re-seeds the clinicians, slots and 3 sample requests in different states. |

## Edge cases handled

- Blank or too-long fields, a bad phone number, or no availability ticked: the form shows the error again with the patient's input kept.
- No matching slots: the clinic page says so and offers "Ask for more times".
- A slot taken between the clinic page loading and "Send offer": the offer is refused with a message, and the list refreshes.
- Opening an offer link after it expired, after booking, or twice: the page shows the current state, never an error.
- Unknown token or request id: a 404 page.
- Times: stored in UTC and shown in Europe/London.

## Out of scope

Login, real SMS, editing the calendar, more than one practice, patients cancelling or rescheduling, reminders, AI.

## Build order

1. Scaffold the Worker, Hono and D1. Write the schema, seed and reset. Deploy an empty app to prove the pipeline works.
2. `logic.ts` and its tests.
3. Patient request form, status page and outbox.
4. Clinic queue, triage, matching and send offer.
5. Accept, expiry, "ask for more times" and calendar.
6. README, click through the live URL on desktop and phone, and submit.
