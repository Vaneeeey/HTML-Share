import { describe, expect, it } from "vitest";
import {
  createShareAccessToken,
  hashAccessPassword,
  verifyAccessPassword,
  verifyShareAccessToken,
} from "@/lib/access";

describe("share access passwords", () => {
  it("verifies a matching password and rejects an incorrect one", () => {
    const hash = hashAccessPassword("review-1234");

    expect(verifyAccessPassword("review-1234", hash)).toBe(true);
    expect(verifyAccessPassword("wrong-password", hash)).toBe(false);
  });

  it("invalidates access tokens when the page password hash changes", () => {
    process.env.APP_SECRET = "test-secret";
    const firstHash = hashAccessPassword("review-1234");
    const secondHash = hashAccessPassword("review-5678");
    const token = createShareAccessToken({ id: "page-1", accessPasswordHash: firstHash });

    expect(verifyShareAccessToken({ id: "page-1", accessPasswordHash: firstHash }, token)).toBe(true);
    expect(verifyShareAccessToken({ id: "page-1", accessPasswordHash: secondHash }, token)).toBe(false);
  });
});
