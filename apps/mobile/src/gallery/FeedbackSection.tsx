import { useState } from 'react'
import { View } from 'react-native'

import {
  Alert,
  AppBar,
  BottomNav,
  Button,
  Card,
  ConfirmSheet,
  DateStrip,
  type DateStripDay,
  type NavTab,
  Sheet,
  StepProgress,
  Tabs,
  Text,
  useToast,
} from '@/ui'

/** Every state of the dot in one week, which is the point of showing it here. */
const DAYS: DateStripDay[] = [
  { key: '2026-07-20', initial: 'M', day: 20, mark: 'under' },
  { key: '2026-07-21', initial: 'T', day: 21, mark: 'over' },
  { key: '2026-07-22', initial: 'W', day: 22, mark: 'under' },
  { key: '2026-07-23', initial: 'T', day: 23, mark: 'missed' },
  { key: '2026-07-24', initial: 'F', day: 24, mark: 'under' },
  { key: '2026-07-25', initial: 'S', day: 25 },
  { key: '2026-07-26', initial: 'S', day: 26, disabled: true },
]

const DETAIL_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'nutrients', label: 'Nutrients' },
  { value: 'similar', label: 'Similar' },
] as const

const NAV_TABS: readonly [NavTab<string>, NavTab<string>, NavTab<string>, NavTab<string>] = [
  { value: 'today', label: 'Today', icon: { set: 'ui', name: 'home' } },
  { value: 'diary', label: 'Diary', icon: { set: 'ui', name: 'diary' } },
  { value: 'trends', label: 'Trends', icon: { set: 'ui', name: 'trends' } },
  { value: 'me', label: 'Me', icon: { set: 'ui', name: 'profile' } },
]

export function FeedbackSection() {
  const toast = useToast()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [day, setDay] = useState(DAYS[3].key)
  const [tab, setTab] = useState<(typeof DETAIL_TABS)[number]['value']>('overview')
  const [navTab, setNavTab] = useState('today')

  return (
    <>
      <Card title="Alerts">
        <View className="gap-3">
          <Alert title="Meal saved" description="Logged for Wednesday." />
          <Alert
            tone="warning"
            title="Double check"
            description="This portion looks larger than usual."
          />
          <Alert
            tone="error"
            title="Sync failed"
            description="We could not reach the food database."
          />
          <Alert tone="info" title="Weekly average" description="Not a single weigh in." />
        </View>
      </Card>

      <Card title="Toasts">
        <View className="flex-row flex-wrap gap-2">
          <Button
            size="sm"
            onPress={() =>
              toast.show({
                title: 'Entry deleted',
                action: { label: 'Undo', onPress: () => toast.show({ title: 'Restored' }) },
              })
            }
          >
            Snackbar
          </Button>
          <Button
            size="sm"
            variant="kaya"
            onPress={() =>
              toast.show({
                tone: 'warning',
                title: 'Had lunch yet?',
                description: 'Tap to log it before you forget.',
                icon: { set: 'system', name: 'bell' },
              })
            }
          >
            Nudge
          </Button>
          <Button
            size="sm"
            variant="danger"
            onPress={() =>
              toast.show({ tone: 'error', title: 'Offline', description: 'We will retry shortly.' })
            }
          >
            Error
          </Button>
        </View>
      </Card>

      <Card title="Sheets">
        <View className="flex-row flex-wrap gap-2">
          <Button size="sm" variant="neutral" onPress={() => setSheetOpen(true)}>
            Open sheet
          </Button>
          <Button size="sm" variant="danger" onPress={() => setConfirmOpen(true)}>
            Delete entry
          </Button>
        </View>

        <Sheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Change unit"
          description="Everyday serving units first. Grams sit behind this."
          footer={
            <Button fullWidth onPress={() => setSheetOpen(false)}>
              Done
            </Button>
          }
        >
          <Text variant="body">Plates, bowls, pieces and cups all map to grams underneath.</Text>
        </Sheet>

        <ConfirmSheet
          visible={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() =>
            new Promise((resolve) => {
              setTimeout(() => {
                toast.show({ title: 'Entry deleted' })
                resolve(undefined)
              }, 900)
            })
          }
          title="Delete this entry?"
          description="Char kuey teow, 742 kcal will be removed from today."
          confirmLabel="Delete"
        />
      </Card>

      <Card title="App bar and tabs" flush>
        <View className="gap-3 p-card">
          <AppBar title="Food details" onBack={() => {}} />
          <Tabs options={DETAIL_TABS} value={tab} onChange={setTab} />
          <Text variant="meta">Showing: {tab}</Text>
        </View>
      </Card>

      <Card title="Date strip">
        <DateStrip days={DAYS} value={day} onChange={setDay} />
      </Card>

      <Card title="Onboarding progress">
        <StepProgress total={4} current={2} caption="Step 2 of 4, about a minute left" />
      </Card>

      <Card title="Bottom nav" flush contentClassName="overflow-visible">
        <BottomNav
          tabs={NAV_TABS}
          value={navTab}
          onChange={setNavTab}
          onPressAction={() => toast.show({ title: 'Quick add' })}
        />
      </Card>
    </>
  )
}
