import { describe, expect, it } from "vitest";
import { decideRoute, safeNextPath } from "@/lib/auth/routes";

const url = (path: string) => {
  const u = new URL(path, "http://localhost");
  return { pathname: u.pathname, search: u.search, searchParams: u.searchParams };
};

describe("decideRoute (protected routes)", () => {
  const signedOut = { configured: true, signedIn: false };
  const signedIn = { configured: true, signedIn: true };

  it.each(["/dashboard", "/puzzles", "/puzzles/new", "/dictionary", "/settings", "/"])(
    "sends signed-out visitors from %s to login",
    (path) => {
      const decision = decideRoute(url(path), signedOut);
      expect(decision.type).toBe("redirect");
      expect(decision.type === "redirect" && decision.to.startsWith("/login")).toBe(true);
    },
  );

  it("remembers the requested page so login can return to it", () => {
    expect(decideRoute(url("/puzzles/abc/grid?tab=1"), signedOut)).toEqual({
      type: "redirect",
      to: `/login?next=${encodeURIComponent("/puzzles/abc/grid?tab=1")}`,
    });
  });

  it.each(["/login", "/forgot-password", "/auth/confirm"])("lets signed-out visitors open %s", (path) => {
    expect(decideRoute(url(path), signedOut)).toEqual({ type: "next" });
  });

  it("requires a recovery session for the reset-password page", () => {
    expect(decideRoute(url("/reset-password"), signedOut)).toEqual({
      type: "redirect",
      to: "/login?notice=reset-link-expired",
    });
    expect(decideRoute(url("/reset-password"), signedIn)).toEqual({ type: "next" });
  });

  it("sends signed-in users from login to the dashboard", () => {
    expect(decideRoute(url("/login"), signedIn)).toEqual({ type: "redirect", to: "/dashboard" });
  });

  it("shows the login page with an error for signed-in non-admins", () => {
    expect(decideRoute(url("/login?error=not-admin"), signedIn)).toEqual({ type: "next" });
  });

  it("lets signed-in users reach admin pages (the server still checks the admin role)", () => {
    expect(decideRoute(url("/dashboard"), signedIn)).toEqual({ type: "next" });
  });

  it("explains missing configuration instead of crashing", () => {
    const notConfigured = { configured: false, signedIn: false };
    expect(decideRoute(url("/login"), notConfigured)).toEqual({ type: "redirect", to: "/setup-required" });
    expect(decideRoute(url("/setup-required"), notConfigured)).toEqual({ type: "next" });
  });
});

describe("safeNextPath (open-redirect protection)", () => {
  it.each([
    ["/puzzles/abc/grid", "/puzzles/abc/grid"],
    ["/dictionary?q=WHALE", "/dictionary?q=WHALE"],
    [null, "/dashboard"],
    ["", "/dashboard"],
    ["https://evil.example", "/dashboard"],
    ["//evil.example", "/dashboard"],
    ["/\\evil.example", "/dashboard"],
    ["javascript:alert(1)", "/dashboard"],
    ["/login", "/dashboard"],
  ])("maps %s to %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
