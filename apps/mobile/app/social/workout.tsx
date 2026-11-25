import { useLocalSearchParams } from 'expo-router'
import { PostWorkoutScreen } from '@/features/groups/WorkoutView'

export default function SocialWorkoutRoute() {
  const { post } = useLocalSearchParams<{ post: string }>()
  return <PostWorkoutScreen key={post} postId={post} />
}
