/** A missing room stays missing: ม.1 is never inferred to be ม.1/1. */
export function normalizeClassroom(value: string) {
  const text = value.normalize("NFC").trim().replace(/\s+/g, "");
  const match = /^(?:ม\.?|มัธยมศึกษาปีที่)([1-6])(?:\/0*([1-9][0-9]?))?$/.exec(
    text,
  );
  if (!match) return null;
  const grade_level = `ม.${match[1]}`;
  const room = match[2] ? Number(match[2]) : null;
  return {
    grade_level,
    room,
    classroom_name: room === null ? grade_level : `${grade_level}/${room}`,
  };
}

export function compareClassrooms(a: string, b: string) {
  const left = normalizeClassroom(a),
    right = normalizeClassroom(b);
  if (!left || !right) return a.localeCompare(b, "th", { numeric: true });
  return (
    Number(left.grade_level.slice(2)) - Number(right.grade_level.slice(2)) ||
    (left.room ?? 0) - (right.room ?? 0)
  );
}
