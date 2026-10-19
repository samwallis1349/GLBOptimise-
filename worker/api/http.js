/** Response helpers shared by the /api/v1 handlers. */

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-filename',
  'Access-Control-Expose-Headers': 'Content-Disposition, X-AssetBench-Summary, X-Quota-Remaining, X-Quota-Limit, X-Quota-Reset, Retry-After',
};

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function quotaHeaders(quota) {
  if (!quota || quota.limit == null) return {};
  const headers = {
    'X-Quota-Limit': String(quota.limit),
    'X-Quota-Remaining': String(quota.remaining),
  };
  if (quota.resetsAt) headers['X-Quota-Reset'] = String(quota.resetsAt);
  return headers;
}

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS, ...extraHeaders },
  });
}

export function errorResponse(err) {
  if (err instanceof ApiError) {
    const extra = {};
    if (err.status === 429 && err.details?.limit != null) {
      Object.assign(extra, quotaHeaders(err.details));
      if (err.details.resetsAt) {
        const retrySec = Math.max(1, Math.ceil((Date.parse(err.details.resetsAt) - Date.now()) / 1000));
        if (Number.isFinite(retrySec)) extra['Retry-After'] = String(retrySec);
      }
    }
    return json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } }, err.status, extra);
  }
  console.error('[api/v1] unhandled', err);
  return json({ error: { code: 'internal_error', message: 'Processing failed unexpectedly.' } }, 500);
}

/** JSON in a header must be ASCII: escape everything outside it. */
export function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function fileResponse(bytes, { filename, contentType, summary, quota }) {
  const headers = {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${filename.replace(/[^\w.-]+/g, '_')}"`,
    'Cache-Control': 'no-store',
    ...CORS_HEADERS,
    ...quotaHeaders(quota),
  };
  if (summary) headers['X-AssetBench-Summary'] = asciiJson(summary);
  return new Response(bytes, { status: 200, headers });
}

export function toBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
