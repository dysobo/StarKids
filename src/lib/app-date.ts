export const APP_TIME_ZONE = process.env.APP_TIME_ZONE || "Asia/Shanghai"

type AppDateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function getFormatter(timeZone: string) {
  const cached = formatters.get(timeZone)
  if (cached) return cached

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
  formatters.set(timeZone, formatter)
  return formatter
}

export function getAppDateParts(date = new Date(), timeZone = APP_TIME_ZONE): AppDateParts {
  const values: Record<string, number> = {}

  for (const part of getFormatter(timeZone).formatToParts(date)) {
    if (part.type !== "literal") values[part.type] = Number(part.value)
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  }
}

function getTimeZoneOffsetMs(date: Date, timeZone = APP_TIME_ZONE) {
  const parts = getAppDateParts(date, timeZone)
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
  return asUtc - date.getTime()
}

export function startOfAppDate(
  year: number,
  month: number,
  day: number,
  timeZone = APP_TIME_ZONE
) {
  const targetUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0)
  let timestamp = targetUtc

  for (let i = 0; i < 3; i++) {
    const next = targetUtc - getTimeZoneOffsetMs(new Date(timestamp), timeZone)
    if (next === timestamp) break
    timestamp = next
  }

  return new Date(timestamp)
}

export function startOfAppDay(date = new Date(), timeZone = APP_TIME_ZONE) {
  const parts = getAppDateParts(date, timeZone)
  return startOfAppDate(parts.year, parts.month, parts.day, timeZone)
}

export function addAppDays(date: Date, days: number, timeZone = APP_TIME_ZONE) {
  const parts = getAppDateParts(date, timeZone)
  return startOfAppDate(parts.year, parts.month, parts.day + days, timeZone)
}

export function getAppDayRange(date = new Date(), timeZone = APP_TIME_ZONE) {
  const start = startOfAppDay(date, timeZone)
  return { start, end: addAppDays(start, 1, timeZone) }
}

export function isSameAppDay(a: Date, b: Date, timeZone = APP_TIME_ZONE) {
  const left = getAppDateParts(a, timeZone)
  const right = getAppDateParts(b, timeZone)
  return left.year === right.year && left.month === right.month && left.day === right.day
}

export function getAppDayOfWeek(date = new Date(), timeZone = APP_TIME_ZONE) {
  const parts = getAppDateParts(date, timeZone)
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
}
