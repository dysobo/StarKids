import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import type { FamilyMember, MemberRole } from "@prisma/client"

export async function requireUserId() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("请先登录")
  return session.user.id
}

export async function requireFamilyMember(role?: MemberRole): Promise<FamilyMember> {
  const userId = await requireUserId()

  const member = await prisma.familyMember.findFirst({
    where: { userId, ...(role ? { role } : {}) },
  })

  if (!member) {
    throw new Error(role === "PARENT" ? "只有家长可以执行此操作" : "你还未加入家庭")
  }

  return member
}

export function assertSameFamily(resourceFamilyId: string, member: FamilyMember) {
  if (resourceFamilyId !== member.familyId) {
    throw new Error("无权操作其他家庭的数据")
  }
}
