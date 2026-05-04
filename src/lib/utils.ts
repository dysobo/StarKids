import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getErrorMessage(error: unknown, fallback = "操作失败") {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return fallback
}
