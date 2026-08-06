import { requireProfile } from "@/lib/auth"
import { AppShell } from "@/components/layout/app-shell"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await requireProfile()

  return (
    <AppShell
      fullName={profile.full_name}
      role={profile.role}
      photoUrl={profile.photo_url}
      allowedModules={profile.allowed_modules}
    >
      {children}
    </AppShell>
  )
}
