import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useRoutines } from '@/data'
import {
  ExerciseArt,
  exerciseById,
  LEVEL_KEY,
  RowChevron,
  TEMPLATE_GROUP_KEY,
  TEMPLATE_GROUPS,
  TEMPLATES,
  templateDescriptionKey,
  templateNameKey,
} from '@/features/workouts'
import { useBack } from '@/lib/navigation'
import { AppBar, Badge, Card, Screen, Tappable, Text } from '@/ui'

/** The built-in programs, grouped the way they are run. */
export default function TemplatesScreen() {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const goBack = useBack('/workouts')
  const routines = useRoutines().data ?? []
  const added = new Set(routines.map((routine) => routine.templateId).filter(Boolean))

  return (
    <Screen
      header={
        <AppBar
          title={t('workouts:explore.title')}
          onBack={goBack}
          backLabel={t('common:action.back')}
        />
      }
    >
      {TEMPLATE_GROUPS.map((group) => (
        <View key={group} className="gap-2.5">
          <Text variant="subtitle" className="pt-2">
            {t(TEMPLATE_GROUP_KEY[group])}
          </Text>
          {TEMPLATES.filter((template) => template.group === group).map((template) => {
            const first = exerciseById(template.exercises[0]?.id ?? '')
            return (
              <Card key={template.id} contentClassName="p-0">
                <Tappable
                  className="flex-row items-center gap-3 p-4"
                  onPress={() =>
                    router.push({ pathname: '/workout/template/[id]', params: { id: template.id } })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={t(templateNameKey(template.id))}
                >
                  {first ? (
                    <ExerciseArt exerciseId={first.id} category={first.category} size={56} />
                  ) : null}
                  <View className="min-w-0 flex-1 gap-1">
                    <Text variant="bodyStrong">{t(templateNameKey(template.id))}</Text>
                    <Text variant="meta" numberOfLines={2}>
                      {t(templateDescriptionKey(template.id))}
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5 pt-0.5">
                      <Badge size="sm" tone="neutral">
                        {t(LEVEL_KEY[template.level])}
                      </Badge>
                      <Badge size="sm" tone="neutral">
                        {t('workouts:routines.exercises', { count: template.exercises.length })}
                      </Badge>
                      {added.has(template.id) ? (
                        <Badge size="sm" tone="pandan">
                          {t('workouts:explore.inRoutines')}
                        </Badge>
                      ) : null}
                    </View>
                  </View>
                  <RowChevron />
                </Tappable>
              </Card>
            )
          })}
        </View>
      ))}
    </Screen>
  )
}
