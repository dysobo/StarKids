import { NextResponse } from "next/server"
import { registerUser } from "@/lib/actions/register"
import { getErrorMessage } from "@/lib/utils"

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    await registerUser(formData)
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 400 })
  }
}
