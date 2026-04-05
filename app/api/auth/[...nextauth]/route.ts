// app/api/auth/[...nextauth]/route.ts
// Auth.js route handler — all auth logic lives in lib/auth.ts, not here
import { handlers } from "@/lib/auth"

export const { GET, POST } = handlers
