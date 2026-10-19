import { useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { ToggleRow } from '@/features/shared/SettingRow'
import { AppBar, Badge, Button, Card, Icon, Text, useToast } from '@/ui'
import { MEMBERS } from './data'
import { LabScreen } from './LabScreen'
import { People } from './parts'

/**
 * Where an invite link lands. Every direction shares it, because the question
 * it answers is the same in all four: what will these people see of me.
 *
 * Logged or not is the one thing a member cannot hide, since it is the whole
 * of the accountability. Weight is the one thing nobody can share.
 */
export function JoinInvite() {
  const router = useRouter()
  const toast = useToast()
  const [calories, setCalories] = useState(true)
  const [photos, setPhotos] = useState(false)

  const join = () => {
    toast.show({ title: 'You joined Lunch Kakis', tone: 'success' })
    router.replace({ pathname: '/labs/groups/pact', params: { step: 'week' } })
  }

  return (
    <LabScreen
      header={
        <AppBar leading="dismiss" onBack={() => router.back()} backLabel="Close" title="Invite" />
      }
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={join}>
            Join Lunch Kakis
          </Button>
          <Button variant="ghost" fullWidth onPress={() => router.back()}>
            Not now
          </Button>
        </View>
      }
    >
      <View className="items-center gap-2 pt-2">
        <Icon set="system" name="users-group" size={96} />
        <Text variant="screenTitle" className="text-center">
          Wei Ling invited you
        </Text>
      </View>

      <Card>
        <Text variant="subtitle">Lunch Kakis</Text>
        <People who={MEMBERS.slice(1)} size="sm" />
        <View className="flex-row flex-wrap gap-2">
          <Badge tone="pandan" size="sm">
            Food only
          </Badge>
          <Badge tone="neutral" size="sm">
            4 members
          </Badge>
          <Badge tone="kaya" size="sm">
            Weekly pact
          </Badge>
        </View>
      </Card>

      <Card title="What the group sees" contentClassName="gap-0">
        <View className="flex-row items-center gap-3 py-2.5">
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="label">Whether you logged today</Text>
            <Text variant="meta">Always on. It is the accountability.</Text>
          </View>
          <Icon set="system" name="lock" size={26} />
        </View>
        <View className="h-px bg-line" />
        <ToggleRow title="Calories and macros" value={calories} onValueChange={setCalories} />
        <ToggleRow
          title="Meal photos"
          description={photos ? undefined : 'Friends see the dish drawing instead'}
          value={photos}
          onValueChange={setPhotos}
        />
        <View className="flex-row items-center gap-3 py-2.5">
          <View className="min-w-0 flex-1">
            <Text variant="label">Weight and body stats</Text>
          </View>
          <Text variant="meta">Never shared</Text>
        </View>
      </Card>
    </LabScreen>
  )
}
