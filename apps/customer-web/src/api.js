const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";
const configuredDemoMode = import.meta.env.VITE_DEMO_MODE;
const DEMO_MODE =
  configuredDemoMode === "true" ||
  (!configuredDemoMode &&
    (location.hostname === "sprint.abh1.xyz" ||
      location.hostname.endsWith(".vercel.app")));
const demoStorageKey = "sprint.hosted-demo.v1";

const demoShop = {
  id: "shop_demo",
  slug: "abh1-demo",
  displayName: "abh1 Print & Services",
  status: "OPEN",
  currency: "INR",
  services: [
    {
      id: "pan_assistance",
      name: "PAN application assistance",
      description:
        "Bring your documents and let the shop help prepare your application.",
      paymentTiming: "AT_COUNTER",
      priceMode: "FIXED",
      priceMinor: 9900,
      instructions:
        "The shop confirms the final documents and charge at the counter.",
      fields: [
        { id: "fullName", label: "Full name", type: "TEXT", required: true },
        { id: "phone", label: "Phone number", type: "TEXT", required: true },
        {
          id: "consent",
          label:
            "I understand this is merchant assistance, not an official service.",
          type: "CHECKBOX",
          required: true,
        },
      ],
    },
  ],
};

function readDemo() {
  try {
    return (
      JSON.parse(localStorage.getItem(demoStorageKey)) || {
        sequence: 4821,
        attachments: {},
        requests: {},
      }
    );
  } catch {
    return { sequence: 4821, attachments: {}, requests: {} };
  }
}
function writeDemo(state) {
  localStorage.setItem(demoStorageKey, JSON.stringify(state));
}
function demoError(message) {
  throw new Error(message);
}
function demoPages(range, total = 1) {
  if (!range || range === "all") return total;
  return (
    range.split(",").reduce((count, segment) => {
      const [first, last] = segment.trim().split("-").map(Number);
      return (
        count +
        (Number.isFinite(last)
          ? Math.max(0, last - first + 1)
          : Number.isFinite(first)
            ? 1
            : 0)
      );
    }, 0) || total
  );
}
function demoPrice(print, pages) {
  const base =
    print.colorMode === "COLOR"
      ? print.sides === "DUPLEX"
        ? 1500
        : 1000
      : print.sides === "DUPLEX"
        ? 300
        : 200;
  return base * pages * Math.max(1, Number(print.copies) || 1);
}

async function demoApi(path, { method, body, formData } = {}) {
  const state = readDemo();
  if (method === "POST" && path === "/v1/customer/sessions")
    return { token: `demo_${crypto.randomUUID()}` };
  if (method === "GET" && /^\/v1\/shops\/[^/]+$/.test(path))
    return { ...demoShop, slug: path.split("/").pop() };
  if (method === "POST" && path === "/v1/customer/attachments") {
    const file = formData?.get("file");
    if (!file) demoError("Choose a document to upload.");
    if (file.size > 20 * 1024 * 1024)
      demoError("Files must be 20 MB or smaller.");
    const attachment = {
      id: crypto.randomUUID(),
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      pageCount: 1,
    };
    state.attachments[attachment.id] = attachment;
    writeDemo(state);
    return attachment;
  }
  if (method === "POST" && path === "/v1/customer/requests") {
    if (!body?.type) demoError("Choose a supported request type.");
    const request = {
      id: crypto.randomUUID(),
      requestNumber: `S-${state.sequence++}`,
      type: body.type,
      currency: "INR",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (body.type === "PRINT") {
      const attachment = state.attachments[body.attachmentIds?.[0]];
      if (!attachment) demoError("Upload your document before continuing.");
      const selectedPageCount = demoPages(
        body.print?.pageRange,
        attachment.pageCount,
      );
      request.amountMinor = demoPrice(body.print || {}, selectedPageCount);
      request.state =
        body.paymentTiming === "AT_COUNTER" ? "SUBMITTED" : "AWAITING_PAYMENT";
      request.print = { ...body.print, selectedPageCount };
    } else if (body.type === "SERVICE") {
      const service = demoShop.services.find(
        (item) => item.id === body.serviceDefinitionId,
      );
      if (!service) demoError("This service is not available.");
      for (const field of service.fields.filter((field) => field.required))
        if (!body.fieldValues?.[field.id])
          demoError(`Complete ${field.label}.`);
      request.amountMinor = service.priceMinor;
      request.state =
        service.paymentTiming === "AT_COUNTER"
          ? "SUBMITTED"
          : "AWAITING_PAYMENT";
    } else demoError("This request type is not available.");
    state.requests[request.id] = request;
    writeDemo(state);
    return { request };
  }
  const requestMatch = path.match(
    /^\/v1\/customer\/requests\/([^/]+)(\/pay-development)?$/,
  );
  if (requestMatch) {
    const request = state.requests[requestMatch[1]];
    if (!request) demoError("Request not found.");
    if (method === "GET") return { request };
    if (method === "POST" && requestMatch[2]) {
      request.state = "SUBMITTED";
      request.paymentStatus = "PAID";
      request.updatedAt = new Date().toISOString();
      state.requests[request.id] = request;
      writeDemo(state);
      return { request };
    }
  }
  if (method === "GET" && path === "/v1/realtime/ticket")
    return { ticket: "hosted-demo", expiresInSeconds: 60 };
  demoError("This action is not available in the hosted demo.");
}

function failure(message, response) {
  const error = new Error(message);
  error.status = response?.status;
  return error;
}

export async function api(
  path,
  { method = "GET", sessionToken, idempotencyKey, body, formData } = {},
) {
  if (DEMO_MODE)
    return demoApi(path, {
      method,
      sessionToken,
      idempotencyKey,
      body,
      formData,
    });
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(sessionToken ? { "X-Sprint-Session": sessionToken } : {}),
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : formData,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw failure(
      data?.error?.message || "Sprint could not complete that action.",
      response,
    );
  return data;
}

export function newKey() {
  return crypto.randomUUID();
}
export { API_URL, DEMO_MODE };
