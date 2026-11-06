// All queries and state changes. Each state change is one D1 batch (a transaction),
// and every statement re-checks the current state in its WHERE clause, so a stale page
// or a double click can't hold or book a slot twice.

import { type DayHalf, type NewRequest, type Urgency, formatWhen, offerExpiry, offerText, parseReply, suggestUrgency } from './logic'

export const PRACTICE = 'Riverside Surgery'

export type RequestStatus = 'new' | 'offered' | 'booked' | 'needs_times' | 'no_reply'
export type RequestRow = {
  id: number; token: string; patient_name: string; phone: string; reason: string
  flag_chest_or_breathing: number; flag_rapidly_worse: number
  suggested_urgency: Urgency; urgency: Urgency | null; status: RequestStatus; created_at: string
}
export type SlotRow = {
  id: number; clinician_id: number; clinician: string; role: string
  starts_at: string; duration_min: number; status: 'open' | 'held' | 'booked'; request_id: number | null
}
export type OfferRow = { id: number; request_id: number; created_at: string; expires_at: string; status: string }
export type MessageRow = {
  id: number; request_id: number; phone: string; direction: 'out' | 'in'; body: string; created_at: string
  token: string; patient_name: string
}

// Requests the clinic still has to act on.
const QUEUE_STATES = "('new', 'no_reply')"
const SLOT_SELECT = `SELECT s.*, c.name AS clinician, c.role FROM slots s JOIN clinicians c ON c.id = s.clinician_id`

const iso = (d: Date) => d.toISOString()

// ---------- reads ----------

export function getRequestByToken(db: D1Database, token: string) {
  return db.prepare('SELECT * FROM requests WHERE token = ?').bind(token).first<RequestRow>()
}

export function getRequest(db: D1Database, id: number) {
  return db.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first<RequestRow>()
}

export async function getAvailability(db: D1Database, requestId: number): Promise<DayHalf[]> {
  const r = await db.prepare('SELECT day, half FROM availability WHERE request_id = ? ORDER BY day, half')
    .bind(requestId).all<DayHalf>()
  return r.results
}

export async function listRequests(db: D1Database) {
  const r = await db.prepare(
    `SELECT * FROM requests
     ORDER BY COALESCE(urgency, suggested_urgency) = 'urgent' DESC, created_at ASC`,
  ).all<RequestRow>()
  return r.results
}

export async function openFutureSlots(db: D1Database, now: Date) {
  const r = await db.prepare(`${SLOT_SELECT} WHERE s.status = 'open' AND s.starts_at > ? ORDER BY s.starts_at`)
    .bind(iso(now)).all<SlotRow>()
  return r.results
}

export async function allSlots(db: D1Database) {
  const r = await db.prepare(`${SLOT_SELECT} ORDER BY s.starts_at, c.id`).all<SlotRow>()
  return r.results
}

export async function bookedSlotFor(db: D1Database, requestId: number) {
  return db.prepare(`${SLOT_SELECT} WHERE s.request_id = ? AND s.status = 'booked'`).bind(requestId).first<SlotRow>()
}

/** The latest offer for a request, with its slots. */
export async function latestOffer(db: D1Database, requestId: number) {
  const offer = await db.prepare('SELECT * FROM offers WHERE request_id = ? ORDER BY id DESC LIMIT 1')
    .bind(requestId).first<OfferRow>()
  if (!offer) return null
  const slots = await db.prepare(
    `${SLOT_SELECT} JOIN offer_slots os ON os.slot_id = s.id WHERE os.offer_id = ? ORDER BY s.starts_at`,
  ).bind(offer.id).all<SlotRow>()
  return { ...offer, slots: slots.results }
}

export async function listMessages(db: D1Database) {
  const r = await db.prepare(
    `SELECT m.*, r.token, r.patient_name FROM messages m JOIN requests r ON r.id = m.request_id
     ORDER BY m.created_at DESC, m.id DESC LIMIT 500`,
  ).all<MessageRow>()
  return r.results
}

// ---------- state changes ----------

/** Expire every pending offer past its deadline: free its held slots, put the request back in the queue. */
export async function expireOffers(db: D1Database, now: Date) {
  const t = iso(now)
  const due = `SELECT id FROM offers WHERE status = 'pending' AND expires_at <= ?`
  await db.batch([
    db.prepare(
      `UPDATE slots SET status = 'open', request_id = NULL
       WHERE status = 'held' AND id IN (SELECT slot_id FROM offer_slots WHERE offer_id IN (${due}))`,
    ).bind(t),
    db.prepare(
      `UPDATE requests SET status = 'no_reply'
       WHERE status = 'offered' AND id IN (SELECT request_id FROM offers WHERE id IN (${due}))`,
    ).bind(t),
    db.prepare(`UPDATE offers SET status = 'expired' WHERE id IN (${due})`).bind(t),
  ])
}

function message(db: D1Database, requestId: number, body: string, now: Date, guardSql = '1', ...guardArgs: unknown[]) {
  return db.prepare(
    `INSERT INTO messages (request_id, phone, body, created_at)
     SELECT id, phone, ?, ? FROM requests WHERE id = ? AND ${guardSql}`,
  ).bind(body, iso(now), requestId, ...guardArgs)
}

export async function createRequest(db: D1Database, v: NewRequest, now: Date, baseUrl: string) {
  const token = crypto.randomUUID()
  const reqId = `(SELECT id FROM requests WHERE token = ?)`
  await db.batch([
    db.prepare(
      `INSERT INTO requests (token, patient_name, phone, reason, flag_chest_or_breathing, flag_rapidly_worse,
                             suggested_urgency, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(token, v.name, v.phone, v.reason, v.chestOrBreathing ? 1 : 0, v.rapidlyWorse ? 1 : 0,
      suggestUrgency(v), iso(now)),
    ...v.availability.map((a) =>
      db.prepare(`INSERT INTO availability (request_id, day, half) VALUES (${reqId}, ?, ?)`).bind(token, a.day, a.half)),
    db.prepare(
      `INSERT INTO messages (request_id, phone, body, created_at) SELECT id, phone, ?, ? FROM requests WHERE token = ?`,
    ).bind(
      `${PRACTICE}: we've got your appointment request. We'll text you times to choose from, no need to call us. ` +
      `Track it here: ${baseUrl}/r/${token}`, iso(now), token),
  ])
  return token
}

/** Receptionist confirms or changes urgency. Only while the request is waiting in the queue. */
export async function setUrgency(db: D1Database, id: number, urgency: Urgency) {
  const r = await db.prepare(`UPDATE requests SET urgency = ? WHERE id = ? AND status IN ${QUEUE_STATES}`)
    .bind(urgency, id).run()
  return r.meta.changes === 1
}

/**
 * Offer slots to a triaged request and hold them. All-or-nothing: if the request has left the queue
 * or any slot is no longer open, nothing changes and this returns false.
 */
export async function sendOffer(db: D1Database, req: RequestRow, slots: SlotRow[], now: Date, baseUrl: string) {
  if (!req.urgency || slots.length === 0) return false
  // Sorted so the numbers in the text match the order on the patient's page (latestOffer sorts by time).
  const sorted = [...slots].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const slotIds = sorted.map((s) => s.id)
  const ids = slotIds.map(() => '?').join(',')
  const expires = offerExpiry(req.urgency, now, sorted.map((s) => s.starts_at))
  const pending = `(SELECT id FROM offers WHERE request_id = ? AND status = 'pending')`
  const results = await db.batch([
    db.prepare(
      `INSERT INTO offers (request_id, created_at, expires_at)
       SELECT ?, ?, ? WHERE
         EXISTS (SELECT 1 FROM requests WHERE id = ? AND status IN ${QUEUE_STATES} AND urgency IS NOT NULL)
         AND NOT EXISTS (SELECT 1 FROM offers WHERE request_id = ? AND status = 'pending')
         AND (SELECT COUNT(*) FROM slots WHERE id IN (${ids}) AND status = 'open' AND starts_at > ?) = ?`,
    ).bind(req.id, iso(now), iso(expires), req.id, req.id, ...slotIds, iso(now), slotIds.length),
    db.prepare(
      `INSERT INTO offer_slots (offer_id, slot_id) SELECT ${pending}, id FROM slots WHERE id IN (${ids})
       AND EXISTS ${pending}`,
    ).bind(req.id, ...slotIds, req.id),
    db.prepare(
      `UPDATE slots SET status = 'held', request_id = ?
       WHERE status = 'open' AND id IN (SELECT slot_id FROM offer_slots WHERE offer_id = ${pending})`,
    ).bind(req.id, req.id),
    message(db, req.id, offerText(PRACTICE, sorted, expires, `${baseUrl}/r/${req.token}`),
      now, `status IN ${QUEUE_STATES} AND EXISTS ${pending}`, req.id),
    db.prepare(`UPDATE requests SET status = 'offered' WHERE id = ? AND EXISTS ${pending}`).bind(req.id, req.id),
  ])
  return results[0].meta.changes === 1
}

/** Patient picks one offered slot. Returns false if the offer expired, was already used, or the slot isn't in it. */
export async function acceptOffer(db: D1Database, req: RequestRow, slotId: number, now: Date) {
  const live = `(SELECT id FROM offers WHERE request_id = ? AND status = 'pending' AND expires_at > ?)`
  const justBooked = `EXISTS (SELECT 1 FROM slots WHERE id = ? AND status = 'booked' AND request_id = ?)`
  const slot = await db.prepare(`${SLOT_SELECT} WHERE s.id = ?`).bind(slotId).first<SlotRow>()
  const results = await db.batch([
    db.prepare(
      `UPDATE slots SET status = 'booked' WHERE id = ? AND status = 'held' AND request_id = ? AND starts_at > ?
       AND id IN (SELECT slot_id FROM offer_slots WHERE offer_id = ${live})`,
    ).bind(slotId, req.id, iso(now), req.id, iso(now)),
    db.prepare(`UPDATE slots SET status = 'open', request_id = NULL WHERE status = 'held' AND request_id = ? AND ${justBooked}`)
      .bind(req.id, slotId, req.id),
    db.prepare(`UPDATE offers SET status = 'accepted' WHERE request_id = ? AND status = 'pending' AND ${justBooked}`)
      .bind(req.id, slotId, req.id),
    message(db, req.id,
      `${PRACTICE}: you're booked with ${slot?.clinician ?? 'us'} on ${slot ? formatWhen(slot.starts_at) : ''}. See you then.`,
      now, `status = 'offered' AND ${justBooked}`, slotId, req.id),
    db.prepare(`UPDATE requests SET status = 'booked' WHERE id = ? AND status = 'offered' AND ${justBooked}`)
      .bind(req.id, slotId, req.id),
  ])
  return results[0].meta.changes === 1
}

/**
 * A patient replies by SMS (simulated). Logs the reply, then either books the chosen option
 * (acceptOffer sends the confirmation) or texts back why it couldn't.
 * Returns false if no request uses this phone number.
 */
export async function handleReply(db: D1Database, phone: string, body: string, now: Date, baseUrl: string) {
  const req = await db.prepare('SELECT * FROM requests WHERE phone = ? ORDER BY id DESC LIMIT 1').bind(phone).first<RequestRow>()
  if (!req) return false
  await db.prepare(`INSERT INTO messages (request_id, phone, direction, body, created_at) VALUES (?, ?, 'in', ?, ?)`)
    .bind(req.id, phone, body, iso(now)).run()
  const reply = (text: string) => message(db, req.id, text, now).run()

  if (req.status === 'offered') {
    const offer = await latestOffer(db, req.id)
    const choice = offer?.status === 'pending' ? parseReply(body, offer.slots.length) : null
    if (offer?.status === 'pending' && choice === null) {
      const n = offer.slots.length
      await reply(`${PRACTICE}: sorry, we didn't understand. Reply with just the number${n > 1 ? `, 1 to ${n}` : ' 1'}, or choose here: ${baseUrl}/r/${req.token}`)
      return true
    }
    if (offer && choice !== null && (await acceptOffer(db, req, offer.slots[choice - 1].id, now))) return true
    await reply(`${PRACTICE}: sorry, that time is no longer available. We'll text you new times soon.`)
    return true
  }
  if (req.status === 'booked') {
    const slot = await bookedSlotFor(db, req.id)
    await reply(`${PRACTICE}: you're already booked${slot ? ` with ${slot.clinician} on ${formatWhen(slot.starts_at)}` : ''}.`)
    return true
  }
  if (req.status === 'no_reply') {
    await reply(`${PRACTICE}: sorry, that offer has ended and the times were released. Your request is not cancelled: we'll text you new times.`)
    return true
  }
  await reply(`${PRACTICE}: thanks. There's nothing to choose right now. We'll text you when we have times for you.`)
  return true
}

/** No slot fits: ask the patient for more times. */
export async function askForTimes(db: D1Database, req: RequestRow, now: Date, baseUrl: string) {
  const results = await db.batch([
    message(db, req.id,
      `${PRACTICE}: we couldn't find a time that fits. Please add a few more times you could come in: ${baseUrl}/r/${req.token}`,
      now, `status IN ${QUEUE_STATES}`),
    db.prepare(`UPDATE requests SET status = 'needs_times' WHERE id = ? AND status IN ${QUEUE_STATES}`).bind(req.id),
  ])
  return results[1].meta.changes === 1
}

/** Patient adds more half-days; the request goes back into the queue as new. */
export async function addTimes(db: D1Database, req: RequestRow, availability: DayHalf[]) {
  const results = await db.batch([
    ...availability.map((a) =>
      db.prepare(
        `INSERT OR IGNORE INTO availability (request_id, day, half)
         SELECT id, ?, ? FROM requests WHERE id = ? AND status = 'needs_times'`,
      ).bind(a.day, a.half, req.id)),
    db.prepare(`UPDATE requests SET status = 'new' WHERE id = ? AND status = 'needs_times'`).bind(req.id),
  ])
  return results[results.length - 1].meta.changes === 1
}

/** Demo only: make the pending offer due now, then run normal expiry. */
export async function expireNow(db: D1Database, requestId: number, now: Date) {
  await db.prepare(`UPDATE offers SET expires_at = ? WHERE request_id = ? AND status = 'pending'`)
    .bind(iso(now), requestId).run()
  await expireOffers(db, now)
}
