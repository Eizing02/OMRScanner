import { afterEach, describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/api", () => ({
  ApiError: class extends Error {
    constructor(
      public code: string,
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));
import { uploadOriginalLogo } from "@/lib/cloudinary/upload";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("server-side original logo upload (mocked external service)", () => {
  it("fails clearly when Cloudinary is not configured", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "");
    await expect(
      uploadOriginalLogo(new Blob(["unused"]), "school"),
    ).rejects.toMatchObject({ code: "CLOUDINARY_NOT_CONFIGURED", status: 503 });
  });
  it("signs on server, preserves file bytes, avoids incoming transforms and delivers originals", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "test-cloud");
    vi.stubEnv("CLOUDINARY_API_KEY", "test-key");
    vi.stubEnv("CLOUDINARY_API_SECRET", "test-secret-not-real");
    const bytes = await readFile("public/omr-assets/school-logo.png");
    const school = "20000000-0000-4000-8000-000000000001";
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      expect(url).toBe(
        "https://api.cloudinary.com/v1_1/test-cloud/image/upload",
      );
      const form = init.body as FormData;
      expect(
        Buffer.from(await (form.get("file") as File).arrayBuffer()),
      ).toEqual(bytes);
      expect(form.has("transformation")).toBe(false);
      expect(form.has("upload_preset")).toBe(false);
      expect(form.get("overwrite")).toBe("false");
      const signature = createHash("sha1")
        .update(
          `overwrite=false&public_id=${form.get("public_id")}&timestamp=${form.get("timestamp")}test-secret-not-real`,
        )
        .digest("hex");
      expect(form.get("signature")).toBe(signature);
      return Response.json({
        public_id: form.get("public_id"),
        version: 42,
        format: "png",
      });
    });
    const uploaded = await uploadOriginalLogo(new Blob([bytes]), school);
    expect(uploaded.image_url).toMatch(
      /^https:\/\/res.cloudinary.com\/test-cloud\/image\/upload\/fl_original\/v42\/school-logos\//,
    );
    expect(JSON.stringify(uploaded)).not.toContain("test-secret");
  });
});
