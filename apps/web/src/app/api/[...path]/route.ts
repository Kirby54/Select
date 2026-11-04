/**
 * Same-origin proxy to the Select API. The target is read at request time from
 * SELECT_API_URL, so one built image works in any environment.
 */
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const API = process.env.SELECT_API_URL ?? "http://127.0.0.1:8000";
// The session cookie and the anti-forgery header must reach the API; nothing else is needed.
const FORWARDED = ["authorization", "content-type", "accept", "cookie", "x-select-csrf", "user-agent"];

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const url = new URL(`/api/${path.map(encodeURIComponent).join("/")}`, API);
  url.search = request.nextUrl.search;
  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const hasBody = !["GET", "HEAD"].includes(request.method);
  try {
    const upstream = await fetch(url, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    const responseHeaders = new Headers();
    for (const name of ["content-type", "content-disposition"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    // Sign-in and sign-out set or clear the session cookie; pass each Set-Cookie through unchanged.
    for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append("set-cookie", cookie);
    responseHeaders.set("cache-control", "no-store");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json(
      { detail: "The Select API is not reachable. Check that the api service is running.", code: "backend_unreachable" },
      { status: 502 },
    );
  }
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
