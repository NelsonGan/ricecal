import { useLocalSearchParams } from 'expo-router'
import { useSocialPostWorkout } from '@/data/social'
import { SharedWorkoutView } from '@/features/groups/WorkoutView'

export default function SocialWorkoutRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <SocialWorkoutScreen key={id} postId={id} />
}

function SocialWorkoutScreen({ postId }: { postId: string }) {
  const query = useSocialPostWorkout(postId)
  return (
    <SharedWorkoutView
      view={query.data}
      isError={query.isError}
      paused={query.fetchStatus === 'paused'}
      retry={() => query.refetch()}
    />
  )
}
