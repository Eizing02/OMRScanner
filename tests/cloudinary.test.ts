import { afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  uploadOriginalLogo,
  cloudinaryConfigured,
} from "@/lib/cloudinary/upload";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("cancelled Cloudinary integration", () => {
  it("never uploads or reads keys even if legacy environment variables remain", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "unused-cloud");
    vi.stubEnv("CLOUDINARY_API_KEY", "unused-key");
    vi.stubEnv("CLOUDINARY_API_SECRET", "unused-secret");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(cloudinaryConfigured()).toBe(false);
    await expect(
      uploadOriginalLogo(new Blob(["unused"]), "school"),
    ).rejects.toMatchObject({ code: "CLOUDINARY_DISABLED", status: 410 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
