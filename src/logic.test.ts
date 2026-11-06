import { describe, expect, it } from 'vitest'
import {
  halfOf, isExpired, londonToUtc, matchSlots, nextDays, offerExpiry, suggestUrgency, validateRequest,
} from './logic'

// Fri 6 Nov 2026, 10:00 London (GMT, so also 10:00 UTC).
const now = new Date('2026-11-06T10:00:00Z')
const slot = (id: number, iso: string) => ({ id, starts_at: iso })

describe('time helpers', () => {
  it('converts London time to UTC in winter and summer', () => {
    expect(londonToUtc('2026-11-09', 9, 0).toISOString()).toBe('2026-11-09T09:00:00.000Z')
    expect(londonToUtc('2026-07-01', 9, 0).toISOString()).toBe('2026-07-01T08:00:00.000Z')
  })
  it('classifies half-days by London time', () => {
    expect(halfOf(new Date('2026-11-09T08:00:00Z'))).toEqual({ day: '2026-11-09', half: 'am' })
    expect(halfOf(new Date('2026-11-09T13:00:00Z'))).toEqual({ day: '2026-11-09', half: 'pm' })
    expect(halfOf(new Date('2026-11-09T18:30:00Z'))).toBeNull()
    expect(halfOf(new Date('2026-07-01T07:30:00Z'))).toEqual({ day: '2026-07-01', half: 'am' }) // 08:30 BST
  })
  it('lists the next days from today', () => {
    expect(nextDays(now, 3)).toEqual(['2026-11-06', '2026-11-07', '2026-11-08'])
  })
})

describe('suggestUrgency', () => {
  it('is urgent if any red flag is ticked', () => {
    expect(suggestUrgency({ chestOrBreathing: false, rapidlyWorse: false })).toBe('routine')
    expect(suggestUrgency({ chestOrBreathing: true, rapidlyWorse: false })).toBe('urgent')
    expect(suggestUrgency({ chestOrBreathing: false, rapidlyWorse: true })).toBe('urgent')
  })
})

describe('matchSlots', () => {
  const slots = [
    slot(1, '2026-11-09T14:00:00Z'), // Mon pm
    slot(2, '2026-11-06T09:00:00Z'), // today, already past
    slot(3, '2026-11-06T15:00:00Z'), // today pm
    slot(4, '2026-11-09T09:00:00Z'), // Mon am
    slot(5, '2026-11-07T09:00:00Z'), // tomorrow am
  ]
  const avail = [
    { day: '2026-11-06', half: 'pm' as const },
    { day: '2026-11-07', half: 'am' as const },
    { day: '2026-11-09', half: 'pm' as const },
  ]
  it('keeps future slots inside chosen half-days, soonest first', () => {
    expect(matchSlots(slots, avail, 'routine', now).map((s) => s.id)).toEqual([3, 5, 1])
  })
  it('limits urgent requests to the next 24 hours', () => {
    expect(matchSlots(slots, avail, 'urgent', now).map((s) => s.id)).toEqual([3, 5])
  })
  it('returns nothing when no availability matches', () => {
    expect(matchSlots(slots, [{ day: '2026-11-10', half: 'am' }], 'routine', now)).toEqual([])
  })
})

describe('offers', () => {
  it('expires urgent offers after 2h and routine after 24h', () => {
    expect(offerExpiry('urgent', now).toISOString()).toBe('2026-11-06T12:00:00.000Z')
    expect(offerExpiry('routine', now).toISOString()).toBe('2026-11-07T10:00:00.000Z')
  })
  it('treats the expiry instant as expired', () => {
    expect(isExpired('2026-11-06T10:00:00.000Z', now)).toBe(true)
    expect(isExpired('2026-11-06T10:00:01.000Z', now)).toBe(false)
  })
})

describe('validateRequest', () => {
  const days = ['2026-11-06', '2026-11-07']
  const good = { name: 'Sam Patel', phone: '07700 900123', reason: 'Sore knee', slot: ['2026-11-06:pm'] }
  it('accepts a valid form', () => {
    const r = validateRequest(good, days)
    expect(r.ok && r.value.phone).toBe('07700900123')
  })
  it('accepts a single availability box (string, not array)', () => {
    expect(validateRequest({ ...good, slot: '2026-11-07:am' }, days).ok).toBe(true)
  })
  it('rejects blanks, bad phone and no availability', () => {
    const r = validateRequest({ name: ' ', phone: '123', reason: '' }, days)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toHaveLength(4)
  })
  it('ignores availability outside the allowed days', () => {
    expect(validateRequest({ ...good, slot: ['2026-12-25:am'] }, days).ok).toBe(false)
  })
  it('rejects an over-long reason', () => {
    expect(validateRequest({ ...good, reason: 'x'.repeat(501) }, days).ok).toBe(false)
  })
})
