"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { updatePassword } from "@/lib/auth/actions";
import { newPasswordSchema, PASSWORD_MIN_LENGTH, type NewPasswordInput } from "@/lib/validation/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/text-field";

/**
 * Used after a password-reset link (afterReset: signs out and returns to
 * login) and on the Account page (stays signed in).
 */
export function NewPasswordForm({ afterReset = false }: { afterReset?: boolean }) {
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<NewPasswordInput>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const response = await updatePassword(values, { afterReset });
      if (response.ok) {
        reset();
        setResult({ tone: "success", text: response.message ?? "Password changed." });
        return;
      }
      if (response.formError) setResult({ tone: "error", text: response.formError });
      for (const [field, message] of Object.entries(response.fieldErrors ?? {})) {
        setError(field as keyof NewPasswordInput, { message });
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {result ? <Alert tone={result.tone}>{result.text}</Alert> : null}

      <PasswordField
        label="New password"
        autoComplete="new-password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short sentence is easy to remember.`}
        error={errors.password?.message}
        {...register("password")}
      />
      <PasswordField
        label="Type the new password again"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      <Button
        type="submit"
        size="lg"
        fullWidth={afterReset}
        loading={pending}
        loadingText="Saving…"
        icon={<KeyRound aria-hidden className="size-5" />}
      >
        {afterReset ? "Save new password" : "Change password"}
      </Button>
    </form>
  );
}
