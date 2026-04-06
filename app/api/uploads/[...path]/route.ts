// app/api/uploads/[...path]/route.ts
// GET /api/uploads/[...path] — dev-only file serving from /tmp/zoiten-uploads
// In production, nginx serves /uploads/* directly; this route returns 404 in prod.
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  // Production: nginx serves uploads directly — this route is unused
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 })
  }

  const { path } = await params
  const filePath = path.join("/")
  const uploadDir =
    process.env.UPLOAD_DIR ?? "/tmp/zoiten-uploads"

  try {
    const buffer = await readFile(join(uploadDir, filePath))
    const ext = filePath.split(".").pop()?.toLowerCase() ?? ""
    const contentType = MIME_MAP[ext] ?? "application/octet-stream"
    return new NextResponse(buffer, {
      headers: { "Content-Type": contentType },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
