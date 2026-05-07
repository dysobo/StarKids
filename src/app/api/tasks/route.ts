import { auth } from "@/auth"
import { getAppDayRange } from "@/lib/app-date"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const member = await prisma.familyMember.findFirst({
    where: { userId: session.user.id, role: "PARENT" },
  })
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { start, end } = getAppDayRange()

  const tasks = await prisma.task.findMany({
    where: { familyId: member.familyId, status: "ACTIVE" },
    include: {
      assignees: { select: { id: true, nickname: true } },
      completions: {
        where: {
          date: { gte: start, lt: end },
        },
        include: { member: { select: { nickname: true } } },
      },
    },
    orderBy: { sortOrder: "asc" },
  })

  const pending = await prisma.taskCompletion.findMany({
    where: {
      status: "PENDING",
      task: { familyId: member.familyId },
    },
    include: {
      task: { select: { name: true, icon: true, points: true } },
      member: { select: { nickname: true } },
    },
    orderBy: { date: "desc" },
  })

  return NextResponse.json({ tasks, pending })
}
