"use client"

import React, { useMemo, useState } from "react"

export type NativeDateRange = {
  from?: Date
  to?: Date
}

type RangeCalendarProps = {
  value?: NativeDateRange
  onChange?: (range: NativeDateRange) => void
  numberOfMonths?: 1 | 2
  className?: string
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

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

function isBefore(a?: Date, b?: Date) {
  if (!a || !b) return false
  return startOfDay(a).getTime() < startOfDay(b).getTime()
}

function isAfter(a?: Date, b?: Date) {
  if (!a || !b) return false
  return startOfDay(a).getTime() > startOfDay(b).getTime()
}

function addMonths(date: Date, n: number) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1)
}

function formatMonthTitle(date: Date) {
  return date.toLocaleString("en-US", { month: "long", year: "numeric" })
}

function getMonthMatrix(year: number, month: number) {
  // calendar grid starting on Sunday
  const firstDayOfMonth = new Date(year, month, 1)
  const startWeekday = firstDayOfMonth.getDay() // 0..6 Sun..Sat
  const startDate = new Date(year, month, 1 - startWeekday)

  const days: { date: Date; inMonth: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + i)
    days.push({
      date: d,
      inMonth: d.getMonth() === month,
    })
  }

  // split into weeks of 7
  const weeks: typeof days[] = []
  for (let i = 0; i < 6; i++) weeks.push(days.slice(i * 7, i * 7 + 7))
  return weeks
}

export default function RangeCalendar({
  value,
  onChange,
  numberOfMonths = 2,
  className = "",
}: RangeCalendarProps) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const [cursorMonth, setCursorMonth] = useState<Date>(
    value?.from ? new Date(value.from.getFullYear(), value.from.getMonth(), 1) : new Date(today.getFullYear(), today.getMonth(), 1)
  )

  const [hoverDate, setHoverDate] = useState<Date | undefined>(undefined)

  const range = value ?? {}
  const from = range.from ? startOfDay(range.from) : undefined
  const to = range.to ? startOfDay(range.to) : undefined

  const handleSelect = (day: Date) => {
    const d = startOfDay(day)

    // No start yet OR already had full range -> start new range
    if (!from || (from && to)) {
      onChange?.({ from: d, to: undefined })
      return
    }

    // selecting before start -> make it new start
    if (isBefore(d, from)) {
      onChange?.({ from: d, to: from })
      return
    }

    // selecting same or after start -> close range
    onChange?.({ from, to: d })
  }

  const inPreviewRange = (d: Date) => {
    if (!from || to || !hoverDate) return false
    const h = startOfDay(hoverDate)
    const min = isBefore(h, from) ? h : from
    const max = isAfter(h, from) ? h : from
    return d >= min && d <= max
  }

  const inFinalRange = (d: Date) => {
    if (!from || !to) return false
    return d >= from && d <= to
  }

  const renderMonth = (base: Date, offset: number) => {
    const monthDate = addMonths(base, offset)
    const y = monthDate.getFullYear()
    const m = monthDate.getMonth()
    const weeks = getMonthMatrix(y, m)

    return (
      <div className="flex flex-col gap-2">
        <div className="text-center font-semibold text-base">
          {formatMonthTitle(monthDate)}
        </div>

        <div className="grid grid-cols-7 text-center text-sm text-slate-500 px-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">{w}</div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {weeks.map((week, wi) => (
            <div
              key={wi}
              className="grid grid-cols-7 gap-1 rounded-lg bg-slate-50/70 px-1 py-1"
            >
              {week.map(({ date, inMonth }) => {
                const d = startOfDay(date)

                const isFrom = isSameDay(d, from)
                const isTo = isSameDay(d, to)
                const isInRange = inFinalRange(d) || inPreviewRange(d)

                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    onClick={() => handleSelect(d)}
                    onMouseEnter={() => setHoverDate(d)}
                    onMouseLeave={() => setHoverDate(undefined)}
                    className={[
                      "h-10 w-10 mx-auto rounded-md text-sm flex items-center justify-center transition",
                      !inMonth ? "text-slate-300" : "text-slate-900 hover:bg-slate-200/70",
                      isInRange && !isFrom && !isTo ? "bg-slate-200/80" : "",
                      (isFrom || isTo) ? "bg-black text-white rounded-xl" : "",
                    ].join(" ")}
                  >
                    {d.getDate()}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className={[
        "rounded-xl border border-slate-200 bg-white shadow-sm p-4",
        className,
      ].join(" ")}
    >
      {/* header with arrows */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setCursorMonth((p) => addMonths(p, -1))}
          className="h-9 w-9 rounded-md hover:bg-slate-100 flex items-center justify-center text-xl"
          aria-label="Previous month"
        >
          ‹
        </button>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setCursorMonth((p) => addMonths(p, 1))}
          className="h-9 w-9 rounded-md hover:bg-slate-100 flex items-center justify-center text-xl"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div
        className={
          numberOfMonths === 2
            ? "grid grid-cols-1 md:grid-cols-2 gap-6"
            : "grid grid-cols-1"
        }
      >
        {renderMonth(cursorMonth, 0)}
        {numberOfMonths === 2 && renderMonth(cursorMonth, 1)}
      </div>
    </div>
  )
}
