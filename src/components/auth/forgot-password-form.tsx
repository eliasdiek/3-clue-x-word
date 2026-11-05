"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { requestPasswordReset } from "@/lib/auth/actions";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

export function ForgotPasswordForm() {
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const response = await requestPasswordReset(values);
      if (response.ok) {
        setResult({ tone: "success", text: response.message ?? "Check your inbox." });
        return;
      }
      if (response.formError) setResult({ tone: "error", text: response.formError });
      if (response.fieldErrors?.email) setError("email", { message: response.fieldErrors.email });
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {result ? <Alert tone={result.tone}>{result.text}</Alert> : null}

      <TextField
        label="Email address"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="name@example.com"
        icon={<Mail className="size-5" />}
        error={errors.email?.message}
        {...register("email")}
      />

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={pending}
        loadingText="Sending…"
        icon={<Send aria-hidden className="size-5" />}
      >
        Send reset link
      </Button>

      <Link
        href="/login"
        className="inline-flex items-center justify-center gap-2 rounded text-base font-bold text-brand hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Back to login
      </Link>
    </form>
  );
}
