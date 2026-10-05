import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set(["https://sprint.abh1.xyz", "http://localhost:5173", "http://localhost:8787"]);
const maxUploadBytes = 20 * 1024 * 1024;
const safeMimeTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);

const json = (body: unknown, status = 200, origin?: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });

const cors = (origin?: string | null) => ({
  "Access-Control-Allow-Origin": origin && (allowedOrigins.has(origin) || origin.endsWith(".vercel.app") || origin.includes("localhost")) ? origin : "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-sprint-session, x-sprint-device, x-idempotency-key, x-admin-token, x-merchant-setup-key, x-merchant-token",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Vary": "Origin",
});

const error = (message: string, status = 400, origin?: string | null) =>
  json({ error: { message } }, status, origin);

const db = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function token() {
  return `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
}

function now() {
  return new Date().toISOString();
}

function parsePages(range: unknown, total: number) {
  if (!range || range === "all") return total;
  const pages = new Set<number>();
  for (const part of String(range).split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [firstText, lastText] = trimmed.split("-");
    const first = Number(firstText);
    const last = lastText ? Number(lastText) : first;
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || last > total) {
      throw new Error("Use a valid page range, such as 1-3.");
    }
    for (let page = first; page <= last; page += 1) pages.add(page);
  }
  return pages.size || total;
}

function price(print: Record<string, unknown>, pages: number, rates: Record<string, number>) {
  const color = print.colorMode === "COLOR" ? "COLOR" : "BW";
  const sides = print.sides === "DUPLEX" ? "DUPLEX" : "SINGLE";
  const copies = Number(print.copies) || 1;
  if (!Number.isInteger(copies) || copies < 1 || copies > 99) throw new Error("Choose between 1 and 99 copies.");
  const rate = rates[`A4_${color}_${sides}`] ?? (color === 'COLOR' ? (sides === 'DUPLEX' ? 1500 : 1000) : (sides === 'DUPLEX' ? 300 : 200));
  const sheets = sides === "DUPLEX" ? Math.ceil(pages / 2) : pages;
  return rate * sheets * copies;
}

async function customer(request: Request) {
  const value = request.headers.get("x-sprint-session");
  if (!value) throw new Error("Start a customer session before continuing.");
  const client = db();
  const tokenHash = await sha256(value);
  const { data: session } = await client
    .from("sprint_customer_sessions")
    .select("*")
    .eq("token_hash", tokenHash)
    .gt("expires_at", now())
    .maybeSingle();
  if (!session) throw new Error("Your customer session has expired. Refresh the page to begin again.");
  await client.from("sprint_customer_sessions").update({ last_seen_at: now() }).eq("id", session.id);
  return { client, session };
}

async function deviceAuth(request: Request) {
  const value = request.headers.get("x-sprint-device");
  if (!value) throw new Error("Device authorization required.");
  const client = db();
  const tokenHash = await sha256(value);
  const { data: device } = await client
    .from("merchant_devices")
    .select("*")
    .eq("token_hash", tokenHash)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (!device) throw new Error("Device not authorized or revoked.");
  await client.from("merchant_devices").update({ last_seen_at: now() }).eq("id", device.id);
  return { client, device };
}

function adminAuth(request: Request) {
  const token = request.headers.get("x-admin-token") || new URL(request.url).searchParams.get("adminToken");
  const expected = Deno.env.get("SPRINT_ADMIN_TOKEN") || "sprint-admin-token-2026";
  if (!token || token !== expected) throw new Error("Platform admin authorization required.");
}

async function resolveShop(client: ReturnType<typeof db>, identifier: string) {
  const raw = identifier.trim();
  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();

  const { data: shop } = await client
    .from("sprint_shops")
    .select("*")
    .or(`slug.eq.${lower},store_code.eq.${upper},slug.eq.${upper}`)
    .maybeSingle();

  return shop;
}

function serializeRequest(row: Record<string, unknown>, items: Array<Record<string, unknown>> = [], quotes: Array<Record<string, unknown>> = []) {
  const details = (row.details_json || {}) as Record<string, unknown>;
  return {
    id: row.id,
    requestNumber: row.request_number,
    shopId: row.shop_id,
    type: row.type,
    state: row.state,
    amountMinor: row.amount_minor,
    currency: row.currency,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method || "PENDING",
    customerNote: row.customer_note || details.customerNote,
    print: details.print,
    service: details.service,
    items,
    quotes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  const url = new URL(request.url);
  const path = url.pathname.replace(/^.*\/sprint-api/, "") || "/";

  try {
    // Health
    if (request.method === "GET" && path === "/health") {
      return json({ ok: true, product: "Sprint by abh1", version: "0.2.0" }, 200, origin);
    }

    // Customer Session
    if (request.method === "POST" && path === "/v1/customer/sessions") {
      const client = db();
      const plainToken = token();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error: insertError } = await client
        .from("sprint_customer_sessions")
        .insert({ token_hash: await sha256(plainToken), expires_at: expiresAt });
      if (insertError) throw insertError;
      return json({ token: plainToken, expiresAt }, 201, origin);
    }

    // Store lookup by code
    if (request.method === "GET" && path === "/v1/stores/lookup") {
      const code = String(url.searchParams.get("code") || "").trim();
      if (!code) return error("Enter a store code.", 400, origin);
      const client = db();
      const shop = await resolveShop(client, code);
      if (!shop) return error("Store code not found.", 404, origin);
      return json({
        valid: true,
        storeCode: shop.store_code,
        slug: shop.slug,
        displayName: shop.display_name,
        address: shop.address,
        city: shop.city,
        operationalStatus: shop.operational_status || "ACTIVE",
        url: `https://sprint.abh1.xyz/s/${shop.store_code || shop.slug}`,
      }, 200, origin);
    }

    // Shop details
    if (request.method === "GET" && /^\/v1\/shops\/[^/]+$/.test(path)) {
      const identifier = path.split("/").pop()!;
      const client = db();
      const shop = await resolveShop(client, identifier);
      if (!shop) return error("This Sprint shop was not found.", 404, origin);

      const { data: services } = await client
        .from("sprint_services")
        .select("*")
        .eq("shop_id", shop.id)
        .eq("enabled", true)
        .order("sort_order", { ascending: true });

      const { data: products } = await client
        .from("store_products")
        .select("*")
        .eq("shop_id", shop.id)
        .eq("available", true)
        .order("sort_order", { ascending: true });

      const rates = shop.rates_json || {};
      return json({
        id: shop.id,
        slug: shop.slug,
        storeCode: shop.store_code || "7KD3P",
        displayName: shop.display_name,
        address: shop.address || "",
        city: shop.city || "",
        status: shop.status,
        operationalStatus: shop.operational_status || "ACTIVE",
        currency: shop.currency,
        rates,
        printOptions: Object.keys(rates).map((k) => k.split("_")),
        services: (services || []).map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category || "DOCUMENT_ASSISTANCE",
          description: s.description,
          priceMode: s.price_mode,
          priceMinor: s.price_minor,
          paymentTiming: s.payment_timing,
          fields: s.fields_json || [],
          instructions: s.instructions,
        })),
        products: (products || []).map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          description: p.description,
          priceMinor: p.price_minor,
          sku: p.sku,
          trackInventory: p.track_inventory,
          quantity: p.quantity,
        })),
        paymentSettings: shop.payment_settings_json || { onlineEnabled: true, payAtCounterEnabled: true, upiQrEnabled: true },
        printingEnabled: shop.printing_enabled !== false,
        servicesEnabled: shop.services_enabled !== false,
        stationeryEnabled: shop.stationery_enabled !== false,
        canonicalUrl: `https://sprint.abh1.xyz/s/${shop.store_code || shop.slug}`,
      }, 200, origin);
    }

    // Attachment upload
    if (request.method === "POST" && path === "/v1/customer/attachments") {
      const { client, session } = await customer(request);
      const form = await request.formData();
      const file = form.get("file");
      const shopIdentifier = String(form.get("shopSlug") || form.get("storeCode") || "");
      if (!(file instanceof File)) return error("Choose a document to upload.", 400, origin);
      if (!safeMimeTypes.has(file.type) || file.size <= 0 || file.size > maxUploadBytes) {
        return error("Use a PDF, PNG, or JPG no larger than 20 MB.", 400, origin);
      }

      const shop = await resolveShop(client, shopIdentifier);
      if (!shop) return error("This shop is not accepting requests.", 409, origin);

      const attachmentId = crypto.randomUUID();
      const objectKey = `${shop.id}/${session.id}/${attachmentId}`;
      const { error: uploadError } = await client.storage.from("sprint-documents").upload(objectKey, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error: attError } = await client.from("sprint_attachments").insert({
        id: attachmentId,
        shop_id: shop.id,
        customer_session_id: session.id,
        object_key: objectKey,
        original_name: file.name.slice(0, 180),
        mime_type: file.type,
        size_bytes: file.size,
        page_count: 1,
        expires_at: expiresAt,
      });
      if (attError) {
        await client.storage.from("sprint-documents").remove([objectKey]);
        throw attError;
      }
      return json({ id: attachmentId, originalName: file.name, mimeType: file.type, sizeBytes: file.size, pageCount: 1 }, 201, origin);
    }

    // Unified Customer Request Submission (Print + Service + Stationery)
    if (request.method === "POST" && path === "/v1/customer/requests") {
      const { client, session } = await customer(request);
      const body = await request.json();
      const shop = await resolveShop(client, body.shopSlug || body.storeCode || "");
      if (!shop) return error("This shop is not accepting requests.", 409, origin);
      if (shop.operational_status === "SUSPENDED_BY_ABH1") return error("This store is currently suspended by abh1.", 403, origin);
      if (shop.operational_status === "PAUSED_BY_MERCHANT" || shop.status === "PAUSED") return error("This store is temporarily paused.", 409, origin);

      const itemsToProcess = [];
      if (Array.isArray(body.items) && body.items.length > 0) {
        itemsToProcess.push(...body.items);
      } else if (body.type === "PRINT") {
        itemsToProcess.push({ type: "PRINT", attachmentIds: body.attachmentIds, print: body.print });
      } else if (body.type === "SERVICE") {
        itemsToProcess.push({ type: "SERVICE", serviceDefinitionId: body.serviceDefinitionId, fieldValues: body.fieldValues, customerNote: body.customerNote });
      } else {
        return error("Add at least one item to your request.", 400, origin);
      }

      let totalAmountMinor = 0;
      let hasQuoteItem = false;
      const processedItems: Array<Record<string, unknown>> = [];
      const linkedAttachmentIds: string[] = [];

      for (const item of itemsToProcess) {
        const itemId = crypto.randomUUID();
        if (item.type === "PRINT") {
          const attId = item.attachmentIds?.[0] || body.attachmentIds?.[0];
          const { data: attachment } = await client
            .from("sprint_attachments")
            .select("*")
            .eq("id", attId)
            .eq("shop_id", shop.id)
            .eq("customer_session_id", session.id)
            .maybeSingle();
          if (!attachment) return error("Print document unavailable.", 403, origin);
          linkedAttachmentIds.push(attachment.id);

          const printConf = item.print || body.print || {};
          const selectedPageCount = parsePages(printConf.pageRange, attachment.page_count);
          const amountMinor = price(printConf, selectedPageCount, shop.rates_json || {});
          totalAmountMinor += amountMinor;

          processedItems.push({
            id: itemId,
            item_type: "PRINT",
            title: `Print: ${attachment.original_name}`,
            amount_minor: amountMinor,
            status: "PENDING",
            configuration_json: {
              attachmentId: attachment.id,
              originalName: attachment.original_name,
              pageRange: printConf.pageRange || "all",
              selectedPageCount,
              copies: Number(printConf.copies) || 1,
              colorMode: printConf.colorMode === "COLOR" ? "COLOR" : "BW",
              paperSize: "A4",
              sides: printConf.sides === "DUPLEX" ? "DUPLEX" : "SINGLE",
            },
          });
        } else if (item.type === "SERVICE") {
          const sId = item.serviceDefinitionId || body.serviceDefinitionId;
          const { data: service } = await client.from("sprint_services").select("*").eq("id", sId).eq("shop_id", shop.id).eq("enabled", true).maybeSingle();
          if (!service) return error("Service not available.", 404, origin);

          let servicePrice = service.price_mode === "FIXED" ? service.price_minor : 0;
          if (service.price_mode === "MERCHANT_QUOTE") {
            hasQuoteItem = true;
            servicePrice = 0;
          }
          totalAmountMinor += servicePrice;

          processedItems.push({
            id: itemId,
            item_type: "SERVICE",
            title: service.name,
            amount_minor: servicePrice,
            status: "PENDING",
            configuration_json: {
              serviceDefinitionId: service.id,
              serviceName: service.name,
              fieldValues: item.fieldValues || {},
              customerNote: item.customerNote || "",
            },
          });
        } else if (item.type === "PRODUCT") {
          const { data: prod } = await client.from("store_products").select("*").eq("id", item.productId).eq("shop_id", shop.id).eq("available", true).maybeSingle();
          if (!prod) return error("Product unavailable.", 404, origin);
          const qty = Math.max(1, Number(item.quantity) || 1);
          if (prod.track_inventory && prod.quantity < qty) {
            return error(`Only ${prod.quantity} unit(s) available for "${prod.name}".`, 409, origin);
          }
          if (prod.track_inventory) {
            await client.from("store_products").update({ quantity: prod.quantity - qty, updated_at: now() }).eq("id", prod.id);
          }
          const itemAmount = prod.price_minor * qty;
          totalAmountMinor += itemAmount;

          processedItems.push({
            id: itemId,
            item_type: "PRODUCT",
            title: `${prod.name} × ${qty}`,
            amount_minor: itemAmount,
            status: "PENDING",
            configuration_json: {
              productId: prod.id,
              productName: prod.name,
              quantity: qty,
              unitPriceMinor: prod.price_minor,
            },
          });
        }
      }

      const distinctTypes = new Set(processedItems.map((i) => i.item_type));
      let requestCategory = "MIXED";
      if (distinctTypes.size === 1) {
        const only = distinctTypes.values().next().value;
        requestCategory = only === "PRINT" ? "PRINT" : only === "SERVICE" ? "SERVICE" : "STATIONERY";
      }

      let initialState = "SUBMITTED";
      if (hasQuoteItem) {
        initialState = "AWAITING_QUOTE";
      } else if (totalAmountMinor > 0 && body.paymentTiming !== "AT_COUNTER") {
        initialState = "AWAITING_PAYMENT";
      }

      const { data: requestRow, error: createError } = await client.from("sprint_requests").insert({
        shop_id: shop.id,
        customer_session_id: session.id,
        type: requestCategory,
        state: initialState,
        amount_minor: totalAmountMinor,
        currency: shop.currency,
        payment_status: "PENDING",
        payment_method: body.paymentMethod || "PENDING",
        customer_note: body.customerNote || "",
        details_json: { items: processedItems },
      }).select().single();
      if (createError) throw createError;

      // Insert items into sprint_request_items
      for (const item of processedItems) {
        await client.from("sprint_request_items").insert({
          id: item.id,
          request_id: requestRow.id,
          item_type: item.item_type,
          title: item.title,
          amount_minor: item.amount_minor,
          status: item.status,
          configuration_json: item.configuration_json,
        });
      }

      for (const attId of linkedAttachmentIds) {
        await client.from("sprint_attachments").update({ request_id: requestRow.id }).eq("id", attId);
      }

      await client.from("sprint_request_events").insert({ request_id: requestRow.id, event_type: "REQUEST_CREATED", actor_type: "CUSTOMER" });
      return json({ request: serializeRequest(requestRow, processedItems) }, 201, origin);
    }

    // Customer Single Request / Payment / Quotes
    const reqMatch = path.match(/^\/v1\/customer\/requests\/([^/]+)(\/(pay-development|pay-counter|quotes\/([^/]+)))?$/);
    if (reqMatch) {
      const { client, session } = await customer(request);
      const requestId = reqMatch[1];
      const action = reqMatch[3];
      const quoteId = reqMatch[4];

      const { data: existing } = await client
        .from("sprint_requests")
        .select("*")
        .or(`id.eq.${requestId},request_number.eq.${requestId}`)
        .eq("customer_session_id", session.id)
        .maybeSingle();
      if (!existing) return error("Request not found.", 404, origin);

      const { data: items } = await client.from("sprint_request_items").select("*").eq("request_id", existing.id);
      const { data: quotes } = await client.from("service_quotes").select("*").eq("request_id", existing.id);

      if (request.method === "GET" && !action) {
        return json({ request: serializeRequest(existing, items || [], quotes || []) }, 200, origin);
      }

      if (request.method === "POST" && action === "pay-development") {
        if (existing.state !== "AWAITING_PAYMENT") return error("Not awaiting payment.", 409, origin);
        const { data: paid } = await client.from("sprint_requests").update({ state: "SUBMITTED", payment_status: "PAID", updated_at: now() }).eq("id", existing.id).select().single();
        await client.from("sprint_request_events").insert({ request_id: existing.id, event_type: "DEVELOPMENT_PAYMENT_CAPTURED", actor_type: "CUSTOMER" });
        return json({ request: serializeRequest(paid, items || [], quotes || []) }, 200, origin);
      }

      if (request.method === "POST" && action === "pay-counter") {
        const { data: updated } = await client.from("sprint_requests").update({ state: "SUBMITTED", payment_method: "PAY_AT_COUNTER", updated_at: now() }).eq("id", existing.id).select().single();
        await client.from("sprint_request_events").insert({ request_id: existing.id, event_type: "PAY_AT_COUNTER_SELECTED", actor_type: "CUSTOMER" });
        return json({ request: serializeRequest(updated, items || [], quotes || []) }, 200, origin);
      }

      if (request.method === "POST" && quoteId) {
        const body = await request.json();
        const nextQuoteStatus = body.action === "ACCEPT" ? "ACCEPTED" : "REJECTED";
        await client.from("service_quotes").update({ status: nextQuoteStatus, responded_at: now() }).eq("id", quoteId);
        const nextState = body.action === "ACCEPT" ? "AWAITING_PAYMENT" : "REJECTED";
        const { data: updated } = await client.from("sprint_requests").update({ state: nextState, updated_at: now() }).eq("id", existing.id).select().single();
        return json({ request: serializeRequest(updated, items || [], quotes || []) }, 200, origin);
      }
    }

    // Customer Requests List
    if (request.method === "GET" && path === "/v1/customer/requests") {
      const { client, session } = await customer(request);
      const { data: rows } = await client.from("sprint_requests").select("*").eq("customer_session_id", session.id).order("created_at", { ascending: false }).limit(30);
      return json({ requests: (rows || []).map((r) => serializeRequest(r)) }, 200, origin);
    }

    // Realtime ticket
    if (request.method === "GET" && path === "/v1/realtime/ticket") {
      return json({ ticket: "supabase-realtime", expiresInSeconds: 60 }, 200, origin);
    }

    // Merchant Device Pairing Workflow
    if (request.method === "POST" && path === "/v1/merchant/devices/pair-request") {
      const client = db();
      const codePart1 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const codePart2 = Math.random().toString(36).substring(2, 4).toUpperCase();
      const pairingCode = `${codePart1}-${codePart2}`;
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await client.from("device_pairing_codes").insert({
        pairing_code: pairingCode,
        device_name: "Sprint Windows Terminal",
        claimed: false,
        expires_at: expiresAt,
      });
      return json({ pairingCode, expiresInSeconds: 600 }, 201, origin);
    }

    if (request.method === "POST" && path === "/v1/merchant/devices/pair-confirm") {
      const client = db();
      const body = await request.json();
      const shop = await resolveShop(client, body.storeId || "");
      if (!shop) return error("Store not found.", 404, origin);

      const { data: pairing } = await client
        .from("device_pairing_codes")
        .select("*")
        .eq("pairing_code", String(body.pairingCode || "").trim().toUpperCase())
        .eq("claimed", false)
        .gt("expires_at", now())
        .maybeSingle();
      if (!pairing) return error("Pairing code invalid or expired.", 404, origin);

      const deviceToken = token();
      const tokenHash = await sha256(deviceToken);
      const { data: dev } = await client.from("merchant_devices").insert({
        shop_id: shop.id,
        name: pairing.device_name || "Sprint Windows Terminal",
        token_hash: tokenHash,
        version: "0.2.0",
        status: "ACTIVE",
      }).select().single();

      await client.from("device_pairing_codes").update({
        claimed: true,
        shop_id: shop.id,
        device_id: dev.id,
        device_token_hash: deviceToken,
      }).eq("id", pairing.id);

      return json({ deviceId: dev.id, storeId: shop.id, storeName: shop.display_name }, 200, origin);
    }

    if (request.method === "POST" && path === "/v1/merchant/devices/pair-poll") {
      const client = db();
      const body = await request.json();
      const { data: pairing } = await client
        .from("device_pairing_codes")
        .select("*")
        .eq("pairing_code", String(body.pairingCode || "").trim().toUpperCase())
        .maybeSingle();
      if (!pairing) return error("Pairing code not found.", 404, origin);
      if (!pairing.claimed) return json({ status: "PENDING" }, 200, origin);

      const { data: shop } = await client.from("sprint_shops").select("*").eq("id", pairing.shop_id).maybeSingle();
      const devToken = pairing.device_token_hash;
      await client.from("device_pairing_codes").update({ device_token_hash: "" }).eq("id", pairing.id);

      return json({
        status: "CONFIRMED",
        deviceId: pairing.device_id,
        deviceToken: devToken,
        store: { id: shop.id, storeCode: shop.store_code, displayName: shop.display_name },
      }, 200, origin);
    }

    // Platform Admin Overview
    if (request.method === "GET" && path === "/v1/admin/overview") {
      adminAuth(request);
      const client = db();
      const { data: merchants } = await client.from("merchants").select("*").order("name");
      const { data: shops } = await client.from("sprint_shops").select("*").order("display_name");
      const { data: devices } = await client.from("merchant_devices").select("*").order("last_seen_at", { ascending: false });
      const { data: requests } = await client.from("sprint_requests").select("state, type, amount_minor, payment_status");

      const stats = {
        totalMerchants: merchants?.length || 0,
        activeMerchants: merchants?.filter((m) => m.status === "ACTIVE").length || 0,
        totalStores: shops?.length || 0,
        activeStores: shops?.filter((s) => s.operational_status === "ACTIVE").length || 0,
        openStores: shops?.filter((s) => s.status === "OPEN" && s.operational_status === "ACTIVE").length || 0,
        totalGtvMinor: (requests || []).filter((r) => r.payment_status === "PAID").reduce((sum, r) => sum + (r.amount_minor || 0), 0),
        allRequests: requests || [],
      };

      return json({ merchants: merchants || [], shops: shops || [], devices: devices || [], stats, recentActivity: [] }, 200, origin);
    }

    // Platform Admin Create Merchant
    if (request.method === "POST" && path === "/v1/admin/merchants") {
      adminAuth(request);
      const client = db();
      const body = await request.json();
      const { data: m, error: mErr } = await client.from("merchants").insert({
        name: body.name,
        slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        contact_email: body.contactEmail || "",
        contact_phone: body.contactPhone || "",
        status: "ACTIVE",
      }).select().single();
      if (mErr) throw mErr;
      return json(m, 201, origin);
    }

    // Platform Admin Create Store
    if (request.method === "POST" && path === "/v1/admin/stores") {
      adminAuth(request);
      const client = db();
      const body = await request.json();
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let storeCode = "";
      for (let i = 0; i < 5; i++) storeCode += chars[Math.floor(Math.random() * chars.length)];

      const slug = `${storeCode.toLowerCase()}-${body.displayName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
      const { data: shop, error: sErr } = await client.from("sprint_shops").insert({
        merchant_id: body.merchantId,
        store_code: storeCode,
        slug,
        display_name: body.displayName,
        address: body.address || "",
        city: body.city || "",
        status: "OPEN",
        operational_status: "ACTIVE",
        rates_json: body.rates || { A4_BW_SINGLE: 200, A4_BW_DUPLEX: 300, A4_COLOR_SINGLE: 1000, A4_COLOR_DUPLEX: 1500 },
        payment_settings_json: { onlineEnabled: true, payAtCounterEnabled: true, upiQrEnabled: true },
      }).select().single();
      if (sErr) throw sErr;

      await client.from("store_code_reservations").insert({ store_code: storeCode, shop_id: shop.id, merchant_id: body.merchantId });
      return json({ ...shop, canonicalUrl: `https://sprint.abh1.xyz/s/${storeCode}` }, 201, origin);
    }

    return error("Route not found.", 404, origin);
  } catch (caught) {
    const err = caught as Error;
    console.error(err);
    return error(err.message || "Sprint error.", 500, origin);
  }
});
