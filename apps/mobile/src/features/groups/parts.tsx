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
import { openPaywall, proFeatureTitle } from '@/data/refusals'
import { MealPhoto } from '@/features/shared'
import { SocialPhoto } from '@/features/social/components'
import { Avatar, Icon, type IconProps, ProRing, Tappable, useToast } from '@/ui'

/**
 * The drawings any group can wear, from the food set every entry already
 * uses. Seven, so the picker shows them in one row. `free_group_icons()` in
 * Postgres also allows `chilli`, which an older app still offers.
 */
export const GROUP_ICONS = [
  'rice-bowl',
  'noodle-bowl',
  'dumpling',
  'satay',
  'avocado',
  'smoothie',
  'coffee',
] as const

/** The drawings only a Pro leader can give a group. */
export const PRO_GROUP_ICONS = [
  'sushi-roll',
  'pizza-slice',
  'burger',
  'ice-cream',
  'cupcake',
  'chilli',
  'doughnut',
  'cake-slice',
  'watermelon',
  'strawberry',
  'mango',
  'pineapple',
  'coconut',
  'roti',
  'porridge',
  'prawn',
  'crab',
  'chicken-drumstick',
  'beef-steak',
  'fried-egg',
  'pancakes',
  'waffle',
  'tea-cup',
  'protein-shaker',
  'leafy-greens',
  'spring-roll',
  'kuih',
] as const

/**
 * A group's icon: its uploaded picture when it has one, its drawing
 * otherwise. The drawing sits under the picture, so it shows while the
 * picture is signed and stays when signing is refused (somebody outside the
 * group, or an uploader whose account has gone).
 *
 * `fill` makes the picture fill its parent tile rather than a `size` square.
 */
export function GroupIcon({
  name,
  path,
  size = 40,
  fill = false,
}: {
  name: string
  path?: string | null
  size?: number
  fill?: boolean
}) {
  if (!path) return <Icon {...foodIcon(name)} size={size} />
  const box = fill
    ? { width: '100%' as const, height: '100%' as const }
    : { width: size, height: size }
  return (
    <View style={box} className="items-center justify-center overflow-hidden rounded-tile">
      <Icon {...foodIcon(name)} size={fill ? 32 : size} />
      <View className="absolute inset-0">
        <SocialPhoto path={path} label={name} />
      </View>
    </View>
  )
}

function foodIcon(name: string): IconProps {
  return { set: 'food', name } as IconProps
}

/** A person's picture, or their initial on a coloured tile. */
export function PersonAvatar({ person, size = 'sm' }: { person: GroupPerson; size?: 'xs' | 'sm' }) {
  return (
    <ProRing pro={person.is_pro} size={size}>
      {person.avatar_path ? (
        <SocialPhoto path={person.avatar_path} avatar size={size} label={person.name} />
      ) : (
        <Avatar name={person.name} size={size} fallback="initial" />
      )}
    </ProRing>
  )
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

/**
 * Opens a group member's workout as its own page draws it. The viewer's own
 * opens their own page instead, with its notes, records and menu.
 */
export function useOpenGroupWorkout(groupId: string) {
  const router = useRouter()
  const viewer = useUserId()
  return useCallback(
    (workout: { source: 'workout' | 'activity'; id: string }, ownerId: string) => {
      if (ownerId === viewer) {
        router.push(
          workout.source === 'workout'
            ? { pathname: '/workout/[id]', params: { id: workout.id } }
            : { pathname: '/activity/workout/[id]', params: { id: workout.id } },
        )
        return
      }
      router.push({
        pathname: '/group/workout',
        params: { group: groupId, source: workout.source, id: workout.id },
      })
    },
    [router, groupId, viewer],
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
        // A free account's third group: the price, not an error. The sheet's
        // own check usually gets there first; this is a group started on
        // another phone, or a list that had not loaded.
        if (reason === 'group_limit_reached') {
          openPaywall(toast, { title: proFeatureTitle('new_group'), feature: 'new_group' })
          throw error
        }
        // A Pro drawing or picture after the subscription lapsed on another
        // phone, or before this one heard: the picker's own check missed it.
        if (reason === 'pro_group_icon') {
          openPaywall(toast, { title: proFeatureTitle('group_icon'), feature: 'group_icon' })
          throw error
        }
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
