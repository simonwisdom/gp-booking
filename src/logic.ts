// Pure booking rules. No database access, so everything here is unit-tested.

export type Urgency = 'urgent' | 'routine'
export type Half = 'am' | 'pm'
export type DayHalf = { day: string; half: Half }

export const TZ = 'Europe/London'
export const URGENT_WINDOW_HOURS = 24
export const OFFER_HOURS: Record<Urgency, number> = { urgent: 2, routine: 24 }
export const MAX_OFFER_SLOTS = 3
// Half-day boundaries in London local minutes since midnight.
const HALVES: Record<Half, [number, number]> = { am: [8 * 60, 13 * 60], pm: [13 * 60, 18 * 60 + 30] }

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** London calendar day (YYYY-MM-DD) and minutes since midnight for a UTC instant. */
export function londonParts(at: Date): { day: string; minutes: number } {
  const p = Object.fromEntries(partsFmt.formatToParts(at).map((x) => [x.type, x.value]))
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) }
}

/** UTC instant for a London local day and time. Handles GMT/BST. */
export function londonToUtc(day: string, hour: number, minute: number): Date {
  const guess = new Date(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`)
  const local = londonParts(guess)
  const localAsUtc = Date.parse(`${local.day}T00:00:00Z`) + local.minutes * 60_000
  return new Date(guess.getTime() - (localAsUtc - guess.getTime()))
}

/** Which half-day a slot falls in, or null if outside both. */
export function halfOf(at: Date): DayHalf | null {
  const { day, minutes } = londonParts(at)
  for (const half of ['am', 'pm'] as const) {
    const [from, to] = HALVES[half]
    if (minutes >= from && minutes < to) return { day, half }
  }
  return null
}

/** The next `count` London days starting today. */
export function nextDays(now: Date, count: number): string[] {
  const today = londonParts(now).day
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(`${today}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

export function suggestUrgency(flags: { chestOrBreathing: boolean; rapidlyWorse: boolean }): Urgency {
  return flags.chestOrBreathing || flags.rapidlyWorse ? 'urgent' : 'routine'
}

/** Open slots that fit the patient's half-days, soonest first. Urgent requests only see the next 24h. */
export function matchSlots<S extends { starts_at: string }>(
  openSlots: S[], availability: DayHalf[], urgency: Urgency, now: Date,
): S[] {
  const wanted = new Set(availability.map((a) => `${a.day}:${a.half}`))
  const latest = now.getTime() + URGENT_WINDOW_HOURS * 3_600_000
  return openSlots
    .filter((s) => {
      const t = new Date(s.starts_at)
      if (t.getTime() <= now.getTime()) return false
      if (urgency === 'urgent' && t.getTime() > latest) return false
      const h = halfOf(t)
      return h !== null && wanted.has(`${h.day}:${h.half}`)
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}

export function offerExpiry(urgency: Urgency, now: Date): Date {
  return new Date(now.getTime() + OFFER_HOURS[urgency] * 3_600_000)
}

export function isExpired(expiresAt: string, now: Date): boolean {
  return new Date(expiresAt).getTime() <= now.getTime()
}

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso))
}

/** "Mon 9 Nov" for a YYYY-MM-DD day. */
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(`${day}T12:00:00Z`))
}

export type NewRequest = {
  name: string
  phone: string
  reason: string
  chestOrBreathing: boolean
  rapidlyWorse: boolean
  availability: DayHalf[]
}

/** Ticked "day:half" boxes, keeping only real half-days within `allowedDays`. */
export function parseAvailability(raw: string | string[] | undefined, allowedDays: string[]): DayHalf[] {
  const picked = Array.isArray(raw) ? raw : raw ? [raw] : []
  const out: DayHalf[] = []
  for (const p of picked) {
    const [day, half] = p.split(':')
    if (allowedDays.includes(day) && (half === 'am' || half === 'pm')) out.push({ day, half })
  }
  return out
}

/** Validate the patient form. `allowedDays` limits availability to the next 7 days. */
export function validateRequest(
  form: Record<string, string | string[]>, allowedDays: string[],
): { ok: true; value: NewRequest } | { ok: false; errors: string[] } {
  const str = (k: string) => (typeof form[k] === 'string' ? (form[k] as string).trim() : '')
  const errors: string[] = []
  const name = str('name')
  const phone = str('phone').replace(/[\s-]/g, '')
  const reason = str('reason')
  if (!name) errors.push('Please enter your name.')
  else if (name.length > 80) errors.push('Name must be 80 characters or fewer.')
  if (!/^(\+447|07)\d{9}$/.test(phone)) errors.push('Please enter a UK mobile number, like 07700 900123.')
  if (!reason) errors.push('Please say briefly what the appointment is about.')
  else if (reason.length > 500) errors.push('Please keep the reason to 500 characters or fewer.')

  const availability = parseAvailability(form.slot, allowedDays)
  if (availability.length === 0) errors.push('Please tick at least one morning or afternoon when you could come in.')

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    value: { name, phone, reason, chestOrBreathing: form.chest === 'on', rapidlyWorse: form.worse === 'on', availability },
  }
}
