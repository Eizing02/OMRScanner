export function attendanceDestinationLabel(label: string) {
  const name = label.trim();
  return !name || name.toLowerCase() === "mathquest" ? "ระบบเช็คชื่อ" : label;
}
