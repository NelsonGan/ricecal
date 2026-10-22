import { useLocalSearchParams } from 'expo-router'
import { ChatScreen } from '@/features/groups/Chat'

export default function GroupChatRoute() {
  const { id, day } = useLocalSearchParams<{ id: string; day: string }>()
  return <ChatScreen key={`${id}:${day}`} groupId={id} day={day} />
}
