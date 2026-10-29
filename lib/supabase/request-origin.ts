import "server-only";

function netlifyPublicOrigins(): string[] {
  // URL/SITE_ID/SITE_NAME are read-only Netlify runtime metadata. Request
  // headers cannot add an origin to this list. Do not allow *.netlify.app.
  if (!process.env.SITE_ID || !process.env.URL) return [];
  try {
    const url = new URL(process.env.URL);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return [];
    const origins = [url.origin];
    const name = process.env.SITE_NAME;
    if (name && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name))
      origins.push(`https://${name}.netlify.app`);
    return [...new Set(origins)];
  } catch {
    return [];
  }
}

export function isRequestOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  // Retain compatibility for non-browser/legacy clients; session and workspace
  // authorization are still mandatory in the calling routes.
  if (origin === null) return true;
  return [new URL(request.url).origin, ...netlifyPublicOrigins()].includes(
    origin,
  );
}

export function publicRequestOrigin(request: Request): string {
  const origins = netlifyPublicOrigins();
  if (!origins.length) return new URL(request.url).origin;
  // Honor a known entry domain for OAuth cookies. An arbitrary Host or
  // X-Forwarded-Host must never become a redirect destination.
  for (const name of ["x-forwarded-host", "host"]) {
    const host = request.headers.get(name)?.toLowerCase();
    const match = origins.find((origin) => new URL(origin).host === host);
    if (match) return match;
  }
  // The Next adapter may report the immutable deploy hostname internally.
  return origins[0];
}
