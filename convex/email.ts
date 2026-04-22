import type { GenericCtx } from "@convex-dev/better-auth"
import { requireRunMutationCtx } from "@convex-dev/better-auth/utils"
import { Resend, vOnEmailEventArgs } from "@convex-dev/resend"

import { components, internal } from "./_generated/api"
import type { DataModel } from "./_generated/dataModel"
import { internalMutation } from "./_generated/server"

// testMode defaults to true so dev can't accidentally email real users.
// Set RESEND_TEST_MODE=false in production to send to real addresses.
// Explicit `: Resend` annotation is required because `onEmailEvent` references
// a function in this same module, which would otherwise cause TS inference to
// loop on itself.
export const resend: Resend = new Resend(components.resend, {
  testMode: process.env.RESEND_TEST_MODE !== "false",
  onEmailEvent: internal.email.handleEmailEvent,
})

/**
 * Receives delivery events from the Resend webhook (mounted in convex/http.ts).
 * The event payload is also automatically persisted to the component's
 * `deliveryEvents` table for inspection in the Convex dashboard.
 *
 * Currently logs bounces and complaints. Extend this handler to flag the
 * user's email as unreachable if you want to stop sending auth OTPs to
 * addresses that will never arrive.
 */
export const handleEmailEvent = internalMutation({
  args: vOnEmailEventArgs,
  handler: async (_ctx, args) => {
    if (args.event.type === "email.bounced" || args.event.type === "email.complained") {
      console.warn(`[resend] ${args.event.type} for email ${args.id}`, args.event.data)
    }
  },
})

type OTPType = "sign-in" | "email-verification" | "forget-password" | "change-email"

const OTP_COPY: Record<OTPType, { subject: string; heading: string; body: string }> = {
  "sign-in": {
    subject: "Your sign-in code",
    heading: "Sign in",
    body: "Use this code to sign in.",
  },
  "email-verification": {
    subject: "Verify your email",
    heading: "Verify your email",
    body: "Enter this code to confirm your email address.",
  },
  "forget-password": {
    subject: "Reset your password",
    heading: "Reset your password",
    body: "Use this code to reset your password. Ignore this email if you didn't request it.",
  },
  "change-email": {
    subject: "Confirm your new email",
    heading: "Confirm your new email",
    body: "Enter this code to confirm the email change.",
  },
}

/**
 * Send an auth OTP email via Resend. Used by Better Auth's emailOTP plugin
 * inside the `sendVerificationOTP` callback in convex/auth.ts.
 */
export async function sendAuthOTP(
  ctx: GenericCtx<DataModel>,
  { email, otp, type }: { email: string; otp: string; type: OTPType },
) {
  const app = process.env.APP_NAME ?? "App"
  const from = process.env.EMAIL_FROM ?? "Auth <onboarding@resend.dev>"
  const { subject, heading, body } = OTP_COPY[type]
  await resend.sendEmail(requireRunMutationCtx(ctx), {
    from,
    to: email,
    subject: `${app}: ${subject} (${otp})`,
    html: renderHtml(heading, body, otp),
    text: `${heading}\n\n${body}\n\nCode: ${otp}\n\nThis code expires in 5 minutes.`,
  })
}

function renderHtml(heading: string, body: string, otp: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;color:#111"><h1 style="font-size:20px;margin:0 0 16px">${heading}</h1><p style="margin:0 0 24px">${body}</p><div style="font-size:28px;letter-spacing:6px;font-weight:600;padding:16px;background:#f5f5f5;border-radius:8px;text-align:center">${otp}</div><p style="margin:24px 0 0;color:#666;font-size:13px">This code expires in 5 minutes.</p></body></html>`
}
