import * as Haptics from 'expo-haptics'
import { type ReactElement, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, View, type ViewToken } from 'react-native'

import type { SocialPage } from '@/data/social'
import { Button, cn, EmptyState, Skeleton, Text, useNavInset } from '@/ui'

function SocialSkeleton({
  variant = 'cards',
  count = 3,
}: {
  variant?: 'cards' | 'feed' | 'rows' | 'grid'
  count?: number
}) {
  const { t } = useTranslation('social')
  const slots = ['first', 'second', 'third', 'fourth']
  if (variant === 'grid') {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t('loading')}
        className="flex-row flex-wrap p-1"
      >
        {slots.slice(0, count === 3 ? 4 : 2).map((slot) => (
          <View key={slot} className="w-1/2 p-0.5">
            <Skeleton height={170} rounded={false} />
          </View>
        ))}
      </View>
    )
  }
  if (variant === 'rows') {
    return (
      <View accessibilityRole="progressbar" accessibilityLabel={t('loading')}>
        {slots.slice(0, count).map((slot, index) => (
          <View
            key={slot}
            className={cn(
              'min-h-[68px] flex-row items-center gap-3 py-3',
              index < count - 1 && 'border-b-2 border-track',
            )}
          >
            <Skeleton width={40} height={40} rounded={false} />
            <View className="min-w-0 flex-1 gap-2">
              <Skeleton width={112} />
              <Skeleton width={78} height={10} />
            </View>
            <Skeleton width={88} height={44} rounded={false} />
          </View>
        ))}
      </View>
    )
  }
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={t('loading')} className="gap-4 p-5">
      {slots.slice(0, count).map((slot) => (
        <View key={slot} className="gap-3 rounded-md bg-surface p-4">
          <View className="flex-row items-center gap-3">
            <Skeleton width={42} height={42} rounded={false} />
            <View className="flex-1 gap-2">
              <Skeleton width="55%" />
              <Skeleton width="30%" height={10} />
            </View>
          </View>
          <Skeleton height={180} rounded={false} />
          <Skeleton width="70%" height={12} />
        </View>
      ))}
    </View>
  )
}

type PageQuery<T> = {
  data?: { pages: SocialPage<T>[] }
  isPending: boolean
  isError: boolean
  isFetching: boolean
  isFetchingNextPage: boolean
  isFetchNextPageError: boolean
  hasNextPage: boolean
  fetchStatus: string
  fetchNextPage: () => Promise<unknown>
  refetch: () => Promise<unknown>
}
export function SocialList<T>({
  query,
  rowKey,
  renderRow,
  empty,
  end,
  header,
  variant = 'cards',
  columns = 1,
}: {
  query: PageQuery<T>
  rowKey: (row: T) => string
  renderRow: (row: T, visible: boolean) => ReactElement
  empty: string
  /** Said under the last row once there are no more pages. */
  end?: string
  header?: ReactElement
  variant?: 'cards' | 'feed' | 'rows' | 'grid'
  columns?: number
}) {
  const { t } = useTranslation('social')
  const [viewport, setViewport] = useState({ first: 0, last: columns - 1 })
  const [refreshing, setRefreshing] = useState(false)
  const navInset = useNavInset()
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<T>[] }) => {
    const indices = viewableItems.flatMap((item) => (item.index === null ? [] : [item.index]))
    const first = indices.length ? Math.min(...indices) : -1
    const last = indices.length ? Math.max(...indices) : -1
    setViewport((previous) =>
      previous.first === first && previous.last === last ? previous : { first, last },
    )
  }).current
  // Viewport changes do not change the pages. Reuse the deduplicated rows while scrolling.
  const rows = useMemo(() => {
    const seen = new Set<string>()
    return (query.data?.pages.flatMap((page) => page.rows) ?? []).filter((row) => {
      const id = rowKey(row)
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
  }, [query.data, rowKey])
  const next = () => {
    if (query.hasNextPage && !query.isFetching) void query.fetchNextPage()
  }
  const refresh = async () => {
    setRefreshing(true)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    try {
      await query.refetch()
    } finally {
      setRefreshing(false)
    }
  }
  // On a tab the nav bar floats over the end of the list, so the last row needs
  // that much more room to scroll clear of it. Zero on a pushed page.
  const bottom = 32 + navInset
  const contentContainerStyle =
    variant === 'feed'
      ? { paddingBottom: bottom }
      : variant === 'rows'
        ? { paddingHorizontal: 20, paddingBottom: bottom }
        : variant === 'grid'
          ? { padding: 2, paddingBottom: bottom }
          : { padding: 20, gap: 16, paddingBottom: bottom }
  return (
    <FlatList
      data={rows}
      keyExtractor={rowKey}
      extraData={viewport}
      renderItem={({ item, index }) => {
        // Authorize and decode two nearby rows before a scroll reveals them.
        // Keep the window bounded, including both directions and grid columns.
        const nearby =
          viewport.first >= 0 &&
          index >= viewport.first - 2 * columns &&
          index <= viewport.last + 2 * columns
        const row = renderRow(item, nearby)
        return variant === 'grid' ? (
          <View style={{ flex: 1 / columns }} className="p-0.5">
            {row}
          </View>
        ) : (
          row
        )
      }}
      numColumns={columns}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={{ itemVisiblePercentThreshold: 5 }}
      contentContainerStyle={contentContainerStyle}
      style={{ flex: 1 }}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={
        header ? { marginBottom: variant === 'feed' ? 0 : variant === 'grid' ? 12 : 16 } : undefined
      }
      ItemSeparatorComponent={
        variant === 'rows' ? () => <View className="h-[2px] bg-track" /> : undefined
      }
      keyboardShouldPersistTaps="handled"
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      windowSize={5}
      // Background invalidation, such as a completed Like, must not open the
      // native pull-to-refresh control and move the viewport.
      refreshing={refreshing}
      onRefresh={() => {
        void refresh()
      }}
      onEndReached={next}
      // A feed card takes almost a viewport. Fetch its next page early enough
      // for the two upcoming cards to authorize and decode their photos too.
      onEndReachedThreshold={variant === 'feed' ? 2 : 0.6}
      ListEmptyComponent={
        query.isPending && query.fetchStatus !== 'paused' ? (
          <SocialSkeleton variant={variant} />
        ) : (
          <EmptyState
            title={
              query.fetchStatus === 'paused' ? t('offline') : query.isError ? t('failed') : empty
            }
          />
        )
      }
      ListFooterComponent={
        query.isFetchNextPageError && rows.length > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            onPress={() => {
              void query.fetchNextPage()
            }}
          >
            {t('retry')}
          </Button>
        ) : query.isError && rows.length === 0 ? (
          <Button
            variant="neutral"
            onPress={() => {
              void query.refetch()
            }}
          >
            {t('retry')}
          </Button>
        ) : query.isFetchingNextPage ? (
          <SocialSkeleton variant={variant} count={1} />
        ) : query.hasNextPage ? (
          <Button
            size="sm"
            variant="ghost"
            onPress={() => {
              void query.fetchNextPage()
            }}
          >
            {t('loadMore')}
          </Button>
        ) : end && rows.length > 0 ? (
          <Text variant="meta" className="text-center">
            {end}
          </Text>
        ) : null
      }
      ListFooterComponentStyle={{ padding: 16 }}
    />
  )
}
export function QueryNotice({
  pending,
  error,
  paused,
  unavailable,
  retry,
}: {
  pending?: boolean
  error?: boolean
  paused?: boolean
  unavailable?: boolean
  retry: () => unknown
}) {
  const { t } = useTranslation('social')
  if (pending && !paused) return <SocialSkeleton />
  return (
    <View className="gap-3">
      <EmptyState
        title={
          paused
            ? t('offline')
            : error
              ? t('failed')
              : unavailable
                ? t('unavailable')
                : t('emptyPosts')
        }
      />
      {error ? (
        <Button
          variant="neutral"
          onPress={() => {
            retry()
          }}
        >
          {t('retry')}
        </Button>
      ) : null}
    </View>
  )
}
