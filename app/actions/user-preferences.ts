// app/actions/user-preferences.ts
// Server actions для персистентных per-user настроек UI.
// Паттерн: key/value JSON хранилище, auth-only (без requireSection —
// это пользовательские настройки UI, не данные домена).
//
// Использование:
//   const widths = await getUserPreference<Record<string, number>>("prices.wb.columnWidths")
//   await setUserPreference("prices.wb.columnWidths", { photo: 128, svodka: 200 })

"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

/** Прочитать per-user настройку по ключу. null если не задана. */
export async function getUserPreference<T = unknown>(
  key: string,
): Promise<T | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  try {
    const row = await prisma.userPreference.findUnique({
      where: { userId_key: { userId: session.user.id, key } },
    })
    if (!row) return null
    return row.value as T
  } catch (e) {
    console.error("[getUserPreference]", e)
    return null
  }
}

/** Записать per-user настройку (upsert). */
export async function setUserPreference<T = unknown>(
  key: string,
  value: T,
): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { ok: false, error: "Не авторизован" }
  }

  if (!key || key.length === 0 || key.length > 200) {
    return { ok: false, error: "Некорректный ключ настройки" }
  }

  try {
    await prisma.userPreference.upsert({
      where: { userId_key: { userId: session.user.id, key } },
      // Prisma Json поле: передаём как never чтобы обойти InputJsonValue strict
      create: { userId: session.user.id, key, value: value as never },
      update: { value: value as never },
    })
    // revalidatePath НЕ вызываем — клиент сам применит state, серверный рендер
    // UserPreference читается только при загрузке страницы.
    return { ok: true }
  } catch (e) {
    console.error("[setUserPreference]", e)
    return { ok: false, error: (e as Error).message }
  }
}
