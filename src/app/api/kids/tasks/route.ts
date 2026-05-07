import { auth } from "@/auth"
import { getAppDayRange } from "@/lib/app-date"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const member = await prisma.familyMember.findFirst({
    where: { userId: session.user.id, role: "KID" },
  })
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { start, end } = getAppDayRange()

  const tasks = await prisma.task.findMany({
    where: {
      familyId: member.familyId,
      status: "ACTIVE",
      assignees: { some: { id: member.id } },
    },
    include: {
      completions: {
        where: { date: { gte: start, lt: end }, memberId: member.id },
        select: { id: true, status: true, pointsEarned: true },
      },
    },
    orderBy: { sortOrder: "asc" },
  })

  return NextResponse.json({ tasks })
}
