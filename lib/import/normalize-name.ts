export const namePrefixes = [
  "เด็กชาย",
  "เด็กหญิง",
  "นางสาว",
  "นาย",
  "น.ส.",
  "ด.ช.",
  "ด.ญ.",
] as const;
export function normalizeName(name: string) {
  const text = name.normalize("NFC").trim().replace(/\s+/g, " ");
  const prefix: (typeof namePrefixes)[number] | "" =
    namePrefixes.find((p) => text.startsWith(p)) ?? "";
  const parts = text.slice(prefix.length).trim().split(" ");
  return {
    prefix,
    first_name: parts[0] ?? "",
    last_name: parts.slice(1).join(" "),
  };
}
