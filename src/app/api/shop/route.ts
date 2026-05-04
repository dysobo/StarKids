import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { getErrorMessage } from "@/lib/utils"
import type { RewardCategory } from "@prisma/client"

function toNonNegativeInt(value: unknown, fallback = 0) {
  const parsed = parseInt(String(value ?? ""), 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const member = await prisma.familyMember.findFirst({
      where: { userId: session.user.id, role: "PARENT" },
    })
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const [rewards, pendingRedemptions] = await Promise.all([
      prisma.reward.findMany({
        where: { familyId: member.familyId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.rewardRedemption.findMany({
        where: {
          reward: { familyId: member.familyId },
          status: "PENDING",
        },
        include: {
          reward: { select: { name: true, points: true } },
          member: { select: { nickname: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ])

    return NextResponse.json({ rewards, pendingRedemptions })
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const member = await prisma.familyMember.findFirst({
      where: { userId: session.user.id },
    })
    if (!member || member.role !== "PARENT") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const name = String(body.name || "").trim()
    if (!name) {
      return NextResponse.json({ error: "商品名称不能为空" }, { status: 400 })
    }

    const stock = toNonNegativeInt(body.stock)
    const reward = await prisma.reward.create({
      data: {
        familyId: member.familyId,
        name,
        description: body.description || null,
        points: Math.max(1, toNonNegativeInt(body.points, 50)),
        category: (body.category || "OTHER") as RewardCategory,
        isFeatured: body.isFeatured || false,
        stock,
        remainingStock: stock,
        maxPerPerson: toNonNegativeInt(body.maxPerPerson),
        cooldownDays: toNonNegativeInt(body.cooldownDays),
        status: "ACTIVE",
      },
    })

    return NextResponse.json({ reward }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 500 })
  }
}
