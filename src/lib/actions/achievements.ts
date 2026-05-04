"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { assertSameFamily, requireFamilyMember } from "@/lib/authz"
import type { AchievementCategory } from "@prisma/client"

type AchievementConditionInput = {
  type: string
  count?: number
  days?: number
  points?: number
  category?: string
}

export async function createAchievement(formData: FormData) {
  const member = await requireFamilyMember("PARENT")

  const conditionType = formData.get("conditionType") as string
  const condition: AchievementConditionInput = { type: conditionType }

  if (conditionType === "TASK_COUNT") {
    condition.count = parseInt(formData.get("conditionCount") as string) || 0
  }
  if (conditionType === "STREAK") {
    condition.days = parseInt(formData.get("conditionDays") as string) || parseInt(formData.get("conditionCount") as string) || 0
  }
  if (conditionType === "CONSECUTIVE_DAYS") {
    condition.days = parseInt(formData.get("conditionDays") as string) || 0
  }
  if (conditionType === "TOTAL_POINTS") {
    condition.points = parseInt(formData.get("conditionPoints") as string) || 0
  }
  if (conditionType === "REDEMPTION_COUNT") {
    condition.count = parseInt(formData.get("conditionCount") as string) || 0
  }

  const category = formData.get("conditionCategory") as string
  if (category && category !== "ALL") condition.category = category

  await prisma.achievement.create({
    data: {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      icon: (formData.get("icon") as string) || "🏆",
      category: (formData.get("category") as AchievementCategory) || "SPECIAL",
      condition: JSON.stringify(condition),
      bonusPoints: parseInt(formData.get("bonusPoints") as string) || 0,
      sortOrder: parseInt(formData.get("sortOrder") as string) || 0,
      isHidden: formData.get("isHidden") === "true",
      isActive: true,
      familyId: member.familyId,
    },
  })

  revalidatePath("/admin/achievements")
}

export async function updateAchievement(formData: FormData) {
  const member = await requireFamilyMember("PARENT")

  const id = formData.get("id") as string
  if (!id) throw new Error("缺少成就ID")

  const existing = await prisma.achievement.findUnique({
    where: { id },
    select: { familyId: true, isGlobal: true },
  })
  if (!existing) throw new Error("成就不存在")
  if (existing.isGlobal || !existing.familyId) throw new Error("内置成就不可修改")
  assertSameFamily(existing.familyId, member)

  const conditionType = formData.get("conditionType") as string
  const condition: AchievementConditionInput = { type: conditionType }

  if (conditionType === "TASK_COUNT") {
    condition.count = parseInt(formData.get("conditionCount") as string) || 0
  }
  if (conditionType === "STREAK") {
    condition.days = parseInt(formData.get("conditionDays") as string) || parseInt(formData.get("conditionCount") as string) || 0
  }
  if (conditionType === "CONSECUTIVE_DAYS") {
    condition.days = parseInt(formData.get("conditionDays") as string) || 0
  }
  if (conditionType === "TOTAL_POINTS") {
    condition.points = parseInt(formData.get("conditionPoints") as string) || 0
  }
  if (conditionType === "REDEMPTION_COUNT") {
    condition.count = parseInt(formData.get("conditionCount") as string) || 0
  }

  const category = formData.get("conditionCategory") as string
  if (category && category !== "ALL") condition.category = category

  await prisma.achievement.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      icon: (formData.get("icon") as string) || "🏆",
      category: (formData.get("category") as AchievementCategory) || "SPECIAL",
      condition: JSON.stringify(condition),
      bonusPoints: parseInt(formData.get("bonusPoints") as string) || 0,
      sortOrder: parseInt(formData.get("sortOrder") as string) || 0,
      isHidden: formData.has("isHidden") ? formData.get("isHidden") === "true" : undefined,
    },
  })

  revalidatePath("/admin/achievements")
}

export async function deleteAchievement(id: string) {
  const member = await requireFamilyMember("PARENT")

  const existing = await prisma.achievement.findUnique({
    where: { id },
    select: { familyId: true, isGlobal: true },
  })
  if (!existing) throw new Error("成就不存在")
  if (existing.isGlobal || !existing.familyId) throw new Error("内置成就不可删除")
  assertSameFamily(existing.familyId, member)

  await prisma.achievement.delete({ where: { id } })
  revalidatePath("/admin/achievements")
}

export async function toggleAchievement(id: string, isActive: boolean) {
  const member = await requireFamilyMember("PARENT")

  const existing = await prisma.achievement.findUnique({
    where: { id },
    select: { familyId: true, isGlobal: true },
  })
  if (!existing) throw new Error("成就不存在")
  if (existing.isGlobal || !existing.familyId) throw new Error("内置成就不可修改")
  assertSameFamily(existing.familyId, member)

  await prisma.achievement.update({
    where: { id },
    data: { isActive },
  })

  revalidatePath("/admin/achievements")
}
