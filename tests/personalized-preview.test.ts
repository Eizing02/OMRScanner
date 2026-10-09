import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SheetContent } from "@/components/omr/omr-sheet-preview";
import { defaultLayout } from "@/lib/omr/generate-template";
describe("personalized OMR SVG", () => {
  it("marks exactly five ID bubbles solid black and leaves every answer blank", () => {
    const html = renderToStaticMarkup(
      createElement(SheetContent, {
        layout: defaultLayout,
        qr: "",
        student: {
          id: "student",
          student_code: "02074",
          full_name: "เด็กชายสมชาย ตัวอย่าง",
          classroom_name: "ม.3/1",
          number: null,
        },
      }),
    );
    expect(html).toContain("เด็กชายสมชาย ตัวอย่าง");
    const idCircles = html.match(/<circle[^>]*data-id-digit[^>]*>/g)!;
    expect(idCircles).toHaveLength(50);
    expect(
      idCircles.filter((circle) => circle.includes('fill="#000"')),
    ).toHaveLength(5);
    for (const [digit, value] of [..."02074"].entries())
      expect(
        idCircles.find(
          (circle) =>
            circle.includes(`data-id-digit="${digit}"`) &&
            circle.includes(`data-id-value="${value}"`),
        ),
      ).toContain('fill="#000"');
    expect(html.match(/data-question=/g)).toHaveLength(80);
    expect(html.match(/fill="white"/g)).toHaveLength(1);
    expect(html).not.toContain("เลขที่");
  });
  it("does not invent a student identity on blank or marked demo scans", () => {
    const html = renderToStaticMarkup(
      createElement(SheetContent, {
        layout: defaultLayout,
        qr: "",
        marked: [],
      }),
    );
    expect(html).not.toContain("04217");
    expect(html.match(/<circle[^>]*data-id-digit[^>]*fill="#000"/g)).toBeNull();
  });
});
