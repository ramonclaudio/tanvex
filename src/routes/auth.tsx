import { useCallback, useEffect, useRef, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { AuthLoading, Authenticated, Unauthenticated, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react";
import { Camera, Check, Loader2, User, X } from "lucide-react";
import { z } from "zod";

import { api } from "@convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// Reserved usernames that cannot be used
const RESERVED_USERNAMES = [
  "admin",
  "administrator",
  "root",
  "system",
  "moderator",
  "mod",
  "support",
  "help",
  "info",
  "contact",
  "api",
  "www",
  "mail",
  "email",
  "test",
  "null",
  "undefined",
];

// Check if username is reserved (case-insensitive)
const isReservedUsername = (username: string) =>
  RESERVED_USERNAMES.includes(username.toLowerCase());

// Zod schemas for form validation
const signInEmailSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const signInUsernameSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const signUpSchema = z.object({
  name: z.string().min(1, "Name is required."),
  username: z
    .string()
    .refine(
      (val) => val === "" || (val.length >= 3 && val.length <= 30 && /^[a-zA-Z0-9_.]+$/.test(val)),
      "Username must be 3-30 characters and can only contain letters, numbers, underscores, and dots.",
    )
    .refine(
      (val) => val === "" || !isReservedUsername(val),
      "This username is reserved and cannot be used.",
    ),
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

// Search params for redirect after auth
type AuthSearchParams = {
  redirect?: string;
};

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearchParams => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: Auth,
});

function Auth() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4">
        <AuthLoading>
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </AuthLoading>

        <Authenticated>
          <AuthenticatedView />
        </Authenticated>

        <Unauthenticated>
          <UnauthenticatedView />
        </Unauthenticated>
      </div>
    </div>
  );
}

function AuthenticatedView() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { data: user, isPending, isError, error } = useQuery(api.auth.getCurrentUser);
  const [loading, setLoading] = useState(false);

  // Handle redirect after successful authentication
  useEffect(() => {
    if (user && redirect) {
      navigate({ to: redirect });
    }
  }, [user, redirect, navigate]);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await authClient.signOut();
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while fetching user data
  if (isPending) {
    return (
      <div className="flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Handle error state
  if (isError) {
    return (
      <div className="text-center">
        <p className="text-destructive">Error loading user: {error.message}</p>
        <Button variant="secondary" onClick={handleSignOut} className="mt-4">
          Sign Out
        </Button>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold text-center text-foreground">Welcome</h1>
      <div className="space-y-4 text-center">
        <div className="flex justify-center">
          <Avatar className="size-16 border-2 border-border">
            <AvatarImage src={user?.avatarUrl || undefined} alt={user?.fullName ?? "User avatar"} />
            <AvatarFallback>
              <User size={24} className="text-muted-foreground" />
            </AvatarFallback>
          </Avatar>
        </div>
        {user?.fullName && <p className="font-medium text-foreground">{user.fullName}</p>}
        <p className="text-sm text-muted-foreground">{user?.email}</p>

        <div className="pt-2 space-y-2">
          <Button asChild className="w-full">
            <Link to="/profile">View Profile</Link>
          </Button>
          <Button variant="secondary" onClick={handleSignOut} disabled={loading} className="w-full">
            {loading ? "Signing out..." : "Sign Out"}
          </Button>
        </div>
      </div>
    </>
  );
}

function UnauthenticatedView() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInMethod, setSignInMethod] = useState<"email" | "username">("email");
  const [serverError, setServerError] = useState("");

  // Username availability state
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const usernameCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Avatar state for sign-up
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Mutations for avatar upload after sign-up
  const generateUploadUrl = useMutation(api.users.generateAvatarUploadUrl);
  const updateAvatar = useMutation(api.users.updateAvatar);

  // Check username availability with debounce
  const checkUsernameAvailability = useCallback(async (username: string) => {
    if (!username || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    // Validate format first
    if (!/^[a-zA-Z0-9_.]+$/.test(username)) {
      setUsernameAvailable(null);
      return;
    }

    // Check if reserved username - immediately mark as unavailable
    if (isReservedUsername(username)) {
      setUsernameAvailable(false);
      return;
    }

    setIsCheckingUsername(true);
    try {
      const result = await authClient.isUsernameAvailable({ username });
      if (result.data) {
        setUsernameAvailable(result.data.available);
      }
    } catch {
      setUsernameAvailable(null);
    } finally {
      setIsCheckingUsername(false);
    }
  }, []);

  // Debounced username check
  const handleUsernameChange = useCallback(
    (username: string) => {
      setUsernameAvailable(null);

      // Clear existing timeout
      if (usernameCheckTimeoutRef.current) {
        clearTimeout(usernameCheckTimeoutRef.current);
      }

      // Check reserved usernames immediately (no debounce needed)
      if (username && username.length >= 3 && /^[a-zA-Z0-9_.]+$/.test(username)) {
        if (isReservedUsername(username)) {
          setUsernameAvailable(false);
          return;
        }
        // Debounce the API call for non-reserved usernames
        usernameCheckTimeoutRef.current = setTimeout(() => {
          checkUsernameAvailability(username);
        }, 500);
      }
    },
    [checkUsernameAvailability],
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (usernameCheckTimeoutRef.current) {
        clearTimeout(usernameCheckTimeoutRef.current);
      }
    };
  }, []);

  const signInEmailForm = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    validators: {
      onSubmit: signInEmailSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError("");
      try {
        const result = await authClient.signIn.email({
          email: value.email,
          password: value.password,
        });
        if (result.error) {
          setServerError(result.error.message || "Sign in failed");
        }
      } catch {
        setServerError("An error occurred during sign in");
      }
    },
  });

  const signInUsernameForm = useForm({
    defaultValues: {
      username: "",
      password: "",
    },
    validators: {
      onSubmit: signInUsernameSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError("");
      try {
        const result = await authClient.signIn.username({
          username: value.username,
          password: value.password,
        });
        if (result.error) {
          setServerError(result.error.message || "Sign in failed");
        }
      } catch {
        setServerError("An error occurred during sign in");
      }
    },
  });

  const signUpForm = useForm({
    defaultValues: {
      name: "",
      username: "",
      email: "",
      password: "",
    },
    validators: {
      onSubmit: signUpSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError("");
      try {
        const result = await authClient.signUp.email({
          email: value.email,
          password: value.password,
          name: value.name,
          // Only include username if provided
          ...(value.username && { username: value.username }),
        });
        if (result.error) {
          setServerError(result.error.message || "Sign up failed");
          return;
        }

        // If sign-up succeeded and user selected an avatar, upload it
        if (avatarFile) {
          try {
            // Get upload URL
            const uploadUrl = await generateUploadUrl();

            // Upload the file
            const uploadResult = await fetch(uploadUrl, {
              method: "POST",
              headers: { "Content-Type": avatarFile.type },
              body: avatarFile,
            });

            if (uploadResult.ok) {
              const { storageId } = await uploadResult.json();
              // Update the user's avatar
              await updateAvatar({ storageId });
            }
          } catch {
            // Avatar upload failed, but sign-up succeeded - don't block
            console.error("Failed to upload avatar during sign-up");
          }
        }
      } catch {
        setServerError("An error occurred during sign up");
      }
    },
  });

  // Get the active form based on mode and sign-in method
  const getActiveForm = () => {
    if (mode === "signup") return signUpForm;
    return signInMethod === "email" ? signInEmailForm : signInUsernameForm;
  };
  const form = getActiveForm();

  // Handle avatar file selection
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setServerError("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setServerError("Image must be less than 5MB");
      return;
    }

    setAvatarFile(file);
    setServerError("");

    // Create preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const clearAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    if (avatarInputRef.current) {
      avatarInputRef.current.value = "";
    }
  };

  // Clear avatar and reset state when switching modes
  const handleModeChange = (newMode: "signin" | "signup") => {
    setMode(newMode);
    setServerError("");
    setUsernameAvailable(null);
    if (newMode === "signin") {
      clearAvatar();
    }
  };

  // Handle sign-in method change
  const handleSignInMethodChange = (method: "email" | "username") => {
    setSignInMethod(method);
    setServerError("");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <FieldSet>
        <FieldLegend>{mode === "signin" ? "Sign In" : "Sign Up"}</FieldLegend>
        <FieldDescription>
          {mode === "signin"
            ? "Enter your credentials to access your account."
            : "Create an account to get started."}
        </FieldDescription>

        <div className="flex rounded-md border border-input overflow-hidden">
          <button
            type="button"
            onClick={() => handleModeChange("signin")}
            className={`flex-1 py-2 text-sm transition-colors ${mode === "signin" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("signup")}
            className={`flex-1 py-2 text-sm transition-colors ${mode === "signup" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
          >
            Sign Up
          </button>
        </div>

        <FieldGroup>
          {mode === "signup" && (
            <>
              {/* Avatar picker */}
              <Field>
                <FieldLabel>Profile Photo (optional)</FieldLabel>
                <div className="flex items-center gap-4">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                    id="avatar-upload"
                  />
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="relative cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full"
                    >
                      <Avatar className="size-16 border-2 border-dashed border-input group-hover:border-primary transition-colors">
                        {avatarPreview ? (
                          <AvatarImage src={avatarPreview} alt="Avatar preview" />
                        ) : (
                          <AvatarFallback className="bg-muted">
                            <Camera size={20} className="text-muted-foreground" />
                          </AvatarFallback>
                        )}
                      </Avatar>
                    </button>
                    {avatarPreview && (
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        className="absolute -top-1 -right-1 rounded-full size-5"
                        onClick={clearAvatar}
                      >
                        <X className="size-3" />
                      </Button>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {avatarPreview ? (
                      <span className="text-foreground">Image selected</span>
                    ) : (
                      <span>Click to upload</span>
                    )}
                  </div>
                </div>
                <FieldDescription>Add a profile photo. You can change it later.</FieldDescription>
              </Field>

              <signUpForm.Field
                name="name"
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                        placeholder="Your name"
                        autoComplete="name"
                      />
                      <FieldDescription>This is how we'll address you.</FieldDescription>
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </Field>
                  );
                }}
              />

              <signUpForm.Field
                name="username"
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  const showAvailability =
                    field.state.value.length >= 3 && /^[a-zA-Z0-9_.]+$/.test(field.state.value);
                  return (
                    <Field data-invalid={isInvalid || usernameAvailable === false}>
                      <FieldLabel htmlFor={field.name}>Username (optional)</FieldLabel>
                      <div className="relative">
                        <Input
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => {
                            field.handleChange(e.target.value);
                            handleUsernameChange(e.target.value);
                          }}
                          aria-invalid={isInvalid || usernameAvailable === false}
                          placeholder="johndoe"
                          autoComplete="username"
                          className="pr-10"
                        />
                        {/* Availability indicator */}
                        {showAvailability && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            {isCheckingUsername ? (
                              <Loader2 className="size-4 animate-spin text-muted-foreground" />
                            ) : usernameAvailable === true ? (
                              <Check className="size-4 text-green-500" />
                            ) : usernameAvailable === false ? (
                              <X className="size-4 text-destructive" />
                            ) : null}
                          </div>
                        )}
                      </div>
                      <FieldDescription>
                        {usernameAvailable === false ? (
                          <span className="text-destructive">This username is not available.</span>
                        ) : usernameAvailable === true ? (
                          <span className="text-green-600">Username is available!</span>
                        ) : (
                          "A unique handle others can use to find you."
                        )}
                      </FieldDescription>
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </Field>
                  );
                }}
              />
            </>
          )}

          {mode === "signin" ? (
            <>
              {/* Email/Username toggle for sign-in */}
              <div className="flex rounded-md border border-input overflow-hidden">
                <button
                  type="button"
                  onClick={() => handleSignInMethodChange("email")}
                  className={`flex-1 py-1.5 text-xs transition-colors ${signInMethod === "email" ? "bg-muted text-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
                >
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => handleSignInMethodChange("username")}
                  className={`flex-1 py-1.5 text-xs transition-colors ${signInMethod === "username" ? "bg-muted text-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
                >
                  Username
                </button>
              </div>

              {signInMethod === "email" ? (
                <>
                  <signInEmailForm.Field
                    name="email"
                    children={(field) => {
                      const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                      return (
                        <Field data-invalid={isInvalid}>
                          <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                          <Input
                            id={field.name}
                            name={field.name}
                            type="email"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            aria-invalid={isInvalid}
                            placeholder="you@example.com"
                            autoComplete="email"
                          />
                          {isInvalid && <FieldError errors={field.state.meta.errors} />}
                        </Field>
                      );
                    }}
                  />
                  <signInEmailForm.Field
                    name="password"
                    children={(field) => {
                      const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                      return (
                        <Field data-invalid={isInvalid || !!serverError}>
                          <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                          <Input
                            id={field.name}
                            name={field.name}
                            type="password"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            aria-invalid={isInvalid || !!serverError}
                            placeholder="••••••••"
                            autoComplete="current-password"
                          />
                          {isInvalid && <FieldError errors={field.state.meta.errors} />}
                          {serverError && <FieldError>{serverError}</FieldError>}
                        </Field>
                      );
                    }}
                  />
                </>
              ) : (
                <>
                  <signInUsernameForm.Field
                    name="username"
                    children={(field) => {
                      const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                      return (
                        <Field data-invalid={isInvalid}>
                          <FieldLabel htmlFor={field.name}>Username</FieldLabel>
                          <Input
                            id={field.name}
                            name={field.name}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            aria-invalid={isInvalid}
                            placeholder="johndoe"
                            autoComplete="username"
                          />
                          {isInvalid && <FieldError errors={field.state.meta.errors} />}
                        </Field>
                      );
                    }}
                  />
                  <signInUsernameForm.Field
                    name="password"
                    children={(field) => {
                      const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                      return (
                        <Field data-invalid={isInvalid || !!serverError}>
                          <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                          <Input
                            id={field.name}
                            name={field.name}
                            type="password"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            aria-invalid={isInvalid || !!serverError}
                            placeholder="••••••••"
                            autoComplete="current-password"
                          />
                          {isInvalid && <FieldError errors={field.state.meta.errors} />}
                          {serverError && <FieldError>{serverError}</FieldError>}
                        </Field>
                      );
                    }}
                  />
                </>
              )}
            </>
          ) : (
            <>
              <signUpForm.Field
                name="email"
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="email"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </Field>
                  );
                }}
              />
              <signUpForm.Field
                name="password"
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid || !!serverError}>
                      <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="password"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid || !!serverError}
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                      <FieldDescription>Must be at least 8 characters.</FieldDescription>
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                      {serverError && <FieldError>{serverError}</FieldError>}
                    </Field>
                  );
                }}
              />
            </>
          )}

          <form.Subscribe
            selector={(state) => state.isSubmitting}
            children={(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Loading..." : mode === "signin" ? "Sign In" : "Create Account"}
              </Button>
            )}
          />
        </FieldGroup>
      </FieldSet>
    </form>
  );
}
