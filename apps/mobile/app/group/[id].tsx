import { useLocalSearchParams } from 'expo-router'
import { GroupSettingsScreen } from '@/features/groups/Settings'

export default function GroupSettingsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <GroupSettingsScreen key={id} groupId={id} />
}
