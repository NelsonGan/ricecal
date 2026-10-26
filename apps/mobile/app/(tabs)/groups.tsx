import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useUserId } from '@/data'
import { useMyGroups } from '@/data/groups'
import { GroupBoardScreen } from '@/features/groups/Board'
import { GroupsHome } from '@/features/groups/Home'
import { setOpenGroup, useOpenGroup } from '@/features/groups/store'
import { Aside, EmptyState, Screen, useWindowLayout } from '@/ui'

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
  // And is forgotten then, so rejoining later does not reopen a stale day.
  // Not while the list is refetching: a list read before a join (the one kept
  // on disk, at launch) would forget a group the person has just joined.
  const fetching = groups.isFetching
  useEffect(() => {
    if (open && !stillIn && !fetching) setOpenGroup(userId, null)
  }, [open, stillIn, fetching, userId])
  const { split } = useWindowLayout()
  const { t } = useTranslation('groups')

  const board = groupId ? (
    <GroupBoardScreen key={groupId} groupId={groupId} onBack={() => setOpenGroup(userId, null)} />
  ) : null
  const home = <GroupsHome onOpen={(id) => setOpenGroup(userId, id)} />
  // The board's only field is in a sheet, so it never makes way for a keyboard:
  // the chat's, opened over it, slid the chat bar up behind the chat and then
  // down again on the way back. The list's search field still needs it.
  return (
    <Screen scroll={false} flush keyboardAvoid={groupId ? 'none' : 'padding'}>
      {split ? (
        // With two panes the list stays, and the group opens beside it: the
        // same two levels, both on screen. Its back button closes it.
        <>
          {home}
          <Aside>
            {board ?? (
              <View className="flex-1 justify-center p-gutter">
                <EmptyState icon={{ set: 'food', name: 'rice-bowl' }} title={t('pickGroup')} />
              </View>
            )}
          </Aside>
        </>
      ) : (
        (board ?? home)
      )}
    </Screen>
  )
}
