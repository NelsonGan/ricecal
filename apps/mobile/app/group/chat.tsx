import { useLocalSearchParams } from 'expo-router'
import { ChatScreen } from '@/features/groups/Chat'

export default function GroupChatRoute() {
  const { id, day, reply } = useLocalSearchParams<{ id: string; day: string; reply?: string }>()
  return <ChatScreen key={`${id}:${day}`} groupId={id} day={day} reply={reply === '1'} />
}
