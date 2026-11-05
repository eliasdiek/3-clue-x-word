"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LockKeyhole, LogIn, Mail } from "lucide-react";
import { signIn } from "@/lib/auth/actions";
import { LOGIN_NOTICES } from "@/lib/auth/messages";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordField, TextField } from "@/components/ui/text-field";

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const noticeKey = searchParams.get("error") ?? searchParams.get("notice");
  const notice = noticeKey ? LOGIN_NOTICES[noticeKey] : undefined;

  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", remember: true },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      // On success the server action redirects, so a result means failure.
      const result = await signIn(values, next);
      if (result.ok) return;
      if (result.formError) setFormError(result.formError);
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
        setError(field as keyof LoginInput, { message });
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" aria-describedby="login-heading">
      {notice && !formError ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {formError ? <Alert tone="error">{formError}</Alert> : null}

      <TextField
        label="Email address"
        type="email"
        autoComplete="username"
        inputMode="email"
        placeholder="name@example.com"
        icon={<Mail className="size-5" />}
        error={errors.email?.message}
        {...register("email")}
      />

      <PasswordField
        label="Password"
        autoComplete="current-password"
        placeholder="Your password"
        icon={<LockKeyhole className="size-5" />}
        error={errors.password?.message}
        {...register("password")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Checkbox label="Remember me" {...register("remember")} />
        <Link
          href="/forgot-password"
          className="rounded text-base font-bold text-brand underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
      </div>

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={pending}
        loadingText="Logging in…"
        icon={<LogIn aria-hidden className="size-5" />}
      >
        Log In
      </Button>
    </form>
  );
}
