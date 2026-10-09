/** Only relative in-app destinations; never protocol-relative or escaped URLs. */
export function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return "/dashboard";
  try {
    const base = "https://scansob.netlify.app";
    const resolved = new URL(value, base);
    if (resolved.origin !== base || resolved.pathname.startsWith("/auth/") || resolved.pathname === "/login") return "/dashboard";
    return resolved.pathname + resolved.search;
  } catch { return "/dashboard"; }
}
