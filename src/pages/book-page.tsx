import { useMemo, useState, type MouseEvent } from "react"
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react"

import { FieldLabel } from "@/components/field-label"
import { BusyOverlay } from "@/components/busy-overlay"
import { ErrorBanner, PageShell, Spinner } from "@/components/page-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import {
  APP_NAME,
  bookingMonthBounds,
  clampVisibleMonth,
  formatDuration,
  formatRange,
  localYmd,
  startOfMonth,
  startsByDay,
  WEEKDAYS,
} from "@/lib/booking"
import type { PublicConfig } from "@/lib/types"

/**
 * 所要時間を、選べる刻みのいちばん近い値にする。
 * @param value スライダーの値。
 * @param durations 選べる分。
 * @returns 刻みに合わせた分。
 */
function snapDuration(value: number, durations: number[]): number {
  return durations.reduce((best, current) =>
    Math.abs(current - value) < Math.abs(best - value) ? current : best
  )
}

/**
 * スライダー上の値の位置。つまみの中心に合わせる。
 * @param value 分。
 * @param min 最小。
 * @param max 最大。
 * @returns left の CSS。
 */
function sliderMarkOffset(value: number, min: number, max: number): string {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100
  return `calc(${pct}% + ${(50 - pct) * 0.12}px)`
}

/**
 * 時間の区切りなら長い目盛にする。
 * @param value 分。
 * @param min 最小。
 * @param max 最大。
 * @returns 長い目盛なら true。
 */
function isMajorDurationMark(value: number, min: number, max: number): boolean {
  return value === min || value === max || value % 60 === 0
}

/**
 * 狭いスライダーでも重ならないラベルにする。
 * @param value 分。
 * @param min 最小。
 * @param max 最大。
 * @returns ラベルを出すなら true。
 */
function isDurationLabelMark(value: number, min: number, max: number): boolean {
  return value === min || value === max || value % 120 === 0
}

/**
 * 所要時間を1段階動かす。
 * @param current いまの分。
 * @param durations 選べる分。
 * @param direction 短くするなら -1、長くするなら 1。
 * @returns 動かした後の分。
 */
function stepDuration(current: number, durations: number[], direction: -1 | 1): number {
  const snapped = snapDuration(current, durations)
  const index = Math.max(0, durations.indexOf(snapped))
  const next = index + direction
  if (next < 0) return durations[0]
  if (next >= durations.length) return durations[durations.length - 1]
  return durations[next]
}

/**
 * 予約画面を表示する。
 * @param props 枠・カレンダー・予約ダイアログの状態と操作。
 * @returns 予約画面。
 */
export function BookPage({
  config,
  durationMin,
  withMeet,
  month,
  selectedDay,
  selectedStart,
  starts,
  loading,
  submitting,
  error,
  form,
  bookingHref,
  onBrandClick,
  onHelp,
  onDurationChange,
  onMeetChange,
  onMonthChange,
  onSelectDay,
  onSelectStart,
  onFormChange,
  onCloseDrawer,
  onSubmit,
}: {
  config: PublicConfig | null
  durationMin: number
  withMeet: boolean
  month: Date
  selectedDay: string | null
  selectedStart: string | null
  starts: string[]
  loading: boolean
  submitting: boolean
  error: string
  form: { name: string; eventTitle: string; email: string; note: string }
  bookingHref: string
  onBrandClick: (event: MouseEvent<HTMLAnchorElement>) => void
  onHelp: () => void
  onDurationChange: (value: number) => void
  onMeetChange: (value: boolean) => void
  onMonthChange: (value: Date) => void
  onSelectDay: (day: string) => void
  onSelectStart: (iso: string) => void
  onFormChange: (key: "name" | "eventTitle" | "email" | "note", value: string) => void
  onCloseDrawer: () => void
  onSubmit: () => void
}) {
  const durations = config?.durations?.length
    ? config.durations
    : Array.from({ length: 16 }, (_, index) => 15 + index * 15)
  const [draggingDuration, setDraggingDuration] = useState<number | null>(null)
  const draftDuration = draggingDuration ?? durationMin
  const durationBound = {
    min: durations[0],
    max: durations[durations.length - 1],
    step:
      durations.length > 1
        ? Math.min(...durations.slice(1).map((value, index) => value - durations[index]))
        : 15,
  }
  const visibleMonth = clampVisibleMonth(month, config)
  const bounds = bookingMonthBounds(config)
  const currentIdx = visibleMonth.getFullYear() * 12 + visibleMonth.getMonth()
  const byDay = useMemo(() => startsByDay(starts), [starts])
  const todayKey = localYmd(new Date())
  const first = startOfMonth(visibleMonth)
  const startPad = first.getDay()
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate()
  const dayTimes = selectedDay ? byDay[selectedDay] || [] : []
  const hm = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const domains = config?.allowedEmailDomains || []
  const emailHint = domains.length
    ? `予約確定の案内と、カレンダー招待の送付先です。キャンセル時の連絡にも使います。 ${domains.map((domain) => `@${domain}`).join("、")} のみ予約できます。`
    : "予約確定の案内と、カレンダー招待の送付先です。キャンセル時の連絡にも使います。"

  return (
    <PageShell
      lede={config?.hostName || "空き時間から予約する"}
      bookingHref={bookingHref}
      submitting={submitting}
      onBrandClick={onBrandClick}
      onHelp={onHelp}
    >
      {error && !selectedStart ? <ErrorBanner>{error}</ErrorBanner> : null}
      <div className="grid gap-4 md:grid-cols-[300px_1fr]">
        <Card>
          <CardContent className="grid gap-5">
            <div>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel text="所要時間" />
                <p className="mb-1.5 text-sm font-medium tabular-nums">{formatDuration(draftDuration)}</p>
              </div>
              <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={submitting || draftDuration <= durationBound.min}
                  aria-label="所要時間を15分短くする"
                  onClick={() => {
                    const next = stepDuration(draftDuration, durations, -1)
                    setDraggingDuration(null)
                    onDurationChange(next)
                  }}
                >
                  <Minus />
                </Button>
                <Slider
                  className="h-7"
                  min={durationBound.min}
                  max={durationBound.max}
                  step={durationBound.step}
                  value={[draftDuration]}
                  disabled={submitting}
                  aria-label="所要時間"
                  aria-valuetext={formatDuration(draftDuration)}
                  onValueChange={(value) => {
                    setDraggingDuration(snapDuration(value[0] ?? draftDuration, durations))
                  }}
                  onValueCommit={(value) => {
                    const next = snapDuration(value[0] ?? draftDuration, durations)
                    setDraggingDuration(null)
                    onDurationChange(next)
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={submitting || draftDuration >= durationBound.max}
                  aria-label="所要時間を15分長くする"
                  onClick={() => {
                    const next = stepDuration(draftDuration, durations, 1)
                    setDraggingDuration(null)
                    onDurationChange(next)
                  }}
                >
                  <Plus />
                </Button>
                <span />
                <div className="-mt-2">
                  <div className="relative h-2" aria-hidden>
                    {durations.map((min) => {
                      const major = isMajorDurationMark(min, durationBound.min, durationBound.max)
                      return (
                        <span
                          key={min}
                          className={[
                            "absolute top-0 w-px -translate-x-1/2",
                            major ? "h-2 bg-muted-foreground/55" : "h-1.5 bg-muted-foreground/30",
                          ].join(" ")}
                          style={{ left: sliderMarkOffset(min, durationBound.min, durationBound.max) }}
                        />
                      )
                    })}
                  </div>
                  <div className="relative mt-0.5 h-4 text-[11px] text-muted-foreground">
                    {durations
                      .filter((min) => isDurationLabelMark(min, durationBound.min, durationBound.max))
                      .map((min) => {
                        const atStart = min === durationBound.min
                        const atEnd = min === durationBound.max
                        return (
                          <span
                            key={min}
                            className={`absolute whitespace-nowrap ${atEnd ? "right-0" : atStart ? "left-0" : "-translate-x-1/2"}`}
                            style={
                              atStart || atEnd
                                ? undefined
                                : { left: sliderMarkOffset(min, durationBound.min, durationBound.max) }
                            }
                          >
                            {formatDuration(min)}
                          </span>
                        )
                      })}
                  </div>
                </div>
                <span />
              </div>
            </div>
            <div>
              <FieldLabel text="場所" />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={withMeet ? "default" : "outline"}
                  aria-pressed={withMeet}
                  onClick={() => onMeetChange(true)}
                >
                  Google Meet
                </Button>
                <Button
                  type="button"
                  variant={!withMeet ? "default" : "outline"}
                  aria-pressed={!withMeet}
                  onClick={() => onMeetChange(false)}
                >
                  Meetなし
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            {loading ? (
              <Spinner />
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-base font-medium">
                    {visibleMonth.getFullYear()}年{visibleMonth.getMonth() + 1}月
                  </h2>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="前の月"
                      disabled={currentIdx <= bounds.min}
                      onClick={() =>
                        onMonthChange(
                          new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1)
                        )
                      }
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="次の月"
                      disabled={currentIdx >= bounds.max}
                      onClick={() =>
                        onMonthChange(
                          new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1)
                        )
                      }
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                </div>
                <div className="mb-1 grid grid-cols-7 text-center text-xs text-muted-foreground">
                  {WEEKDAYS.map((day) => (
                    <div key={day}>{day}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: startPad }, (_, index) => (
                    <div key={`pad-${index}`} />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, index) => {
                    const day = index + 1
                    const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day)
                    const key = localYmd(date)
                    const has = (byDay[key] || []).length > 0
                    const selected = key === selectedDay
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={!has}
                        className={[
                          "flex h-10 flex-col items-center justify-center gap-0.5 rounded-lg text-sm",
                          has ? "hover:bg-muted" : "text-muted-foreground/40",
                          selected ? "bg-primary text-primary-foreground hover:bg-primary" : "",
                          key < todayKey ? "opacity-60" : "",
                        ].join(" ")}
                        onClick={() => onSelectDay(key)}
                      >
                        <span>{day}</span>
                        <span
                          className={[
                            "size-1 rounded-full",
                            has
                              ? selected
                                ? "bg-primary-foreground"
                                : "bg-foreground"
                              : "bg-transparent",
                          ].join(" ")}
                        />
                      </button>
                    )
                  })}
                </div>
                {selectedDay ? (
                  <div className="mt-5">
                    <FieldLabel text="空き時間" />
                    {dayTimes.length ? (
                      <div className="flex flex-wrap gap-2">
                        {dayTimes.map((iso) => (
                          <Button
                            key={iso}
                            type="button"
                            variant={iso === selectedStart ? "default" : "outline"}
                            aria-pressed={iso === selectedStart}
                            onClick={() => onSelectStart(iso)}
                          >
                            {hm.format(new Date(iso))}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">この日の空きはありません。</p>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog
        open={!!selectedStart}
        onOpenChange={(open) => {
          if (!open && !submitting) onCloseDrawer()
        }}
      >
        <DialogContent
          className="overflow-visible sm:max-w-lg"
          showCloseButton={!submitting}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            document.getElementById("field-name")?.focus()
          }}
          onPointerDownOutside={(event) => {
            if (submitting) event.preventDefault()
          }}
          onEscapeKeyDown={(event) => {
            if (submitting) event.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>予約内容</DialogTitle>
            <DialogDescription>
              {selectedStart
                ? `${formatRange(selectedStart, new Date(new Date(selectedStart).getTime() + durationMin * 60000).toISOString())} · ${withMeet ? "Google Meet" : "Meetなし"}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {error ? <ErrorBanner>{error}</ErrorBanner> : null}
          <div className="grid gap-4">
            <div>
              <FieldLabel
                text="お名前"
                htmlFor="field-name"
                hint="予約者の名前です。カレンダー招待にも使います。"
                disabled={submitting}
              />
              <Input
                id="field-name"
                value={form.name}
                disabled={submitting}
                onChange={(event) => onFormChange("name", event.target.value)}
              />
            </div>
            <div>
              <FieldLabel
                text="予定のタイトル（任意）"
                htmlFor="field-eventTitle"
                hint={`カレンダーに追加されるイベントのタイトルです。空欄なら「お名前 さんとのミーティング（${APP_NAME}）」になります。`}
                disabled={submitting}
              />
              <Input
                id="field-eventTitle"
                value={form.eventTitle}
                disabled={submitting}
                onChange={(event) => onFormChange("eventTitle", event.target.value)}
              />
            </div>
            <div>
              <FieldLabel
                text="メールアドレス"
                htmlFor="field-email"
                hint={emailHint}
                disabled={submitting}
              />
              <Input
                id="field-email"
                type="email"
                value={form.email}
                disabled={submitting}
                onChange={(event) => onFormChange("email", event.target.value)}
              />
            </div>
            <div>
              <FieldLabel
                text="説明（任意）"
                htmlFor="field-note"
                hint="ホストへの連絡事項です。カレンダー予定の説明にも入ります。"
                disabled={submitting}
              />
              <Textarea
                id="field-note"
                value={form.note}
                disabled={submitting}
                onChange={(event) => onFormChange("note", event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={submitting} onClick={onCloseDrawer}>
              戻る
            </Button>
            <Button type="button" disabled={submitting} onClick={onSubmit}>
              {submitting ? "予約しています…" : "予約を確定する"}
            </Button>
          </DialogFooter>
          {submitting ? <BusyOverlay text="予約しています…" placement="dialog" /> : null}
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
