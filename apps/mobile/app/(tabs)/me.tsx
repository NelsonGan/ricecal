import { format, parseISO } from 'date-fns'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import {
  storedImageSource,
  useAvatarUrl,
  useCurrentWeight,
  useEntitlement,
  useHealthConnection,
  useMealTimes,
  useProfile,
  useSettings,
  useStreak,
  useSubscription,
  useTargets,
} from '@/data'
import { signOut } from '@/data/auth'
import { showWeight, UNIT_KEY, unitFor } from '@/features/progress'
import { HelpSheet } from '@/features/settings'
import { ScreenTitle, SettingRow } from '@/features/shared'
import { Avatar, Button, Card, ConfirmSheet, Icon, ListRow, Screen, StatTile, Text } from '@/ui'

/** U1 PROFILE */
export default function MeScreen() {
  const { t } = useTranslation(['profile', 'activity', 'common'])
  const router = useRouter()

  const { data: profile } = useProfile()
  const { data: avatarUri } = useAvatarUrl(profile?.avatar_path ?? undefined)
  /**
   * Through `storedImageSource` rather than handed to `Avatar` in two pieces,
   * because the uri is not always a signed URL: when the picture is already on
   * this device it is a path into expo-image's own cache, and that one is the
   * entry rather than a candidate for it. One rule, in the one place that
   * knows it.
   */
  const avatar = storedImageSource(profile?.avatar_path ?? undefined, avatarUri)
  const { data: settings } = useSettings()
  const { data: targets, isPending: targetsPending } = useTargets()
  const { data: subscription } = useSubscription()
  const { entitled } = useEntitlement()
  const { data: mealTimes } = useMealTimes()
  const streak = useStreak()
  const weight = useCurrentWeight()
  const weightUnit = unitFor(settings?.units)
  const health = useHealthConnection()
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  /**
   * Every switch on `/settings/reminders`, and it has to stay every switch.
   *
   * The monthly report was missing, so the row summarised seven reminders as
   * "6 on" — a figure with nothing to correct it, since the only way to see the
   * disagreement is to open the screen and count the toggles by hand. A list
   * written out here rather than derived is what let one drift away from the
   * screen it describes; the fix is cheap and the check is to read the switches
   * in `app/settings/reminders.tsx` against these names whenever either moves.
   */
  const activeReminders =
    (mealTimes ?? []).filter((meal) => meal.reminder_enabled).length +
    (settings
      ? [
          settings.notify_water,
          settings.notify_weigh_in,
          settings.notify_weekly_report,
          settings.notify_monthly_report,
        ].filter(Boolean).length
      : 0)

  /**
   * A row with no value yet shows no value.
   *
   * Every summary on this screen has a plausible-looking default behind it — no
   * streak, no connected store, metric units, zero reminders — and each one is
   * a statement about the account rather than about the request. `SettingRow`
   * drops its value column entirely for `undefined`, which is the honest shape
   * while the answer is out and costs no layout: the title and the chevron do
   * not move when the figure lands beside them.
   */
  const remindersValue =
    settings && mealTimes ? t('profile:home.remindersValue', { count: activeReminders }) : undefined

  // `entitled` rather than the status alone, because the two can disagree: a
  // row whose period has run out still SAYS `active`, and the gates read the
  // date. Left on the status this line would tell somebody they had Pro on the
  // same screen whose buttons were about to refuse them.
  const status = entitled ? (subscription?.status ?? 'none') : 'none'
  const planLine =
    status === 'trial'
      ? t('profile:home.proTrial', {
          when: subscription?.trial_ends_at
            ? t('profile:home.proTrialOn', {
                date: format(parseISO(subscription.trial_ends_at), 'd MMM'),
              })
            : t('profile:home.proTrialTomorrow'),
        })
      : status === 'active'
        ? t('profile:home.proActive')
        : t('profile:home.proNone')

  return (
    <Screen>
      <ScreenTitle title={t('common:nav.me')} />

      <Card>
        <View className="flex-row items-center gap-3">
          {/* Empty rather than an em dash: with no name the avatar draws a stock
              figure, and "—" would have been read out as the account's name. */}
          <Avatar
            name={profile?.display_name ?? ''}
            uri={avatar?.uri}
            cacheKey={avatar?.cacheKey}
            accessibilityLabel={profile?.display_name || t('profile:home.noName')}
            size="md"
            tone="pandan"
          />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="subtitle">{profile?.display_name || t('profile:home.noName')}</Text>
            <Text variant="meta">
              {profile?.created_at
                ? t('profile:home.memberSince', {
                    month: format(parseISO(profile.created_at), 'MMMM'),
                  })
                : ''}
            </Text>
          </View>
        </View>

        <View className="flex-row gap-2.5">
          {/* An em dash for a figure nobody has yet, the same as the two tiles
              beside it. This one used to print "0", which is a real answer —
              and the wrong one on every account that has a streak. */}
          <StatTile
            className="flex-1"
            tone="track"
            label={t('profile:home.streak')}
            value={streak.isPending ? '—' : String(streak.current)}
          />
          {/* The label IS the unit, so it has to move with the setting: this
              tile printed a hardcoded "KG" over an unconverted figure, and the
              row four lines down on the same screen said "Imperial".

              Waits on the SETTINGS as well as the weight, for the reason given
              above `remindersValue`: the two queries answer independently, and
              `unitFor(undefined)` is kilograms — so an imperial account whose
              weight landed first would read its own figure in the unit it does
              not use, then watch it change. A dash says nothing instead. */}
          <StatTile
            className="flex-1"
            tone="track"
            label={t(UNIT_KEY[weightUnit]).toUpperCase()}
            value={
              weight === undefined || settings === undefined ? '—' : showWeight(weight, weightUnit)
            }
          />
          <StatTile
            className="flex-1"
            tone="track"
            label={t('profile:home.goal')}
            value={targets ? targets.kcal.toLocaleString() : '—'}
          />
        </View>
      </Card>

      {/* `gap-0` because this card holds TWO rows now, and a `ListRow` carries its
          own divider: at the card's default gap the line under the first row
          reads as an underline of that row with a band of empty card beneath it,
          rather than as the seam between two. Same reason the settings card
          below does it. */}
      <Card contentClassName="gap-0">
        {/* Somebody who has never paid has nothing to manage. The subscription
            screen is a plan, a renewal date and a way to cancel; for them it
            was three cards of "none" wrapped around a button to the paywall,
            so they go straight to the paywall instead. */}
        <ListRow
          title={t('profile:home.pro')}
          subtitle={planLine}
          leading={<Icon set="system" name="crown" size={42} />}
          onPress={() => router.push(entitled ? '/settings/subscription' : '/paywall')}
        />
        {/* THE OTHER WAY TO GET PRO, and it belongs in this card rather than
            down among the settings for exactly that reason: the row above it is
            the way you pay for it, and this is the way you do not. Somewhere in
            the list between reminders and units it would read as a setting, and
            nobody goes looking for a way to earn something in a settings list.

            Shown to subscribers too. A monthly plan can earn a year and a
            yearly one can earn lifetime, so there is no tier this is pointless
            for; the copy is about posting rather than about unlocking, which
            keeps it true for somebody who has already paid. */}
        <ListRow
          title={t('profile:shareEarn.row')}
          subtitle={t('profile:shareEarn.heroTitle')}
          leading={<Icon set="system" name="gift" size={42} />}
          divider={false}
          onPress={() => router.push('/settings/share')}
        />
      </Card>

      <Card title={t('profile:home.settings')} contentClassName="gap-0">
        <SettingRow
          icon={{ set: 'body', name: 'target' }}
          title={t('profile:home.goals')}
          value={
            targetsPending
              ? undefined
              : targets
                ? t('profile:home.goalsValue', { kcal: targets.kcal.toLocaleString() })
                : '—'
          }
          onPress={() => router.push('/settings/goals')}
        />
        {/* Above the reminders rather than below them: the times set here are
            the hours a reminder fires at, so this is the row that decides what
            the next one means.

            No value beside it. The other rows summarise themselves in a word —
            a budget, a count, a pair of units — and four meal times do not fit
            in that space; naming only breakfast would be picking one at
            random. */}
        <SettingRow
          icon={{ set: 'system', name: 'clock' }}
          title={t('profile:home.personalisation')}
          onPress={() => router.push('/settings/personalisation')}
        />
        {/* Under personalisation and above reminders: it is a thing about this
            body rather than a notification preference, and the row it sits next
            to — meal times — is the other place the app is told about a daily
            rhythm. */}
        {/* With a value, like every row around it. This one had none, on the
            screen where the answer — is anything connected at all? — is the
            whole reason to open it. The other rows summarise themselves in a
            word and so can this: the store's name, or that there isn't one. */}
        <SettingRow
          icon={{ set: 'system', name: 'watch' }}
          title={t('activity:settings.title')}
          value={
            health.isPending
              ? undefined
              : health.data?.connected
                ? t(`activity:provider.${health.data.provider}`)
                : t('profile:home.healthOff')
          }
          onPress={() => router.push('/settings/health')}
        />
        <SettingRow
          icon={{ set: 'system', name: 'bell' }}
          title={t('profile:home.reminders')}
          value={remindersValue}
          onPress={() => router.push('/settings/reminders')}
        />
        <SettingRow
          icon={{ set: 'system', name: 'contrast' }}
          title={t('profile:home.units')}
          value={settings ? t(`profile:home.${settings.units}`) : undefined}
          onPress={() => router.push('/settings/preferences')}
        />
        {/* The tour's permanent home.
            It is offered once on Today, as a toast that dismisses itself — so
            somebody who looked away has no other way back to it, and "once" is
            only an acceptable rule because this row exists. */}
        <SettingRow
          icon={{ set: 'system', name: 'lightbulb' }}
          title={t('profile:home.tutorial')}
          onPress={() => router.push('/tutorial')}
        />
        {/* A sheet rather than a route, because there is no help centre in the
            app: the row explains where support actually happens and opens
            Discord. It pointed at the preferences screen, which is the row
            above it wearing a different name. */}
        <SettingRow
          icon={{ set: 'system', name: 'help' }}
          title={t('profile:home.help')}
          divider={false}
          onPress={() => setHelpOpen(true)}
        />
      </Card>

      {/* Small and centred rather than a full-width control at the foot of the
          screen. Signing out is the least likely thing anyone came here to do,
          and at button size it read as the page's main action.

          `self-center` on the BUTTON rather than `items-center` on the row:
          `Button` sets `self-start` on its own container, and align-self beats
          a parent's align-items — so this sat against the left gutter for as
          long as the sentence above claimed it was centred. */}
      <View>
        <Button
          variant="ghost"
          size="sm"
          className="self-center"
          onPress={() => setConfirmSignOut(true)}
        >
          {t('profile:home.signOut')}
        </Button>
      </View>

      <HelpSheet visible={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* Confirmed, because signing out of an app whose data lives on a server
          is not destructive but very much feels like it. */}
      <ConfirmSheet
        visible={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        onConfirm={() => {
          setConfirmSignOut(false)
          signOut()
        }}
        title={t('profile:home.signOutTitle')}
        description={t('profile:home.signOutBody')}
        confirmLabel={t('profile:home.signOut')}
      />
    </Screen>
  )
}
