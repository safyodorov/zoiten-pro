// Клиент WB Feedbacks + Questions + Returns + Buyer Chat API.
// Phase 8: Feedbacks + Questions (scope bit 5 "Отзывы", WB_API_TOKEN).
// Phase 9: Returns/Claims (scope bit 11 "Buyers Returns", WB_RETURNS_TOKEN).
// Phase 10: Buyer Chat (scope bit 9 "Чат с покупателями", WB_CHAT_TOKEN).
// В отличие от card.wb.ru v4 (см. lib/wb-api.ts), эти API не блокируются
// по TLS fingerprint — используем нативный fetch.

const FEEDBACKS_API = "https://feedbacks-api.wildberries.ru"
const RETURNS_API = "https://returns-api.wildberries.ru" // Phase 9
const CHAT_API = "https://buyer-chat-api.wildberries.ru" // Phase 10
const RATE_LIMIT_FALLBACK_MS = 6000

// Токен Phase 8 (Feedbacks/Questions) — scope bit 5
function getToken(): string {
  const token = process.env.WB_API_TOKEN
  if (!token) throw new Error("WB_API_TOKEN не настроен")
  return token
}

// Токен Phase 9 (Returns/Claims) — scope bit 11 "Buyers Returns".
// Fallback на WB_API_TOKEN для dev/test окружений.
function getReturnsToken(): string {
  const token = process.env.WB_RETURNS_TOKEN ?? process.env.WB_API_TOKEN
  if (!token) throw new Error("WB_RETURNS_TOKEN или WB_API_TOKEN не настроен")
  return token
}

// Токен Phase 10 (Buyers Chat) — scope bit 9 "Чат с покупателями".
// Fallback на WB_API_TOKEN для dev/test окружений (паттерн Phase 9 getReturnsToken).
function getChatToken(): string {
  const token = process.env.WB_CHAT_TOKEN ?? process.env.WB_API_TOKEN
  if (!token) throw new Error("WB_CHAT_TOKEN или WB_API_TOKEN не настроен")
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

// ── Внутренний helper с 429 retry (параметризованный) ─────────

async function callApi(
  baseUrl: string,
  token: string,
  path: string,
  init: RequestInit,
  attempt = 0
): Promise<Response> {
  // Phase 10: для multipart/form-data (FormData body) fetch сам выставляет
  // Content-Type с boundary — НЕ перезаписываем на application/json.
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: token,
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(init.headers ?? {}),
    },
  })

  if (res.status === 429 && attempt === 0) {
    const retry = Number(res.headers.get("X-Ratelimit-Retry")) || 0
    const waitMs = retry > 0 ? retry * 1000 : RATE_LIMIT_FALLBACK_MS
    await new Promise((r) => setTimeout(r, waitMs))
    return callApi(baseUrl, token, path, init, 1)
  }

  if (res.status === 401) throw new Error("Неверный токен WB API")
  if (res.status === 403) {
    // Разный scope-hint для разных API: Feedbacks bit 5, Returns bit 11, Chat bit 9.
    const scopeHint = baseUrl.includes("returns-api")
      ? "bit 11 Buyers Returns (WB_RETURNS_TOKEN)"
      : baseUrl.includes("buyer-chat-api")
        ? "bit 9 Buyers chat (WB_CHAT_TOKEN)"
        : "bit 5"
    throw new Error(`Нет доступа — проверьте scope токена (${scopeHint})`)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`WB API ${res.status}: ${body.slice(0, 200)}`)
  }

  return res
}

// Feedbacks/Questions API — использует WB_API_TOKEN (scope bit 5)
async function callWb(path: string, init: RequestInit, attempt = 0): Promise<Response> {
  return callApi(FEEDBACKS_API, getToken(), path, init, attempt)
}

// Returns API — использует WB_RETURNS_TOKEN (scope bit 11 Buyers Returns)
async function callReturnsApi(
  path: string,
  init: RequestInit,
  attempt = 0
): Promise<Response> {
  return callApi(RETURNS_API, getReturnsToken(), path, init, attempt)
}

// Chat API — использует WB_CHAT_TOKEN (scope bit 9 Buyers chat). Phase 10.
async function callChatApi(
  path: string,
  init: RequestInit,
  attempt = 0
): Promise<Response> {
  return callApi(CHAT_API, getChatToken(), path, init, attempt)
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

// ── WB Buyers Returns API (Phase 9) ──────────────────────────

// Canonical Claim schema из WB Returns API.
// Важные особенности:
//   - photos / video_paths возвращаются БЕЗ схемы ("//photos.wbstatic.net/..."),
//     перед fetch-ом надо добавить "https:" префикс.
//   - actions[] динамический — не хардкодить строки, всегда брать из свежего GET.
//   - status, status_ex, claim_type — integer enum, WB их публично не документирует;
//     храним as-is в SupportTicket.wbClaimStatus/wbClaimStatusEx/wbClaimType.
export interface Claim {
  id: string // UUID v4
  claim_type: number // enum integer
  status: number // status integer
  status_ex: number // status_ex integer
  nm_id: number // артикул WB
  user_comment: string // причина покупателя
  wb_comment?: string // инструкция WB (не продавца) покупателю
  dt: string // ISO 8601 — когда заявка подана
  imt_name: string // название товара (денормализованное)
  order_dt?: string // ISO 8601 — дата заказа
  dt_update?: string // ISO 8601 — последнее обновление
  photos?: string[] // //photos.wbstatic.net/... (без схемы!)
  video_paths?: string[] // //video.wbstatic.net/...
  actions: string[] // ["autorefund1", "approve1", "rejectcustom", ...]
  price?: number // рубли
  currency_code?: string // "643" = RUB
  srid?: string // Shipment ID
}

export interface ListReturnsParams {
  is_archive: boolean // обязательный — false = под рассмотрением, true = архив
  limit?: number // default 50, max 200
  offset?: number // default 0
  id?: string // UUID фильтр
  nm_id?: number // артикул фильтр
}

export interface ListReturnsResult {
  claims: Claim[]
  total: number
}

// ── Returns API methods ──────────────────────────────────────

export async function listReturns(p: ListReturnsParams): Promise<ListReturnsResult> {
  const qs = new URLSearchParams()
  qs.set("is_archive", String(p.is_archive))
  if (p.limit !== undefined) qs.set("limit", String(p.limit))
  if (p.offset !== undefined) qs.set("offset", String(p.offset))
  if (p.id !== undefined) qs.set("id", p.id)
  if (p.nm_id !== undefined) qs.set("nm_id", String(p.nm_id))

  const res = await callReturnsApi(`/api/v1/claims?${qs}`, { method: "GET" })
  const json = (await res.json()) as { claims?: Claim[]; total?: number }
  return { claims: json.claims ?? [], total: json.total ?? 0 }
}

// Одобрить заявку: action = "approve1" | "autorefund1" | "approvecc1".
// comment обязателен только для "rejectcustom" (см. rejectReturn); для
// "approvecc1" — опциональный «одобрить с пояснением».
export async function approveReturn(
  id: string,
  wbAction: string,
  comment?: string
): Promise<{ ok: true }> {
  const body: { id: string; action: string; comment?: string } = {
    id,
    action: wbAction,
  }
  if (comment !== undefined) body.comment = comment
  await callReturnsApi("/api/v1/claim", {
    method: "PATCH",
    body: JSON.stringify(body),
  })
  return { ok: true }
}

// Отклонить заявку — action всегда "rejectcustom", comment обязателен 10-1000 символов.
export async function rejectReturn(id: string, reason: string): Promise<{ ok: true }> {
  if (reason.length < 10 || reason.length > 1000) {
    throw new Error("Причина должна быть от 10 до 1000 символов")
  }
  await callReturnsApi("/api/v1/claim", {
    method: "PATCH",
    body: JSON.stringify({ id, action: "rejectcustom", comment: reason }),
  })
  return { ok: true }
}

// Пересмотреть отклонённую заявку — повторный approve* action.
// Работает, только если WB снова вернул "approve1" (или аналог) в actions[]
// после предыдущего rejectcustom. Без comment — семантика повторного одобрения.
export async function reconsiderReturn(
  id: string,
  wbAction: string
): Promise<{ ok: true }> {
  await callReturnsApi("/api/v1/claim", {
    method: "PATCH",
    body: JSON.stringify({ id, action: wbAction }),
  })
  return { ok: true }
}

// ── WB Buyer Chat API (Phase 10) ─────────────────────────────
// Base: https://buyer-chat-api.wildberries.ru
// Auth: Authorization: ${WB_CHAT_TOKEN} (без Bearer, паттерн всех WB API)
// Rate limit: 10 req / 10 sec → callApi ретраит 429 с X-Ratelimit-Retry.
//
// Endpoints:
//   GET  /ping                           — health check
//   GET  /api/v1/seller/chats            — список чатов (replySign + clientName + lastMessage)
//   GET  /api/v1/seller/events?next={ms} — cursor-based поток событий
//   POST /api/v1/seller/message          — multipart: replySign + message + file[]
//   GET  /api/v1/seller/download/{id}    — бинарь вложения

export interface ChatGoodCard {
  nmID: number
  price?: number
  size?: string
}

export interface ChatLastMessage {
  text: string
  addTimestamp: number // Unix seconds
}

export interface Chat {
  chatID: string // UUID — используем как SupportTicket.wbExternalId
  replySign: string // обязательно для sendMessage; храним в SupportTicket.chatReplySign
  clientName: string
  goodCard?: ChatGoodCard
  lastMessage?: ChatLastMessage
}

export interface ChatAttachmentImage {
  downloadID: string
  fileName: string
  width?: number
  height?: number
}

export interface ChatAttachmentFile {
  downloadID: string
  fileName: string
  fileSize?: number
}

export interface ChatAttachments {
  goodCard?: ChatGoodCard
  images?: ChatAttachmentImage[]
  files?: ChatAttachmentFile[]
}

export interface ChatMessage {
  text?: string
  attachments?: ChatAttachments
}

export interface ChatEvent {
  chatID: string
  eventID: string // уникален глобально — используем как SupportMessage.wbEventId
  eventType: string // "message"
  isNewChat: boolean
  message?: ChatMessage
  addTimestamp: number // Unix ms
  sender: "client" | "seller"
  clientName?: string
}

export interface ChatEventsResult {
  events: ChatEvent[]
  next: number
  totalEvents: number
  newestEventTime?: string
  oldestEventTime?: string
}

export interface SendChatMessageInput {
  replySign: string // ≤255 символов
  message?: string // ≤1000 символов
  files?: Array<{ name: string; data: Buffer | Blob; contentType: string }>
}

// ── Chat API methods ─────────────────────────────────────────

export async function pingChat(): Promise<{ ok: true }> {
  await callChatApi("/ping", { method: "GET" })
  return { ok: true }
}

export async function listChats(): Promise<Chat[]> {
  const res = await callChatApi("/api/v1/seller/chats", { method: "GET" })
  const json = (await res.json()) as { result?: Chat[]; errors?: unknown }
  return json.result ?? []
}

export async function getChatEvents(next?: number): Promise<ChatEventsResult> {
  const path =
    next !== undefined
      ? `/api/v1/seller/events?next=${encodeURIComponent(String(next))}`
      : "/api/v1/seller/events"
  const res = await callChatApi(path, { method: "GET" })
  const json = (await res.json()) as {
    result?: {
      events?: ChatEvent[]
      next?: number
      totalEvents?: number
      newestEventTime?: string
      oldestEventTime?: string
    }
    errors?: unknown
  }
  return {
    events: json.result?.events ?? [],
    next: json.result?.next ?? 0,
    totalEvents: json.result?.totalEvents ?? 0,
    newestEventTime: json.result?.newestEventTime,
    oldestEventTime: json.result?.oldestEventTime,
  }
}

// sendChatMessage — multipart upload. Ограничения WB:
//   - replySign ≤ 255 символов (обязателен, получаем из Chat.replySign / ticket.chatReplySign)
//   - message ≤ 1000 символов
//   - каждый файл ≤ 5 МБ
//   - сумма файлов ≤ 30 МБ
//   - допустимые типы: image/jpeg, image/png, application/pdf (валидация на клиенте + серверная через mimeType)
export async function sendChatMessage(
  input: SendChatMessageInput
): Promise<{ ok: true; addTime?: number; chatID?: string }> {
  if (input.replySign.length > 255) {
    throw new Error("replySign превышает 255 символов")
  }
  if (input.message && input.message.length > 1000) {
    throw new Error("Сообщение превышает 1000 символов")
  }
  const form = new FormData()
  form.append("replySign", input.replySign)
  if (input.message) form.append("message", input.message)
  let totalBytes = 0
  for (const f of input.files ?? []) {
    // Buffer → Blob для FormData (Node 20 FormData принимает Blob).
    const blob =
      f.data instanceof Blob ? f.data : new Blob([new Uint8Array(f.data)], { type: f.contentType })
    if (blob.size > 5 * 1024 * 1024) {
      throw new Error(`Файл ${f.name} больше 5 МБ`)
    }
    totalBytes += blob.size
    form.append("file", blob, f.name)
  }
  if (totalBytes > 30 * 1024 * 1024) {
    throw new Error("Суммарный размер файлов больше 30 МБ")
  }
  const res = await callChatApi("/api/v1/seller/message", {
    method: "POST",
    body: form,
  })
  const json = (await res.json()) as {
    result?: { addTime?: number; chatID?: string }
    errors?: unknown
  }
  return { ok: true, addTime: json.result?.addTime, chatID: json.result?.chatID }
}

export async function downloadChatAttachment(downloadId: string): Promise<Buffer> {
  const res = await callChatApi(
    `/api/v1/seller/download/${encodeURIComponent(downloadId)}`,
    { method: "GET" }
  )
  const arr = await res.arrayBuffer()
  return Buffer.from(arr)
}
