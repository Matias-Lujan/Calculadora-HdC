import { useId } from 'react'
import { formatDayTitle } from '../eatenAt.ts'
import { daySummaryText, type MealDay } from '../history.ts'
import { MealListItem } from './MealListItem.tsx'

type Props = {
  day: MealDay
  open: boolean
  onToggle: () => void
  /** The moment "Hoy" and "Ayer" are relative to. */
  now: Date
}

/**
 * A day of the history list (spec §6.7): a button with the day, how many
 * meals and the carbs of the day, that unfolds its meals (the same pattern
 * as "Ver la cuenta"). A day the next page can still add meals to shows
 * only its name.
 */
export function MealDayGroup({ day, open, onToggle, now }: Props) {
  const id = useId()
  const summary = daySummaryText(day)
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        className="flex min-h-11 items-center gap-2 py-2 text-left"
        onClick={onToggle}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="flex flex-col">
          <span className="font-semibold">{formatDayTitle(day.day, now)}</span>
          {summary !== null && (
            <span className="text-sm text-slate-700">{summary}</span>
          )}
        </span>
      </button>
      {open && (
        <ul id={id} className="flex flex-col divide-y divide-slate-200 pl-6">
          {day.meals.map((meal) => (
            <li key={meal.id}>
              <MealListItem meal={meal} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
