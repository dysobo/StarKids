"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { assertSameFamily, requireFamilyMember } from "@/lib/authz"
import type { PetSpecies } from "@prisma/client"

export async function createOutfit(formData: FormData) {
  const member = await requireFamilyMember("PARENT")

  const species = formData.get("species") as string

  await prisma.petOutfit.create({
    data: {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      image: (formData.get("image") as string) || "👗",
      species: (species && species !== "ALL" ? species : null) as PetSpecies | null,
      points: parseInt(formData.get("points") as string) || 0,
      isDefault: formData.get("isDefault") === "true",
      sortOrder: parseInt(formData.get("sortOrder") as string) || 0,
      familyId: member.familyId,
    },
  })

  revalidatePath("/admin/pets")
}

export async function updateOutfit(formData: FormData) {
  const member = await requireFamilyMember("PARENT")

  const id = formData.get("id") as string
  if (!id) throw new Error("缺少装扮ID")

  const existing = await prisma.petOutfit.findUnique({
    where: { id },
    select: { familyId: true },
  })
  if (!existing) throw new Error("装扮不存在")
  if (!existing.familyId) throw new Error("内置装扮不可修改")
  assertSameFamily(existing.familyId, member)

  const species = formData.get("species") as string

  await prisma.petOutfit.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      image: (formData.get("image") as string) || "👗",
      species: (species && species !== "ALL" ? species : null) as any,
      points: parseInt(formData.get("points") as string) || 0,
      isDefault: formData.get("isDefault") === "true",
      sortOrder: parseInt(formData.get("sortOrder") as string) || 0,
    } as any,
  })

  revalidatePath("/admin/pets")
}

export async function deleteOutfit(id: string) {
  const member = await requireFamilyMember("PARENT")

  const existing = await prisma.petOutfit.findUnique({
    where: { id },
    select: { familyId: true },
  })
  if (!existing) throw new Error("装扮不存在")
  if (!existing.familyId) throw new Error("内置装扮不可删除")
  assertSameFamily(existing.familyId, member)

  await prisma.petOutfit.delete({ where: { id } })
  revalidatePath("/admin/pets")
}

export async function unlockOutfit(formData: FormData) {
  const member = await requireFamilyMember("PARENT")

  const outfitId = formData.get("outfitId") as string
  const kidMemberId = formData.get("memberId") as string

  await prisma.$transaction(async (tx) => {
    const existing = await tx.petOutfitGrant.findUnique({
      where: { outfitId_memberId: { outfitId, memberId: kidMemberId } },
    })
    if (existing) throw new Error("该装扮已解锁")

    const outfit = await tx.petOutfit.findUnique({ where: { id: outfitId } })
    if (!outfit) throw new Error("装扮不存在")
    if (outfit.familyId && outfit.familyId !== member.familyId) {
      throw new Error("无权操作其他家庭的装扮")
    }

    const kid = await tx.familyMember.findUnique({
      where: { id: kidMemberId },
      select: { familyId: true, role: true, currentPoints: true },
    })
    if (!kid || kid.familyId !== member.familyId || kid.role !== "KID") {
      throw new Error("只能给本家庭的小朋友解锁装扮")
    }
    if (kid.currentPoints < outfit.points) {
      throw new Error("小朋友积分不足，无法解锁该装扮")
    }

    await tx.petOutfitGrant.create({
      data: {
        outfitId,
        memberId: kidMemberId,
        pointsSpent: outfit.points,
      },
    })

    if (outfit.points > 0) {
      await tx.familyMember.update({
        where: { id: kidMemberId },
        data: { currentPoints: { decrement: outfit.points } },
      })
    }
  })

  revalidatePath("/admin/pets")
}
