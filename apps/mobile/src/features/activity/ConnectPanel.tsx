import { useTranslation } from 'react-i18next'
import { Linking, Platform, View } from 'react-native'

import type { Availability, ProviderId } from '@/lib/health'
import { Button, Card, Icon, Text } from '@/ui'

export type ConnectPanelProps = {
  availability: Availability
  /** Whether to offer generated data. Development builds, unusable store only. */
  demo: boolean
  busy: boolean
  /** Chunks read so far during a backfill, or null before one starts. */
  progress: { done: number; total: number } | null
  /** True after a granted-looking connect that produced no rows. iOS only. */
  cameBackEmpty: boolean
  onConnect: (provider: ProviderId) => void
  onRecheck: () => void
}

/**
 * A1 / N1 / N2: the screen before there is any data.
 *
 * Three jobs, and the third is the one that is usually skipped. It has to say
 * what will be read, it has to offer the connection — and when the connection
 * cannot be made it has to say WHY in terms of something the reader can do. "No
 * health data available" is the failure this component exists to avoid: on a
 * simulator the answer is "there is no Health app here", on an Android phone
 * without Health Connect it is "install it and turn on an app that records your
 * movement", and those are different sentences with different buttons.
 */
export function ConnectPanel({
  availability,
  demo,
  busy,
  progress,
  cameBackEmpty,
  onConnect,
  onRecheck,
}: ConnectPanelProps) {
  const { t } = useTranslation(['activity', 'common'])

  const isApple = Platform.OS === 'ios'
  const nativeId: ProviderId = isApple ? 'apple_health' : 'health_connect'

  return (
    <>
      <Card>
        <View className="items-center gap-2 pb-1">
          <Icon set="system" name="watch" size={64} />
          <Text variant="title" className="text-center">
            {t('connect.title')}
          </Text>
          <Text variant="body" className="text-center">
            {t('connect.body')}
          </Text>
        </View>
      </Card>

      <Card title={t('connect.readTitle')}>
        <View className="gap-3.5">
          <ReadRow
            icon={{ set: 'body', name: 'flame-burn' }}
            title={t('connect.energy')}
            body={t('connect.energyBody')}
          />
          <ReadRow
            icon={{ set: 'body', name: 'footprints' }}
            title={t('connect.steps')}
            body={t('connect.stepsBody')}
          />
          <ReadRow
            icon={{ set: 'body', name: 'stopwatch' }}
            title={t('connect.workouts')}
            body={t('connect.workoutsBody')}
          />
        </View>

        {/* The promise, kept where the permission is asked for rather than in a
            settings screen nobody opens. It is also literally true: the
            HealthKit request passes an empty `toShare`, and the Health Connect
            one asks only for read access. */}
        <Text variant="meta" className="pt-4">
          {t('connect.privacy')}
        </Text>
      </Card>

      {availability.ok ? (
        <Card>
          <View className="gap-3">
            {cameBackEmpty ? (
              // Only reachable on iOS, where a denied read is indistinguishable
              // from a granted one until the first query comes back with
              // nothing. The wording does not accuse the user of declining,
              // because we genuinely cannot tell.
              <View className="gap-1 pb-1">
                <Text variant="subtitle">{t('connect.emptyTitle')}</Text>
                <Text variant="body">{t('connect.emptyBody')}</Text>
              </View>
            ) : null}

            {/* "Continue", not the store's name.
                The same rule as the onboarding step, and the same rejection
                behind it: guideline 5.1.1(iv) reads a button that names the
                permission as the app doing the asking. Nothing is lost, because
                the line under the button still says which store this is and
                what it covers. */}
            <Button
              onPress={() => onConnect(nativeId)}
              loading={busy}
              disabled={busy}
              fullWidth
              leftIcon={<Icon set="system" name="watch" size={22} />}
            >
              {t('common:action.continue')}
            </Button>
            <Text variant="meta" className="text-center">
              {busy && progress
                ? t('connect.progress', progress)
                : busy
                  ? t('connect.connecting')
                  : isApple
                    ? t('connect.appleBody')
                    : t('connect.connectHealthBody')}
            </Text>
          </View>
        </Card>
      ) : (
        <Card tone="kaya">
          <View className="gap-2">
            <Text variant="subtitle" className="text-kaya-ink">
              {t('connect.unavailableTitle')}
            </Text>
            <Text variant="body" className="text-kaya-ink">
              {t(REASON_KEY[availability.reason])}
            </Text>

            {availability.reason === 'not-installed' ? (
              <Button
                variant="secondary"
                fullWidth
                className="pt-2"
                onPress={() => {
                  // The Play Store listing for Health Connect. `market://`
                  // opens the store app directly where it exists and falls
                  // through to the web listing where it does not.
                  Linking.openURL('market://details?id=com.google.android.apps.healthdata').catch(
                    () =>
                      Linking.openURL(
                        'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata',
                      ),
                  )
                }}
              >
                {t('connect.openStore')}
              </Button>
            ) : null}

            <Button variant="ghost" fullWidth onPress={onRecheck}>
              {t('connect.checkAgain')}
            </Button>
          </View>
        </Card>
      )}

      {demo ? (
        <Card>
          <View className="gap-3">
            <Button
              variant="secondary"
              fullWidth
              onPress={() => onConnect('demo')}
              loading={busy}
              disabled={busy}
            >
              {t('connect.demo')}
            </Button>
            <Text variant="meta" className="text-center">
              {t('connect.demoBody')}
            </Text>
          </View>
        </Card>
      ) : null}
    </>
  )
}

function ReadRow({
  icon,
  title,
  body,
}: {
  icon: Parameters<typeof Icon>[0]
  title: string
  body: string
}) {
  return (
    <View className="flex-row items-center gap-md">
      <Icon {...icon} size={32} />
      <View className="min-w-0 flex-1">
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="meta">{body}</Text>
      </View>
    </View>
  )
}

/** Copy keys as a map, so a renamed key is a compile error. */
const REASON_KEY = {
  'wrong-platform': 'connect.wrongPlatform',
  'no-health-store': 'connect.simulator',
  'not-installed': 'connect.notInstalled',
  'not-linked': 'connect.notLinked',
} as const satisfies Record<Extract<Availability, { ok: false }>['reason'], string>
