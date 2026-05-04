"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { assertSameFamily, requireFamilyMember } from "@/lib/authz"
import type { PetSpecies, PetStage } from "@prisma/client"
import { STAGE_CONFIG } from "@/lib/constants"

export async function createPet(formData: FormData) {
  const member = await requireFamilyMember("KID")

  const existing = await prisma.pet.findUnique({
    where: { memberId: member.id },
  })
  if (existing) throw new Error("你已经有一只宠物了！")

  const pet = await prisma.pet.create({
    data: {
      memberId: member.id,
      species: ((formData.get("species") as string) || "CAT") as PetSpecies,
      name: ((formData.get("name") as string) || "小宝贝").trim(),
    },
  })

  revalidatePath("/kids/pet")
  return pet
}

export async function feedPet() {
  const member = await requireFamilyMember("KID")

  const pet = await prisma.pet.findUnique({
    where: { memberId: member.id },
  })
  if (!pet) throw new Error("你还没有宠物！")

  const today = new Date().toDateString()
  const lastFeed = pet.lastFeedDate?.toDateString()

  if (lastFeed === today) {
    throw new Error("今天已经互动过了，明天再来吧！")
  }

  const totalEarned = await prisma.taskCompletion.aggregate({
    where: { memberId: member.id, status: "APPROVED" },
    _sum: { pointsEarned: true },
  })

  const newLevel = totalEarned._sum.pointsEarned || 0
  let newStage = pet.stage

  for (const [stage, config] of Object.entries(STAGE_CONFIG)) {
    if (newLevel >= config.threshold) {
      newStage = stage as PetStage
    }
  }

  await prisma.pet.update({
    where: { id: pet.id },
    data: {
      level: newLevel,
      stage: newStage,
      mood: Math.min(100, pet.mood + 20),
      lastFeedDate: new Date(),
      lastMoodUpdate: new Date(),
    },
  })

  revalidatePath("/kids/pet")
}

export async function dressPet(outfitId: string) {
  const member = await requireFamilyMember("KID")

  const pet = await prisma.pet.findUnique({
    where: { memberId: member.id },
  })
  if (!pet) throw new Error("你还没有宠物！")

  const outfit = await prisma.petOutfit.findUnique({
    where: { id: outfitId },
  })
  if (!outfit) throw new Error("装扮不存在")
  if (outfit.familyId) assertSameFamily(outfit.familyId, member)
  if (outfit.species && outfit.species !== pet.species) throw new Error("这个装扮不适用于当前宠物")

  const grant = await prisma.petOutfitGrant.findFirst({
    where: { outfitId, memberId: member.id },
  })
  if (!grant && !outfit.isDefault) throw new Error("你还未解锁这个装扮！")

  await prisma.pet.update({
    where: { id: pet.id },
    data: { currentOutfit: outfitId },
  })

  revalidatePath("/kids/pet")
}

export async function getPetDetails(memberId: string) {
  const member = await requireFamilyMember()
  if (member.role === "KID" && member.id !== memberId) {
    throw new Error("只能查看自己的宠物")
  }

  if (member.role === "PARENT") {
    const target = await prisma.familyMember.findUnique({
      where: { id: memberId },
      select: { familyId: true },
    })
    if (!target) throw new Error("家庭成员不存在")
    assertSameFamily(target.familyId, member)
  }

  const [pet, outfits, grants] = await Promise.all([
    prisma.pet.findUnique({ where: { memberId } }),
    prisma.petOutfit.findMany({
      where: {
        OR: [
          { familyId: member.familyId },
          { familyId: null },
        ],
      },
    }),
    prisma.petOutfitGrant.findMany({
      where: { memberId },
      select: { outfitId: true },
    }),
  ])

  return { pet, outfits, unlockedIds: new Set(grants.map((g) => g.outfitId)) }
}
