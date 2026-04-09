// lib/password.ts
// Генерация криптостойких случайных паролей через Web Crypto API

// Без визуально похожих символов: 0/O, 1/l/I
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
const SPECIAL = "!@#$%&*"

/**
 * Генерирует случайный пароль заданной длины.
 * Гарантирует наличие минимум по одной большой букве, маленькой, цифре и спецсимволу.
 */
export function generatePassword(length = 12): string {
  if (length < 8) length = 8

  const allChars = CHARS + SPECIAL
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)

  // Генерим случайный пароль
  let password = ""
  for (let i = 0; i < length; i++) {
    password += allChars[bytes[i] % allChars.length]
  }

  // Гарантируем наличие обязательных типов символов — подменяем первые 4 символа
  const guarantors = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ", // верхний регистр
    "abcdefghijkmnpqrstuvwxyz", // нижний регистр
    "23456789",                  // цифра
    SPECIAL,                     // спецсимвол
  ]
  const guaranteedBytes = new Uint32Array(4)
  crypto.getRandomValues(guaranteedBytes)

  let result = password.split("")
  for (let i = 0; i < 4; i++) {
    result[i] = guarantors[i][guaranteedBytes[i] % guarantors[i].length]
  }

  // Перемешиваем чтобы гарантированные символы не были в начале
  const shuffleBytes = new Uint32Array(length)
  crypto.getRandomValues(shuffleBytes)
  for (let i = result.length - 1; i > 0; i--) {
    const j = shuffleBytes[i] % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }

  return result.join("")
}
