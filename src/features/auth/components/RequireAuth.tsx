import { Navigate } from 'react-router'
import { AppLayout } from '../../../components/AppLayout.tsx'
import { LoadingScreen } from '../../../components/LoadingScreen.tsx'
import { useSession } from '../useSession.ts'
import { UsageNoticeDialog } from './UsageNoticeDialog.tsx'

export function RequireAuth() {
  const session = useSession()

  if (session === undefined) {
    return <LoadingScreen />
  }

  if (session === null) {
    return <Navigate to="/login" replace />
  }

  return (
    <>
      <AppLayout />
      <UsageNoticeDialog />
    </>
  )
}
