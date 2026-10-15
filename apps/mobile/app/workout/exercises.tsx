import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useExerciseBests } from '@/data'
import {
  CATEGORIES,
  CATEGORY_KEY,
  type Category,
  cancelPick,
  deliverPick,
  EQUIPMENT,
  EQUIPMENT_KEY,
  type Equipment,
  ExerciseArt,
  hasPick,
  LEVEL_KEY,
  LEVELS,
  type Level,
  type LibraryExercise,
  type LibraryFilters,
  MUSCLE_KEY,
  MUSCLES,
  type Muscle,
  planFor,
  searchExercises,
  useExerciseLibrary,
} from '@/features/workouts'
import { useDebouncedValue } from '@/lib/use-debounce'
import { spacing } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import {
  AppBar,
  Badge,
  Button,
  Chip,
  cn,
  EmptyState,
  Icon,
  IconButton,
  Screen,
  SearchField,
  Sheet,
  Tappable,
  Text,
} from '@/ui'

/**
 * The exercise library: every built-in exercise and the user's own, searched
 * by name or alias and narrowed by body part, equipment, level and muscle.
 *
 * Two modes. Browsing (the tab's "Exercises") opens an exercise's page. Picking
 * (`pick=one|many`, from the logger or the routine editor) ticks exercises and
 * hands them back through `features/workouts/pick.ts`.
 */
export default function ExercisesScreen() {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ pick?: 'one' | 'many'; category?: string }>()
  const picking = params.pick === 'one' || params.pick === 'many'
  const single = params.pick === 'one'
  const library = useExerciseLibrary()
  const bests = useExerciseBests(null).data

  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 120)
  const [category, setCategory] = useState<Category | null>(
    (CATEGORIES as readonly string[]).includes(params.category ?? '')
      ? (params.category as Category)
      : null,
  )
  const [filters, setFilters] = useState<Omit<LibraryFilters, 'category'>>({})
  const chips = useRef<ScrollView>(null)
  const scrolledToChip = useRef(false)
  const [filtering, setFiltering] = useState(false)
  const [chosen, setChosen] = useState<string[]>([])

  // Leaving without choosing must not leave the opener's callback armed for
  // the next time the library is opened from somewhere else.
  useEffect(() => () => cancelPick(), [])

  const results = useMemo(
    () => searchExercises(library.all, debounced, { ...filters, category }),
    [library.all, debounced, filters, category],
  )

  // Recently done first when nothing is being searched: the exercise somebody
  // is looking for is usually one they did last week.
  const recent = useMemo(() => {
    if (debounced || category || Object.values(filters).some(Boolean)) return []
    return (bests ?? [])
      .filter((entry) => entry.lastAt)
      .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))
      .slice(0, 6)
      .map((entry) => library.byId(entry.exerciseId))
      .filter((exercise): exercise is LibraryExercise => Boolean(exercise))
  }, [bests, debounced, category, filters, library])

  const rows: Row[] = [
    ...(recent.length
      ? [{ kind: 'heading' as const, key: 'h-recent', label: t('workouts:library.recent') }]
      : []),
    ...recent.map((exercise) => ({ kind: 'exercise' as const, key: `r-${exercise.id}`, exercise })),
    ...(recent.length
      ? [{ kind: 'heading' as const, key: 'h-all', label: t('workouts:library.all') }]
      : []),
    ...results.map((exercise) => ({ kind: 'exercise' as const, key: exercise.id, exercise })),
  ]

  const activeFilters = Object.values(filters).filter(Boolean).length

  const choose = (exercise: LibraryExercise) => {
    if (!picking) {
      router.push({ pathname: '/workout/exercise/[id]', params: { id: exercise.id } })
      return
    }
    if (single) {
      finish([exercise])
      return
    }
    setChosen((current) =>
      current.includes(exercise.id)
        ? current.filter((id) => id !== exercise.id)
        : [...current, exercise.id],
    )
  }

  const finish = (exercises: LibraryExercise[]) => {
    // Back first, then hand over. An opener that navigates with the result
    // ("Log a sport" opens the logger) pushed its screen and then had this
    // back pop it straight off again.
    router.back()
    if (hasPick()) {
      deliverPick(exercises.map(planFor))
    }
  }

  return (
    <Screen
      header={
        <AppBar
          title={
            !picking
              ? t('workouts:library.title')
              : params.category === 'sports'
                ? t('workouts:start.sport')
                : single
                  ? t('workouts:library.replaceTitle')
                  : t('workouts:library.pickTitle')
          }
          onBack={() => router.back()}
          backLabel={t('common:action.back')}
          action={
            <IconButton
              size="sm"
              variant="neutral"
              accessibilityLabel={t('workouts:library.create')}
              onPress={() => router.push('/workout/custom')}
            >
              <Icon set="ui" name="plus" size={20} />
            </IconButton>
          }
        />
      }
      scroll={false}
      flush
      footer={
        picking && !single && chosen.length ? (
          <Button
            fullWidth
            onPress={() =>
              finish(
                chosen
                  .map((id) => library.byId(id))
                  .filter((exercise): exercise is LibraryExercise => Boolean(exercise)),
              )
            }
          >
            {t('workouts:library.add', { count: chosen.length })}
          </Button>
        ) : undefined
      }
    >
      <View className="gap-3 px-gutter pb-2">
        <View className="flex-row items-center gap-2">
          <SearchField
            containerClassName="flex-1"
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery('')}
            clearLabel={t('workouts:library.clear')}
            placeholder={t('workouts:library.search')}
          />
          <Tappable
            className={cn(
              'h-[56px] flex-row items-center gap-1.5 rounded-md border-2 px-3',
              activeFilters ? 'border-pandan bg-pandan-soft' : 'border-line bg-surface',
            )}
            onPress={() => setFiltering(true)}
            accessibilityRole="button"
            accessibilityLabel={t('workouts:library.filters')}
          >
            <Icon set="ui" name="filter" size={20} />
            {activeFilters ? <Text variant="label">{activeFilters}</Text> : null}
          </Tappable>
        </View>
        <ScrollView
          ref={chips}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          <Chip selected={category === null} onPress={() => setCategory(null)}>
            {t('workouts:library.all')}
          </Chip>
          {CATEGORIES.map((value) => (
            <View
              key={value}
              // Opened on a category ("Log a sport" opens on Sports, the
              // second to last), the row scrolls to show it chosen; otherwise
              // the list looked filtered by nothing anybody could see.
              onLayout={(event) => {
                if (value !== params.category || scrolledToChip.current) return
                scrolledToChip.current = true
                chips.current?.scrollTo({ x: event.nativeEvent.layout.x, animated: false })
              }}
            >
              <Chip
                selected={category === value}
                onPress={() => setCategory(category === value ? null : value)}
              >
                {t(CATEGORY_KEY[value])}
              </Chip>
            </View>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={14}
        renderItem={({ item }) =>
          item.kind === 'heading' ? (
            <Text variant="overline" className="pb-1 pt-3">
              {item.label}
            </Text>
          ) : (
            <ExerciseRow
              exercise={item.exercise}
              picking={picking && !single}
              checked={chosen.includes(item.exercise.id)}
              onPress={() => choose(item.exercise)}
            />
          )
        }
        ListEmptyComponent={
          <EmptyState
            title={t('workouts:library.noneTitle')}
            description={t('workouts:library.noneBody')}
            icon={{ set: 'body', name: 'gym-bench' }}
            action={
              <Button
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/workout/custom', params: { name: query } })
                }
              >
                {t('workouts:library.create')}
              </Button>
            }
          />
        }
        contentContainerStyle={{
          paddingHorizontal: spacing.gutter,
          paddingBottom: spacing.gutter + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
      />

      <FilterSheet
        visible={filtering}
        onClose={() => setFiltering(false)}
        filters={filters}
        onChange={setFilters}
      />
    </Screen>
  )
}

type Row =
  | { kind: 'heading'; key: string; label: string }
  | { kind: 'exercise'; key: string; exercise: LibraryExercise }

function ExerciseRow({
  exercise,
  picking,
  checked,
  onPress,
}: {
  exercise: LibraryExercise
  picking: boolean
  checked: boolean
  onPress: () => void
}) {
  const { t } = useTranslation(['workouts'])
  const colors = useThemeColors()
  const primary = Object.entries(exercise.muscles).sort((a, b) => b[1] - a[1])[0]?.[0] as
    | Muscle
    | undefined

  return (
    <Tappable
      className={cn(
        'flex-row items-center gap-3 rounded-tile px-2 py-2',
        checked ? 'bg-pandan-soft' : undefined,
      )}
      onPress={onPress}
      accessibilityRole={picking ? 'checkbox' : 'button'}
      accessibilityState={picking ? { checked } : undefined}
      accessibilityLabel={exercise.name}
    >
      <ExerciseArt exerciseId={exercise.id} category={exercise.category} size={56} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="bodyStrong" numberOfLines={2}>
          {exercise.name}
        </Text>
        <Text variant="meta" numberOfLines={1}>
          {[
            primary ? t(MUSCLE_KEY[primary]) : t(CATEGORY_KEY[exercise.category]),
            t(EQUIPMENT_KEY[exercise.equipment]),
          ].join(' · ')}
        </Text>
      </View>
      {exercise.custom ? (
        <Badge tone="water" size="sm">
          {t('workouts:custom.badge')}
        </Badge>
      ) : null}
      {picking ? (
        checked ? (
          <View className="h-[28px] w-[28px] items-center justify-center rounded-[8px] bg-pandan">
            <Icon set="ui" name="check" size={18} tintColor={colors.onPandan} />
          </View>
        ) : (
          <View className="h-[28px] w-[28px] rounded-[8px] border-2 border-line-strong bg-surface" />
        )
      ) : null}
    </Tappable>
  )
}

function FilterSheet({
  visible,
  onClose,
  filters,
  onChange,
}: {
  visible: boolean
  onClose: () => void
  filters: Omit<LibraryFilters, 'category'>
  onChange: (next: Omit<LibraryFilters, 'category'>) => void
}) {
  const { t } = useTranslation(['workouts', 'common'])

  const group = <T extends string>(
    title: string,
    values: readonly T[],
    label: (value: T) => string,
    current: T | null | undefined,
    set: (value: T | null) => void,
  ) => (
    <View className="gap-2">
      <Text variant="label">{title}</Text>
      <View className="flex-row flex-wrap gap-2">
        {values.map((value) => (
          <Chip
            key={value}
            selected={current === value}
            onPress={() => set(current === value ? null : value)}
          >
            {label(value)}
          </Chip>
        ))}
      </View>
    </View>
  )

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      title={t('workouts:library.filters')}
      fullHeight
      titleAction={
        <Button size="sm" variant="ghost" onPress={() => onChange({})}>
          {t('workouts:library.clear')}
        </Button>
      }
    >
      <View className="gap-5 pb-6">
        {group(
          t('workouts:library.equipment'),
          EQUIPMENT,
          (value: Equipment) => t(EQUIPMENT_KEY[value]),
          filters.equipment,
          (equipment) => onChange({ ...filters, equipment }),
        )}
        {group(
          t('workouts:library.level'),
          LEVELS,
          (value: Level) => t(LEVEL_KEY[value]),
          filters.level,
          (level) => onChange({ ...filters, level }),
        )}
        {group(
          t('workouts:library.muscle'),
          MUSCLES,
          (value: Muscle) => t(MUSCLE_KEY[value]),
          filters.muscle,
          (muscle) => onChange({ ...filters, muscle }),
        )}
        <Button fullWidth onPress={onClose}>
          {t('common:action.done')}
        </Button>
      </View>
    </Sheet>
  )
}
