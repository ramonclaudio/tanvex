import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import {
  AuthLoading,
  Authenticated,
  Unauthenticated,
  useMutation,
} from 'convex/react'
import { useQuery } from 'convex-helpers/react'
import { AtSign, Camera, Check, FileText, Loader2, Mail, Save, User, X } from 'lucide-react'

import { api } from '@convex/_generated/api'
import { fetchAuthQuery } from '@/lib/auth-server'
import { authClient } from '@/lib/auth-client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Reserved usernames that cannot be used
const RESERVED_USERNAMES = [
  'admin',
  'administrator',
  'root',
  'system',
  'moderator',
  'mod',
  'support',
  'help',
  'info',
  'contact',
  'api',
  'www',
  'mail',
  'email',
  'test',
  'null',
  'undefined',
]

// Check if username is reserved (case-insensitive)
const isReservedUsername = (username: string) =>
  RESERVED_USERNAMES.includes(username.toLowerCase())

// Validate username format
const isValidUsernameFormat = (username: string) =>
  username.length >= 3 && username.length <= 30 && /^[a-zA-Z0-9_.]+$/.test(username)

// Server function to fetch profile data during SSR
const fetchProfileData = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const user = await fetchAuthQuery(api.users.getMe, {})
    return { user, error: null }
  } catch {
    // User not authenticated or error fetching
    return { user: null, error: 'not_authenticated' }
  }
})

export const Route = createFileRoute('/profile')({
  // SSR: Prefetch profile data before rendering
  loader: async () => {
    const { user, error } = await fetchProfileData()
    return { preloadedUser: user, error }
  },
  // Redirect unauthenticated users to auth page
  beforeLoad: async ({ context }) => {
    // Check if we have a token from the root route's auth check
    if (!context.token) {
      throw redirect({
        to: '/auth',
        search: { redirect: '/profile' },
      })
    }
  },
  component: ProfilePage,
})

function ProfilePage() {
  const { preloadedUser } = Route.useLoaderData()

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 lg:p-8">
        <AuthLoading>
          <ProfileSkeleton />
        </AuthLoading>

        <Authenticated>
          <ProfileContent preloadedUser={preloadedUser} />
        </Authenticated>

        <Unauthenticated>
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              Please sign in to view your profile.
            </p>
          </div>
        </Unauthenticated>
      </div>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-6 w-32 bg-muted rounded" />
          <div className="h-4 w-48 bg-muted rounded" />
        </div>
      </div>
      <div className="space-y-4">
        <div className="h-10 bg-muted rounded" />
        <div className="h-24 bg-muted rounded" />
      </div>
    </div>
  )
}

type PreloadedUser = {
  _id: string
  _creationTime: number
  email: string
  username?: string | null
  displayUsername?: string | null
  firstName?: string
  lastName?: string
  fullName?: string
  hasCustomName?: boolean
  avatarUrl?: string | null
  hasUploadedAvatar?: boolean
  bio?: string
  role?: 'user' | 'admin' | 'moderator'
  createdAt?: number
  updatedAt?: number
} | null

function ProfileContent({ preloadedUser }: { preloadedUser: PreloadedUser }) {
  // Use live query for real-time updates, falling back to preloaded data
  const { data: user, isPending } = useQuery(api.users.getMe)
  const updateProfile = useMutation(api.users.updateProfile)
  const clearNameMutation = useMutation(api.users.clearName)
  const generateUploadUrl = useMutation(api.users.generateAvatarUploadUrl)
  const updateAvatar = useMutation(api.users.updateAvatar)
  const deleteAvatarMutation = useMutation(api.users.deleteAvatar)

  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isClearingName, setIsClearingName] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Username availability state
  const [isCheckingUsername, setIsCheckingUsername] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const usernameCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Use live data if available, otherwise use preloaded
  const currentUser = user ?? preloadedUser
  const originalUsername = currentUser?.displayUsername ?? currentUser?.username ?? ''

  // Form state (avatar is handled separately via file upload)
  const [formData, setFormData] = useState({
    firstName: currentUser?.firstName ?? '',
    lastName: currentUser?.lastName ?? '',
    username: currentUser?.displayUsername ?? currentUser?.username ?? '',
    bio: currentUser?.bio ?? '',
  })

  // Check username availability with debounce
  const checkUsernameAvailability = useCallback(async (username: string) => {
    // Skip check if username is same as current
    if (username.toLowerCase() === originalUsername.toLowerCase()) {
      setUsernameAvailable(null)
      setUsernameError(null)
      return
    }

    if (!username || username.length < 3) {
      setUsernameAvailable(null)
      setUsernameError(null)
      return
    }

    // Validate format first
    if (!isValidUsernameFormat(username)) {
      setUsernameAvailable(null)
      setUsernameError('Username must be 3-30 characters (letters, numbers, underscores, dots)')
      return
    }

    // Check if reserved username
    if (isReservedUsername(username)) {
      setUsernameAvailable(false)
      setUsernameError('This username is reserved')
      return
    }

    setIsCheckingUsername(true)
    setUsernameError(null)
    try {
      const result = await authClient.isUsernameAvailable({ username })
      if (result.data) {
        setUsernameAvailable(result.data.available)
        if (!result.data.available) {
          setUsernameError('This username is already taken')
        }
      }
    } catch {
      setUsernameAvailable(null)
      setUsernameError(null)
    } finally {
      setIsCheckingUsername(false)
    }
  }, [originalUsername])

  // Debounced username check
  const handleUsernameChange = useCallback((username: string) => {
    setFormData((prev) => ({ ...prev, username }))
    setUsernameAvailable(null)
    setUsernameError(null)

    // Clear existing timeout
    if (usernameCheckTimeoutRef.current) {
      clearTimeout(usernameCheckTimeoutRef.current)
    }

    // Skip if same as original
    if (username.toLowerCase() === originalUsername.toLowerCase()) {
      return
    }

    // Skip if empty (clearing username)
    if (!username) {
      return
    }

    // Check reserved usernames immediately
    if (username.length >= 3 && isValidUsernameFormat(username)) {
      if (isReservedUsername(username)) {
        setUsernameAvailable(false)
        setUsernameError('This username is reserved')
        return
      }
      // Debounce the API call
      usernameCheckTimeoutRef.current = setTimeout(() => {
        checkUsernameAvailability(username)
      }, 500)
    }
  }, [checkUsernameAvailability, originalUsername])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (usernameCheckTimeoutRef.current) {
        clearTimeout(usernameCheckTimeoutRef.current)
      }
    }
  }, [])

  // Sync form when user data changes (e.g., from preloaded to live)
  const resetForm = () => {
    setFormData({
      firstName: currentUser?.firstName ?? '',
      lastName: currentUser?.lastName ?? '',
      username: currentUser?.displayUsername ?? currentUser?.username ?? '',
      bio: currentUser?.bio ?? '',
    })
    setUsernameAvailable(null)
    setUsernameError(null)
  }

  // Check if username change is valid for saving
  const isUsernameChangeValid = () => {
    const newUsername = formData.username
    // No change - valid
    if (newUsername.toLowerCase() === originalUsername.toLowerCase()) {
      return true
    }
    // Clearing username - valid
    if (!newUsername) {
      return true
    }
    // Has error or not available - invalid
    if (usernameError || usernameAvailable === false) {
      return false
    }
    // Still checking - invalid
    if (isCheckingUsername) {
      return false
    }
    // Available or same as original - valid
    return usernameAvailable === true || newUsername.toLowerCase() === originalUsername.toLowerCase()
  }

  const handleSave = async () => {
    if (!currentUser) return

    // Validate username before saving
    if (!isUsernameChangeValid()) {
      setError('Please fix the username issue before saving')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      // Update username via Better Auth if changed
      const currentUsername = currentUser.displayUsername ?? currentUser.username ?? ''
      if (formData.username !== currentUsername) {
        const result = await authClient.updateUser({
          username: formData.username || undefined,
        })
        if (result.error) {
          setError(result.error.message || 'Failed to update username')
          setIsSaving(false)
          return
        }
      }

      // Update other profile fields via Convex
      await updateProfile({
        firstName: formData.firstName || undefined,
        lastName: formData.lastName || undefined,
        bio: formData.bio || undefined,
      })
      setIsEditing(false)
      setUsernameAvailable(null)
      setUsernameError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    resetForm()
    setIsEditing(false)
    setError(null)
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleClearName = async () => {
    if (!currentUser?.hasCustomName) return

    setIsClearingName(true)
    setError(null)

    try {
      await clearNameMutation()
      // Clear form data too
      setFormData((prev) => ({ ...prev, firstName: '', lastName: '' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear name')
    } finally {
      setIsClearingName(false)
    }
  }

  const handleDeleteAvatar = async (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent triggering file picker
    if (!currentUser?.hasUploadedAvatar) return

    setIsUploadingAvatar(true)
    setError(null)

    try {
      await deleteAvatarMutation()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete avatar')
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      setError('Image must be less than 5MB')
      return
    }

    setIsUploadingAvatar(true)
    setError(null)

    try {
      // Step 1: Get upload URL from Convex
      const uploadUrl = await generateUploadUrl()

      // Step 2: Upload file to Convex storage
      const result = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      })

      if (!result.ok) {
        throw new Error('Failed to upload image')
      }

      const { storageId } = await result.json()

      // Step 3: Update user avatar with the storage ID
      await updateAvatar({ storageId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload avatar')
    } finally {
      setIsUploadingAvatar(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  if (isPending && !preloadedUser) {
    return <ProfileSkeleton />
  }

  if (!currentUser) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">User not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        {!isEditing ? (
          <Button
            onClick={() => {
              resetForm()
              setIsEditing(true)
            }}
          >
            Edit Profile
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !isUsernameChangeValid()}>
              {isSaving ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Save />
              )}
              Save
            </Button>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Avatar section */}
      <div className="flex items-center gap-6">
        <div className="relative">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          {/* Avatar - clickable only in edit mode */}
          {isEditing ? (
            <button
              type="button"
              onClick={handleAvatarClick}
              disabled={isUploadingAvatar}
              className="relative cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full"
              title="Click to change avatar"
            >
              <Avatar className="size-24 border-2 border-border group-hover:border-primary transition-colors">
                <AvatarImage
                  src={currentUser.avatarUrl || undefined}
                  alt={currentUser.fullName ?? 'User avatar'}
                />
                <AvatarFallback>
                  <User size={40} className="text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              {/* Overlay on hover */}
              <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {isUploadingAvatar ? (
                  <Loader2 className="size-8 text-white animate-spin" />
                ) : (
                  <Camera className="size-8 text-white" />
                )}
              </div>
            </button>
          ) : (
            <Avatar className="size-24 border-2 border-border">
              <AvatarImage
                src={currentUser.avatarUrl || undefined}
                alt={currentUser.fullName ?? 'User avatar'}
              />
              <AvatarFallback>
                <User size={40} className="text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
          )}
          {/* Delete avatar button - only in edit mode */}
          {isEditing && currentUser.hasUploadedAvatar && !isUploadingAvatar && (
            <Button
              type="button"
              size="icon-sm"
              variant="destructive"
              className="absolute -top-1 -right-1 rounded-full size-6"
              onClick={handleDeleteAvatar}
              title="Remove avatar"
            >
              <X className="size-3" />
            </Button>
          )}
        </div>

        <div className="space-y-1">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, firstName: e.target.value }))
                }
                placeholder="First name"
                className="text-xl font-semibold bg-transparent border-b border-input focus:border-primary outline-none text-foreground placeholder:text-muted-foreground w-32"
              />
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, lastName: e.target.value }))
                }
                placeholder="Last name"
                className="text-xl font-semibold bg-transparent border-b border-input focus:border-primary outline-none text-foreground placeholder:text-muted-foreground w-32"
              />
              {/* Clear name button - only show if user has custom name set */}
              {currentUser.hasCustomName && !isClearingName && (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="size-6"
                  onClick={handleClearName}
                  title="Clear custom name (revert to provider name)"
                >
                  <X className="size-3" />
                </Button>
              )}
              {isClearingName && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
            </div>
          ) : (
            <h2 className="text-xl font-semibold text-foreground">
              {currentUser.fullName || 'No name set'}
            </h2>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail size={14} />
            <span className="text-sm">{currentUser.email}</span>
          </div>
          {/* Username */}
          {isEditing ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <AtSign size={14} className="text-muted-foreground" />
                <div className="relative">
                  <Input
                    type="text"
                    value={formData.username}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    placeholder="username"
                    className={`h-7 text-sm w-40 pr-8 ${usernameError || usernameAvailable === false ? 'border-destructive' : ''}`}
                  />
                  {/* Availability indicator */}
                  {formData.username && formData.username.toLowerCase() !== originalUsername.toLowerCase() && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      {isCheckingUsername ? (
                        <Loader2 className="size-3 animate-spin text-muted-foreground" />
                      ) : usernameAvailable === true ? (
                        <Check className="size-3 text-green-500" />
                      ) : usernameAvailable === false || usernameError ? (
                        <X className="size-3 text-destructive" />
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
              {/* Username error/success message */}
              {formData.username && formData.username.toLowerCase() !== originalUsername.toLowerCase() && (
                <div className="ml-6">
                  {usernameError ? (
                    <span className="text-xs text-destructive">{usernameError}</span>
                  ) : usernameAvailable === true ? (
                    <span className="text-xs text-green-600">Username available</span>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            (currentUser.displayUsername || currentUser.username) && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <AtSign size={14} />
                <span className="text-sm">{currentUser.displayUsername || currentUser.username}</span>
              </div>
            )
          )}
          {currentUser.role && currentUser.role !== 'user' && (
            <span className="inline-block px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full capitalize">
              {currentUser.role}
            </span>
          )}
        </div>
      </div>

      {/* Bio section */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <FileText size={16} />
          Bio
        </label>
        {isEditing ? (
          <textarea
            value={formData.bio}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, bio: e.target.value }))
            }
            placeholder="Tell us about yourself..."
            rows={4}
            className="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        ) : (
          <p className="text-muted-foreground">
            {currentUser.bio || 'No bio yet.'}
          </p>
        )}
      </div>

      {/* Account info */}
      <div className="pt-6 border-t border-border">
        <h3 className="text-sm font-medium text-foreground mb-4">
          Account Information
        </h3>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Member since</dt>
            <dd className="text-foreground">
              {new Date(currentUser._creationTime).toLocaleDateString(
                undefined,
                {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }
              )}
            </dd>
          </div>
          {currentUser.updatedAt && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Last updated</dt>
              <dd className="text-foreground">
                {new Date(currentUser.updatedAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  )
}
