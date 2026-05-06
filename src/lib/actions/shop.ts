"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { createNotification } from "./notifications"
import { assertSameFamily, requireFamilyMember, requireUserId } from "@/lib/authz"
import type { RewardCategory, RewardStatus } from "@prisma/client"

export async function createReward(formData: FormData) {
  const member = await requireFamilyMember("PARENT")

  await prisma.reward.create({
    data: {
      familyId: member.familyId,
      name: (formData.get("name") as string).trim(),
      description: (formData.get("description") as string) || null,
      category: (formData.get("category") as RewardCategory) || "TOY",
      points: parseInt(formData.get("points") as string) || 50,
      stock: parseInt(formData.get("stock") as string) || 0,
      remainingStock: parseInt(formData.get("stock") as string) || 0,
      maxPerPerson: parseInt(formData.get("maxPerPerson") as string) || 0,
      cooldownDays: parseInt(formData.get("cooldownDays") as string) || 0,
      isFeatured: formData.get("isFeatured") === "true",
      tags: JSON.stringify((formData.get("tags") as string)?.split(",").map((t) => t.trim()).filter(Boolean) || []),
    },
  })

  revalidatePath("/admin/shop")
  revalidatePath("/kids/shop")
}

export async function updateReward(formData: FormData) {
  const member = await requireFamilyMember("PARENT")

  const id = formData.get("id") as string
  if (!id) throw new Error("商品ID不能为空")

  const existing = await prisma.reward.findUnique({
    where: { id },
    select: {
      familyId: true,
      image: true,
      category: true,
      points: true,
      stock: true,
      remainingStock: true,
      maxPerPerson: true,
      cooldownDays: true,
      status: true,
    },
  })
  if (!existing) throw new Error("商品不存在")
  assertSameFamily(existing.familyId, member)

  const name = (formData.get("name") as string)?.trim()
  if (!name) throw new Error("商品名称不能为空")

  const points = parseInt(formData.get("points") as string, 10)
  const stock = parseInt(formData.get("stock") as string, 10)
  const maxPerPerson = parseInt(formData.get("maxPerPerson") as string, 10)
  const cooldownDays = parseInt(formData.get("cooldownDays") as string, 10)
  const nextStock = Number.isFinite(stock) && stock >= 0 ? stock : existing.stock
  const remainingStock =
    nextStock === 0 ? 0 : Math.max(0, existing.remainingStock + nextStock - existing.stock)

  await prisma.reward.update({
    where: { id },
    data: {
      name,
      description: (formData.get("description") as string) || null,
      category: (formData.get("category") as RewardCategory) || existing.category,
      image: (formData.get("image") as string) || existing.image,
      points: Number.isFinite(points) && points > 0 ? points : existing.points,
      stock: nextStock,
      remainingStock,
      maxPerPerson: Number.isFinite(maxPerPerson) && maxPerPerson >= 0 ? maxPerPerson : existing.maxPerPerson,
      cooldownDays: Number.isFinite(cooldownDays) && cooldownDays >= 0 ? cooldownDays : existing.cooldownDays,
      status: (formData.get("status") as RewardStatus) || existing.status,
      isFeatured: formData.has("isFeaturedInput") ? formData.get("isFeatured") === "true" : undefined,
    }
  })

  revalidatePath("/admin/shop")
  revalidatePath("/kids/shop")
}

export async function deleteReward(id: string) {
  const member = await requireFamilyMember("PARENT")

  const existing = await prisma.reward.findUnique({
    where: { id },
    select: { familyId: true },
  })
  if (!existing) throw new Error("商品不存在")
  assertSameFamily(existing.familyId, member)

  await prisma.reward.delete({ where: { id } })
  revalidatePath("/admin/shop")
}

export async function redeemReward(rewardId: string, message?: string) {
  const member = await requireFamilyMember("KID")

  const reward = await prisma.reward.findUnique({ where: { id: rewardId } })
  if (!reward) throw new Error("商品不存在")
  assertSameFamily(reward.familyId, member)
  if (reward.status !== "ACTIVE") throw new Error("商品已下架")

  if (reward.stock > 0 && reward.remainingStock <= 0) {
    throw new Error("库存不足")
  }

  if (member.currentPoints < reward.points) {
    throw new Error(`积分不足！需要 ${reward.points}⭐，当前 ${member.currentPoints}⭐`)
  }

  const redemption = await prisma.$transaction(async (tx) => {
    const created = await tx.rewardRedemption.create({
      data: {
        rewardId,
        memberId: member.id,
        pointsSpent: reward.points,
        status: "PENDING",
        kidMessage: message || null,
      },
    })

    if (reward.stock > 0) {
      await tx.reward.update({
        where: { id: rewardId },
        data: { remainingStock: { decrement: 1 } },
      })
    }

    await tx.familyMember.update({
      where: { id: member.id },
      data: { currentPoints: { decrement: reward.points } },
    })

    return created
  })

  const parents = await prisma.familyMember.findMany({
    where: { familyId: member.familyId, role: "PARENT" },
    select: { userId: true },
  })
  for (const p of parents) {
    await createNotification({
      userId: p.userId,
      memberId: member.id,
      type: "REDEMPTION_REQUEST",
      priority: "HIGH",
      title: `${member.nickname} 申请兑换`,
      content: `"${reward.name}" -${reward.points}⭐${message ? ` 留言: "${message}"` : ""}`,
      link: "/admin/shop",
      data: { redemptionId: redemption.id, rewardId },
    })
  }

  revalidatePath("/kids/shop")
  return redemption
}

export async function approveRedemption(redemptionId: string) {
  const userId = await requireUserId()
  const parent = await requireFamilyMember("PARENT")

  const existing = await prisma.rewardRedemption.findUnique({
    where: { id: redemptionId },
    select: { status: true, reward: { select: { familyId: true } } },
  })
  if (!existing) throw new Error("兑换记录不存在")
  if (existing.status !== "PENDING") throw new Error("该兑换申请已处理")
  assertSameFamily(existing.reward.familyId, parent)

  const r = await prisma.rewardRedemption.update({
    where: { id: redemptionId },
    data: {
      status: "APPROVED",
      approvedBy: userId,
      approvedAt: new Date(),
    },
    include: { member: { select: { userId: true, nickname: true } }, reward: { select: { name: true } } },
  })

  try {
    await createNotification({
      userId: r.member.userId,
      memberId: r.memberId,
      type: "REDEMPTION_APPROVED",
      priority: "HIGH",
      title: "兑换申请通过！🎉",
      content: `你申请的"${r.reward.name}"已通过，爸爸妈妈会尽快兑现！`,
      link: "/kids/shop",
    })
  } catch (e) {
    console.error("Notification creation failed:", e)
  }

  revalidatePath("/admin/shop")
  revalidatePath("/kids/shop")
}

export async function rejectRedemption(redemptionId: string, note?: string) {
  const userId = await requireUserId()
  const parent = await requireFamilyMember("PARENT")

  const redemption = await prisma.rewardRedemption.findUnique({
    where: { id: redemptionId },
    include: { reward: true },
  })

  if (!redemption) throw new Error("兑换记录不存在")
  if (redemption.status !== "PENDING") throw new Error("该兑换申请已处理")
  assertSameFamily(redemption.reward.familyId, parent)

  const r = await prisma.$transaction(async (tx) => {
    if (redemption.reward.stock > 0) {
      await tx.reward.update({
        where: { id: redemption.rewardId },
        data: { remainingStock: { increment: 1 } },
      })
    }

    const updated = await tx.rewardRedemption.update({
      where: { id: redemptionId },
      data: {
        status: "REJECTED",
        approvedBy: userId,
        approvedAt: new Date(),
        parentNote: note || null,
      },
      include: { member: { select: { userId: true } }, reward: { select: { name: true } } },
    })

    await tx.familyMember.update({
      where: { id: redemption.memberId },
      data: { currentPoints: { increment: redemption.pointsSpent } },
    })

    return updated
  })

  try {
    await createNotification({
      userId: r.member.userId,
      memberId: r.memberId,
      type: "REDEMPTION_REJECTED",
      priority: "NORMAL",
      title: "兑换申请未通过",
      content: `你申请的"${r.reward.name}"暂未通过，继续努力攒积分吧！`,
      link: "/kids/shop",
    })
  } catch (e) {
    console.error("Notification creation failed:", e)
  }

  revalidatePath("/admin/shop")
  revalidatePath("/kids/shop")
}
