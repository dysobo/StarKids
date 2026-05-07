import { prisma } from "@/lib/db"
import { addAppDays, getAppDateParts, getAppDayOfWeek, getAppDayRange, isSameAppDay } from "@/lib/app-date"

type PointRuleParams = {
  days?: number
  bonus?: number
  multiplier?: number
  cap?: number
}

type BonusResult = {
  basePoints: number
  bonusPoints: number
  totalPoints: number
  breakdown: string[]
}

export async function calculatePoints(
  taskPoints: number,
  memberId: string,
  familyId: string,
): Promise<BonusResult> {
  const breakdown: string[] = [`基础积分: +${taskPoints}⭐`]
  let bonusPoints = 0
  let capApplied = false

  const [rules, member, config] = await Promise.all([
    prisma.pointRule.findMany({
      where: { familyId, isActive: true },
    }),
    prisma.familyMember.findUnique({
      where: { id: memberId },
      select: { birthdate: true },
    }),
    prisma.pointConfig.findFirst({
      where: { familyId },
    }),
  ])

  for (const rule of rules) {
    const params = JSON.parse(rule.params) as PointRuleParams

    switch (rule.ruleType) {
      case "STREAK_BONUS": {
        const streakDays = await getStreakDays(memberId)
        if (params.days && streakDays >= params.days) {
          const bonus = params.bonus || 0
          bonusPoints += bonus
          breakdown.push(`${rule.name}: +${bonus}⭐`)
        }
        break
      }

      case "WEEKEND_DOUBLE": {
        if (isWeekend() && config?.weekendDouble) {
          const bonus = taskPoints * ((params.multiplier || 2) - 1)
          bonusPoints += bonus
          breakdown.push(`${rule.name}: +${bonus}⭐`)
        }
        break
      }

      case "BIRTHDAY_TRIPLE": {
        if (member?.birthdate && isBirthday(member.birthdate) && config?.birthdayTriple) {
          const bonus = taskPoints * ((params.multiplier || 3) - 1)
          bonusPoints += bonus
          breakdown.push(`🎂 ${rule.name}: +${bonus}⭐`)
        }
        break
      }

      case "DAILY_CAP": {
        const todayPoints = await getTodayPoints(memberId)
        const maxPoints = params.cap || 0
        if (maxPoints > 0 && todayPoints + taskPoints + bonusPoints > maxPoints) {
          const maxBonus = Math.max(0, maxPoints - todayPoints - taskPoints)
          bonusPoints = Math.min(bonusPoints, maxBonus)
          capApplied = true
        }
        break
      }
    }
  }

  const configuredCap = config?.dailyCap || 0
  if (configuredCap > 0) {
    const todayPoints = await getTodayPoints(memberId)
    const remaining = Math.max(0, configuredCap - todayPoints)
    const awardedBase = Math.min(taskPoints, remaining)
    const awardedBonus = Math.min(bonusPoints, Math.max(0, remaining - awardedBase))

    if (awardedBase + awardedBonus < taskPoints + bonusPoints) {
      capApplied = true
    }

    if (capApplied) {
      breakdown.push("已按每日积分上限截断")
    }

    return {
      basePoints: awardedBase,
      bonusPoints: awardedBonus,
      totalPoints: awardedBase + awardedBonus,
      breakdown,
    }
  }

  if (capApplied) {
    breakdown.push("已按每日积分上限截断")
  }

  return {
    basePoints: taskPoints,
    bonusPoints,
    totalPoints: taskPoints + bonusPoints,
    breakdown,
  }
}

async function getStreakDays(memberId: string): Promise<number> {
  const completions = await prisma.taskCompletion.findMany({
    where: {
      memberId,
      status: "APPROVED",
    },
    select: { date: true },
    orderBy: { date: "desc" },
    distinct: ["date"],
  })

  if (completions.length === 0) return 0

  let streak = 0
  const today = new Date()
  const firstDate = new Date(completions[0].date)
  const startOffset = isSameAppDay(firstDate, today)
    ? 0
    : isSameAppDay(firstDate, addAppDays(today, -1))
      ? 1
      : null

  if (startOffset === null) return 0

  for (let i = 0; i < completions.length; i++) {
    const expectedDate = addAppDays(today, -(startOffset + i))
    const compDate = new Date(completions[i].date)

    if (isSameAppDay(compDate, expectedDate)) {
      streak++
    } else {
      break
    }
  }

  return streak
}

async function getTodayPoints(memberId: string): Promise<number> {
  const { start, end } = getAppDayRange()

  const completions = await prisma.taskCompletion.aggregate({
    where: {
      memberId,
      status: "APPROVED",
      date: { gte: start, lt: end },
    },
    _sum: { pointsEarned: true },
  })

  return completions._sum.pointsEarned || 0
}

function isWeekend(): boolean {
  const day = getAppDayOfWeek()
  return day === 0 || day === 6
}

function isBirthday(birthday: Date | null): boolean {
  if (!birthday) return false
  const today = getAppDateParts()
  const birthdayParts = getAppDateParts(birthday)
  return (
    today.month === birthdayParts.month &&
    today.day === birthdayParts.day
  )
}
