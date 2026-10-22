import { APP_NAME, MAX_DAYS_AHEAD } from "@/lib/booking"
import { gasRun } from "@/lib/gas-api"
import type { AdminSettings, CreateBookingPayload, HourRange, PublicBooking } from "@/lib/types"

/**
 * プレビュー用の保存形。
 */
type PreviewStore = {
  busy: Record<string, boolean>
  bookings: Record<string, PublicBooking>
  settings: AdminSettings | null
}

/**
 * 初期の受付時間。
 */
const defaultWeekHours: Record<string, HourRange[] | null> = {
  "0": null,
  "1": [{ start: "10:00", end: "18:00" }],
  "2": [{ start: "10:00", end: "18:00" }],
  "3": [{ start: "10:00", end: "18:00" }],
  "4": [{ start: "10:00", end: "18:00" }],
  "5": [{ start: "10:00", end: "18:00" }],
  "6": null,
}

/**
 * 時刻を分にする。
 * @param hm HH:MM。
 * @returns 0時からの分。
 */
function hmToMin(hm: string): number {
  const parts = String(hm || "00:00").split(":")
  return Number(parts[0] || 0) * 60 + Number(parts[1] || 0)
}

/**
 * 1日分の時間帯を配列にする。
 * @param hours 保存されている時間帯。
 * @returns 時間帯の配列。
 */
function dayRanges(hours: HourRange[] | HourRange | null | undefined): HourRange[] {
  if (!hours) return []
  if (Array.isArray(hours)) return hours
  if (hours.start && hours.end) return [hours]
  return []
}

/**
 * タイムゾーン上の壁時計を UTC にする。
 * @param year 年。
 * @param month 月。
 * @param day 日。
 * @param hour 時。
 * @param minute 分。
 * @param timeZone タイムゾーン。
 * @returns UTC の Date。
 */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0)
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
  const asUtc = (ms: number) => {
    const map: Record<string, string> = {}
    dtf.formatToParts(new Date(ms)).forEach((part) => {
      if (part.type !== "literal") map[part.type] = part.value
    })
    let hours = Number(map.hour)
    if (hours === 24) hours = 0
    return Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      hours,
      Number(map.minute),
      Number(map.second)
    )
  }
  const offset = asUtc(utcGuess) - utcGuess
  const utc = utcGuess - offset
  const offset2 = asUtc(utc) - utc
  return new Date(utcGuess - offset2)
}

/**
 * GAS が無いときに、同じ関数名で動くモックを付ける。
 * @returns {void}
 */
export function installPreviewApi(): void {
  if (gasRun()) return

  let store: PreviewStore
  try {
    store = JSON.parse(sessionStorage.getItem("timepick-preview") || '{"busy":{},"bookings":{}}')
  } catch {
    store = { busy: {}, bookings: {}, settings: null }
  }
  const busy = store.busy || {}
  const bookings = store.bookings || {}
  let previewSettings: AdminSettings =
    store.settings ||
    ({
      hostName: "デモ",
      timezone: "Asia/Tokyo",
      bufferMin: 15,
      minNoticeMin: 120,
      maxDaysAhead: 28,
      writeCalendarId: "primary",
      busyCalendarIds: ["primary", "private"],
      weekHours: defaultWeekHours,
      allowedEmailDomains: [],
    } as AdminSettings)

  const persist = () => {
    sessionStorage.setItem(
      "timepick-preview",
      JSON.stringify({ busy, bookings, settings: previewSettings })
    )
  }

  const mockStarts = (durationMin: number) => {
    const tz = "Asia/Tokyo"
    const out: string[] = []
    const now = Date.now()
    const weekHours = previewSettings.weekHours || defaultWeekHours
    const days = Math.min(
      MAX_DAYS_AHEAD,
      Math.max(1, Number(previewSettings.maxDaysAhead) || 28)
    )
    for (let i = 0; i < days; i += 1) {
      const seed = new Date(now + i * 86400000)
      const ymd = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(seed)
      const parts = ymd.split("-").map(Number)
      const weekday = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12)).getUTCDay()
      const ranges = dayRanges(weekHours[String(weekday)])
      for (const range of ranges) {
        const startMin = hmToMin(range.start)
        const endMin = hmToMin(range.end)
        for (let minutes = startMin; minutes + durationMin <= endMin; minutes += 15) {
          const start = zonedTimeToUtc(
            parts[0],
            parts[1],
            parts[2],
            Math.floor(minutes / 60),
            minutes % 60,
            tz
          )
          if (start.getTime() > now + 2 * 3600000 && !busy[start.toISOString()]) {
            out.push(start.toISOString())
          }
        }
      }
    }
    return out
  }

  const publicBooking = (row: PublicBooking): PublicBooking => ({
    ...row,
    googleUrl: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(row.title)}`,
    icsUrl: `/?page=ics&token=${row.token}`,
    cancelUrl: `/?page=cancel&token=${row.token}`,
  })

  const impl = {
    getPublicConfig: () => ({
      configured: true,
      appName: APP_NAME,
      hostName: typeof previewSettings.hostName === "string" ? previewSettings.hostName : "デモ",
      timezone: "Asia/Tokyo",
      durations: Array.from({ length: 16 }, (_, index) => 15 + index * 15),
      maxDaysAhead: Number(previewSettings.maxDaysAhead) || 28,
      minNoticeMin: Number(previewSettings.minNoticeMin) || 120,
      allowedEmailDomains: Array.isArray(previewSettings.allowedEmailDomains)
        ? previewSettings.allowedEmailDomains
        : [],
    }),
    getSlots: (durationMin: number) => ({
      timezone: "Asia/Tokyo",
      durationMin,
      starts: mockStarts(Number(durationMin)),
    }),
    createBooking: (payload: CreateBookingPayload) => {
      if (!payload.name) throw new Error("お名前を入力してください。")
      const eventTitle = String(payload.eventTitle || "").trim()
      if (eventTitle.length > 80) throw new Error("予定のタイトルは80文字以内にしてください。")
      if (!payload.email || payload.email.indexOf("@") === -1) {
        throw new Error("メールアドレスの形式が正しくありません。")
      }
      const allowed = Array.isArray(previewSettings.allowedEmailDomains)
        ? previewSettings.allowedEmailDomains
        : []
      if (allowed.length) {
        const domain = String(payload.email)
          .slice(String(payload.email).lastIndexOf("@") + 1)
          .replace(/\.+$/, "")
          .trim()
          .toLowerCase()
        if (!allowed.some((item) => domain === String(item || "").toLowerCase())) {
          throw new Error("このドメインのメールアドレスでは予約できません。")
        }
      }
      if (busy[payload.startIso]) throw new Error("その時間は埋まりました。別の時間を選んでください。")
      const start = new Date(payload.startIso)
      const end = new Date(start.getTime() + payload.durationMin * 60000)
      const token = `preview-${Math.random().toString(36).slice(2, 10)}`
      busy[payload.startIso] = true
      const row: PublicBooking = {
        token,
        status: "confirmed",
        title: eventTitle || `${payload.name} さんとのミーティング（${APP_NAME}）`,
        guestName: payload.name,
        guestEmail: payload.email,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        durationMin: payload.durationMin,
        withMeet: !!payload.withMeet,
        meetUrl: payload.withMeet ? "https://meet.google.com/preview-demo" : "",
        note: payload.note || "",
      }
      bookings[token] = row
      persist()
      return publicBooking(row)
    },
    getBooking: (token: string) => {
      const row = bookings[token]
      if (!row) throw new Error("予約が見つかりません。")
      return publicBooking(row)
    },
    cancelBooking: (token: string) => {
      const row = bookings[token]
      if (!row) throw new Error("予約が見つかりません。")
      row.status = "cancelled"
      delete busy[row.startIso]
      persist()
      return publicBooking(row)
    },
    adminGetState: () => ({
      settings: {
        ...previewSettings,
        weekHours: previewSettings.weekHours || defaultWeekHours,
        allowedEmailDomains: previewSettings.allowedEmailDomains || [],
      },
      calendars: [
        { id: "primary", name: "メイン", primary: true },
        { id: "private", name: "プライベート", primary: false },
        { id: "work", name: "仕事", primary: false },
      ],
    }),
    adminSaveSettings: (_key: string, patch: AdminSettings | string) => {
      if (typeof patch === "string") {
        patch = JSON.parse(patch) as AdminSettings
      }
      if (patch?.writeCalendarId) {
        const calIds: Record<string, boolean> = { primary: true, private: true, work: true }
        if (!calIds[patch.writeCalendarId]) {
          throw new Error("このカレンダーはもうありません。選び直してください。")
        }
        const liveBusy = (patch.busyCalendarIds || []).filter((id) => calIds[id])
        if (!liveBusy.length) {
          throw new Error("このカレンダーはもうありません。選び直してください。")
        }
        patch.busyCalendarIds = liveBusy
      }
      if (patch?.weekHours) {
        const names = ["日曜", "月曜", "火曜", "水曜", "木曜", "金曜", "土曜"]
        for (let day = 0; day <= 6; day += 1) {
          const ranges = dayRanges(patch.weekHours[String(day)])
          const cleaned = ranges.map((range) => ({
            start: hmToMin(range.start),
            end: hmToMin(range.end),
          }))
          for (const range of ranges) {
            if (!range.start || !range.end || hmToMin(range.end) <= hmToMin(range.start)) {
              throw new Error(`${names[day]}の終了時刻は開始より後にしてください。`)
            }
          }
          cleaned.sort((left, right) => left.start - right.start)
          for (let index = 1; index < cleaned.length; index += 1) {
            if (cleaned[index].start < cleaned[index - 1].end) {
              throw new Error(`${names[day]}の時間帯が重なっています。`)
            }
          }
        }
      }
      previewSettings = { ...previewSettings, ...patch }
      previewSettings.maxDaysAhead = Math.min(
        MAX_DAYS_AHEAD,
        Math.max(1, Number(previewSettings.maxDaysAhead) || 28)
      )
      if (previewSettings.allowedEmailDomains != null) {
        const raw = previewSettings.allowedEmailDomains
        const text = Array.isArray(raw) ? raw.join("\n") : String(raw || "")
        const seen: Record<string, boolean> = {}
        const out: string[] = []
        for (const part of text.split(/[\s,;]+/)) {
          const domain = String(part || "")
            .replace(/^@+/, "")
            .replace(/\.+$/, "")
            .trim()
            .toLowerCase()
          if (!domain) continue
          if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
            throw new Error(`メールドメインの形式が正しくありません（${domain}）。`)
          }
          if (seen[domain]) continue
          seen[domain] = true
          out.push(domain)
        }
        previewSettings.allowedEmailDomains = out
      }
      persist()
      return previewSettings
    },
  }

  type Success = (result: unknown) => void
  type Failure = (error: { message?: string } | null) => void
  let ok: Success = () => {}
  let fail: Failure = () => {}
  const api: Record<string, unknown> = {
    withSuccessHandler(fn: Success) {
      ok = fn
      return api
    },
    withFailureHandler(fn: Failure) {
      fail = fn
      return api
    },
  }
  for (const [name, fn] of Object.entries(impl)) {
    api[name] = (...args: unknown[]) => {
      const success = ok
      const failure = fail
      window.setTimeout(() => {
        try {
          success((fn as (...values: unknown[]) => unknown)(...args))
        } catch (error) {
          failure(error instanceof Error ? error : { message: String(error) })
        }
      }, 60)
    }
  }

  const host = window as Window & {
    google?: { script?: { run?: unknown } }
  }
  host.google = host.google || {}
  host.google.script = host.google.script || {}
  host.google.script.run = api
}
