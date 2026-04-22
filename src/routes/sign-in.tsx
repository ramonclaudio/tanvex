import { api } from "@convex/_generated/api"
import {
  isReservedUsername,
  isValidUsernameFormat,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from "@convex/constants"
import Camera01Icon from "@hugeicons/core-free-icons/Camera01Icon"
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon"
import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon"
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useForm } from "@tanstack/react-form"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useConvexAuth,
  useMutation,
} from "convex/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { z } from "zod"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

const signInEmailSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
})

const signInUsernameSchema = z.object({
  username: z
    .string()
    .min(USERNAME_MIN_LENGTH, `Username must be at least ${USERNAME_MIN_LENGTH} characters.`),
  password: z.string().min(8, "Password must be at least 8 characters."),
})

const emailOnlySchema = z.object({
  email: z.string().email("Please enter a valid email address."),
})

const otpSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your email."),
})

const resetPasswordSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
})

const signUpSchema = z.object({
  name: z.string().min(1, "Name is required."),
  username: z
    .string()
    .refine(
      (val) => val === "" || isValidUsernameFormat(val),
      `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters, letters, numbers, underscores, and dots only.`,
    )
    .refine(
      (val) => val === "" || !isReservedUsername(val),
      "This username is reserved and cannot be used.",
    ),
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
})

type AuthSearchParams = { redirect?: string }

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>): AuthSearchParams => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: ({ context, search }) => {
    if (context.isAuthenticated) {
      throw redirect({ to: search.redirect ?? "/" })
    }
  },
  component: SignInPage,
})

type AuthPhase =
  | { kind: "default" }
  | { kind: "verify-signup"; email: string }
  | { kind: "otp-sign-in"; email: string }
  | { kind: "reset-request" }
  | { kind: "reset-verify"; email: string }

function SignInPage() {
  // Phase lives on the page, not inside <Unauthenticated>, because that boundary
  // unmounts its children every time the Convex websocket revalidates auth.
  const [phase, setPhase] = useState<AuthPhase>({ kind: "default" })
  const { redirect: redirectTo } = Route.useSearch()
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useConvexAuth()

  // Any successful auth flip (password, OTP, email verify, auto-sign-in after
  // verification) while the page is mounted. `beforeLoad` only redirects on
  // fresh navigations, so this effect handles the in-session transition.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      void navigate({ to: redirectTo ?? "/" })
    }
  }, [isLoading, isAuthenticated, redirectTo, navigate])

  const resetToDefault = useCallback(() => setPhase({ kind: "default" }), [])

  // OTP forms render ABOVE the auth boundaries. Better Auth triggers a
  // /get-session refetch right after signUp.email resolves; that refetch flips
  // isLoading true while data is still null, which would unmount <Unauthenticated>
  // and drop the user back onto the sign-in form mid-flow.
  if (phase.kind !== "default") {
    return (
      <main
        id="main"
        className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-sm flex-col gap-6 px-6 py-16 sm:py-24"
      >
        <OTPFlows phase={phase} setPhase={setPhase} resetToSignIn={resetToDefault} />
      </main>
    )
  }

  return (
    <main
      id="main"
      className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-sm flex-col gap-6 px-6 py-16 sm:py-24"
    >
      <AuthLoading>
        <Spinner />
      </AuthLoading>

      <Authenticated>
        <Spinner />
      </Authenticated>

      <Unauthenticated>
        <UnauthedView setPhase={setPhase} />
      </Unauthenticated>
    </main>
  )
}

function Spinner() {
  return (
    <div className="flex justify-center pt-8">
      <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-6 animate-spin" />
    </div>
  )
}

function UnauthedView({ setPhase }: { setPhase: (phase: AuthPhase) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [signInMethod, setSignInMethod] = useState<"email" | "username" | "otp">("email")
  const [serverError, setServerError] = useState("")

  const [isCheckingUsername, setIsCheckingUsername] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const usernameCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const generateUploadUrl = useMutation(api.users.generateAvatarUploadUrl)
  const updateAvatar = useMutation(api.users.updateAvatar)

  const checkUsernameAvailability = useCallback(async (username: string) => {
    if (!username || !isValidUsernameFormat(username)) {
      setUsernameAvailable(null)
      return
    }
    if (isReservedUsername(username)) {
      setUsernameAvailable(false)
      return
    }
    setIsCheckingUsername(true)
    try {
      const result = await authClient.isUsernameAvailable({ username })
      if (result.data) setUsernameAvailable(result.data.available)
    } catch {
      setUsernameAvailable(null)
    } finally {
      setIsCheckingUsername(false)
    }
  }, [])

  const handleUsernameChange = useCallback(
    (username: string) => {
      setUsernameAvailable(null)
      if (usernameCheckTimeoutRef.current) clearTimeout(usernameCheckTimeoutRef.current)
      if (username && isValidUsernameFormat(username)) {
        if (isReservedUsername(username)) {
          setUsernameAvailable(false)
          return
        }
        usernameCheckTimeoutRef.current = setTimeout(() => checkUsernameAvailability(username), 500)
      }
    },
    [checkUsernameAvailability],
  )

  useEffect(() => {
    return () => {
      if (usernameCheckTimeoutRef.current) clearTimeout(usernameCheckTimeoutRef.current)
    }
  }, [])

  const signInEmailForm = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: signInEmailSchema },
    onSubmit: async ({ value }) => {
      setServerError("")
      try {
        const result = await authClient.signIn.email({
          email: value.email,
          password: value.password,
        })
        if (result.error) {
          // Unverified account: auto-resend OTP and jump to verify step.
          // autoSignInAfterVerification on the server finishes the flow.
          if (result.error.code === "EMAIL_NOT_VERIFIED") {
            await authClient.emailOtp.sendVerificationOtp({
              email: value.email,
              type: "email-verification",
            })
            setPhase({ kind: "verify-signup", email: value.email })
            return
          }
          setServerError(result.error.message || "Sign in failed")
        }
      } catch {
        setServerError("An error occurred during sign in")
      }
    },
  })

  const signInOtpEmailForm = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: emailOnlySchema },
    onSubmit: async ({ value }) => {
      setServerError("")
      try {
        const result = await authClient.emailOtp.sendVerificationOtp({
          email: value.email,
          type: "sign-in",
        })
        if (result.error) {
          setServerError(result.error.message || "Could not send code")
          return
        }
        setPhase({ kind: "otp-sign-in", email: value.email })
      } catch {
        setServerError("An error occurred while sending the code")
      }
    },
  })

  const signInUsernameForm = useForm({
    defaultValues: { username: "", password: "" },
    validators: { onSubmit: signInUsernameSchema },
    onSubmit: async ({ value }) => {
      setServerError("")
      try {
        const result = await authClient.signIn.username({
          username: value.username,
          password: value.password,
        })
        if (result.error) setServerError(result.error.message || "Sign in failed")
      } catch {
        setServerError("An error occurred during sign in")
      }
    },
  })

  const signUpForm = useForm({
    defaultValues: { name: "", username: "", email: "", password: "" },
    validators: { onSubmit: signUpSchema },
    onSubmit: async ({ value }) => {
      setServerError("")
      try {
        const result = await authClient.signUp.email({
          email: value.email,
          password: value.password,
          name: value.name,
          ...(value.username && { username: value.username }),
        })
        if (result.error) {
          setServerError(result.error.message || "Sign up failed")
          return
        }

        if (avatarFile) {
          try {
            const uploadUrl = await generateUploadUrl()
            const uploadResult = await fetch(uploadUrl, {
              method: "POST",
              headers: { "Content-Type": avatarFile.type },
              body: avatarFile,
            })
            if (uploadResult.ok) {
              const { storageId } = await uploadResult.json()
              await updateAvatar({ storageId })
            }
          } catch {
            console.error("Failed to upload avatar during sign-up")
          }
        }

        setPhase({ kind: "verify-signup", email: value.email })
      } catch {
        setServerError("An error occurred during sign up")
      }
    },
  })

  const activeForm =
    mode === "signup"
      ? signUpForm
      : signInMethod === "email"
        ? signInEmailForm
        : signInMethod === "username"
          ? signInUsernameForm
          : signInOtpEmailForm

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setServerError("Please select an image file")
      return
    }
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      setServerError("Image must be less than 5MB")
      return
    }
    setAvatarFile(file)
    setServerError("")
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === "string") setAvatarPreview(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const clearAvatar = () => {
    setAvatarFile(null)
    setAvatarPreview(null)
    if (avatarInputRef.current) avatarInputRef.current.value = ""
  }

  const handleModeChange = (next: "signin" | "signup") => {
    setMode(next)
    setServerError("")
    setUsernameAvailable(null)
    if (next === "signin") clearAvatar()
  }

  const handleSignInMethodChange = (method: "email" | "username" | "otp") => {
    setSignInMethod(method)
    setServerError("")
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void activeForm.handleSubmit()
      }}
    >
      <FieldSet>
        <FieldLegend>{mode === "signin" ? "Sign in" : "Create your account"}</FieldLegend>
        <FieldDescription>
          {mode === "signin"
            ? "Enter your credentials to access your account."
            : "A verification code will be sent to confirm your email."}
        </FieldDescription>

        <SegmentedToggle
          value={mode}
          options={[
            { value: "signin", label: "Sign in" },
            { value: "signup", label: "Sign up" },
          ]}
          onChange={handleModeChange}
        />

        <FieldGroup>
          {mode === "signup" && (
            <>
              <Field>
                <FieldLabel>Profile photo (optional)</FieldLabel>
                <div className="flex items-center gap-4">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="group rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                    >
                      <Avatar className="size-14 border border-dashed border-input group-hover:border-ring/60">
                        {avatarPreview ? (
                          <AvatarImage src={avatarPreview} alt="Avatar preview" />
                        ) : (
                          <AvatarFallback>
                            <HugeiconsIcon icon={Camera01Icon} strokeWidth={2} className="size-5" />
                          </AvatarFallback>
                        )}
                      </Avatar>
                    </button>
                    {avatarPreview ? (
                      <button
                        type="button"
                        onClick={clearAvatar}
                        className="text-destructive-foreground absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-destructive shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-destructive/30"
                        aria-label="Remove photo"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
                      </button>
                    ) : null}
                  </div>
                  <FieldDescription>
                    {avatarPreview ? "Photo selected" : "Click to upload"}
                  </FieldDescription>
                </div>
              </Field>

              <signUpForm.Field
                name="name"
                children={(field) => {
                  const invalid = field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={invalid || undefined}>
                      <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={invalid}
                        placeholder="Your name"
                        autoComplete="name"
                      />
                      {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                    </Field>
                  )
                }}
              />

              <signUpForm.Field
                name="username"
                children={(field) => {
                  const invalid = field.state.meta.isTouched && !field.state.meta.isValid
                  const showAvailability = isValidUsernameFormat(field.state.value)
                  const unavailable = usernameAvailable === false
                  return (
                    <Field data-invalid={invalid || unavailable || undefined}>
                      <FieldLabel htmlFor={field.name}>Username (optional)</FieldLabel>
                      <div className="relative">
                        <Input
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => {
                            field.handleChange(e.target.value)
                            handleUsernameChange(e.target.value)
                          }}
                          aria-invalid={invalid || unavailable}
                          placeholder="johndoe"
                          autoComplete="username"
                          className="pr-9"
                        />
                        {showAvailability ? (
                          <div className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">
                            {isCheckingUsername ? (
                              <HugeiconsIcon
                                icon={Loading03Icon}
                                strokeWidth={2}
                                className="size-4 animate-spin text-muted-foreground"
                              />
                            ) : usernameAvailable === true ? (
                              <HugeiconsIcon
                                icon={Tick02Icon}
                                strokeWidth={2}
                                className="size-4 text-primary"
                              />
                            ) : unavailable ? (
                              <HugeiconsIcon
                                icon={Cancel01Icon}
                                strokeWidth={2}
                                className="size-4 text-destructive"
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <FieldDescription>
                        {unavailable
                          ? "This username is not available."
                          : usernameAvailable === true
                            ? "Username is available."
                            : "A unique handle others can use to find you."}
                      </FieldDescription>
                      {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                    </Field>
                  )
                }}
              />
            </>
          )}

          {mode === "signin" ? (
            <>
              <SegmentedToggle
                value={signInMethod}
                options={[
                  { value: "email", label: "Email" },
                  { value: "username", label: "Username" },
                  { value: "otp", label: "Email OTP" },
                ]}
                onChange={handleSignInMethodChange}
                size="sm"
              />

              {signInMethod === "email" ? (
                <>
                  <signInEmailForm.Field
                    name="email"
                    children={(field) => {
                      const invalid = field.state.meta.isTouched && !field.state.meta.isValid
                      return (
                        <Field data-invalid={invalid || undefined}>
                          <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                          <Input
                            id={field.name}
                            name={field.name}
                            type="email"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            aria-invalid={invalid}
                            placeholder="you@example.com"
                            autoComplete="email"
                          />
                          {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                        </Field>
                      )
                    }}
                  />
                  <signInEmailForm.Field
                    name="password"
                    children={(field) => {
                      const invalid = field.state.meta.isTouched && !field.state.meta.isValid
                      return (
                        <Field data-invalid={invalid || !!serverError || undefined}>
                          <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                          <Input
                            id={field.name}
                            name={field.name}
                            type="password"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            aria-invalid={invalid || !!serverError}
                            placeholder="••••••••"
                            autoComplete="current-password"
                          />
                          {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                          {serverError ? <FieldError>{serverError}</FieldError> : null}
                        </Field>
                      )
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setServerError("")
                      setPhase({ kind: "reset-request" })
                    }}
                    className="-mt-1 self-start text-xs text-muted-foreground hover:text-foreground"
                  >
                    Forgot password?
                  </button>
                </>
              ) : null}

              {signInMethod === "otp" ? (
                <signInOtpEmailForm.Field
                  name="email"
                  children={(field) => {
                    const invalid = field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={invalid || !!serverError || undefined}>
                        <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          type="email"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={invalid || !!serverError}
                          placeholder="you@example.com"
                          autoComplete="email"
                        />
                        <FieldDescription>
                          We'll email you a 6-digit code. No password needed.
                        </FieldDescription>
                        {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                        {serverError ? <FieldError>{serverError}</FieldError> : null}
                      </Field>
                    )
                  }}
                />
              ) : null}

              {signInMethod === "username" ? (
                <>
                  <signInUsernameForm.Field
                    name="username"
                    children={(field) => {
                      const invalid = field.state.meta.isTouched && !field.state.meta.isValid
                      return (
                        <Field data-invalid={invalid || undefined}>
                          <FieldLabel htmlFor={field.name}>Username</FieldLabel>
                          <Input
                            id={field.name}
                            name={field.name}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            aria-invalid={invalid}
                            placeholder="johndoe"
                            autoComplete="username"
                          />
                          {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                        </Field>
                      )
                    }}
                  />
                  <signInUsernameForm.Field
                    name="password"
                    children={(field) => {
                      const invalid = field.state.meta.isTouched && !field.state.meta.isValid
                      return (
                        <Field data-invalid={invalid || !!serverError || undefined}>
                          <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                          <Input
                            id={field.name}
                            name={field.name}
                            type="password"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            aria-invalid={invalid || !!serverError}
                            placeholder="••••••••"
                            autoComplete="current-password"
                          />
                          {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                          {serverError ? <FieldError>{serverError}</FieldError> : null}
                        </Field>
                      )
                    }}
                  />
                </>
              ) : null}
            </>
          ) : (
            <>
              <signUpForm.Field
                name="email"
                children={(field) => {
                  const invalid = field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={invalid || undefined}>
                      <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="email"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={invalid}
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                      {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                    </Field>
                  )
                }}
              />
              <signUpForm.Field
                name="password"
                children={(field) => {
                  const invalid = field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={invalid || !!serverError || undefined}>
                      <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="password"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={invalid || !!serverError}
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                      <FieldDescription>At least 8 characters.</FieldDescription>
                      {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                      {serverError ? <FieldError>{serverError}</FieldError> : null}
                    </Field>
                  )
                }}
              />
            </>
          )}

          <activeForm.Subscribe
            selector={(state) => state.isSubmitting}
            children={(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting} size="lg" className="w-full">
                {isSubmitting
                  ? "Loading..."
                  : mode === "signup"
                    ? "Create account"
                    : signInMethod === "otp"
                      ? "Send code"
                      : "Sign in"}
              </Button>
            )}
          />
        </FieldGroup>
      </FieldSet>
    </form>
  )
}

function OTPFlows({
  phase,
  setPhase,
  resetToSignIn,
}: {
  phase: Exclude<AuthPhase, { kind: "default" }>
  setPhase: (phase: AuthPhase) => void
  resetToSignIn: () => void
}) {
  const [serverError, setServerError] = useState("")
  const [info, setInfo] = useState("")

  const otpForm = useForm({
    defaultValues: { otp: "" },
    validators: { onSubmit: otpSchema },
    onSubmit: async ({ value }) => {
      setServerError("")
      setInfo("")
      try {
        if (phase.kind === "verify-signup") {
          const result = await authClient.emailOtp.verifyEmail({
            email: phase.email,
            otp: value.otp,
          })
          if (result.error) {
            setServerError(result.error.message || "Verification failed")
            return
          }
          // autoSignInAfterVerification on the server mints the session inline;
          // Authenticated boundary swaps views automatically.
          return
        }
        if (phase.kind === "otp-sign-in") {
          const result = await authClient.signIn.emailOtp({
            email: phase.email,
            otp: value.otp,
          })
          if (result.error) setServerError(result.error.message || "Sign in failed")
          return
        }
      } catch {
        setServerError("An error occurred. Please try again.")
      }
    },
  })

  const emailForm = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: emailOnlySchema },
    onSubmit: async ({ value }) => {
      setServerError("")
      setInfo("")
      try {
        const result = await authClient.emailOtp.requestPasswordReset({ email: value.email })
        if (result.error) {
          setServerError(result.error.message || "Could not send reset code")
          return
        }
        setPhase({ kind: "reset-verify", email: value.email })
      } catch {
        setServerError("An error occurred. Please try again.")
      }
    },
  })

  const resetForm = useForm({
    defaultValues: { otp: "", password: "" },
    validators: { onSubmit: resetPasswordSchema },
    onSubmit: async ({ value }) => {
      if (phase.kind !== "reset-verify") return
      setServerError("")
      setInfo("")
      try {
        const result = await authClient.emailOtp.resetPassword({
          email: phase.email,
          otp: value.otp,
          password: value.password,
        })
        if (result.error) {
          setServerError(result.error.message || "Reset failed")
          return
        }
        setInfo("Password updated. Sign in with your new password.")
        resetToSignIn()
      } catch {
        setServerError("An error occurred. Please try again.")
      }
    },
  })

  const resendOtp = async (type: "sign-in" | "email-verification" | "forget-password") => {
    if (phase.kind === "reset-request") return
    setServerError("")
    setInfo("")
    try {
      if (type === "forget-password") {
        await authClient.emailOtp.requestPasswordReset({ email: phase.email })
      } else {
        await authClient.emailOtp.sendVerificationOtp({ email: phase.email, type })
      }
      setInfo("New code sent. Check your inbox.")
    } catch {
      setServerError("Could not send a new code. Try again.")
    }
  }

  if (phase.kind === "reset-request") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void emailForm.handleSubmit()
        }}
      >
        <FieldSet>
          <FieldLegend>Reset your password</FieldLegend>
          <FieldDescription>Enter your email and we'll send you a 6-digit code.</FieldDescription>
          <FieldGroup>
            <emailForm.Field
              name="email"
              children={(field) => {
                const invalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={invalid || !!serverError || undefined}>
                    <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={invalid || !!serverError}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                    {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                    {serverError ? <FieldError>{serverError}</FieldError> : null}
                  </Field>
                )
              }}
            />
            <emailForm.Subscribe
              selector={(state) => state.isSubmitting}
              children={(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting} size="lg" className="w-full">
                  {isSubmitting ? "Loading..." : "Send reset code"}
                </Button>
              )}
            />
            <Button type="button" variant="ghost" onClick={resetToSignIn}>
              Back to sign in
            </Button>
          </FieldGroup>
        </FieldSet>
      </form>
    )
  }

  if (phase.kind === "reset-verify") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void resetForm.handleSubmit()
        }}
      >
        <FieldSet>
          <FieldLegend>Enter reset code</FieldLegend>
          <FieldDescription>
            We sent a 6-digit code to <strong className="text-foreground">{phase.email}</strong>.
          </FieldDescription>
          <FieldGroup>
            <resetForm.Field
              name="otp"
              children={(field) => {
                const invalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={invalid || undefined}>
                    <FieldLabel htmlFor={field.name}>Verification code</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={invalid}
                      placeholder="123456"
                    />
                    {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                  </Field>
                )
              }}
            />
            <resetForm.Field
              name="password"
              children={(field) => {
                const invalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={invalid || !!serverError || undefined}>
                    <FieldLabel htmlFor={field.name}>New password</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={invalid || !!serverError}
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                    <FieldDescription>At least 8 characters.</FieldDescription>
                    {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                    {serverError ? <FieldError>{serverError}</FieldError> : null}
                    {info ? <FieldDescription>{info}</FieldDescription> : null}
                  </Field>
                )
              }}
            />
            <resetForm.Subscribe
              selector={(state) => state.isSubmitting}
              children={(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting} size="lg" className="w-full">
                  {isSubmitting ? "Loading..." : "Reset password"}
                </Button>
              )}
            />
            <Button type="button" variant="ghost" onClick={() => resendOtp("forget-password")}>
              Resend code
            </Button>
            <Button type="button" variant="ghost" onClick={resetToSignIn}>
              Back to sign in
            </Button>
          </FieldGroup>
        </FieldSet>
      </form>
    )
  }

  const isVerifySignup = phase.kind === "verify-signup"
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void otpForm.handleSubmit()
      }}
    >
      <FieldSet>
        <FieldLegend>{isVerifySignup ? "Verify your email" : "Enter sign-in code"}</FieldLegend>
        <FieldDescription>
          We sent a 6-digit code to <strong className="text-foreground">{phase.email}</strong>.
        </FieldDescription>
        <FieldGroup>
          <otpForm.Field
            name="otp"
            children={(field) => {
              const invalid = field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={invalid || !!serverError || undefined}>
                  <FieldLabel htmlFor={field.name}>Verification code</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={invalid || !!serverError}
                    placeholder="123456"
                  />
                  {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                  {serverError ? <FieldError>{serverError}</FieldError> : null}
                  {info ? <FieldDescription>{info}</FieldDescription> : null}
                </Field>
              )
            }}
          />
          <otpForm.Subscribe
            selector={(state) => state.isSubmitting}
            children={(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting} size="lg" className="w-full">
                {isSubmitting ? "Loading..." : isVerifySignup ? "Verify email" : "Sign in"}
              </Button>
            )}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => resendOtp(isVerifySignup ? "email-verification" : "sign-in")}
          >
            Resend code
          </Button>
          <Button type="button" variant="ghost" onClick={resetToSignIn}>
            Back to sign in
          </Button>
        </FieldGroup>
      </FieldSet>
    </form>
  )
}

function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  size?: "md" | "sm"
}) {
  return (
    <div className="flex overflow-hidden rounded-3xl border border-border bg-background p-1">
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 rounded-[calc(var(--radius)*1.6)] font-medium transition-colors",
              size === "sm" ? "py-1 text-xs" : "py-2 text-sm",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
