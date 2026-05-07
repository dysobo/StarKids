import { auth } from "@/auth"
import { addAppDays, isSameAppDay } from "@/lib/app-date"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const member = await prisma.familyMember.findFirst({
    where: { userId: session.user.id, role: "KID" },
    include: { family: { select: { name: true } } },
  })
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let streak = 0
  const completions = await prisma.taskCompletion.findMany({
    where: { memberId: member.id, status: "APPROVED" },
    select: { date: true },
    orderBy: { date: "desc" },
    distinct: ["date"],
  })

  if (completions.length > 0) {
    const today = new Date()
    const firstDate = new Date(completions[0].date)
    const startOffset = isSameAppDay(firstDate, today)
      ? 0
      : isSameAppDay(firstDate, addAppDays(today, -1))
        ? 1
        : null

    if (startOffset !== null) {
      for (let i = 0; i < completions.length; i++) {
        const expectedDate = addAppDays(today, -(startOffset + i))
        const compDate = new Date(completions[i].date)

        if (isSameAppDay(compDate, expectedDate)) {
          streak++
        } else {
          break
        }
      }
    }
  }

  return NextResponse.json({
    nickname: member.nickname,
    role: member.role,
    familyName: member.family.name,
    currentPoints: member.currentPoints,
    streak,
  })
}
