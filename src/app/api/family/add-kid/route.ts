import { NextResponse } from "next/server"
import { addKidToFamily } from "@/lib/actions/family"
import { getErrorMessage } from "@/lib/utils"

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const result = await addKidToFamily(formData)
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 400 })
  }
}
