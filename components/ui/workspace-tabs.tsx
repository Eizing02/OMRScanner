"use client";
export function WorkspaceTabs({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (value: string) => void;
  items: { id: string; label: string }[];
}) {
  return (
    <div
      className="workspace-tabs"
      role="group"
      aria-label="ส่วนของพื้นที่ทำงาน"
    >
      {items.map((item) => (
        <button
          key={item.id}
          className={value === item.id ? "active" : ""}
          aria-pressed={value === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
