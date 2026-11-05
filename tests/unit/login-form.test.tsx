// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/auth/login-form";
import { AUTH_ERRORS } from "@/lib/auth/messages";

const signIn = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("@/lib/auth/actions", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => searchParams }));

beforeEach(() => {
  signIn.mockReset();
  searchParams = new URLSearchParams();
});

describe("LoginForm", () => {
  it("shows every element from the design", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument();
    expect(screen.getByLabelText("Remember me")).toBeChecked();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.getByRole("button", { name: "Log In" })).toBeInTheDocument();
  });

  it("validates before contacting the server", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email address"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Log In" }));

    expect(await screen.findByText(/valid email address/)).toBeInTheDocument();
    expect(screen.getByText("Please enter your password.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveAttribute("aria-invalid", "true");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("submits credentials with remember-me and the return path", async () => {
    searchParams = new URLSearchParams({ next: "/dictionary" });
    signIn.mockResolvedValue({ ok: false, formError: AUTH_ERRORS.invalidCredentials });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email address"), " john@example.com ");
    await user.type(screen.getByLabelText("Password"), "wrong password");
    await user.click(screen.getByLabelText("Remember me"));
    await user.click(screen.getByRole("button", { name: "Log In" }));

    expect(signIn).toHaveBeenCalledWith(
      { email: "john@example.com", password: "wrong password", remember: false },
      "/dictionary",
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(AUTH_ERRORS.invalidCredentials);
  });

  it("shows notices passed in the URL", () => {
    searchParams = new URLSearchParams({ notice: "signed-out" });
    render(<LoginForm />);
    expect(screen.getByRole("status")).toHaveTextContent("You have been logged out safely.");
  });
});
