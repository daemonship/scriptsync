import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signout } from '@/app/(auth)/actions'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <span className="font-semibold text-gray-900">ScriptSync</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user.email}</span>
            {process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK && (
              <a
                href={process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                Upgrade
              </a>
            )}
            <form action={signout}>
              <button
                type="submit"
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  )
}
