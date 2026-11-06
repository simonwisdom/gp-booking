# Agent guide

Read `SPEC.md` (what to build) and `REQUIREMENTS.md` (what "done" means) before changing anything.

## Stack

- Cloudflare Workers + D1, Hono with server-rendered JSX (`hono/jsx`), plain HTML forms. No client-side framework, no build step beyond Wrangler.
- Tests: Vitest, for the pure functions in `src/logic.ts`.

## Layout

- `schema.sql`: the whole database schema. It drops and recreates tables, so it doubles as a reset.
- `src/logic.ts`: pure rules (urgency, slot matching, expiry, time helpers). No database access. Tested in `src/logic.test.ts`.
- `src/db.ts`: every query and state change. Each state change is one `DB.batch` whose `UPDATE`s check the current status in `WHERE`, so stale pages and double clicks can't double-book.
- `src/seed.ts`: demo clinicians, slots and requests, created relative to "now".
- `src/views.tsx`: page components. `src/index.tsx`: routes.

## Commands

- `npm test`, `npm run typecheck` before every commit.
- `npm run dev` serves on 127.0.0.1 only. First run: `npm run db:init:local`.
- `npm run deploy`; schema changes also need `npm run db:init:remote` (this wipes the data; the app's "Reset demo" re-seeds).

## Rules

- Store times as UTC ISO strings; show them in Europe/London.
- Statuses are the fixed values in `schema.sql`. Don't add new ones without updating the schema and SPEC.
- SMS is fake: write to the `messages` table only.
- Keep it small. Nothing outside SPEC's scope.
