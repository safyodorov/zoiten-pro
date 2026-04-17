// Клиент WB Feedbacks + Questions API.
// Scope токена: bit 5 (Отзывы).
// В отличие от card.wb.ru v4 (см. lib/wb-api.ts), feedbacks-api не блокируется
// по TLS fingerprint — используем нативный fetch.

const FEEDBACKS_API = "https://feedbacks-api.wildberries.ru"
const RATE_LIMIT_FALLBACK_MS = 6000

function getToken(): string {
  const token = process.env.WB_API_TOKEN
  if (!token) throw new Error("WB_API_TOKEN не настроен")
  return token
}

// ── Типы ответов ──────────────────────────────────────────────

export interface PhotoLink {
  fullSize: string
  miniSize: string
}

export interface FeedbackVideo {
  previewImage: string
  link: string
  durationSec: number
}

export interface ProductDetails {
  imtId: number
  nmId: number
  productName: string
  supplierArticle: string
  brandName: string
  size?: string
}

export interface FeedbackAnswer {
  text: string
  state: string
  editable: boolean
  createDate?: string
}

export interface Feedback {
  id: string
  text: string
  pros?: string
  cons?: string
  productValuation: number // 1..5
  createdDate: string
  state: string // "wbRu" | "none"
  answer: FeedbackAnswer | null
  productDetails: ProductDetails
  photoLinks: PhotoLink[]
  video: FeedbackVideo | null
}

export interface Question {
  id: string
  text: string
  createdDate: string
  state: string
  answer: FeedbackAnswer | null
  productDetails: ProductDetails
}

export interface ListParams {
  isAnswered?: boolean
  take: number
  skip: number
  dateFrom?: number
  dateTo?: number
}

// ── Внутренний helper с 429 retry ─────────────────────────────

async function callWb(path: string, init: RequestInit, attempt = 0): Promise<Response> {
  const token = getToken()
  const res = await fetch(`${FEEDBACKS_API}${path}`, {
    ...init,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })

  if (res.status === 429 && attempt === 0) {
    const retry = Number(res.headers.get("X-Ratelimit-Retry")) || 0
    const waitMs = retry > 0 ? retry * 1000 : RATE_LIMIT_FALLBACK_MS
    await new Promise((r) => setTimeout(r, waitMs))
    return callWb(path, init, 1)
  }

  if (res.status === 401) throw new Error("Неверный токен WB API")
  if (res.status === 403) throw new Error("Нет доступа — проверьте scope токена (bit 5)")

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`WB API ${res.status}: ${body.slice(0, 200)}`)
  }

  return res
}

// ── Feedbacks ─────────────────────────────────────────────────

export async function listFeedbacks(p: ListParams): Promise<Feedback[]> {
  const qs = new URLSearchParams()
  if (p.isAnswered !== undefined) qs.set("isAnswered", String(p.isAnswered))
  qs.set("take", String(p.take))
  qs.set("skip", String(p.skip))
  if (p.dateFrom) qs.set("dateFrom", String(p.dateFrom))
  if (p.dateTo) qs.set("dateTo", String(p.dateTo))
  qs.set("order", "dateDesc")

  const res = await callWb(`/api/v1/feedbacks?${qs}`, { method: "GET" })
  const json = (await res.json()) as {
    data?: { feedbacks?: Feedback[] }
    feedbacks?: Feedback[]
  }
  return json.data?.feedbacks ?? json.feedbacks ?? []
}

export async function replyFeedback(id: string, text: string): Promise<{ ok: true }> {
  await callWb("/api/v1/feedbacks/answer", {
    method: "POST",
    body: JSON.stringify({ id, text }),
  })
  return { ok: true }
}

export async function editFeedbackAnswer(id: string, text: string): Promise<{ ok: true }> {
  await callWb("/api/v1/feedbacks/answer", {
    method: "PATCH",
    body: JSON.stringify({ id, text }),
  })
  return { ok: true }
}

// ── Questions ────────────────────────────────────────────────

export async function listQuestions(p: ListParams): Promise<Question[]> {
  const qs = new URLSearchParams()
  if (p.isAnswered !== undefined) qs.set("isAnswered", String(p.isAnswered))
  qs.set("take", String(p.take))
  qs.set("skip", String(p.skip))

  const res = await callWb(`/api/v1/questions?${qs}`, { method: "GET" })
  const json = (await res.json()) as {
    data?: { questions?: Question[] }
    questions?: Question[]
  }
  return json.data?.questions ?? json.questions ?? []
}

export async function replyQuestion(id: string, text: string): Promise<{ ok: true }> {
  await callWb("/api/v1/questions", {
    method: "PATCH",
    body: JSON.stringify({ id, answer: { text }, state: "wbRu" }),
  })
  return { ok: true }
}
