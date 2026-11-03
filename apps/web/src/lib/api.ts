/** Typed fetch wrapper. Every failure becomes an ApiError with a human message. */

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly fields: FieldError[] = [],
    public readonly current: unknown = undefined,
    public readonly code: string | undefined = undefined,
  ) {
    super(message);
    this.name = "ApiError";
  }
  get isConflict() {
    return this.status === 409;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isUnreachable() {
    return this.status === 0 || this.status === 502 || this.status === 503;
  }
}

const TOKEN_KEY = "select.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: the token simply is not remembered.
  }
}

type Json = Record<string, unknown> | unknown[] | null;

export async function api<T>(path: string, init: { method?: string; body?: Json; query?: Record<string, unknown> } = {}): Promise<T> {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, String(v)));
    else url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = { accept: "application/json" };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError("Cannot reach Select. Check your connection, then retry.", 0);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (!response.ok) {
    const body = (data ?? {}) as { detail?: unknown; fields?: FieldError[]; code?: string };
    let message = "Something went wrong.";
    let current: unknown;
    if (typeof body.detail === "string") message = body.detail;
    else if (body.detail && typeof body.detail === "object") {
      const detail = body.detail as { message?: string; current?: unknown };
      message = detail.message ?? message;
      current = detail.current;
    }
    if (response.status === 401) message = "You are not signed in. Paste an API token in Settings.";
    throw new ApiError(message, response.status, body.fields ?? [], current, body.code);
  }
  return data as T;
}

export const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Unexpected error.";
