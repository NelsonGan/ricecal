import { useLocalSearchParams, useRouter } from 'expo-router'
import { useUserId } from '@/data'
import { GroupsHome } from '@/features/groups/Home'
import { setOpenGroup } from '@/features/groups/store'
import { useBack } from '@/lib/navigation'

/**
 * Every group the viewer is in, the invites waiting, a new group and the
 * public ones to join. Choosing, joining or making one shows it on Social.
 * `new=1` opens the new group sheet, `invites=1` the invites.
 */
export default function GroupsRoute() {
  const { new: start, invites } = useLocalSearchParams<{ new?: string; invites?: string }>()
  const userId = useUserId()
  const router = useRouter()
  const back = useBack('/social')
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
