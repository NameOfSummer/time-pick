import type { AdminCalendar, HourRange, PublicConfig } from "@/lib/types"

/**
 * カレンダー見出しの曜日。
 */
export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"]

/**
 * 管理画面の曜日行。月曜始まり。
 */
export const WEEK_KEYS = [
  { key: "1", label: "月" },
  { key: "2", label: "火" },
  { key: "3", label: "水" },
  { key: "4", label: "木" },
  { key: "5", label: "金" },
  { key: "6", label: "土" },
  { key: "0", label: "日" },
] as const

/**
 * 画面とメールに出すアプリ名。
 */
export const APP_NAME = "TimePick"

/**
 * 何日先まで予約できるかの上限。1年。
 */
export const MAX_DAYS_AHEAD = 365

/**
 * 所要時間を表示用の文言にする。
 * @param min 分。
 * @returns 分または時間の表示。
 */
export function formatDuration(min: number): string {
  if (min < 60) return `${min}分`
  const hours = Math.floor(min / 60)
  const rest = min % 60
  return rest ? `${hours}時間${rest}分` : `${hours}時間`
}

/**
 * 2桁に揃える。
 * @param value 数値。
 * @returns 2桁の文字列。
 */
export function pad(value: number): string {
  return String(value).padStart(2, "0")
}

/**
 * ローカル日付を YYYY-MM-DD にする。
 * @param date 日付。
 * @returns 日付キー。
 */
export function localYmd(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * その月の1日を返す。
 * @param date 基準日。
 * @returns 月初。
 */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

/**
 * 年月を通し番号にする。
 * @param date 日付。
 * @returns 年*12+月。
 */
export function monthIndex(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth()
}

/**
 * 予約できる期間を返す。
 * @param config 公開設定。
 * @returns 開始と終了。
 */
export function bookingWindow(config: PublicConfig | null): {
  start: Date
  end: Date
} {
  const now = new Date()
  const minNotice = Number(config?.minNoticeMin) || 0
  const maxDays = Number(config?.maxDaysAhead) || 28
  return {
    start: new Date(now.getTime() + minNotice * 60000),
    end: new Date(now.getTime() + maxDays * 24 * 60 * 60000),
  }
}

/**
 * 予約期間に含まれる月の範囲を返す。
 * @param config 公開設定。
 * @returns 月番号の最小と最大。
 */
export function bookingMonthBounds(config: PublicConfig | null): {
  min: number
  max: number
} {
  const window = bookingWindow(config)
  return { min: monthIndex(window.start), max: monthIndex(window.end) }
}

/**
 * 表示中の月を予約期間内に収める。
 * @param month いま表示している月初。
 * @param config 公開設定。
 * @returns 収めた月初。
 */
export function clampVisibleMonth(month: Date, config: PublicConfig | null): Date {
  const bounds = bookingMonthBounds(config)
  const index = monthIndex(month)
  if (index < bounds.min) return startOfMonth(bookingWindow(config).start)
  if (index > bounds.max) return startOfMonth(bookingWindow(config).end)
  return month
}

/**
 * 開始と終了を日本語の期間にする。
 * @param startIso 開始。
 * @param endIso 終了。
 * @returns 日付と時刻の表示。
 */
export function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const date = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(start)
  const hm = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  return `${date} ${hm.format(start)} – ${hm.format(end)}`
}

/**
 * 空き枠を日付ごとに分ける。
 * @param starts ISO 文字列の一覧。
 * @returns 日付キーごとの枠。
 */
export function startsByDay(starts: string[]): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const iso of starts) {
    const key = localYmd(new Date(iso))
    if (!map[key]) map[key] = []
    map[key].push(iso)
  }
  return map
}

/**
 * エラーを画面用の文言にする。
 * @param error 例外。
 * @returns 表示する文。
 */
export function errMessage(error: unknown): string {
  if (!error) return "エラーが発生しました。"
  if (error instanceof Error) return error.message || "エラーが発生しました。"
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message) return message
  }
  return String(error)
}

/**
 * 1日分の時間帯を配列にする。
 * @param hours 保存されている時間帯。
 * @returns 時間帯の配列。
 */
export function dayRanges(hours: HourRange[] | HourRange | null | undefined): HourRange[] {
  if (!hours) return []
  if (Array.isArray(hours)) return hours.slice()
  if (hours.start && hours.end) return [{ start: hours.start, end: hours.end }]
  return []
}

/**
 * 曜日ごとの受付時間を画面用に揃える。
 * @param weekHours 保存されている受付時間。
 * @returns 日曜から土曜までの時間帯。
 */
export function normalizeWeekHours(
  weekHours: Record<string, HourRange[] | HourRange | null> | null | undefined
): Record<string, HourRange[] | null> {
  const source = weekHours || {}
  const next: Record<string, HourRange[] | null> = {}
  for (let day = 0; day <= 6; day += 1) {
    const ranges = dayRanges(source[String(day)])
    next[String(day)] = ranges.length ? ranges : null
  }
  return next
}

/**
 * 時刻を分にする。
 * @param hm HH:MM。
 * @returns 0時からの分。
 */
export function hmToMin(hm: string): number {
  const parts = String(hm || "00:00").split(":")
  return Number(parts[0] || 0) * 60 + Number(parts[1] || 0)
}

/**
 * 分を HH:MM にする。
 * @param min 0時からの分。
 * @returns HH:MM。
 */
export function minToHm(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
}

/**
 * 次に足す時間帯の候補を返す。
 * @param ranges いまの時間帯。
 * @returns 次の開始と終了。
 */
export function suggestNextRange(ranges: HourRange[]): HourRange {
  if (!ranges.length) return { start: "10:00", end: "18:00" }
  const lastEnd = hmToMin(ranges[ranges.length - 1].end)
  if (ranges.length === 1 && lastEnd <= 13 * 60) {
    return { start: "13:00", end: "18:00" }
  }
  const startMin = Math.min(lastEnd + 60, 20 * 60)
  const endMin = Math.min(startMin + 180, 22 * 60)
  if (endMin <= startMin) return { start: "18:00", end: "20:00" }
  return { start: minToHm(startMin), end: minToHm(endMin) }
}

/**
 * 1日の時間帯の不正と重なりを調べる。
 * @param ranges 時間帯。
 * @returns 不正・重なりの位置と文言。
 */
export function dayHourIssues(ranges: HourRange[]): {
  invalid: Record<number, boolean>
  overlap: Record<number, boolean>
  messages: string[]
} {
  const invalid: Record<number, boolean> = {}
  const overlap: Record<number, boolean> = {}
  ranges.forEach((range, index) => {
    const start = hmToMin(range.start)
    const end = hmToMin(range.end)
    if (!range.start || !range.end || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      invalid[index] = true
    }
  })
  ranges.forEach((left, i) => {
    if (invalid[i]) return
    const a0 = hmToMin(left.start)
    const a1 = hmToMin(left.end)
    ranges.forEach((right, j) => {
      if (j <= i || invalid[j]) return
      const b0 = hmToMin(right.start)
      const b1 = hmToMin(right.end)
      if (a0 < b1 && b0 < a1) {
        overlap[i] = true
        overlap[j] = true
      }
    })
  })
  const messages: string[] = []
  if (Object.keys(invalid).length) messages.push("終了時刻は開始より後にしてください。")
  if (Object.keys(overlap).length) messages.push("時間帯が重なっています。")
  return { invalid, overlap, messages }
}

/**
 * 受付時間全体の保存前エラーを返す。
 * @param weekHours 曜日ごとの時間帯。
 * @returns エラー文。問題なければ空。
 */
export function weekHoursErrorMessage(
  weekHours: Record<string, HourRange[] | null> | null | undefined
): string {
  let overlap = false
  let invalid = false
  WEEK_KEYS.forEach((day) => {
    const issues = dayHourIssues(dayRanges((weekHours || {})[day.key]))
    if (Object.keys(issues.invalid).length) invalid = true
    if (Object.keys(issues.overlap).length) overlap = true
  })
  if (overlap && invalid) return "受付時間に、重なっている時間帯または不正な時刻があります。"
  if (overlap) return "同じ曜日の時間帯が重なっています。直してから保存してください。"
  if (invalid) return "終了時刻は開始より後にしてください。"
  return ""
}

/**
 * カレンダーが一覧にあるかを返す。
 * @param id カレンダー ID。
 * @param calendars 管理画面の一覧。
 * @returns あれば true。
 */
export function adminCalendarExists(id: string | undefined, calendars: AdminCalendar[]): boolean {
  const want = String(id || "")
  if (!want) return false
  return calendars.some((calendar) => calendar.id === want || (want === "primary" && calendar.primary))
}

/**
 * カレンダーの表示名を返す。
 * @param calendar カレンダー。
 * @returns 一覧用の名前。
 */
export function calendarOptionLabel(calendar: AdminCalendar): string {
  let name = calendar.name || calendar.id || "カレンダー"
  if (calendar.primary) name += "（メイン）"
  else if (calendar.owned === false) name += "（共有）"
  return name
}

/**
 * 表示名順にカレンダーを並べる。
 * @param calendars 一覧。
 * @returns 並べた一覧。
 */
export function sortedAdminCalendars(calendars: AdminCalendar[]): AdminCalendar[] {
  return calendars.slice().sort((left, right) => {
    const byName = String(left.name || left.id || "").localeCompare(
      String(right.name || right.id || ""),
      "ja"
    )
    if (byName !== 0) return byName
    return String(left.id || "").localeCompare(String(right.id || ""), "ja")
  })
}

/**
 * 許可ドメインに合うメールかを返す。
 * @param email 入力されたメール。
 * @param domains 許可ドメイン。
 * @returns 許可なら true。
 */
export function emailDomainAllowed(email: string, domains: string[] | undefined): boolean {
  const list = domains || []
  if (!list.length) return true
  const at = String(email || "").lastIndexOf("@")
  if (at < 0) return false
  const domain = String(email)
    .slice(at + 1)
    .replace(/\.+$/, "")
    .trim()
    .toLowerCase()
  return list.some((item) => domain === String(item || "").toLowerCase())
}

/**
 * 安全に開ける URL だけを返す。
 * @param url 候補。
 * @returns 使える URL。ダメなら空。
 */
export function safeHref(url: string | undefined): string {
  if (!url) return ""
  if (/^https:\/\//.test(url) || /^http:\/\/localhost/.test(url) || url.indexOf("?") === 0) {
    return url
  }
  return ""
}
