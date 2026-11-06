# Requirements

Source: the Algosoup take-home brief. Build and deploy a real web product that people would use and pay for, in 1 hour.

Each line is one requirement. Under it: what "done" means. Tick the box only when the "done" test passes.

## Deliverables

- [x] **R1. GitHub repo URL**
  Done: code is pushed to a GitHub repo the assessors can open, and the README says what the product is, who it's for, and how to run it locally in one or two commands.

- [x] **R2. Live deployed app URL**
  Done: the URL opens in a fresh browser with no setup, shows demo data straight away, and the core flow (R7) works there end to end, not only on localhost.

- [ ] **R3. Coding agent logs**
  Done: every Claude Code session used for the build is exported with `/export` and sent as-is. No cleaning, rewriting or trimming.

## Product judgment

- [x] **R4. A product people would use and pay for**
  Done: the README names the user, the job they're doing today, what's painful about it, and who pays. Each fits in one sentence.

- [x] **R5. Own idea preferred**
  Done: the idea is not one of the 16 examples in the brief, or, if it starts from one, it has a clear twist that the README states.

- [x] **R6. Not a simple LLM wrapper**
  Done: the product has a real data model (several related records saved in a database), a workflow with states that change over time, and logic written in code (rules, scoring, matching, scheduling). If AI is used, it's one step inside the workflow, and the app still works when the AI call fails.

- [x] **R7. One coherent core flow, complete end to end**
  Done: a new visitor can do the main job from start to finish (create or receive something, act on it, see the result and its new state) without hitting a dead end.

- [x] **R8. Scope fits 1 hour**
  Done: the README lists what was built and what was left out on purpose. Nothing half-built is visible in the UI.

## Engineering judgment

- [x] **R9. Simple, maintainable code**
  Done: a small number of files with clear names, one framework, no unused code or dependencies. A reader can find the core logic in under a minute.

- [x] **R10. Sensible data model**
  Done: the tables and their relationships are written down in the README (a short list or diagram), and statuses are a fixed set of values, not free text.

- [x] **R11. Edge cases handled reasonably**
  Done: empty states, bad input (blank, too long, wrong type), and invalid state changes (for example acting on something already closed) each give a clear message instead of a crash or silent failure.

- [x] **R12. Deployable and easy to understand**
  Done: one command builds and one command deploys; no secrets are in the repo; required environment variables are listed in `.env.example`.
  Note: the app needs no environment variables or secrets (only the D1 binding in `wrangler.jsonc`), so there is no `.env.example`.

- [ ] **R13. Core logic is tested**
  Done: automated tests cover the main rules and state changes, and they pass before each commit.

## AI-native workflow

- [x] **R14. The agent is given good context**
  Done: the repo has this file and a short CLAUDE.md with project rules, and the logs show the agent working from them.
  Note: project rules are in `AGENTS.md` (with `SPEC.md`); `CLAUDE.md` is kept out of the repo by choice.

- [x] **R15. Output is reviewed, tested and steered**
  Done: the logs show tests being run, the live app being checked, and at least one place where bad or off-scope output was caught and corrected.

## Execution

- [ ] **R16. Works live with no obvious bugs**
  Done: the core flow is clicked through on the live URL after the last deploy, on desktop and on a phone-sized screen.

- [ ] **R17. Finished within the time limit**
  Done: first and last commit timestamps fall within 1 hour of the start (see Q1).

## Constraints (from the brief)

- No more than 1 hour.
- Any AI or model provider is allowed.
- Starter templates, UI libraries and hosted services are allowed.
- Agent logs must not be hidden or edited.
- Simple LLM-wrapper builds are rejected.

## Open questions and assumed answers

| # | Question | Assumed answer |
|---|----------|----------------|
| Q1 | When does the hour start and stop? | Starts when the brief was first read (this session). Stops when the live URL, repo and logs are ready to send. Setup, deploy and README all count. |
| Q2 | Does the product have to use AI? | No. AI is allowed, not required. Use it only where it does something the rules-based logic can't, and never as the main feature. |
| Q3 | Do we need login and multiple users? | No real login. One shared demo workspace with seeded data. A "reset demo data" action covers visitors changing it. |
| Q4 | Real database, or is in-memory state enough? | A real, persistent database. The brief grades the data model and state, and data that vanishes on restart would look broken live. |
| Q5 | Do integrations (email, SMS, payments, maps) need to be real? | No. Simulate them behind one small function each, and show their effect in the UI (for example an "outbox" of messages that would be sent). |
| Q6 | Does "would pay for" mean building billing? | No. A one-line pricing idea in the README is enough. |
| Q7 | Public or private GitHub repo? | Public, so assessors can open it without an invite. The brief PDF stays out of the repo. |
| Q8 | If AI is used on a public URL, how do we stop abuse of the API key? | Key stays on the server, calls are capped per request and in total, and the app falls back to rules-only output when the cap is hit. |
| Q9 | Are tests expected? | Not stated. A few fast tests on the core logic are worth the minutes; no UI tests. |
| Q10 | Which screen sizes? | Desktop first, usable on a phone. |
| Q11 | One agent session or several? | Several is fine. Export each one and send them all. |
