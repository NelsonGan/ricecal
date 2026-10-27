import { useRouter } from 'expo-router'
import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { storedImageSource, useMealPhotoUrl, useUserId } from '@/data'
import {
  type BoardEntry,
  type GroupMeal,
  type GroupPerson,
  groupError,
  useGroupAction,
} from '@/data/groups'
import { MealPhoto } from '@/features/shared'
import { SocialPhoto } from '@/features/social/components'
import { Avatar, Icon, type IconProps, Tappable, useToast } from '@/ui'

/** The drawings a group can wear, from the food set every entry already uses. */
export const GROUP_ICONS = [
  'rice-bowl',
  'noodle-bowl',
  'dumpling',
  'satay',
  'avocado',
  'smoothie',
  'coffee',
  'chilli',
] as const

export function GroupIcon({ name, size = 40 }: { name: string; size?: number }) {
  return <Icon {...foodIcon(name)} size={size} />
}

function foodIcon(name: string): IconProps {
  return { set: 'food', name } as IconProps
}

/** A person's picture, or their initial on a coloured tile. */
export function PersonAvatar({ person, size = 'sm' }: { person: GroupPerson; size?: 'xs' | 'sm' }) {
  if (!person.avatar_path) return <Avatar name={person.name} size={size} fallback="initial" />
  return <SocialPhoto path={person.avatar_path} avatar size={size} label={person.name} />
}

/** Opens someone's feed profile, the same screen the feed opens for them. */
export function useOpenProfile() {
  const router = useRouter()
  return useCallback(
    (personId: string) =>
      router.push({ pathname: '/social/profile/[id]', params: { id: personId } }),
    [router],
  )
}

/** Opens a group member's workout as its own page draws it. */
export function useOpenGroupWorkout(groupId: string) {
  const router = useRouter()
  return useCallback(
    (workout: { source: 'workout' | 'activity'; id: string }) =>
      router.push({
        pathname: '/group/workout',
        params: { group: groupId, source: workout.source, id: workout.id },
      }),
    [router, groupId],
  )
}

/** A face that opens its owner's feed, as a face does in the feed itself. */
export function PersonAvatarLink({
  person,
  size = 'sm',
}: {
  person: GroupPerson
  size?: 'xs' | 'sm'
}) {
  const { t } = useTranslation('groups')
  const open = useOpenProfile()
  return (
    <Tappable
      haptics={false}
      hitSlop={6}
      onPress={() => open(person.id)}
      accessibilityRole="button"
      accessibilityLabel={t('openProfile', { name: person.name })}
    >
      <PersonAvatar person={person} size={size} />
    </Tappable>
  )
}

/** What a picture needs of an entry or a shared food. */
type Pictured = Pick<BoardEntry, 'name' | 'photo_path' | 'icon_set' | 'icon_name'>

/**
 * An entry's picture: the photo when there is one, its drawing otherwise. The
 * viewer's own photos are signed as their own; a friend's go through the social
 * signer, which checks the two share a group.
 */
export function EntryPicture({
  entry,
  ownerId,
  iconSize = 40,
}: {
  entry: Pictured
  ownerId: string
  iconSize?: number
}) {
  const viewer = useUserId()
  if (entry.photo_path && ownerId === viewer)
    return <OwnPhoto path={entry.photo_path} label={entry.name} />
  if (entry.photo_path) {
    return <SocialPhoto path={entry.photo_path} label={entry.name} />
  }
  return (
    <View className="h-full w-full items-center justify-center">
      <Icon
        {...((entry.icon_set && entry.icon_name
          ? { set: entry.icon_set, name: entry.icon_name }
          : { set: 'food', name: 'cooking-pot' }) as IconProps)}
        size={iconSize}
      />
    </View>
  )
}

function OwnPhoto({ path, label }: { path: string; label: string }) {
  const photo = useMealPhotoUrl(path)
  const source = storedImageSource(path, photo.data)
  if (!source) return null
  return <MealPhoto source={source} accessibilityLabel={label} />
}

/** A soft fill for a drawn entry, chosen by the meal so a column reads as one. */
export const MEAL_TINT: Record<GroupMeal, string> = {
  breakfast: 'bg-kaya-soft',
  lunch: 'bg-pandan-soft',
  dinner: 'bg-water-soft',
}

/** A short form for a tile: "45m", "1h 20m". */
export function shortDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes}m`
  const rest = minutes % 60
  return rest ? `${Math.floor(minutes / 60)}h ${rest}m` : `${Math.floor(minutes / 60)}h`
}

/**
 * The group mutation with its refusals turned into a toast. `run` rethrows so a
 * sheet can stay open; `press` swallows for a plain button. Both keep their
 * identity across renders, so a list row handed one is not redrawn for it.
 */
export function useGroupTask() {
  const mutation = useGroupAction()
  const toast = useToast()
  const { t } = useTranslation('groups')
  // Read when a task fails, not when the callbacks are made, so they need not
  // change when the toast or the language does.
  const latest = useRef({ toast, t })
  latest.current = { toast, t }
  const { mutateAsync } = mutation
  const run = useCallback(
    async (input: Parameters<typeof mutateAsync>[0]) => {
      try {
        return await mutateAsync(input)
      } catch (error) {
        const reason = groupError(error)
        const { toast, t } = latest.current
        toast.show({
          title: t(`errors.${reason && reason in ERRORS ? (reason as ErrorKey) : 'generic'}`),
          tone: 'error',
        })
        throw error
      }
    },
    [mutateAsync],
  )
  const press = useCallback(
    (input: Parameters<typeof mutateAsync>[0]) => {
      void run(input).catch(() => undefined)
    },
    [run],
  )
  return { ...mutation, run, press }
}

const ERRORS = {
  not_found: true,
  already_member: true,
  group_full: true,
  too_many_groups: true,
  rate_limited: true,
  nudge_closed: true,
  invite_gone: true,
  choose_leader: true,
} as const
type ErrorKey = keyof typeof ERRORS
