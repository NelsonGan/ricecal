import { useUserId } from '@/data'
import { useMyGroups } from '@/data/groups'
import { GroupBoardScreen } from '@/features/groups/Board'
import { GroupsHome } from '@/features/groups/Home'
import { setOpenGroup, useOpenGroup } from '@/features/groups/store'
import { Screen } from '@/ui'

/**
 * The list of groups, or the board of the one last opened. Reopening on the
 * board is the point: most people are in one group, and tapping through the
 * list every launch is the step they would skip. Back on the board clears it.
 */
export default function GroupsTab() {
  const userId = useUserId()
  const open = useOpenGroup(userId)
  const groups = useMyGroups()
  // A group left or deleted elsewhere falls back to the list once the list
  // says so; until it has loaded, the remembered board is trusted.
  const stillIn = !groups.data || groups.data.some((group) => group.id === open)
  const groupId = open && stillIn ? open : null
  return (
    <Screen scroll={false} flush>
      {groupId ? (
        <GroupBoardScreen
          key={groupId}
          groupId={groupId}
          onBack={() => setOpenGroup(userId, null)}
        />
      ) : (
        <GroupsHome onOpen={(id) => setOpenGroup(userId, id)} />
      )}
    </Screen>
  )
}
