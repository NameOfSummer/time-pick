import { APP_NAME } from "@/lib/booking"
import type { AppView, Bootstrap } from "@/lib/types"

/**
 * 画面の種類として使える値かを返す。
 * @param value 判定する値。
 * @returns 使える画面なら true。
 */
function isAppView(value: string): value is AppView {
  return value === "book" || value === "done" || value === "cancel" || value === "admin"
}

/**
 * HTML と URL から初期値を読む。
 * @returns 画面、トークン、管理キー、予約ページ URL。
 */
export function readBootstrap(): Bootstrap {
  const base: Bootstrap = {
    page: "book",
    token: "",
    adminKey: "",
    webAppUrl: "",
  }
  const node = document.getElementById("bootstrap")
  if (node?.textContent) {
    try {
      const parsed = JSON.parse(node.textContent) as Partial<Bootstrap>
      if (parsed.page && isAppView(parsed.page)) base.page = parsed.page
      if (typeof parsed.token === "string") base.token = parsed.token
      if (typeof parsed.adminKey === "string") base.adminKey = parsed.adminKey
      if (typeof parsed.webAppUrl === "string") base.webAppUrl = parsed.webAppUrl
    } catch {
      // 壊れた bootstrap は無視する。
    }
  }
  try {
    const query = new URLSearchParams(window.location.search)
    const page = query.get("page")
    if (page && isAppView(page)) base.page = page
    if (query.get("token")) base.token = query.get("token") || ""
    if (query.get("key")) base.adminKey = query.get("key") || ""
  } catch {
    // URL が読めなくても初期値で進める。
  }
  return base
}

/**
 * 予約ページとして使える URL かを返す。
 * @param url 候補。
 * @returns GAS の iframe 内でなければ true。
 */
export function isUsableBookingUrl(url: string): boolean {
  if (!url) return false
  if (url.includes("userCodeAppPanel")) return false
  if (url.includes("googleusercontent.com")) return false
  return true
}

/**
 * 予約トップへ戻る URL を返す。
 * @param webAppUrl GAS から渡された予約ページ URL。
 * @returns 使える URL。無ければ空。
 */
export function bookingPageHref(webAppUrl: string): string {
  const injected = String(webAppUrl || "").trim()
  if (isUsableBookingUrl(injected)) return injected
  try {
    const host = window.location.hostname || ""
    const path = window.location.pathname || "/"
    if (host.includes("googleusercontent.com") || path.includes("userCodeAppPanel")) {
      return ""
    }
    return `${window.location.protocol}//${window.location.host}${path}`
  } catch {
    return "/"
  }
}

/**
 * 予約トップの URL へ移動する。
 * @param href 移動先。
 * @returns {void}
 */
export function navigateToBookingUrl(href: string): void {
  try {
    const host = window.location.hostname || ""
    const path = window.location.pathname || ""
    if (host.includes("googleusercontent.com") || path.includes("userCodeAppPanel")) {
      window.top!.location.href = href
      return
    }
  } catch {
    // iframe の外へ出られないときは通常の遷移。
  }
  window.location.assign(href)
}

/**
 * 画面タイトルを揃える。
 * @param view いまの画面。
 * @returns {void}
 */
export function syncDocumentTitle(view: AppView): void {
  const suffix =
    view === "done" ? "予約確定" : view === "cancel" ? "キャンセル" : view === "admin" ? "管理" : "予約"
  document.title = `${APP_NAME} - ${suffix}`
}
