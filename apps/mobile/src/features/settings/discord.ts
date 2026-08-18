/**
 * The server, and the logo that stands for it.
 *
 * ONE COPY, because two screens hand over to it now: the help sheet, where it
 * is the whole of support, and Share & Earn, where it is where a reward is
 * claimed. An invite link that had drifted between the two would be a dead link
 * on exactly one of them, and the one that dies is the one nobody opens often
 * enough to notice.
 */
export const DISCORD_INVITE = 'https://discord.gg/DCtQ47tEMh'

/**
 * `require`d from `assets/brand` rather than added to the icon set.
 *
 * `assets/icons` is written by `scripts/sync-icons.mjs`, which starts a full
 * import by deleting the directory and refilling it from the design system — a
 * mark that is not ours would not survive the next sync. Brand art has always
 * lived beside the mascot for the same reason.
 */
export const DISCORD_LOGO = require('../../../assets/brand/discord.png')
