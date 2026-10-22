import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react"
import { Copy, Plus, Trash2, X } from "lucide-react"

import { FieldLabel } from "@/components/field-label"
import { ErrorBanner, PageShell, Spinner } from "@/components/page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  adminCalendarExists,
  calendarOptionLabel,
  dayHourIssues,
  dayRanges,
  hmToMin,
  MAX_DAYS_AHEAD,
  sortedAdminCalendars,
  suggestNextRange,
  WEEK_KEYS,
} from "@/lib/booking"
import { TIMEZONES } from "@/lib/timezones"
import type { AdminCalendar, AdminSettings, HourRange } from "@/lib/types"

/**
 * 管理画面を表示する。
 * @param props 設定と保存操作。
 * @returns 管理画面。
 */
export function AdminPage({
  patch,
  calendars,
  loading,
  submitting,
  error,
  bookingHref,
  onBrandClick,
  onHelp,
  onPatch,
  onSave,
}: {
  patch: AdminSettings | null
  calendars: AdminCalendar[]
  loading: boolean
  submitting: boolean
  error: string
  bookingHref: string
  onBrandClick: (event: MouseEvent<HTMLAnchorElement>) => void
  onHelp: () => void
  onPatch: (next: AdminSettings) => void
  onSave: () => void
}) {
  const adminCals = useMemo(() => sortedAdminCalendars(calendars), [calendars])
  const writeGone = patch ? !adminCalendarExists(patch.writeCalendarId, calendars) : false
  const busyGone = patch ? !(patch.busyCalendarIds || []).length : false
  const anyGone = writeGone || busyGone
  const timezoneOptions = useMemo(() => {
    const current = patch?.timezone || "Asia/Tokyo"
    if (TIMEZONES.some((item) => item.value === current)) return [...TIMEZONES]
    return [{ value: current, label: current }, ...TIMEZONES]
  }, [patch?.timezone])

  return (
    <PageShell
      lede="管理画面"
      bookingHref={bookingHref}
      submitting={submitting}
      onBrandClick={onBrandClick}
      onHelp={onHelp}
      showFoot={false}
    >
      <Card>
        <CardContent>
          {loading && !patch ? <Spinner /> : null}
          {error ? <ErrorBanner>{error}</ErrorBanner> : null}
          {patch && !error && anyGone ? (
            <ErrorBanner>このカレンダーはもうありません。選び直してください。</ErrorBanner>
          ) : null}
          {patch ? (
            <div className="grid gap-5">
              <div>
                <FieldLabel
                  text="表示名"
                  htmlFor="admin-hostName"
                  hint="予約ページの見出しに表示します。"
                />
                <Input
                  id="admin-hostName"
                  value={patch.hostName || ""}
                  onChange={(event) => onPatch({ ...patch, hostName: event.target.value })}
                />
              </div>
              <div>
                <FieldLabel
                  text="許可するメールドメイン"
                  htmlFor="admin-domains"
                  hint={
                    "@ は不要です。例: example.com\n（50件まで。1件ずつドメイン形式。1件の文字数上限なし）"
                  }
                />
                <DomainTagsField
                  id="admin-domains"
                  domains={
                    Array.isArray(patch.allowedEmailDomains)
                      ? patch.allowedEmailDomains
                      : String(patch.allowedEmailDomains || "")
                          .split(/[\s,;]+/)
                          .filter(Boolean)
                  }
                  onChange={(domains) => onPatch({ ...patch, allowedEmailDomains: domains })}
                />
              </div>
              <div>
                <FieldLabel
                  text="タイムゾーン"
                  hint="空き時間と予約の表示に使うタイムゾーンです。"
                />
                <Select
                  value={patch.timezone || "Asia/Tokyo"}
                  onValueChange={(value) => onPatch({ ...patch, timezone: value })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezoneOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <NumberField
                id="admin-buffer"
                label="会議前後のバッファ（分）"
                hint={"カレンダー上の予定の前後に、この分数だけ予約を入れられなくします。\n（0以上。上限なし）"}
                value={patch.bufferMin}
                onChange={(value) => onPatch({ ...patch, bufferMin: value })}
              />
              <NumberField
                id="admin-notice"
                label="最短何分前まで予約可"
                hint={"いまからこの分数以内の枠は予約できません。\n（0以上。上限なし）"}
                value={patch.minNoticeMin}
                onChange={(value) => onPatch({ ...patch, minNoticeMin: value })}
              />
              <NumberField
                id="admin-ahead"
                label="何日先まで予約可"
                hint={`今日から何日先までの空きを公開するかを決めます。\n（1〜${MAX_DAYS_AHEAD}日）`}
                min={1}
                max={MAX_DAYS_AHEAD}
                value={patch.maxDaysAhead}
                onChange={(value) => onPatch({ ...patch, maxDaysAhead: value })}
              />
              <div>
                <FieldLabel text="受付時間" hint="曜日ごとに予約を受け付ける時間帯です。" />
                <div className="grid gap-3">
                  {WEEK_KEYS.map((day) => (
                    <WeekRow
                      key={day.key}
                      day={day}
                      patch={patch}
                      onPatch={onPatch}
                    />
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel
                  text="予定の書き込み先"
                  hint="確定した予約を入れるカレンダーです。"
                />
                <Select
                  value={writeGone ? "" : patch.writeCalendarId}
                  onValueChange={(value) => onPatch({ ...patch, writeCalendarId: value })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="カレンダーを選び直してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {adminCals.map((calendar) => (
                      <SelectItem key={calendar.id} value={calendar.id}>
                        {calendarOptionLabel(calendar)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {writeGone ? (
                  <p className="mt-2 text-sm text-destructive">
                    このカレンダーはもうありません。選び直してください。
                  </p>
                ) : null}
              </div>
              <div>
                <FieldLabel
                  text="空き判定に使うカレンダー"
                  hint="予定が入っている時間を空きから除外するカレンダーです。複数選べます。"
                />
                <div className="grid gap-2">
                  {adminCals.map((calendar) => {
                    const checked = (patch.busyCalendarIds || []).includes(calendar.id)
                    return (
                      <label className="flex items-center gap-2 text-sm" key={calendar.id}>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => {
                            const set = new Set(patch.busyCalendarIds || [])
                            if (value === true) set.add(calendar.id)
                            else set.delete(calendar.id)
                            onPatch({ ...patch, busyCalendarIds: Array.from(set) })
                          }}
                        />
                        {calendarOptionLabel(calendar)}
                      </label>
                    )
                  })}
                </div>
                {busyGone ? (
                  <p className="mt-2 text-sm text-destructive">
                    このカレンダーはもうありません。選び直してください。
                  </p>
                ) : null}
              </div>
              <div>
                <Button type="button" disabled={submitting || anyGone} onClick={onSave}>
                  {submitting ? "保存しています…" : "設定を保存"}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </PageShell>
  )
}

/**
 * 許可ドメインの件数上限。
 */
const MAX_EMAIL_DOMAINS = 50

/**
 * 入力中の文言をドメインの配列にする。
 * @param raw 入力。
 * @returns 整えたドメイン。
 */
function parseDomainDraft(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((part) =>
      String(part || "")
        .replace(/^@+/, "")
        .replace(/\.+$/, "")
        .trim()
        .toLowerCase()
    )
    .filter(Boolean)
}

/**
 * 許可ドメインをタグで編集する。
 * @param props いまのドメインと更新。
 * @returns タグ入力。
 */
function DomainTagsField({
  id,
  domains,
  onChange,
}: {
  id: string
  domains: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState("")

  const commitDraft = () => {
    const added = parseDomainDraft(draft)
    if (!added.length) {
      setDraft("")
      return
    }
    const seen = new Set(domains)
    const next = [...domains]
    for (const domain of added) {
      if (seen.has(domain) || next.length >= MAX_EMAIL_DOMAINS) continue
      seen.add(domain)
      next.push(domain)
    }
    onChange(next)
    setDraft("")
  }

  const onDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.key === "Process") return
    if (event.key === "Enter") {
      event.preventDefault()
      commitDraft()
      return
    }
    if (event.key === "Backspace" && !draft && domains.length) {
      onChange(domains.slice(0, -1))
    }
  }

  return (
    <div
      className="flex min-h-20 w-full min-w-0 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-2 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const input = event.currentTarget.querySelector("input")
          input?.focus()
        }
      }}
    >
      {domains.map((domain) => (
        <Badge key={domain} variant="secondary" className="h-6 gap-0.5 pr-0.5">
          {domain}
          <button
            type="button"
            className="inline-flex size-4 items-center justify-center rounded-sm text-secondary-foreground/70 hover:text-secondary-foreground"
            aria-label={`${domain}を削除`}
            onMouseDown={(event) => {
              event.preventDefault()
              onChange(domains.filter((item) => item !== domain))
            }}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        id={id}
        value={draft}
        placeholder={domains.length ? "" : "example.com"}
        className="min-w-[8rem] flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onDraftKeyDown}
        onBlur={commitDraft}
      />
    </div>
  )
}

/**
 * 数値設定欄を表示する。
 * @param props ラベルと値。
 * @returns 数値入力。
 */
function NumberField({
  id,
  label,
  hint,
  min,
  max,
  value,
  onChange,
}: {
  id: string
  label: string
  hint: string
  min?: number
  max?: number
  value: number
  onChange: (value: number) => void
}) {
  const shown = Number.isFinite(value) ? String(value) : ""
  const [draft, setDraft] = useState(shown)
  const [focused, setFocused] = useState(false)

  const commit = (raw: string) => {
    if (raw.trim() === "" || !Number.isFinite(Number(raw))) {
      setDraft(shown)
      return
    }
    let next = Number(raw)
    if (min != null) next = Math.max(min, next)
    if (max != null) next = Math.min(max, next)
    onChange(next)
    setDraft(String(next))
  }

  return (
    <div>
      <FieldLabel text={label} htmlFor={id} hint={hint} />
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={focused ? draft : shown}
        onFocus={() => {
          setDraft(shown)
          setFocused(true)
        }}
        onChange={(event) => {
          const next = event.target.value
          if (next !== "" && !/^\d*$/.test(next)) return
          setDraft(next)
          if (next === "") return
          onChange(Number(next))
        }}
        onBlur={(event) => {
          commit(event.currentTarget.value)
          setFocused(false)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commit(event.currentTarget.value)
            event.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}

/**
 * 1曜日の受付時間を表示する。
 * @param props 曜日と設定。
 * @returns 曜日行。
 */
function WeekRow({
  day,
  patch,
  onPatch,
}: {
  day: (typeof WEEK_KEYS)[number]
  patch: AdminSettings
  onPatch: (next: AdminSettings) => void
}) {
  const ranges = dayRanges(patch.weekHours[day.key])
  const enabled = ranges.length > 0
  const issues = dayHourIssues(ranges)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyKeys, setCopyKeys] = useState<string[]>([])

  const setRanges = (next: HourRange[] | null) => {
    onPatch({
      ...patch,
      weekHours: { ...patch.weekHours, [day.key]: next },
    })
  }

  return (
    <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-[4rem_1fr] md:items-start">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={enabled}
          onCheckedChange={(value) => {
            setRanges(value === true ? [{ start: "10:00", end: "18:00" }] : null)
          }}
        />
        {day.label}
      </label>
      <div className="grid gap-2">
        {!enabled ? (
          <div className="text-sm text-muted-foreground">休み</div>
        ) : (
          <>
            {ranges.map((range, index) => {
              const bad = !!(issues.invalid[index] || issues.overlap[index])
              return (
                <div className="flex flex-wrap items-center gap-2" key={`${day.key}-${index}`}>
                  <Input
                    type="time"
                    className="w-auto"
                    value={range.start}
                    aria-invalid={bad}
                    onChange={(event) => {
                      const next = dayRanges(patch.weekHours[day.key])
                      next[index] = { start: event.target.value, end: range.end }
                      setRanges(next)
                    }}
                  />
                  <span className="text-sm text-muted-foreground">〜</span>
                  <Input
                    type="time"
                    className="w-auto"
                    value={range.end}
                    aria-invalid={bad}
                    onChange={(event) => {
                      const next = dayRanges(patch.weekHours[day.key])
                      next[index] = { start: range.start, end: event.target.value }
                      setRanges(next)
                    }}
                  />
                  {ranges.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="この時間帯を削除"
                      onClick={() => {
                        const next = dayRanges(patch.weekHours[day.key])
                        next.splice(index, 1)
                        setRanges(next.length ? next : null)
                      }}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                  {index === ranges.length - 1 ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label="時間帯を追加"
                        onClick={() => {
                          const next = dayRanges(patch.weekHours[day.key])
                          if (
                            next.length === 1 &&
                            hmToMin(next[0].end) - hmToMin(next[0].start) >= 6 * 60
                          ) {
                            const originalEnd = next[0].end
                            next[0] = { start: next[0].start, end: "12:00" }
                            next.push({ start: "13:00", end: originalEnd })
                          } else {
                            next.push(suggestNextRange(next))
                          }
                          setRanges(next)
                        }}
                      >
                        <Plus />
                      </Button>
                      <div className="relative">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label="他の曜日に複製"
                          aria-expanded={copyOpen}
                          onClick={(event) => {
                            event.stopPropagation()
                            setCopyOpen((current) => !current)
                            setCopyKeys([])
                          }}
                        >
                          <Copy />
                        </Button>
                        {copyOpen ? (
                          <div
                            className="absolute top-full right-0 z-20 mt-1 w-56 rounded-lg border bg-popover p-3 text-sm shadow-md"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div className="font-medium">{day.label}の時間帯を複製</div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() => {
                                  const others = WEEK_KEYS.filter((item) => item.key !== day.key).map(
                                    (item) => item.key
                                  )
                                  setCopyKeys(copyKeys.length === others.length ? [] : others)
                                }}
                              >
                                すべて
                              </Button>
                            </div>
                            <div className="grid gap-2">
                              {WEEK_KEYS.filter((item) => item.key !== day.key).map((other) => (
                                <label className="flex items-center gap-2" key={other.key}>
                                  <Checkbox
                                    checked={copyKeys.includes(other.key)}
                                    onCheckedChange={(value) => {
                                      setCopyKeys((current) =>
                                        value === true
                                          ? [...current, other.key]
                                          : current.filter((key) => key !== other.key)
                                      )
                                    }}
                                  />
                                  {other.label}
                                </label>
                              ))}
                            </div>
                            <Button
                              type="button"
                              className="mt-3 w-full"
                              size="sm"
                              disabled={!copyKeys.length}
                              onClick={() => {
                                const source = dayRanges(patch.weekHours[day.key])
                                if (!source.length) return
                                const weekHours = { ...patch.weekHours }
                                copyKeys.forEach((key) => {
                                  weekHours[key] = JSON.parse(JSON.stringify(source))
                                })
                                onPatch({ ...patch, weekHours })
                                setCopyOpen(false)
                              }}
                            >
                              適用
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              )
            })}
            {issues.messages.length ? (
              <div className="text-sm text-destructive">{issues.messages.join(" ")}</div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
