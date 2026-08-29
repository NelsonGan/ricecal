import { useTranslation } from 'react-i18next'
import { Share } from 'react-native'

import type { Recipe } from '@/data'
import { usePublishRecipe } from '@/data'
import { ToggleRow } from '@/features/shared'
import { Button, Card, Icon, Sheet, Text, useToast } from '@/ui'

/** Where a shared recipe lives. One place, so a link cannot be built two ways. */
export const recipeLink = (shareSlug: string) => `https://ricecal.my/r/${shareSlug}`

export type ShareSheetProps = {
  visible: boolean
  onClose: () => void
  recipe: Recipe
}

/**
 * Sharing a recipe, and the two different things that means.
 *
 * A link is private sharing: anybody who has it can open the recipe and save a
 * copy, and nobody else can find it at all. Nothing is reviewed, because nothing
 * has been published.
 *
 * Public is the toggle at the foot of the sheet. It puts the recipe in front of
 * every user of the app, which is why it goes through a review first and why the
 * switch coming back on does not mean the recipe is listed: `usePublishRecipe`
 * reports what the reviewer said, and this sheet says so rather than letting the
 * switch imply it.
 */
export function ShareSheet({ visible, onClose, recipe }: ShareSheetProps) {
  const { t } = useTranslation(['recipes', 'common'])
  const toast = useToast()
  const publish = usePublishRecipe()

  const link = recipeLink(recipe.shareSlug)

  const share = () => {
    // The platform's own sheet, which is copy, message and everything else in
    // one — and needs no native module this app does not already have.
    Share.share({ message: `${recipe.name}: ${link}`, url: link }).catch(() => {})
  }

  const setPublic = async (next: boolean) => {
    let result: Awaited<ReturnType<typeof publish.mutateAsync>>
    try {
      result = await publish.mutateAsync({ id: recipe.id, isPublic: next })
    } catch {
      // `set_recipe_public` raises when the recipe is not the caller's, which
      // this screen cannot reach — but a network failure lands here too, and a
      // switch that flicks back with no explanation is the worst of the three
      // outcomes to leave unexplained.
      toast.show({ title: t('recipes:share.publishFailed'), tone: 'error' })
      return
    }
    if (!next) return

    if (result.status === 'approved') {
      toast.show({ title: t('recipes:review.approved'), tone: 'success' })
    } else if (result.status === 'rejected') {
      toast.show({
        title: result.reason
          ? t('recipes:review.rejected', { reason: result.reason })
          : t('recipes:review.rejectedPlain'),
        tone: 'warning',
      })
    } else {
      toast.show({ title: t('recipes:review.pending'), tone: 'neutral' })
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('recipes:share.title')}
      description={t('recipes:share.body')}
      closeLabel={t('common:action.close')}
      scrollable={false}
    >
      <Card contentClassName="flex-row items-center gap-3 p-4">
        <Icon set="ui" name="link" size={20} />
        <Text variant="bodyStrong" className="flex-1" numberOfLines={1}>
          {link}
        </Text>
      </Card>

      <Button fullWidth onPress={share} leftIcon={<Icon set="ui" name="share" size={20} />}>
        {t('recipes:share.action')}
      </Button>

      {/* Only the owner may publish, so the toggle is simply absent on somebody
          else's recipe rather than present and refused. */}
      {recipe.isMine ? (
        <Card>
          <ToggleRow
            title={t('recipes:share.publicTitle')}
            description={
              publish.isPending ? t('recipes:review.checking') : t('recipes:share.publicBody')
            }
            value={recipe.isPublic}
            onValueChange={setPublic}
          />
        </Card>
      ) : null}
    </Sheet>
  )
}
