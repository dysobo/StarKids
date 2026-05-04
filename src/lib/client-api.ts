"use client"

const SUB_PATH = "/kid"

export function apiPath(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`

  if (typeof window !== "undefined" && window.location.pathname.startsWith(`${SUB_PATH}/`)) {
    return `${SUB_PATH}${normalizedPath}`
  }

  return normalizedPath
}
