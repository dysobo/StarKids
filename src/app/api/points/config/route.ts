import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"

async function getOrCreateParentMember(userId: string, userRole?: string) {
  const member = await prisma.familyMember.findFirst({
    where: { userId, role: "PARENT" },
  })
  if (member) return member

  if (userRole !== "PARENT") return null

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  })
  if (!user) return null

  return prisma.$transaction(async (tx) => {
    const existing = await tx.familyMember.findFirst({
      where: { userId, role: "PARENT" },
    })
    if (existing) return existing

    const family = await tx.family.create({
      data: {
        name: `${user.name || user.email || "我的"}的家庭`,
      },
    })

    return tx.familyMember.create({
      data: {
        familyId: family.id,
        userId,
        role: "PARENT",
        nickname: user.name || user.email,
      },
    })
  })
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const member = await getOrCreateParentMember(session.user.id, session.user.role)
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let config = await prisma.pointConfig.findFirst({
    where: { familyId: member.familyId },
  })

  if (!config) {
    config = await prisma.pointConfig.create({
      data: {
        familyId: member.familyId,
        weekendDouble: true,
        birthdayTriple: true,
        dailyCap: 0,
        resetType: "NONE",
      },
    })
  }

  return NextResponse.json(config)
  } catch (e) {
    console.error("GET /api/points/config error:", e)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const member = await getOrCreateParentMember(session.user.id, session.user.role)
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const formData = await request.formData()

  const config = await prisma.pointConfig.upsert({
    where: { familyId: member.familyId },
    create: {
      familyId: member.familyId,
      weekendDouble: formData.get("weekendDouble") === "true",
      birthdayTriple: formData.get("birthdayTriple") === "true",
      dailyCap: parseInt(formData.get("dailyCap") as string) || 0,
      resetType: (formData.get("resetType") as string) || "NONE",
    },
    update: {
      weekendDouble: formData.get("weekendDouble") === "true",
      birthdayTriple: formData.get("birthdayTriple") === "true",
      dailyCap: parseInt(formData.get("dailyCap") as string) || 0,
      resetType: (formData.get("resetType") as string) || "NONE",
    },
  })

  return NextResponse.json(config)
  } catch (e) {
    console.error("POST /api/points/config error:", e)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
