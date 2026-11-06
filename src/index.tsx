import { Hono, type Context } from 'hono'
import * as db from './db'
import { MAX_OFFER_SLOTS, matchSlots, nextDays, parseAvailability, validateRequest } from './logic'
import { resetDemo } from './seed'
import { Calendar, ClinicQueue, ClinicRequest, Home, NotFound, Outbox, PatientStatus, RequestForm, Thread } from './views'

type Env = { Bindings: { DB: D1Database } }
type Form = Record<string, string | string[]>

const DAYS_AHEAD = 7
// Flash messages are looked up by key so query strings can't inject text.
const MESSAGES: Record<string, { text: string; error?: boolean }> = {
  booked: { text: "You're booked. We've texted you the details." },
  gone: { text: 'Sorry, that time is no longer available. The offer may have expired.', error: true },
  times_added: { text: "Thanks. We'll text you times that fit." },
  no_times: { text: 'Please tick at least one half-day.', error: true },
  triaged: { text: 'Urgency confirmed.' },
  offered: { text: 'Offer texted to the patient. Those slots are held until they pick or it expires.' },
  offer_failed: { text: "Couldn't send: one of those slots was just taken, or the request has moved on. Here's the latest.", error: true },
  pick_slots: { text: `Pick between 1 and ${MAX_OFFER_SLOTS} slots from the list.`, error: true },
  asked: { text: 'Asked the patient for more times.' },
  expired: { text: 'Offer expired. Slots released and the request is back in the queue.' },
  stale: { text: 'That request has already moved on. Here is its current state.', error: true },
  reset: { text: 'Demo data reset.' },
}

const app = new Hono<Env>()

const now = () => new Date()
const baseUrl = (c: Context) => new URL(c.req.url).origin
const flash = (c: Context) => MESSAGES[c.req.query('msg') ?? '']
const form = async (c: Context): Promise<Form> => {
  const body = await c.req.parseBody({ all: true })
  const out: Form = {}
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === 'string') out[k] = v
    else if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string')
  }
  return out
}
const ids = (raw: string | string[] | undefined) =>
  ([] as string[]).concat(raw ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0)

// Seed on first use, and expire overdue offers before every request (no cron needed).
app.use('*', async (c, next) => {
  const seeded = await c.env.DB.prepare('SELECT 1 FROM clinicians LIMIT 1').first()
  if (!seeded) await resetDemo(c.env.DB, now(), baseUrl(c))
  await db.expireOffers(c.env.DB, now())
  await next()
})

app.get('/', (c) => c.html(<Home />))

app.post('/demo/reset', async (c) => {
  await resetDemo(c.env.DB, now(), baseUrl(c))
  return c.redirect('/clinic?msg=reset', 303)
})

app.get('/outbox', async (c) => c.html(<Outbox messages={await db.listMessages(c.env.DB)} />))
app.get('/outbox/:phone', async (c) => {
  const phone = c.req.param('phone')
  const messages = (await db.listMessages(c.env.DB)).filter((m) => m.phone === phone)
  if (messages.length === 0) return c.html(<NotFound />, 404)
  return c.html(<Thread phone={phone} messages={messages} />)
})
// Simulated inbound SMS: the patient replies from their phone.
app.post('/outbox/:phone/reply', async (c) => {
  const phone = c.req.param('phone')
  const body = String((await form(c)).body ?? '').trim().slice(0, 300)
  if (!body) return c.redirect(`/outbox/${encodeURIComponent(phone)}`, 303)
  const ok = await db.handleReply(c.env.DB, phone, body, now(), baseUrl(c))
  if (!ok) return c.html(<NotFound />, 404)
  return c.redirect(`/outbox/${encodeURIComponent(phone)}#latest`, 303)
})

// ---------- patient ----------

app.get('/request', (c) => c.html(<RequestForm days={nextDays(now(), DAYS_AHEAD)} />))

app.post('/request', async (c) => {
  const days = nextDays(now(), DAYS_AHEAD)
  const f = await form(c)
  const result = validateRequest(f, days)
  if (!result.ok) return c.html(<RequestForm days={days} errors={result.errors} values={f} />, 422)
  const token = await db.createRequest(c.env.DB, result.value, now(), baseUrl(c))
  return c.redirect(`/r/${token}`, 303)
})

app.get('/r/:token', async (c) => {
  const req = await db.getRequestByToken(c.env.DB, c.req.param('token'))
  if (!req) return c.html(<NotFound />, 404)
  const [offer, booked] = await Promise.all([db.latestOffer(c.env.DB, req.id), db.bookedSlotFor(c.env.DB, req.id)])
  return c.html(<PatientStatus req={req} offer={offer} booked={booked} days={nextDays(now(), DAYS_AHEAD)} msg={flash(c)} />)
})

app.post('/r/:token/accept', async (c) => {
  const req = await db.getRequestByToken(c.env.DB, c.req.param('token'))
  if (!req) return c.html(<NotFound />, 404)
  const [slotId] = ids((await form(c)).slot_id)
  const ok = slotId !== undefined && (await db.acceptOffer(c.env.DB, req, slotId, now()))
  if (ok) return c.redirect(`/r/${req.token}?msg=booked`, 303)
  // Already booked (double tap, second tab, or booked by text): just show the booking, no error.
  const latest = await db.getRequest(c.env.DB, req.id)
  return c.redirect(`/r/${req.token}${latest?.status === 'booked' ? '' : '?msg=gone'}`, 303)
})

app.post('/r/:token/times', async (c) => {
  const req = await db.getRequestByToken(c.env.DB, c.req.param('token'))
  if (!req) return c.html(<NotFound />, 404)
  const availability = parseAvailability((await form(c)).slot, nextDays(now(), DAYS_AHEAD))
  if (availability.length === 0) return c.redirect(`/r/${req.token}?msg=no_times`, 303)
  const ok = await db.addTimes(c.env.DB, req, availability)
  return c.redirect(`/r/${req.token}${ok ? '?msg=times_added' : ''}`, 303)
})

// ---------- clinic ----------

app.get('/clinic', async (c) => {
  const [requests, slots] = await Promise.all([db.listRequests(c.env.DB), db.allSlots(c.env.DB)])
  const bookings = slots.filter((s) => s.status === 'booked' && s.request_id !== null)
  return c.html(<ClinicQueue requests={requests} bookings={bookings} msg={flash(c)} />)
})

app.get('/clinic/calendar', async (c) => {
  const [slots, requests] = await Promise.all([db.allSlots(c.env.DB), db.listRequests(c.env.DB)])
  return c.html(<Calendar days={nextDays(now(), DAYS_AHEAD)} slots={slots} requests={requests} now={now()} />)
})

const requestOr404 = async (c: Context<Env>) => {
  const id = Number(c.req.param('id'))
  return Number.isInteger(id) ? db.getRequest(c.env.DB, id) : null
}
const back = (id: number, msg: string) => `/clinic/requests/${id}?msg=${msg}`

async function matchesFor(d1: D1Database, req: db.RequestRow) {
  const [open, availability] = await Promise.all([db.openFutureSlots(d1, now()), db.getAvailability(d1, req.id)])
  return { availability, matches: matchSlots(open, availability, req.urgency ?? req.suggested_urgency, now()) }
}

app.get('/clinic/requests/:id', async (c) => {
  const req = await requestOr404(c)
  if (!req) return c.html(<NotFound />, 404)
  const [{ availability, matches }, offer, booked] = await Promise.all([
    matchesFor(c.env.DB, req), db.latestOffer(c.env.DB, req.id), db.bookedSlotFor(c.env.DB, req.id),
  ])
  return c.html(<ClinicRequest req={req} availability={availability} matches={matches} offer={offer} booked={booked} msg={flash(c)} />)
})

app.post('/clinic/requests/:id/urgency', async (c) => {
  const req = await requestOr404(c)
  if (!req) return c.html(<NotFound />, 404)
  const urgency = (await form(c)).urgency
  if (urgency !== 'urgent' && urgency !== 'routine') return c.redirect(back(req.id, 'stale'), 303)
  const ok = await db.setUrgency(c.env.DB, req.id, urgency)
  return c.redirect(back(req.id, ok ? 'triaged' : 'stale'), 303)
})

app.post('/clinic/requests/:id/offer', async (c) => {
  const req = await requestOr404(c)
  if (!req) return c.html(<NotFound />, 404)
  const picked = [...new Set(ids((await form(c)).slot_id))]
  const { matches } = await matchesFor(c.env.DB, req)
  // Only slots that currently match this request (its times and urgency window) can be offered.
  const valid = picked.every((id) => matches.some((m) => m.id === id))
  if (picked.length < 1 || picked.length > MAX_OFFER_SLOTS) return c.redirect(back(req.id, 'pick_slots'), 303)
  if (!valid) return c.redirect(back(req.id, 'offer_failed'), 303)
  const ok = await db.sendOffer(c.env.DB, req, matches.filter((m) => picked.includes(m.id)), now(), baseUrl(c))
  return c.redirect(back(req.id, ok ? 'offered' : 'offer_failed'), 303)
})

app.post('/clinic/requests/:id/ask-times', async (c) => {
  const req = await requestOr404(c)
  if (!req) return c.html(<NotFound />, 404)
  const ok = await db.askForTimes(c.env.DB, req, now(), baseUrl(c))
  return c.redirect(back(req.id, ok ? 'asked' : 'stale'), 303)
})

app.post('/clinic/requests/:id/expire', async (c) => {
  const req = await requestOr404(c)
  if (!req) return c.html(<NotFound />, 404)
  await db.expireNow(c.env.DB, req.id, now())
  return c.redirect(back(req.id, 'expired'), 303)
})

app.notFound((c) => c.html(<NotFound />, 404))

export default app
