import { api } from "@convex/_generated/api"
import type { AuthUser } from "@convex/auth"
import { USERNAME_MIN_LENGTH, isReservedUsername, isValidUsernameFormat } from "@convex/constants"
import AtIcon from "@hugeicons/core-free-icons/AtIcon"
import Camera01Icon from "@hugeicons/core-free-icons/Camera01Icon"
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon"
import FloppyDiskIcon from "@hugeicons/core-free-icons/FloppyDiskIcon"
import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon"
import Mail01Icon from "@hugeicons/core-free-icons/Mail01Icon"
import Note01Icon from "@hugeicons/core-free-icons/Note01Icon"
import SquareLock02Icon from "@hugeicons/core-free-icons/SquareLock02Icon"
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon"
import UserIcon from "@hugeicons/core-free-icons/UserIcon"
import { HugeiconsIcon } from "@hugeicons/react"
import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { useQuery } from "convex-helpers/react"
import { Authenticated, AuthLoading, Unauthenticated, useMutation } from "convex/react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { authClient } from "@/lib/auth-client"
import { fetchAuthQuery } from "@/lib/auth-server"
import { cn } from "@/lib/utils"

const fetchProfileData = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const user = await fetchAuthQuery(api.users.getMe, {})
    return { user, error: null as string | null }
  } catch {
    return { user: null, error: "not_authenticated" as string | null }
  }
})

export const Route = createFileRoute("/_authed/profile")({
  loader: async () => {
    const { user, error } = await fetchProfileData()
    return { preloadedUser: user, error }
  },
  component: ProfilePage,
})

function ProfilePage() {
  const { preloadedUser } = Route.useLoaderData()

  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-6 py-12 sm:py-16">
      <AuthLoading>
        <ProfileSkeleton />
      </AuthLoading>
      <Authenticated>
        <ProfileContent preloadedUser={preloadedUser} />
      </Authenticated>
      <Unauthenticated>
        <p className="text-center text-muted-foreground">Please sign in to view your profile.</p>
      </Unauthenticated>
    </main>
  )
}

function ProfileSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center gap-4">
        <div className="size-20 rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-6 w-32 rounded bg-muted" />
          <div className="h-4 w-48 rounded bg-muted" />
        </div>
      </div>
      <div className="space-y-4">
        <div className="h-10 rounded-2xl bg-muted" />
        <div className="h-24 rounded-2xl bg-muted" />
      </div>
    </div>
  )
}

type PreloadedUser = AuthUser | null

function ProfileContent({ preloadedUser }: { preloadedUser: PreloadedUser }) {
  const { data: user, isPending } = useQuery(api.users.getMe)
  const { data: hasPassword } = useQuery(api.auth.hasPassword)
  const updateProfile = useMutation(api.users.updateProfile)
  const generateUploadUrl = useMutation(api.users.generateAvatarUploadUrl)
  const updateAvatar = useMutation(api.users.updateAvatar)
  const deleteAvatarMutation = useMutation(api.users.deleteAvatar)

  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isCheckingUsername, setIsCheckingUsername] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const usernameCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })
  const [passwordErrors, setPasswordErrors] = useState<{
    currentPassword?: string
    newPassword?: string
    confirmPassword?: string
    general?: string
  }>({})
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  const currentUser = user ?? preloadedUser
  const originalUsername = currentUser?.displayUsername ?? currentUser?.username ?? ""

  const [formData, setFormData] = useState({
    name: currentUser?.name ?? "",
    username: currentUser?.displayUsername ?? currentUser?.username ?? "",
    bio: currentUser?.bio ?? "",
  })

  const checkUsernameAvailability = useCallback(
    async (username: string) => {
      if (username.toLowerCase() === originalUsername.toLowerCase()) {
        setUsernameAvailable(null)
        setUsernameError(null)
        return
      }
      if (!username || username.length < USERNAME_MIN_LENGTH) {
        setUsernameAvailable(null)
        setUsernameError(null)
        return
      }
      if (!isValidUsernameFormat(username)) {
        setUsernameAvailable(null)
        setUsernameError("Username must be 3-30 characters (letters, numbers, underscores, dots)")
        return
      }
      if (isReservedUsername(username)) {
        setUsernameAvailable(false)
        setUsernameError("This username is reserved")
        return
      }
      setIsCheckingUsername(true)
      setUsernameError(null)
      try {
        const result = await authClient.isUsernameAvailable({ username })
        if (result.data) {
          setUsernameAvailable(result.data.available)
          if (!result.data.available) setUsernameError("This username is already taken")
        }
      } catch {
        setUsernameAvailable(null)
        setUsernameError(null)
      } finally {
        setIsCheckingUsername(false)
      }
    },
    [originalUsername],
  )

  const handleUsernameChange = useCallback(
    (username: string) => {
      setFormData((prev) => ({ ...prev, username }))
      setUsernameAvailable(null)
      setUsernameError(null)
      if (usernameCheckTimeoutRef.current) clearTimeout(usernameCheckTimeoutRef.current)
      if (username.toLowerCase() === originalUsername.toLowerCase()) return
      if (!username) return
      if (isValidUsernameFormat(username)) {
        if (isReservedUsername(username)) {
          setUsernameAvailable(false)
          setUsernameError("This username is reserved")
          return
        }
        usernameCheckTimeoutRef.current = setTimeout(() => checkUsernameAvailability(username), 500)
      }
    },
    [checkUsernameAvailability, originalUsername],
  )

  useEffect(() => {
    return () => {
      if (usernameCheckTimeoutRef.current) clearTimeout(usernameCheckTimeoutRef.current)
    }
  }, [])

  const resetForm = () => {
    setFormData({
      name: currentUser?.name ?? "",
      username: currentUser?.displayUsername ?? currentUser?.username ?? "",
      bio: currentUser?.bio ?? "",
    })
    setUsernameAvailable(null)
    setUsernameError(null)
  }

  const isUsernameChangeValid = () => {
    const next = formData.username
    if (next.toLowerCase() === originalUsername.toLowerCase()) return true
    if (!next) return true
    if (usernameError || usernameAvailable === false) return false
    if (isCheckingUsername) return false
    return usernameAvailable === true
  }

  const handleSave = async () => {
    if (!currentUser) return
    if (!isUsernameChangeValid()) {
      setError("Please fix the username issue before saving")
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      // Better Auth's username plugin only backfills `displayUsername` on /sign-up/email,
      // not on /update-user. Send both so the UI-visible handle stays in sync.
      const currentUsername = currentUser.displayUsername ?? currentUser.username ?? ""
      const nameChanged = formData.name !== currentUser.name
      const usernameChanged = formData.username !== currentUsername
      if (nameChanged || usernameChanged) {
        const result = await authClient.updateUser({
          ...(nameChanged && { name: formData.name }),
          ...(usernameChanged && {
            username: formData.username || undefined,
            displayUsername: formData.username || undefined,
          }),
        })
        if (result.error) {
          setError(result.error.message || "Failed to update profile")
          setIsSaving(false)
          return
        }
      }
      await updateProfile({ bio: formData.bio || undefined })
      setIsEditing(false)
      setUsernameAvailable(null)
      setUsernameError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile")
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    resetForm()
    setIsEditing(false)
    setError(null)
  }

  const handleAvatarClick = () => fileInputRef.current?.click()

  const handleDeleteAvatar = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!currentUser?.hasUploadedAvatar) return
    setIsUploadingAvatar(true)
    setError(null)
    try {
      await deleteAvatarMutation()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete avatar")
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be less than 5MB")
      return
    }
    setIsUploadingAvatar(true)
    setError(null)
    try {
      const uploadUrl = await generateUploadUrl()
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!result.ok) throw new Error("Failed to upload image")
      const { storageId } = await result.json()
      await updateAvatar({ storageId })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload avatar")
    } finally {
      setIsUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const openPasswordForm = () => {
    setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" })
    setPasswordErrors({})
    setPasswordSuccess(false)
    setIsChangingPassword(true)
  }

  const closePasswordForm = () => {
    setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" })
    setPasswordErrors({})
    setIsChangingPassword(false)
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordErrors({})
    setPasswordSuccess(false)

    const next: typeof passwordErrors = {}
    if (!passwordForm.currentPassword) next.currentPassword = "Current password is required"
    if (!passwordForm.newPassword) {
      next.newPassword = "New password is required"
    } else if (passwordForm.newPassword.length < 8) {
      next.newPassword = "Password must be at least 8 characters"
    } else if (passwordForm.newPassword.length > 128) {
      next.newPassword = "Password must be 128 characters or less"
    } else if (passwordForm.newPassword === passwordForm.currentPassword) {
      next.newPassword = "New password must be different from the current password"
    }
    if (passwordForm.confirmPassword !== passwordForm.newPassword) {
      next.confirmPassword = "Passwords do not match"
    }
    if (Object.keys(next).length > 0) {
      setPasswordErrors(next)
      return
    }

    setIsSavingPassword(true)
    try {
      const result = await authClient.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
        revokeOtherSessions: true,
      })
      if (result.error) {
        const code = result.error.code
        if (code === "INVALID_PASSWORD") {
          setPasswordErrors({ currentPassword: "Current password is incorrect" })
        } else if (code === "PASSWORD_TOO_SHORT") {
          setPasswordErrors({ newPassword: "Password is too short" })
        } else if (code === "PASSWORD_TOO_LONG") {
          setPasswordErrors({ newPassword: "Password is too long" })
        } else if (code === "SESSION_NOT_FRESH") {
          setPasswordErrors({
            general: "Please sign out and sign back in to change your password.",
          })
        } else {
          setPasswordErrors({ general: result.error.message || "Failed to change password" })
        }
        return
      }
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" })
      setPasswordSuccess(true)
      setIsChangingPassword(false)
    } catch (err) {
      setPasswordErrors({
        general: err instanceof Error ? err.message : "Failed to change password",
      })
    } finally {
      setIsSavingPassword(false)
    }
  }

  if (isPending && !preloadedUser) return <ProfileSkeleton />
  if (!currentUser) {
    return <p className="text-center text-muted-foreground">User not found.</p>
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between">
        <h1 className="font-heading text-2xl font-medium tracking-tight">Profile</h1>
        {!isEditing ? (
          <Button
            onClick={() => {
              resetForm()
              setIsEditing(true)
            }}
          >
            Edit profile
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !isUsernameChangeValid()}>
              <HugeiconsIcon
                icon={isSaving ? Loading03Icon : FloppyDiskIcon}
                strokeWidth={2}
                className={cn(isSaving && "animate-spin")}
                data-icon="inline-start"
              />
              Save
            </Button>
          </div>
        )}
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-6">
        <div className="relative">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          {isEditing ? (
            <button
              type="button"
              onClick={handleAvatarClick}
              disabled={isUploadingAvatar}
              className="group relative rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
              title="Click to change avatar"
            >
              <Avatar className="size-24 border border-border">
                <AvatarImage src={currentUser.avatarUrl ?? undefined} alt={currentUser.name} />
                <AvatarFallback>
                  <HugeiconsIcon icon={UserIcon} strokeWidth={2} className="size-9" />
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 grid place-items-center rounded-full bg-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
                <HugeiconsIcon
                  icon={isUploadingAvatar ? Loading03Icon : Camera01Icon}
                  strokeWidth={2}
                  className={cn("size-7 text-background", isUploadingAvatar && "animate-spin")}
                />
              </div>
            </button>
          ) : (
            <Avatar className="size-24 border border-border">
              <AvatarImage src={currentUser.avatarUrl ?? undefined} alt={currentUser.name} />
              <AvatarFallback>
                <HugeiconsIcon icon={UserIcon} strokeWidth={2} className="size-9" />
              </AvatarFallback>
            </Avatar>
          )}
          {isEditing && currentUser.hasUploadedAvatar && !isUploadingAvatar ? (
            <button
              type="button"
              onClick={handleDeleteAvatar}
              className="text-destructive-foreground absolute -top-1 -right-1 grid size-6 place-items-center rounded-full bg-destructive shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-destructive/30"
              aria-label="Remove avatar"
              title="Remove avatar"
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
            </button>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          {isEditing ? (
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              placeholder="Name"
              className="w-full max-w-xs bg-transparent text-xl font-semibold text-foreground outline-none placeholder:text-muted-foreground"
            />
          ) : (
            <h2 className="truncate text-xl font-semibold">{currentUser.name || "No name set"}</h2>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} className="size-4" />
            <span className="truncate">{currentUser.email}</span>
          </div>

          {isEditing ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={AtIcon}
                  strokeWidth={2}
                  className="size-4 text-muted-foreground"
                />
                <div className="relative">
                  <Input
                    type="text"
                    value={formData.username}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    placeholder="username"
                    aria-invalid={!!usernameError || usernameAvailable === false}
                    className="h-8 w-44 pr-8 text-sm"
                  />
                  {formData.username &&
                  formData.username.toLowerCase() !== originalUsername.toLowerCase() ? (
                    <div className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
                      {isCheckingUsername ? (
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          strokeWidth={2}
                          className="size-3.5 animate-spin text-muted-foreground"
                        />
                      ) : usernameAvailable === true ? (
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          strokeWidth={2}
                          className="size-3.5 text-primary"
                        />
                      ) : usernameAvailable === false || usernameError ? (
                        <HugeiconsIcon
                          icon={Cancel01Icon}
                          strokeWidth={2}
                          className="size-3.5 text-destructive"
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              {formData.username &&
              formData.username.toLowerCase() !== originalUsername.toLowerCase() ? (
                <div className="ml-6">
                  {usernameError ? (
                    <span className="text-xs text-destructive">{usernameError}</span>
                  ) : usernameAvailable === true ? (
                    <span className="text-xs text-primary">Username available</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : currentUser.displayUsername || currentUser.username ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <HugeiconsIcon icon={AtIcon} strokeWidth={2} className="size-4" />
              <span>{currentUser.displayUsername || currentUser.username}</span>
            </div>
          ) : null}
        </div>
      </div>

      <Field>
        <FieldLabel className="flex items-center gap-2">
          <HugeiconsIcon icon={Note01Icon} strokeWidth={2} className="size-4" />
          Bio
        </FieldLabel>
        {isEditing ? (
          <textarea
            value={formData.bio}
            onChange={(e) => setFormData((p) => ({ ...p, bio: e.target.value }))}
            placeholder="Tell us about yourself..."
            rows={4}
            className="w-full resize-none rounded-3xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        ) : (
          <p className="text-sm text-muted-foreground">{currentUser.bio || "No bio yet."}</p>
        )}
      </Field>

      <Separator />

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Account</h3>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Member since</dt>
            <dd>
              {new Date(currentUser._creationTime).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Last updated</dt>
            <dd>
              {new Date(currentUser.updatedAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </dd>
          </div>
        </dl>
      </div>

      {hasPassword ? (
        <>
          <Separator />
          <div className="flex flex-col gap-4">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <HugeiconsIcon icon={SquareLock02Icon} strokeWidth={2} className="size-4" />
              Security
            </h3>

            {passwordSuccess && !isChangingPassword ? (
              <p className="text-sm text-primary">
                Password changed. Other sessions have been signed out.
              </p>
            ) : null}

            {!isChangingPassword ? (
              <Button variant="outline" onClick={openPasswordForm} className="self-start">
                Change password
              </Button>
            ) : (
              <form onSubmit={handleChangePassword} className="flex max-w-sm flex-col gap-3">
                <FieldGroup>
                  <Field data-invalid={!!passwordErrors.currentPassword || undefined}>
                    <FieldLabel>Current password</FieldLabel>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      value={passwordForm.currentPassword}
                      onChange={(e) =>
                        setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))
                      }
                      aria-invalid={!!passwordErrors.currentPassword}
                      disabled={isSavingPassword}
                    />
                    {passwordErrors.currentPassword ? (
                      <FieldError>{passwordErrors.currentPassword}</FieldError>
                    ) : null}
                  </Field>
                  <Field data-invalid={!!passwordErrors.newPassword || undefined}>
                    <FieldLabel>New password</FieldLabel>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={passwordForm.newPassword}
                      onChange={(e) =>
                        setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))
                      }
                      aria-invalid={!!passwordErrors.newPassword}
                      disabled={isSavingPassword}
                    />
                    {passwordErrors.newPassword ? (
                      <FieldError>{passwordErrors.newPassword}</FieldError>
                    ) : null}
                  </Field>
                  <Field data-invalid={!!passwordErrors.confirmPassword || undefined}>
                    <FieldLabel>Confirm new password</FieldLabel>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) =>
                        setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))
                      }
                      aria-invalid={!!passwordErrors.confirmPassword}
                      disabled={isSavingPassword}
                    />
                    {passwordErrors.confirmPassword ? (
                      <FieldError>{passwordErrors.confirmPassword}</FieldError>
                    ) : null}
                  </Field>
                  {passwordErrors.general ? (
                    <FieldError>{passwordErrors.general}</FieldError>
                  ) : null}
                  <FieldDescription>
                    Other sessions will be signed out for security.
                  </FieldDescription>
                </FieldGroup>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closePasswordForm}
                    disabled={isSavingPassword}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSavingPassword}>
                    <HugeiconsIcon
                      icon={isSavingPassword ? Loading03Icon : FloppyDiskIcon}
                      strokeWidth={2}
                      className={cn(isSavingPassword && "animate-spin")}
                      data-icon="inline-start"
                    />
                    Save password
                  </Button>
                </div>
              </form>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
