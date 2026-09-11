export const DOC_TYPES = [
  "INVOICE",
  "PRO_FORMA",
  "QUOTATION",
  "CREDIT_NOTE",
  "DEBIT_NOTE",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  INVOICE: "Invoice",
  PRO_FORMA: "Pro-forma invoice",
  QUOTATION: "Quotation",
  CREDIT_NOTE: "Credit note",
  DEBIT_NOTE: "Debit note",
};

export const TAX_CATEGORIES = ["VAT_16", "VAT_8", "ZERO_RATED", "EXEMPT"] as const;
export type TaxCategory = (typeof TAX_CATEGORIES)[number];

export const TAX_RATE: Record<TaxCategory, number> = {
  VAT_16: 0.16,
  VAT_8: 0.08,
  ZERO_RATED: 0,
  EXEMPT: 0,
};

export const TAX_LABEL: Record<TaxCategory, string> = {
  VAT_16: "VAT 16%",
  VAT_8: "VAT 8%",
  ZERO_RATED: "Zero rated",
  EXEMPT: "Exempt",
};

export const PAYMENT_CHANNELS = [
  "MPESA_C2B",
  "MPESA_TILL",
  "BANK_TRANSFER",
  "RTGS",
  "CASH",
  "CHEQUE",
  "CARD",
  "OTHER",
] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

export const CHANNEL_LABEL: Record<PaymentChannel, string> = {
  MPESA_C2B: "M-Pesa (Paybill)",
  MPESA_TILL: "M-Pesa (Till)",
  BANK_TRANSFER: "Bank transfer",
  RTGS: "RTGS",
  CASH: "Cash",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
};

export const CURRENCIES = ["KES", "USD", "EUR", "GBP", "TZS", "UGX", "ZAR"] as const;

export function money(amount: number | string | null | undefined, currency = "KES") {
  const value = Number(amount ?? 0);
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function num(amount: number | string | null | undefined, digits = 2) {
  const value = Number(amount ?? 0);
  return new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);
}

export function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ISSUED: "bg-primary/15 text-primary",
  ACCEPTED: "bg-success/15 text-success",
  REJECTED: "bg-destructive/15 text-destructive",
  EXPIRED: "bg-warning/15 text-warning",
  CONVERTED: "bg-chart-3/20 text-chart-3",
  VOID: "bg-destructive/15 text-destructive",
  CANCELLED: "bg-destructive/15 text-destructive",
  PAID: "bg-success/15 text-success",
  PARTIALLY_PAID: "bg-warning/15 text-warning",
  UNPAID: "bg-muted text-muted-foreground",
  OVERDUE: "bg-destructive/15 text-destructive",
  COMPLETED: "bg-success/15 text-success",
  REVERSED: "bg-destructive/15 text-destructive",
  RECONCILED: "bg-success/15 text-success",
  INITIATED: "bg-warning/15 text-warning",
  FAILED: "bg-destructive/15 text-destructive",
  ACTIVE: "bg-success/15 text-success",
  ON_HOLD: "bg-warning/15 text-warning",
  INACTIVE: "bg-muted text-muted-foreground",
};

export function statusLabel(status: string | null | undefined) {
  if (!status) return "—";
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
}

/** Mirrors public.recalculate_document exactly: discount applies before tax. */
export function lineTotals(input: {
  quantity: number;
  unit_price: number;
  discount_pct: number;
  tax_rate: number;
}) {
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const gross = round2(input.quantity * input.unit_price);
  const discount = round2((input.quantity * input.unit_price * input.discount_pct) / 100);
  const taxable = gross - discount;
  const tax = round2(taxable * input.tax_rate);
  return { gross, discount, taxable, tax, net: taxable + tax };
}

export function documentTotals(
  lines: Array<{ quantity: number; unit_price: number; discount_pct: number; tax_rate: number }>,
  options: { whtApplicable?: boolean; whtRate?: number } = {},
) {
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  let subtotal = 0;
  let discount = 0;
  let taxable = 0;
  let tax = 0;
  for (const line of lines) {
    const t = lineTotals(line);
    subtotal += t.gross;
    discount += t.discount;
    taxable += t.taxable;
    tax += t.tax;
  }
  const total = round2(taxable + tax);
  const wht = options.whtApplicable ? round2(taxable * (options.whtRate ?? 0)) : 0;
  return {
    subtotal: round2(subtotal),
    discount_total: round2(discount),
    taxable_total: round2(taxable),
    tax_total: round2(tax),
    total_amount: total,
    wht_amount: wht,
    net_payable: round2(total - wht),
  };
}
