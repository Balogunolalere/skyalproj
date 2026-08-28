/**
 * Business calendar (mirrors the admin backend `src/lib/business-calendar.ts`).
 *
 * Covers: config parsing (defensive), working-day checks with observed
 * holidays, and the snap-to-next-opening rule used for express tier previews.
 *
 * Run: npx vitest run tests/unit/business-calendar.test.ts
 */
import { describe, expect, test } from 'vitest'
import {
  DEFAULT_BUSINESS_CALENDAR,
  parseBusinessCalendar,
  parseHolidays,
  fmtClock,
  parseClockTime,
  isWorkingDayCal,
  snapToBusinessOpening,
  lagosMinutesOfDay,
} from '@/lib/business-calendar'

// Lagos = UTC+1. Mon 10 Aug 2026 08:00 Lagos = 07:00 UTC.
const MON_0800 = Date.UTC(2026, 7, 10, 7, 0)
// Mon 16:30 Lagos / Wed 12 Aug is a weekday.
const MON_1630 = Date.UTC(2026, 7, 10, 15, 30)
// Fri 14 Aug 2026, 18:30 Lagos = 17:30 UTC (after the 17:00 close).
const FRI_1830 = Date.UTC(2026, 7, 14, 17, 30)
// Sat 15 Aug 12:00 Lagos = 11:00 UTC.
const SAT_NOON = Date.UTC(2026, 7, 15, 11, 0)

describe('calendar config parsing', () => {
  test('defaults to 08:00–17:00 Mon–Fri with no holidays', () => {
    expect(DEFAULT_BUSINESS_CALENDAR.openMinute).toBe(480)
    expect(DEFAULT_BUSINESS_CALENDAR.closeMinute).toBe(1020)
    expect(DEFAULT_BUSINESS_CALENDAR.workingDays).toEqual([1, 2, 3, 4, 5])
    expect(DEFAULT_BUSINESS_CALENDAR.holidays.size).toBe(0)
  })

  test('parseBusinessCalendar reads the public settings keys', () => {
    const cal = parseBusinessCalendar({
      working_day_open: '10:00',
      working_day_close: '16:00',
      observed_holidays: JSON.stringify(['2026-08-11', { date: '2026-08-12', name: 'Demo Day' }]),
    })
    expect(cal.openMinute).toBe(600)
    expect(cal.closeMinute).toBe(960)
    expect(cal.holidays.has('2026-08-11')).toBe(true)
    expect(cal.holidays.has('2026-08-12')).toBe(true)
  })

  test('parseBusinessCalendar never throws — garbage falls back to defaults', () => {
    const cal = parseBusinessCalendar({
      working_day_open: '25:00',
      working_day_close: '17:00',
      observed_holidays: 'not json',
    } as Record<string, string>)
    expect(cal.openMinute).toBe(480)
    expect(cal.closeMinute).toBe(1020)
    expect(cal.holidays.size).toBe(0)
    expect(parseBusinessCalendar(null).openMinute).toBe(480)
    // open >= close → defaults (would otherwise reject every pickup)
    const bad = parseBusinessCalendar({ working_day_open: '17:00', working_day_close: '08:00' })
    expect(bad.openMinute).toBe(480)
    expect(bad.closeMinute).toBe(1020)
  })

  test('parseHolidays drops invalid dates and dedupes', () => {
    expect(parseHolidays('["2026-08-11","2026-02-30","2026-08-11"]')).toEqual(new Set(['2026-08-11']))
    expect(parseHolidays('[]').size).toBe(0)
  })

  test('fmtClock / parseClockTime round-trip', () => {
    expect(fmtClock(480)).toBe('08:00')
    expect(fmtClock(1020)).toBe('17:00')
    expect(parseClockTime('08:00', 480)).toBe(480)
    expect(parseClockTime('8:00', 480)).toBe(480)
    expect(parseClockTime('nope', 480)).toBe(480)
  })
})

describe('working-day checks', () => {
  test('weekends are never working days; holidays are not either', () => {
    expect(isWorkingDayCal(MON_0800)).toBe(true)
    expect(isWorkingDayCal(SAT_NOON)).toBe(false)
    const cal = {
      ...DEFAULT_BUSINESS_CALENDAR,
      holidays: new Set(['2026-08-10']), // Mon holiday
    }
    expect(isWorkingDayCal(MON_0800, cal)).toBe(false)
    expect(isWorkingDayCal(new Date(MON_0800 + 86400000).getTime(), cal)).toBe(true) // Tue
  })
})

describe('snapToBusinessOpening — the "pushed to next opening" rule', () => {
  test('during working hours → now', () => {
    expect(snapToBusinessOpening(MON_0800)).toBe(MON_0800)
    expect(snapToBusinessOpening(MON_1630)).toBe(MON_1630)
  })

  test('before opening on a working day → today at opening', () => {
    // Mon 07:00 Lagos = 06:00 UTC
    const early = Date.UTC(2026, 7, 10, 6, 0)
    expect(snapToBusinessOpening(early)).toBe(MON_0800)
  })

  test('at/after closing → next working day at opening', () => {
    // Mon 17:00 Lagos = 16:00 UTC — closing time is exclusive → Tue 08:00
    const closing = Date.UTC(2026, 7, 10, 16, 0)
    expect(snapToBusinessOpening(closing)).toBe(Date.UTC(2026, 7, 11, 7, 0))
    // Fri 18:30 Lagos → Mon 08:00
    expect(snapToBusinessOpening(FRI_1830)).toBe(Date.UTC(2026, 7, 17, 7, 0))
  })

  test('weekend → Monday 08:00; holiday Monday → Tuesday 08:00', () => {
    expect(snapToBusinessOpening(SAT_NOON)).toBe(Date.UTC(2026, 7, 17, 7, 0))
    const cal = { ...DEFAULT_BUSINESS_CALENDAR, holidays: new Set(['2026-08-17']) } // Mon holiday
    expect(snapToBusinessOpening(SAT_NOON, cal)).toBe(Date.UTC(2026, 7, 18, 7, 0)) // Tue
  })

  test('respects a customized opening time', () => {
    const cal = { ...DEFAULT_BUSINESS_CALENDAR, openMinute: 10 * 60, closeMinute: 16 * 60 }
    // Mon 09:00 Lagos = 08:00 UTC → today 10:00 Lagos
    expect(snapToBusinessOpening(Date.UTC(2026, 7, 10, 8, 0), cal)).toBe(Date.UTC(2026, 7, 10, 9, 0))
    // Mon 16:00 Lagos = 15:00 UTC → Tue 10:00 Lagos
    expect(snapToBusinessOpening(Date.UTC(2026, 7, 10, 15, 0), cal)).toBe(Date.UTC(2026, 7, 11, 9, 0))
  })
})

describe('lagosMinutesOfDay', () => {
  test('reads the Lagos wall-clock minute-of-day', () => {
    expect(lagosMinutesOfDay(MON_0800)).toBe(480)
    expect(lagosMinutesOfDay(MON_1630)).toBe(990)
    expect(lagosMinutesOfDay(SAT_NOON)).toBe(720)
  })
})
