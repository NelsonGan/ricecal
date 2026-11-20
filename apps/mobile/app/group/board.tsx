import { useLocalSearchParams } from 'expo-router'
import { GroupBoardScreen } from '@/features/groups/Board'
import { useBack, useTabUnder } from '@/lib/navigation'
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
  useTabUnder('social')
  return (
    // The board's only field is in a sheet, so it never makes way for a keyboard.
    <Screen scroll={false} flush keyboardAvoid="none">
      <GroupBoardScreen key={id} groupId={id} onBack={back} />
    </Screen>
  )
}
