/**
 * The RiceCal design system.
 *
 * Import from `@/ui`, never from a file inside it — the barrel is what lets a
 * component be split or renamed without touching every screen.
 *
 * Layers, bottom up:
 *   tokens (src/theme)  colour, spacing, radius, motion
 *   cn()                class composition where later utilities win
 *   Squish              the press mechanic every raised control shares
 *   components          everything below
 *
 * Two conventions hold across every component here:
 *
 *   `className` targets the OUTER box — layout, flex, margins. It is what the
 *   parent measures. `contentClassName` targets the inner surface, and is
 *   rarely needed because appearance belongs to `variant` / `tone`.
 *
 *   Anything that can be selected, toggled or typed into is CONTROLLED. No
 *   component holds the value it displays, so an optimistic update that the
 *   server rejects can always be rolled back by the caller.
 */

// Feedback and overlay
export { Alert, type AlertProps, type AlertTone } from './Alert'
// Navigation chrome
export { AppBar, type AppBarProps } from './AppBar'
// Data display
export {
  Avatar,
  AvatarGroup,
  type AvatarGroupProps,
  type AvatarProps,
  type AvatarSize,
} from './Avatar'
// Primitives
export { Badge, type BadgeProps, type BadgeTone, CountBadge, type CountBadgeProps } from './Badge'
export {
  BottomNav,
  type BottomNavProps,
  NAV_BAR_HEIGHT,
  NavAction,
  type NavActionProps,
  NavBar,
  NavItem,
  type NavItemProps,
  type NavTab,
} from './BottomNav'
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button'
export { CalorieRing, type CalorieRingProps } from './CalorieRing'
export { Card, type CardProps, type CardTone } from './Card'
export { Chip, type ChipProps, type ChipTone } from './Chip'
// Controls
export {
  Checkbox,
  type CheckboxProps,
  Radio,
  RadioGroup,
  type RadioGroupProps,
  type RadioProps,
} from './Choice'
export { ConfirmSheet, type ConfirmSheetProps } from './ConfirmSheet'
export { cn } from './cn'
export { DateStrip, type DateStripDay, type DateStripProps } from './DateStrip'
export { Divider, type DividerProps } from './Divider'
export { EmptyState, type EmptyStateProps } from './EmptyState'
export { Icon, type IconProps, type IconSet, icons } from './Icon'
export {
  IconButton,
  type IconButtonProps,
  type IconButtonSize,
  type IconButtonVariant,
} from './IconButton'
export { ListRow, type ListRowProps } from './ListRow'
export {
  MacroBar,
  type MacroBarProps,
  ProgressBar,
  type ProgressBarProps,
  type ProgressTone,
} from './ProgressBar'
// Layout
export { Screen, type ScreenProps } from './Screen'
export { SearchField, type SearchFieldProps } from './SearchField'
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedOption,
} from './SegmentedControl'
export { Select, type SelectOption, type SelectProps } from './Select'
export { Sheet, type SheetProps } from './Sheet'
export { Skeleton, type SkeletonProps, SkeletonRow, Spinner, type SpinnerProps } from './Skeleton'
export { Slider, type SliderProps } from './Slider'
export { Squish, type SquishProps } from './Squish'
export { StatTile, type StatTileProps, type StatTileTone } from './StatTile'
export { StepProgress, type StepProgressProps, type StepProgressTone } from './StepProgress'
export { Stepper, type StepperProps } from './Stepper'
export { Switch, type SwitchProps } from './Switch'
export { type TabOption, Tabs, type TabsProps } from './Tabs'
export { Text, type TextProps, type TextVariant } from './Text'
export { TextField, type TextFieldProps } from './TextField'
export { type ToastOptions, ToastProvider, type ToastTone, useToast } from './Toast'
export {
  type DayStatus,
  WaterTracker,
  type WaterTrackerProps,
  type WeekDay,
  WeekStrip,
  type WeekStripProps,
} from './WeekStrip'
