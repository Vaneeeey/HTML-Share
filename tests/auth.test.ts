import { describe, expect, it } from "vitest";
import {
  createAdminToken,
  createIdentityToken,
  verifyAdminToken,
  verifyIdentityToken,
} from "@/lib/auth";

function withAuthEnv(password: string, callback: () => void) {
  const originalSecret = process.env.APP_SECRET;
  const originalPassword = process.env.ADMIN_PASSWORD;

  process.env.APP_SECRET = "test-secret";
  process.env.ADMIN_PASSWORD = password;

  try {
    callback();
  } finally {
    process.env.APP_SECRET = originalSecret;
    process.env.ADMIN_PASSWORD = originalPassword;
  }
}

describe("admin auth tokens", () => {
  it("accepts tokens signed with the current admin password", () => {
    withAuthEnv("first-password", () => {
      const token = createAdminToken();

      expect(verifyAdminToken(token)).toBe(true);
    });
  });

  it("rejects existing tokens after the admin password changes", () => {
    withAuthEnv("first-password", () => {
      const token = createAdminToken();
      process.env.ADMIN_PASSWORD = "second-password";

      expect(verifyAdminToken(token)).toBe(false);
    });
  });
});

describe("identity tokens", () => {
  it("round-trips the signed display name", () => {
    withAuthEnv("admin-password", () => {
      const token = createIdentityToken("  Lin  ");

      expect(verifyIdentityToken(token)).toMatchObject({ identityId: expect.any(String), name: "Lin" });
    });
  });

  it("rejects tampered identity tokens", () => {
    withAuthEnv("admin-password", () => {
      const token = createIdentityToken("Lin");
      const [payload] = token.split(".");

      expect(verifyIdentityToken(`${payload}.bad-signature`)).toBeNull();
    });
  });
});
