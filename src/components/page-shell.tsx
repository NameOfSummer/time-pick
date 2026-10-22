import type { MouseEvent, ReactNode } from "react"
import { CircleHelp, TriangleAlert } from "lucide-react"

import logo from "@/assets/logo.png"
import { Button } from "@/components/ui/button"
import { APP_NAME } from "@/lib/booking"

/**
 * 画面共通の枠、見出し、フッターを表示する。
 * @param props 見出し、ロゴ操作、使い方、本文。
 * @returns 画面の枠。
 */
export function PageShell({
  lede,
  bookingHref,
  submitting,
  onBrandClick,
  onHelp,
  children,
  showFoot = true,
}: {
  lede: string
  bookingHref: string
  submitting: boolean
  onBrandClick: (event: MouseEvent<HTMLAnchorElement>) => void
  onHelp: () => void
  children: ReactNode
  showFoot?: boolean
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1080px] flex-col px-5 py-6">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <a
          className="font-brand inline-flex items-center gap-3 text-4xl leading-none font-semibold tracking-tight"
          href={bookingHref || "#"}
          target="_top"
          aria-label="予約ページのトップへ"
          onClick={onBrandClick}
        >
          <img src={logo} alt="" className="block h-[calc(1em+14px)] w-auto shrink-0 self-center" />
          <span className="leading-none self-center translate-y-[3px]">{APP_NAME}</span>
        </a>
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{lede}</p>
        <Button type="button" variant="outline" size="sm" disabled={submitting} onClick={onHelp}>
          <CircleHelp />
          使い方
        </Button>
      </header>
      {children}
      {showFoot ? (
        <p className="mt-auto flex items-start gap-1.5 pt-8 text-xs text-muted-foreground">
          <TriangleAlert className="size-3.5 shrink-0 translate-y-px" aria-hidden />
          このページの URL は、予約する相手以外には共有しないでください。
        </p>
      ) : null}
    </div>
  )
}

/**
 * 読み込み中の円を表示する。
 * @returns 読み込み表示。
 */
export function Spinner() {
  return (
    <div
      className="mx-auto my-10 size-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
      aria-label="読み込み中"
    />
  )
}

/**
 * エラー文を表示する。
 * @param props 文言。
 * @returns エラー枠。
 */
export function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </div>
  )
}
