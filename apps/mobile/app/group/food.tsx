import { useLocalSearchParams } from 'expo-router'
import { GroupFoodScreen } from '@/features/groups/FoodView'

export default function GroupFoodRoute() {
  const { group, entry } = useLocalSearchParams<{ group: string; entry: string }>()
  return <GroupFoodScreen key={entry} groupId={group} entryId={entry} />
}
