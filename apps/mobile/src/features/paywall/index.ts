/**
 * The paywall's own pieces: the guard every gated control calls, and the
 * plan picker the three paywall screens share.
 *
 * Separate from `features/shared` because these know what a subscription is
 * and what it costs, which is a narrower thing to know than "meals and foods".
 */
export { ProPitch, type ProPitchProps } from './ProPitch'
export { type RequireProOptions, useRequirePro } from './useRequirePro'
