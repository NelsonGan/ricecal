import { format, parseISO } from 'date-fns'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type Announcement, AnnouncementCard, announcementsNewestFirst } from '@/features/news'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { AppBar, Card, Icon, ListRow, Screen } from '@/ui'

/**
 * Every announcement, newest first, for somebody who closed one too quickly or
 * was never shown it: the launch card only ever shows the newest, once.
 *
 * Opening one here only reads it. Whatever it switched on was switched on when
 * it was first shown, and doing it again would undo a choice made since.
 */
export default function NewsScreen() {
  const { t } = useTranslation(['news', 'common'])
  const goBack = useBack('/me')
  const [open, setOpen] = useState<Announcement | null>(null)
  const announcements = announcementsNewestFirst()

  return (
    <Screen
      header={
        <AppBar title={t('news:title')} onBack={() => goBack()} backLabel={t('common:a11y.back')} />
      }
    >
      <Card contentClassName="gap-0">
        {announcements.map((announcement, index) => (
          <ListRow
            key={announcement.id}
            title={t(`news:${announcement.key}.title`)}
            titleLines={2}
            subtitle={format(parseISO(announcement.releaseDate), datePattern('dayMonthYear'))}
            leading={<Icon set="system" name="megaphone" size={36} />}
            divider={index < announcements.length - 1}
            onPress={() => setOpen(announcement)}
          />
        ))}
      </Card>
      <AnnouncementCard announcement={open} source="settings" onClose={() => setOpen(null)} />
    </Screen>
  )
}
