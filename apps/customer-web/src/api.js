const API_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export function newKey() {
  return crypto.randomUUID();
}

async function request(path, { method = "GET", token, adminToken, deviceToken, body, formData, idempotencyKey } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["X-Sprint-Session"] = token;
  if (adminToken) headers["X-Admin-Token"] = adminToken;
  if (deviceToken) headers["X-Sprint-Device"] = deviceToken;
  if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;

  const url = `${API_URL}${path}`;
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : formData,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || `Request failed with status ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

// Store & Public
export async function lookupStore(code) {
  return request(`/v1/stores/lookup?code=${encodeURIComponent(code)}`);
}

export async function fetchShop(identifier) {
  return request(`/v1/shops/${encodeURIComponent(identifier)}`);
}

// Customer
export async function createCustomerSession() {
  return request("/v1/customer/sessions", { method: "POST" });
}

export async function uploadAttachment(file, storeCode, sessionToken) {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("storeCode", storeCode);
  return request("/v1/customer/attachments", {
    method: "POST",
    token: sessionToken,
    formData,
  });
}

export async function createCustomerRequest(body, sessionToken, idempotencyKey = newKey()) {
  return request("/v1/customer/requests", {
    method: "POST",
    token: sessionToken,
    idempotencyKey,
    body,
  });
}

export async function fetchCustomerRequest(requestId, sessionToken) {
  return request(`/v1/customer/requests/${encodeURIComponent(requestId)}`, {
    token: sessionToken,
  });
}

export async function fetchCustomerRequests(sessionToken) {
  return request("/v1/customer/requests", { token: sessionToken });
}

export async function payDevelopment(requestId, sessionToken, idempotencyKey = newKey()) {
  return request(`/v1/customer/requests/${encodeURIComponent(requestId)}/pay-development`, {
    method: "POST",
    token: sessionToken,
    idempotencyKey,
  });
}

export async function payCounter(requestId, sessionToken) {
  return request(`/v1/customer/requests/${encodeURIComponent(requestId)}/pay-counter`, {
    method: "POST",
    token: sessionToken,
  });
}

export async function respondToQuote(requestId, quoteId, action, sessionToken) {
  return request(`/v1/customer/requests/${encodeURIComponent(requestId)}/quotes/${encodeURIComponent(quoteId)}`, {
    method: "POST",
    token: sessionToken,
    body: { action },
  });
}

// Platform Admin
export async function fetchAdminOverview(adminToken) {
  return request("/v1/admin/overview", { adminToken });
}

export async function createAdminMerchant(body, adminToken) {
  return request("/v1/admin/merchants", { method: "POST", adminToken, body });
}

export async function createAdminStore(body, adminToken) {
  return request("/v1/admin/stores", { method: "POST", adminToken, body });
}

export async function updateAdminStoreStatus(storeId, operationalStatus, adminToken) {
  return request(`/v1/admin/stores/${encodeURIComponent(storeId)}`, {
    method: "PATCH",
    adminToken,
    body: { operationalStatus },
  });
}

export async function revokeAdminDevice(deviceId, adminToken) {
  return request(`/v1/admin/devices/${encodeURIComponent(deviceId)}/revoke`, {
    method: "POST",
    adminToken,
  });
}

// Merchant & Devices
export async function fetchMerchantStores(merchantToken) {
  return request("/v1/merchant/stores", { token: merchantToken });
}

export async function updateMerchantStore(storeId, body, merchantToken) {
  return request(`/v1/merchant/stores/${encodeURIComponent(storeId)}`, {
    method: "PATCH",
    token: merchantToken,
    body,
  });
}

export async function fetchMerchantRequests(deviceToken) {
  return request("/v1/merchant/requests", { deviceToken });
}

export async function transitionMerchantRequest(requestId, state, deviceToken) {
  return request(`/v1/merchant/requests/${encodeURIComponent(requestId)}/transition`, {
    method: "POST",
    deviceToken,
    body: { state },
  });
}

export async function transitionMerchantItem(requestId, itemId, status, deviceToken) {
  return request(`/v1/merchant/requests/${encodeURIComponent(requestId)}/items/${encodeURIComponent(itemId)}/transition`, {
    method: "POST",
    deviceToken,
    body: { status },
  });
}

export async function proposeMerchantQuote(requestId, body, deviceToken) {
  return request(`/v1/merchant/requests/${encodeURIComponent(requestId)}/quotes`, {
    method: "POST",
    deviceToken,
    body,
  });
}

export async function requestDevicePairing(name = "Sprint Windows Terminal") {
  return request("/v1/merchant/devices/pair-request", {
    method: "POST",
    body: { name },
  });
}

export async function confirmDevicePairing(pairingCode, storeId, merchantToken) {
  return request("/v1/merchant/devices/pair-confirm", {
    method: "POST",
    token: merchantToken,
    body: { pairingCode, storeId },
  });
}

export async function pollDevicePairing(pairingCode) {
  return request("/v1/merchant/devices/pair-poll", {
    method: "POST",
    body: { pairingCode },
  });
}

export async function saveMerchantProduct(storeId, product, merchantToken) {
  return request(`/v1/merchant/stores/${encodeURIComponent(storeId)}/products`, {
    method: "POST",
    token: merchantToken,
    body: product,
  });
}

export { API_URL };
