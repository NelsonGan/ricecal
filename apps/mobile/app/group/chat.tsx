import { useLocalSearchParams } from 'expo-router'
import { ChatScreen } from '@/features/groups/Chat'

export default function GroupChatRoute() {
  const { id, reply } = useLocalSearchParams<{ id: string; reply?: string }>()
  return <ChatScreen key={id} groupId={id} reply={reply === '1'} />
}
