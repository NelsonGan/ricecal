import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect } from 'react'
import { useUserId } from '@/data'
import { GroupsHome } from '@/features/groups/Home'
import { setGroupsPageOnTop, setOpenGroup } from '@/features/groups/store'
import { useBack, useTabUnder } from '@/lib/navigation'

/**
 * Every group the viewer is in, the invites waiting, a new group and the
 * public groups to join. Choosing, joining or making one shows it on Social.
 * `new=1` opens the new group sheet and `invites=1` the invites; each is
 * cleared once read, so an invite tapped while this page is open can set it
 * again rather than push a second page.
 */
export default function GroupsRoute() {
  const { new: start, invites } = useLocalSearchParams<{ new?: string; invites?: string }>()
  const userId = useUserId()
  const router = useRouter()
  const back = useBack('/social')
  useTabUnder('social')
  useFocusEffect(
    useCallback(() => {
      setGroupsPageOnTop(true)
      return () => setGroupsPageOnTop(false)
    }, []),
  )
  const asked = start === '1' || invites === '1'
  useEffect(() => {
    if (asked) router.setParams({ new: undefined, invites: undefined })
  }, [asked, router])
  return (
    <GroupsHome
      onBack={back}
      startOpen={start === '1'}
      invitesOpen={invites === '1'}
      onOpen={(id) => {
        setOpenGroup(userId, id)
        router.dismissTo('/social')
      }}
    />
  )
}
