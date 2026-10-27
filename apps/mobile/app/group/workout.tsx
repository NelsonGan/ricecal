import { useLocalSearchParams } from 'expo-router'
import { GroupWorkoutScreen } from '@/features/groups/WorkoutView'

export default function GroupWorkoutRoute() {
  const { group, source, id } = useLocalSearchParams<{
    group: string
    source: string
    id: string
  }>()
  return (
    <GroupWorkoutScreen
      key={`${source}:${id}`}
      groupId={group}
      source={source === 'activity' ? 'activity' : 'workout'}
      id={id}
    />
  )
}
