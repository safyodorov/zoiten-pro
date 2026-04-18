// Подстановка переменных шаблона {имя_покупателя} и {название_товара}.
// Чистая функция, вызывается на клиенте в TemplatePickerModal.onPick перед записью в textarea.
// Консистентна с Phase 10 AutoReplyConfig.messageText (оба используют те же placeholder'ы).
// Fallback: customerName → «покупатель», productName → «» (пусто).

export interface TemplateVarContext {
  customerName?: string | null
  productName?: string | null
}

export function substituteTemplateVars(
  text: string,
  ctx: TemplateVarContext
): string {
  const customer = ctx.customerName?.trim() || "покупатель"
  const product = ctx.productName?.trim() || ""
  return text
    .replace(/\{имя_покупателя\}/g, customer)
    .replace(/\{название_товара\}/g, product)
}
