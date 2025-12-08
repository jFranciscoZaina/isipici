"use client"

import React, { useMemo, useState } from "react"

export type DateRangeValue = {
  from?: Date
  to?: Date
}

type Props = {
  value: DateRangeValue
  onChange: (next: DateRangeValue) => void
  disabled?: boolean
  numberOfMonths?: 1 | 2
  className?: string
  // YYYY-MM-DD -> estado del día
  markers?: Record<string, "paid" | "debt">
}

const WEEK_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

function isToday(d: Date) {
  const t = new Date()
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  )
}


function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function isSameDay(a?: Date, b?: Date) {
  if (!a || !b) return false
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
function isBefore(a: Date, b: Date) {
  return a.getTime() < b.getTime()
}
function inRange(d: Date, from?: Date, to?: Date) {
  if (!from || !to) return false
  const t = d.getTime()
  return t >= from.getTime() && t <= to.getTime()
}
function addMonths(d: Date, n: number) {
  const next = new Date(d)
  next.setMonth(next.getMonth() + n)
  return next
}
function monthLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

function buildMonthGrid(monthDate: Date) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const startWeekday = first.getDay()
  const daysInMonth = last.getDate()

  const cells: (Date | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d))
  }
  while (cells.length % 7 !== 0) cells.push(null)

  // chunk to weeks
  const weeks: (Date | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }

  return weeks
}

export default function RangeCalendar({
  value,
  onChange,
  disabled = false,
  numberOfMonths = 2,
  className = "",
  markers = {},
}: Props) {
  const [baseMonth, setBaseMonth] = useState<Date>(() => {
    return value.from ? new Date(value.from) : new Date()
  })

  const months = useMemo(() => {
    return Array.from({ length: numberOfMonths }, (_, i) =>
      addMonths(baseMonth, i)
    )
  }, [baseMonth, numberOfMonths])

  const handleDayClick = (day: Date) => {
    if (disabled) return
    const clicked = startOfDay(day)
    const from = value.from ? startOfDay(value.from) : undefined
    const to = value.to ? startOfDay(value.to) : undefined

    // no range yet
    if (!from && !to) {
      onChange({ from: clicked, to: undefined })
      return
    }

    // only from set, choose to
    if (from && !to) {
      if (isBefore(clicked, from)) {
        onChange({ from: clicked, to: from })
      } else {
        onChange({ from, to: clicked })
      }
      return
    }

    // full range already set -> restart
    onChange({ from: clicked, to: undefined })
  }

  return (
    <div className={`rounded-xl p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setBaseMonth((m) => addMonths(m, -1))}
          disabled={disabled}
          className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-slate-100 disabled:opacity-40"
          aria-label="Previous month"
        >
          ‹
        </button>

        <div
          className={`grid ${numberOfMonths === 2 ? "grid-cols-2 gap-8" : ""
            }`}
        >
          {months.map((m) => (
            <div
              key={m.toISOString()}
              className="text-center font-semibold text-slate-900 fs-14"
            >
              {monthLabel(m)}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setBaseMonth((m) => addMonths(m, 1))}
          disabled={disabled}
          className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-slate-100 disabled:opacity-40"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className={`grid ${numberOfMonths === 2 ? "grid-cols-2 gap-8" : ""}`}>
        {months.map((m) => {
          const weeks = buildMonthGrid(m)

          return (
            <div key={m.toISOString()}>
              {/* week header */}
              <div className="grid grid-cols-7 text-center text-sm text-slate-500 mb-2">
                {WEEK_DAYS.map((w) => (
                  <div key={w} className="py-1">
                    {w}
                  </div>
                ))}
              </div>

              {/* weeks */}
              <div className="space-y-2">
                {weeks.map((week, wi) => (
                  <div
                    key={wi}
                    className="grid grid-cols-7 gap-1 rounded-full bg-slate-50 px-2 py-1"
                  >
                    {week.map((day, di) => {
                      if (!day) return <div key={di} />
                      const d0 = startOfDay(day)

                      const isFrom = isSameDay(d0, value.from)
                      const isTo = isSameDay(d0, value.to)
                      const isInside = inRange(d0, value.from, value.to)
                      const isEdge = isFrom || isTo

                      const dateKey = d0.toISOString().slice(0, 10)
                      const marker = markers[dateKey]

                      return (
                        <button
                          type="button"
                          key={di}
                          onClick={() => handleDayClick(d0)}
                          disabled={disabled}
                          className={[
                            "h-9 w-9 rounded-full text-sm flex flex-col items-center justify-center transition",
                            disabled
                              ? "cursor-not-allowed opacity-70"
                              : "hover:bg-slate-200",
                            isInside && !isEdge ? "bg-slate-200" : "",
                            isEdge ? "bg-black text-white" : "text-slate-900",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              isEdge ? "text-white" : "text-slate-900",
                              isToday(d0) ? "font-semibold" : "",
                            ].join(" ")}
                          >
                            {d0.getDate()}
                          </span>



                          {marker && (
                            <span
                              className={[
                                "mt-0.5 h-1 w-1 rounded-full",
                                marker === "paid"
                                  ? "bg-green-700"
                                  : "bg-yellow-400",
                              ].join(" ")}
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
