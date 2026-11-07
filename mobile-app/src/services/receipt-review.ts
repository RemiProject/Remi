export function receiptCandidates(text: string): string[] {
  return text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 1 && line.length <= 160 && /\p{L}/u.test(line)
    && !/الإجمالي|المجموع|ضريبة|شكرا/.test(line) && !/\b(total|subtotal|tax|vat|visa|mastercard|cash|change|receipt|thank|address|phone|tel|invoice)\b/i.test(line)).slice(0, 80);
}
