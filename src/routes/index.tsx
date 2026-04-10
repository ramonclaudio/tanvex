import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react'
import { api } from '@convex/_generated/api'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const { data: user } = useQuery(api.users.getMe)
  const firstName = user?.name.split(' ')[0]

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <h1 className="text-4xl font-bold text-foreground">
        {firstName ? `Welcome, ${firstName}` : 'Welcome'}
      </h1>
    </div>
  )
}
