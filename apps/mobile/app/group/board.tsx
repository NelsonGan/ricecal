import { useLocalSearchParams, useNavigation } from 'expo-router'
import { useEffect } from 'react'
import { GroupBoardScreen } from '@/features/groups/Board'
import { showTabUnder, useBack } from '@/lib/navigation'
import { Screen } from '@/ui'

/**
 * One group's whole board: every member, and the sixty days before today.
 * Opened from the group's card on Social, and from a nudge's notification,
 * which pushes it over whatever tab was showing and then puts Social under
 * it, so back lands on the group's card.
 */
export default function GroupBoardRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const back = useBack('/social')
  const navigation = useNavigation()
  useEffect(() => {
    const unsubscribe = navigation.addListener('transitionEnd' as never, () =>
      showTabUnder(navigation as unknown as Parameters<typeof showTabUnder>[0], 'social'),
    )
    return unsubscribe
  }, [navigation])
  return (
    // The board's only field is in a sheet, so it never makes way for a keyboard.
    <Screen scroll={false} flush keyboardAvoid="none">
      <GroupBoardScreen key={id} groupId={id} onBack={back} />
    </Screen>
  )
}
