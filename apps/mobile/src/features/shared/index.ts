/**
 * Pieces shared by more than one screen.
 *
 * The rule for what lives here rather than in `@/ui`: a design-system component
 * knows nothing about RiceCal, while everything here knows about meals, foods
 * or targets. A `FoodRow` could not go in the design system without dragging
 * the domain in with it.
 */
export { type Bar, BarChart, type BarChartProps } from './BarChart'
export { CheckList, type CheckListProps } from './CheckList'
export { FoodRow, type FoodRowProps } from './FoodRow'
export { MacroBars, type MacroBarsProps } from './MacroBars'
export { formatTime, MealCard, type MealCardProps } from './MealCard'
export { PlanPicker, type PlanPickerProps } from './PlanPicker'
export { ScreenTitle, type ScreenTitleProps } from './ScreenTitle'
export { SettingRow, type SettingRowProps, ToggleRow, type ToggleRowProps } from './SettingRow'
export { type Stat, StatRow, type StatRowProps } from './StatRow'
