/**
 * The onboarding flow's own pictures.
 *
 * Kept out of `assets/icons`, whose registry is generated from the design
 * system's source set: these were drawn for this flow alone, and the photos are
 * not icons at all. The two photos are a real plate and a real bowl because the
 * showcase is meant to look like what a scan and a post actually look like.
 */
export const ONBOARDING_ART = {
  globe: require('../../../assets/onboarding/globe.png'),
  friends: require('../../../assets/onboarding/friends.png'),
  megaphone: require('../../../assets/onboarding/megaphone.png'),
  cloud: require('../../../assets/onboarding/cloud.png'),
  key: require('../../../assets/onboarding/key.png'),
  envelope: require('../../../assets/onboarding/envelope.png'),
  nasiLemak: require('../../../assets/onboarding/nasi-lemak.jpg'),
  laksa: require('../../../assets/onboarding/laksa.jpg'),
} as const

export type OnboardingArtName = keyof typeof ONBOARDING_ART
