import { useLocalSearchParams } from 'expo-router'
import { GroupFoodScreen } from '@/features/groups/FoodView'

export default function GroupFoodRoute() {
  const { group, post } = useLocalSearchParams<{
    group: string
    post: string
  }>()
  return <GroupFoodScreen key={`${group}:${post}`} groupId={group} postId={post} />
}
