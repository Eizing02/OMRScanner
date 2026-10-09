import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import {
  normalizeClassroom,
  compareClassrooms,
} from "@/lib/import/normalize-classroom";
import { previewStudents, inferMapping } from "@/lib/import/parse-students";
import { studentSchema } from "@/types/student";
import { inspectLogo } from "@/lib/omr/logo-image";
import { layoutSchema, defaultLayout } from "@/lib/omr/generate-template";

describe("three-column roster", () => {
  it("auto-maps the agreed Thai headers and retains prefixes/zeroes", () => {
    const row = {
      รหัสประจำตัว: "02074",
      "ชื่อ-สกุล": " เด็กชายกิตติกร   ตัวอย่าง ",
      ชั้น: " ม. 1 / 02 ",
    };
    const [item] = previewStudents([row], inferMapping(Object.keys(row)));
    expect(item.errors).toEqual([]);
    expect(item.data).toMatchObject({
      student_code: "02074",
      prefix: "เด็กชาย",
      full_name: "เด็กชายกิตติกร ตัวอย่าง",
      classroom_name: "ม.1/2",
      grade_level: "ม.1",
      room: 2,
      number: null,
    });
  });
  it("supports all seven prefixes and legacy split names", () => {
    for (const prefix of [
      "เด็กชาย",
      "เด็กหญิง",
      "นาย",
      "นางสาว",
      "น.ส.",
      "ด.ช.",
      "ด.ญ.",
    ]) {
      const row = {
        รหัสนักเรียน: "00001",
        ชื่อ: `${prefix}กิตติกร`,
        สกุล: "ตัวอย่าง",
        ชั้น: "ม.2",
        เลขที่: "",
      };
      const [item] = previewStudents([row], inferMapping(Object.keys(row)));
      expect(item.errors).toEqual([]);
      expect(item.data.prefix).toBe(prefix);
      expect(item.data.number).toBeNull();
    }
  });
  it("flags BOTH duplicate rows, missing surname and short codes", () => {
    const mapping = inferMapping(["id", "name", "grade"]);
    const items = previewStudents(
      [
        { id: "00001", name: "นายก ข", grade: "ม.1" },
        { id: "00001", name: "นายค ง", grade: "ม.1" },
      ],
      mapping,
    );
    expect(items.every((i) => i.errors.join().includes("รหัสซ้ำ"))).toBe(true);
    expect(
      previewStudents([{ id: 2074, name: "ก", grade: "ม.7" }], mapping)[0]
        .errors.length,
    ).toBe(3);
  });
  it("normalizes levels 1–6 and sorts nullable rooms without inventing a room", () => {
    for (let grade = 1; grade <= 6; grade++) {
      expect(normalizeClassroom(`ม.${grade}`)?.room).toBeNull();
      expect(normalizeClassroom(`ม.${grade}/2`)?.room).toBe(2);
    }
    for (const value of [
      "ม.0",
      "ม.7",
      "ม.1/0",
      "ม.1/-1",
      "ม.1/100",
      "ม.1/2abc",
      "",
    ])
      expect(normalizeClassroom(value)).toBeNull();
    expect(["ม.2/1", "ม.1/2", "ม.1", "ม.1/1"].sort(compareClassrooms)).toEqual([
      "ม.1",
      "ม.1/1",
      "ม.1/2",
      "ม.2/1",
    ]);
  });
  it("validates server inputs too and derives metadata instead of trusting it", () => {
    const parsed = studentSchema.parse({
      student_code: "00001",
      first_name: "มณี",
      last_name: "ตัวอย่าง",
      prefix: "ด.ญ.",
      classroom_name: "ม1/2",
      grade_level: "ม.6",
      room: 9,
      password: "IGNORE",
    });
    expect(parsed).toMatchObject({
      grade_level: "ม.1",
      room: 2,
      full_name: "ด.ญ.มณี ตัวอย่าง",
    });
    expect(parsed).not.toHaveProperty("password");
  });
});
describe("current-term four-column roster", () => {
  it("maps the supplied header format and retains names, prefixes and zeroes", () => {
    const row = {
      รหัสประจำตัว: "00007",
      ชื่อ: "เด็กชายกิตติกร",
      นามสกุล: "ตัวอย่าง",
      ระดับชั้น: "ม.1/1",
    };
    const mapping = inferMapping(Object.keys(row));
    expect(mapping).toMatchObject({
      student_code: "รหัสประจำตัว",
      first_name: "ชื่อ",
      last_name: "นามสกุล",
      classroom_name: "ระดับชั้น",
      full_name: "",
      number: "",
    });
    const [item] = previewStudents([row], mapping);
    expect(item.errors).toEqual([]);
    expect(item.data).toMatchObject({
      student_code: "00007",
      prefix: "เด็กชาย",
      first_name: "กิตติกร",
      last_name: "ตัวอย่าง",
      full_name: "เด็กชายกิตติกร ตัวอย่าง",
      classroom_name: "ม.1/1",
      grade_level: "ม.1",
      room: 1,
      number: null,
    });
  });
  it("keeps unsuffixed classes and detects invalid or duplicate four-column rows", () => {
    const mapping = inferMapping([
      "รหัสประจำตัว",
      "ชื่อ",
      "นามสกุล",
      "ระดับชั้น",
    ]);
    const make = (code: string, classroom: string) => ({
      รหัสประจำตัว: code,
      ชื่อ: "นางสาวมณี",
      นามสกุล: "ตัวอย่าง",
      ระดับชั้น: classroom,
    });
    const [valid] = previewStudents([make("02074", "ม.6")], mapping);
    expect(valid.errors).toEqual([]);
    expect(valid.data.room).toBeNull();
    const invalid = previewStudents(
      [make("00007", "ม.1"), make("00007", "ม.1/2"), make("1234", "ม.7")],
      mapping,
    );
    expect(invalid[0].errors.join()).toContain("รหัสซ้ำ");
    expect(invalid[1].errors.join()).toContain("รหัสซ้ำ");
    expect(invalid[2].errors).toHaveLength(2);
    expect(invalid[2].data.student_code).toBe("1234");
  });
});
describe("original logo", () => {
  it("ships the supplied logo at its original resolution", async () => {
    expect(
      inspectLogo(
        new Uint8Array(await readFile("public/omr-assets/school-logo.png")),
      ),
    ).toEqual({ width: 742, height: 763, format: "PNG" });
  });
  it("rejects non-images, huge decoded dimensions and arbitrary remote URLs", () => {
    expect(() =>
      inspectLogo(new TextEncoder().encode("<svg></svg>")),
    ).toThrow();
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    bytes.set([73, 72, 68, 82], 12);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 10000);
    view.setUint32(20, 10000);
    expect(() => inspectLogo(bytes)).toThrow();
    expect(
      layoutSchema.safeParse({
        ...defaultLayout,
        logo: "https://example.com/logo.svg",
      }).success,
    ).toBe(false);
  });
});
