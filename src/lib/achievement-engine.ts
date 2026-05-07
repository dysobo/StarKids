import { prisma } from "@/lib/db"
import { SPECIES_EMOJI, STAGE_CONFIG } from "@/lib/constants"
import { addAppDays, isSameAppDay } from "@/lib/app-date"
import type { Prisma, TaskCategory, TaskType } from "@prisma/client"

type AchievementCondition = {
  type: string
  count?: number
  days?: number
  category?: TaskCategory
  type_filter?: TaskType
  points?: number
  completionRate?: number
  zeroRejection?: boolean
  tags?: string[]
}

export async function checkAchievements(memberId: string, completionId?: string) {
  const [member, allAchievements, grantedAchievements] = await Promise.all([
    prisma.familyMember.findUnique({
      where: { id: memberId },
      select: { familyId: true },
    }),
    prisma.achievement.findMany({
      where: {
        isActive: true,
      },
    }),
    prisma.achievementGrant.findMany({
      where: { memberId },
      select: { achievementId: true },
    }),
  ])

  if (!member) return []

  const grantedIds = new Set(grantedAchievements.map((g) => g.achievementId))
  const memberAchievements = allAchievements.filter(
    (a) => a.isGlobal || a.familyId === member.familyId
  )
  const newlyUnlocked: typeof allAchievements = []

  for (const achievement of memberAchievements) {
    if (grantedIds.has(achievement.id)) continue

    const condition = JSON.parse(achievement.condition) as AchievementCondition
    const isMet = await checkCondition(condition, memberId)

    if (isMet) {
      await prisma.achievementGrant.create({
        data: {
          achievementId: achievement.id,
          memberId,
          triggeredBy: completionId || null,
          context: JSON.stringify({ unlockedAt: new Date().toISOString() }),
        },
      })

      if (achievement.bonusPoints > 0 && completionId) {
        const completion = await prisma.taskCompletion.findUnique({
          where: { id: completionId },
        })
        if (completion) {
          await prisma.taskCompletion.update({
            where: { id: completionId },
            data: {
                pointsEarned: completion.pointsEarned + achievement.bonusPoints,
            },
          })
          await prisma.familyMember.update({
            where: { id: memberId },
            data: { currentPoints: { increment: achievement.bonusPoints } },
          })
        }
      }

      newlyUnlocked.push(achievement)
    }
  }

  return newlyUnlocked
}

async function checkCondition(
  condition: AchievementCondition,
  memberId: string
): Promise<boolean> {
  switch (condition.type) {
    case "TASK_COUNT": {
      const where: Prisma.TaskCompletionWhereInput = { memberId, status: "APPROVED" }
      const taskWhere: Prisma.TaskWhereInput = {}
      if (condition.category) taskWhere.category = condition.category
      if (condition.type_filter) taskWhere.type = condition.type_filter
      if (Object.keys(taskWhere).length > 0) where.task = taskWhere
      const count = await prisma.taskCompletion.count({ where })
      return count >= (condition.count || 0)
    }

    case "CONSECUTIVE_DAYS": {
      const days = await getConsecutiveDays(memberId)
      return days >= (condition.days || 0)
    }

    case "STREAK": {
      const where: Prisma.TaskCompletionWhereInput = { memberId, status: "APPROVED" }
      if (condition.category) where.task = { category: condition.category }
      const days = await getConsecutiveDays(memberId, where)
      return days >= (condition.days || condition.count || 0)
    }

    case "REDEMPTION_COUNT": {
      const count = await prisma.rewardRedemption.count({
        where: { memberId, status: "APPROVED" },
      })
      return count >= (condition.count || 0)
    }

    case "TOTAL_POINTS": {
      const result = await prisma.taskCompletion.aggregate({
        where: { memberId, status: "APPROVED" },
        _sum: { pointsEarned: true },
      })
      return (result._sum.pointsEarned || 0) >= (condition.points || 0)
    }

    case "SPECIAL_DATE": {
      const days = condition.days || 7
      const rate = condition.completionRate || 100
      const startDate = addAppDays(new Date(), -days)

      const completions = await prisma.taskCompletion.findMany({
        where: {
          memberId,
          status: "APPROVED",
          date: { gte: startDate },
        },
        distinct: ["date"],
      })

      const totalDays = days
      const daysWithCompletions = completions.length
      const actualRate = Math.round((daysWithCompletions / totalDays) * 100)

      if (condition.zeroRejection) {
        const rejections = await prisma.taskCompletion.count({
          where: {
            memberId,
            status: "REJECTED",
            date: { gte: startDate },
          },
        })
        if (rejections > 0) return false
      }

      return actualRate >= rate
    }

    default:
      return false
  }
}

async function getConsecutiveDays(
  memberId: string,
  baseWhere?: Prisma.TaskCompletionWhereInput
): Promise<number> {
  const completions = await prisma.taskCompletion.findMany({
    where: { memberId, status: "APPROVED", ...(baseWhere || {}) },
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
    const compDate = new Date(completions[i].date)
    const expectedDate = addAppDays(today, -(startOffset + i))

    if (isSameAppDay(compDate, expectedDate)) {
      streak++
    } else {
      break
    }
  }

  return streak
}

export { STAGE_CONFIG, SPECIES_EMOJI }
