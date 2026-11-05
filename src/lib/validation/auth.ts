import { z } from "zod";

/** Shared by the browser forms and the server actions (validated on both). */

const email = z
  .string()
  .trim()
  .min(1, "Please enter your email address.")
  .pipe(z.email("Please enter a valid email address, like name@example.com."));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Please enter your password.").max(256, "That password is too long."),
  remember: z.boolean(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const PASSWORD_MIN_LENGTH = 10;

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
      .max(72, "Use 72 characters or fewer."),
    confirmPassword: z.string().min(1, "Please type the new password again."),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "The two passwords do not match.",
    path: ["confirmPassword"],
  });
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;

/** Result returned by auth server actions to the forms. */
export type ActionResult<TField extends string = string> =
  | { ok: true; message?: string }
  | { ok: false; formError?: string; fieldErrors?: Partial<Record<TField, string>> };

export function fieldErrorsFrom<T extends string>(error: z.ZodError): Partial<Record<T, string>> {
  const result: Partial<Record<T, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in result)) result[key as T] = issue.message;
  }
  return result;
}
