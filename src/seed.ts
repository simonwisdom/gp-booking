// Demo data, created relative to "now" so the demo always has upcoming slots.

import { createRequest, getRequestByToken, openFutureSlots, sendOffer, setUrgency } from './db'
import { type DayHalf, londonToUtc, matchSlots, nextDays } from './logic'

const CLINICIANS = [
  { id: 1, name: 'Dr Amara Okafor', role: 'GP' },
  { id: 2, name: 'Dr Tom Reid', role: 'GP' },
  { id: 3, name: 'Nurse Priya Shah', role: 'Nurse' },
]
const TIMES: [number, number][] = [[8, 30], [9, 30], [10, 40], [11, 50], [13, 30], [14, 40], [15, 50], [17, 0]]
const DAYS_AHEAD = 7

export async function resetDemo(db: D1Database, now: Date, baseUrl: string) {
  await db.batch(['messages', 'offer_slots', 'offers', 'availability', 'slots', 'requests', 'clinicians']
    .map((t) => db.prepare(`DELETE FROM ${t}`)))

  const days = nextDays(now, DAYS_AHEAD)
  const slotStmts: D1PreparedStatement[] = []
  let n = 0
  for (const day of days) {
    for (const c of CLINICIANS) {
      for (const [h, m] of TIMES) {
        n++
        // About a third of slots are already booked by other patients.
        const status = n % 3 === 0 ? 'booked' : 'open'
        slotStmts.push(db.prepare('INSERT INTO slots (clinician_id, starts_at, duration_min, status) VALUES (?, ?, ?, ?)')
          .bind(c.id, londonToUtc(day, h, m).toISOString(), c.role === 'GP' ? 10 : 15, status))
      }
    }
  }
  await db.batch([
    ...CLINICIANS.map((c) => db.prepare('INSERT INTO clinicians (id, name, role) VALUES (?, ?, ?)').bind(c.id, c.name, c.role)),
    ...slotStmts,
  ])

  const both = (d: string): DayHalf[] => [{ day: d, half: 'am' }, { day: d, half: 'pm' }]
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000)

  await createRequest(db, {
    name: 'Jo Lee', phone: '07700900111', reason: 'Knee pain after running, about three weeks now.',
    chestOrBreathing: false, rapidlyWorse: false,
    availability: [{ day: days[1], half: 'pm' }, { day: days[3], half: 'am' }],
  }, minutesAgo(95), baseUrl)

  await createRequest(db, {
    name: 'Mark Evans', phone: '07700900222', reason: 'Tight chest and short of breath when climbing stairs since yesterday.',
    chestOrBreathing: true, rapidlyWorse: false,
    availability: [...both(days[0]), ...both(days[1])],
  }, minutesAgo(20), baseUrl)

  // One request already offered, so the patient side has something to pick from.
  const token = await createRequest(db, {
    name: 'Ana Silva', phone: '07700900333', reason: 'Repeat blood test for thyroid medication.',
    chestOrBreathing: false, rapidlyWorse: false,
    availability: days.slice(1, 4).map((d) => ({ day: d, half: 'am' as const })),
  }, minutesAgo(180), baseUrl)
  const ana = await getRequestByToken(db, token)
  if (ana && (await setUrgency(db, ana.id, 'routine'))) {
    const slots = matchSlots(await openFutureSlots(db, now), days.slice(1, 4).map((d) => ({ day: d, half: 'am' as const })), 'routine', now)
    await sendOffer(db, { ...ana, urgency: 'routine' }, slots.slice(0, 3), minutesAgo(30), baseUrl)
  }
}
