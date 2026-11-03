// Financial Document OS local REST/RPC adapter. All SQL identifiers are
// hard-coded or strictly whitelisted; values are always positional parameters.
// Every user query runs in an RLS-checked, transaction-scoped authenticated role.
import { withUser } from "./database.mjs";

const readable = new Set([
  "businesses", "clients", "documents", "document_items", "invoice_ledger",
  "client_balances", "payments", "receipts", "allocations", "document_versions",
  "share_links", "audit_logs",
]);
const editable = {
  businesses: new Set([
    "name","trading_name","kra_pin","vat_number","email","phone",
    "physical_address","postal_address","city","country","base_currency",
    "default_tax_category","default_wht_rate","default_terms_days","default_template",
    "mpesa_paybill","mpesa_account_format","bank_name","bank_branch",
    "bank_account_name","bank_account_number","bank_swift","signatory_name",
    "signatory_title","default_notes","default_legal_terms",
  ]),
  clients: new Set([
    "business_id","name","email","phone","address","city","country","kra_pin","currency",
    "payment_terms_days","credit_limit","status","notes","contact_person",
  ]),
  share_links: new Set(["business_id","document_id","receipt_id","token","revoked_at"]),
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function identifier(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error("Invalid query field");
  }
  return value;
}
const related = {
  payments: `, CASE WHEN c.id IS NOT NULL THEN jsonb_build_object('name',c.name) END AS clients`,
  receipts: `, CASE WHEN p.id IS NOT NULL THEN to_jsonb(p) END AS payments,
      CASE WHEN c.id IS NOT NULL THEN jsonb_build_object('name',c.name) END AS clients`,
  allocations: `, CASE WHEN p.id IS NOT NULL THEN to_jsonb(p) END AS payments`,
};
const joins = {
  payments: ` LEFT JOIN public.clients c ON c.id=t.client_id AND c.business_id=t.business_id`,
  receipts: ` LEFT JOIN public.payments p ON p.id=t.payment_id AND p.business_id=t.business_id
              LEFT JOIN public.clients c ON c.id=t.client_id AND c.business_id=t.business_id`,
  allocations: ` LEFT JOIN public.payments p ON p.id=t.payment_id AND p.business_id=t.business_id`,
};
export async function queryTable(userId, request) {
  const table = request?.table;
  const mode = request?.mode ?? "select";
  if (!readable.has(table)) throw new Error("Unsupported database entity");
  const filters = request?.filters ?? [];
  if (!Array.isArray(filters) || filters.length > 6) throw new Error("Invalid query filters");
  const fieldValues = filters.map(({ field, value }) => {
    if (value === undefined) throw new Error("Missing query filter value");
    return { field: identifier(field), value };
  });
  if (!["select","insert","update"].includes(mode)) throw new Error("Unsupported data operation");
  return withUser(userId, async (tx) => {
    let rows;
    if (mode === "select") {
      const params = fieldValues.map(x => x.value);
      const conditions = fieldValues.map((x,i) => `t.${x.field} = $${i+1}`).join(" AND ");
      const order = request?.sort?.field ? ` ORDER BY t.${identifier(request.sort.field)} ${request.sort.ascending ? "ASC" : "DESC"}` : "";
      const limit = ` LIMIT ${Math.min(Math.max(Number(request?.limit) || 200,1),500)}`;
      const query = `SELECT t.*${related[table] ?? ""}
        FROM public.${table} t${joins[table] ?? ""}
        ${conditions ? "WHERE " + conditions : ""}${order}${limit}`;
      rows = await tx.unsafe(query, params);
    } else {
      if (!Object.hasOwn(editable, table)) throw new Error("This table is not directly writable");
      const raw = request.values;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Missing data object");
      const input = Object.entries(raw).filter(([k,v]) => v !== undefined);
      if (input.length === 0 || input.some(([k]) => !editable[table].has(k))) {
        throw new Error("Unsupported update field");
      }
      if (table === "clients" && mode === "insert" && !input.some(([k])=>k==="business_id")) {
        throw new Error("Business is required");
      }
      if (table === "share_links" && mode === "insert") {
        const token = raw.token;
        if (typeof token !== "string" || !/^[a-f0-9]{48}$/.test(token)) {
          throw new Error("Invalid share token");
        }
      }
      if (table === "share_links" && mode === "update" &&
          (input.length !== 1 || input[0][0] !== "revoked_at")) {
        throw new Error("Only share revocation is supported");
      }
      if (mode === "update") {
        if (fieldValues.length !== 1 || fieldValues[0].field !== "id" ||
            !uuidPattern.test(String(fieldValues[0].value))) {
          throw new Error("Updates require an exact row ID");
        }
        if (table === "clients" && input.some(([k])=>k==="business_id")) {
          throw new Error("Client tenant cannot be changed");
        }
        const args = input.map(([,v]) => v);
        const sets = input.map(([k],i)=>`${identifier(k)} = $${i+1}`).join(", ");
        args.push(fieldValues[0].value);
        rows = await tx.unsafe(
          `UPDATE public.${table} SET ${sets} WHERE id = $${args.length}::uuid RETURNING *`, args,
        );
      } else {
        if (table === "businesses") throw new Error("Use the create_business command");
        const cols = input.map(([k])=>identifier(k)).join(",");
        const placeholders = input.map((_,i)=>`$${i+1}`).join(",");
        rows = await tx.unsafe(
          `INSERT INTO public.${table} (${cols}) VALUES(${placeholders}) RETURNING *`,
          input.map(([,v])=>v),
        );
      }
    }
    if (request?.single || request?.maybeSingle) {
      if (!rows.length && request.maybeSingle) return null;
      if (rows.length !== 1) throw new Error("Expected one record");
      return rows[0];
    }
    return rows;
  });
}

const functions = {
  create_business: [["_name","text"],["_base_currency","text"]],
  save_document_draft: [["_business_id","uuid"],["_client_id","uuid"],["_payload","jsonb"],["_items","jsonb"],["_document_id","uuid"]],
  finalize_document: [["_document_id","uuid"]],
  issue_credit_note: [["_credit_note_id","uuid"]],
  convert_document: [["_source_id","uuid"],["_target_type","public.doc_type"]],
  void_document: [["_document_id","uuid"],["_reason","text"]],
  set_document_status: [["_document_id","uuid"],["_status","public.doc_lifecycle"]],
  mark_document_sent: [["_document_id","uuid"]],
  record_payment_v2: [["_request","jsonb"]],
  reverse_payment: [["_payment_id","uuid"],["_reason","text"]],
  get_shared_document: [["_token","text"]],
};
const publicFunctions = new Set(["get_shared_document"]);
export async function runRpc(userId, request) {
  const name = request?.name;
  if (!Object.hasOwn(functions, name)) throw new Error("Unknown domain command");
  const args = request?.args ?? {};
  if (typeof args !== "object" || Array.isArray(args)) throw new Error("Invalid command input");
  const definition = functions[name];
  const unexpected = Object.keys(args).filter(key => !definition.some(([field]) => field === key));
  if (unexpected.length) throw new Error("Unexpected command input");
  const casts = definition.map(([,type],i) => "$" + (i+1) + "::" + type).join(",");
  return withUser(userId, async tx => {
    // postgres.js json() preserves objects/arrays as JSONB instead of
    // accidentally casting a serialized string into a JSON scalar.
    const values = definition.map(([field, type]) => {
      const value = args[field] ?? null;
      return type === "jsonb" && value !== null ? tx.json(value) : value;
    });
    const rows = await tx.unsafe(`SELECT to_jsonb(public.${name}(${casts})) AS result`, values);
    return rows[0]?.result ?? null;
  }, publicFunctions.has(name) && !userId ? "anon" : "authenticated");
}
