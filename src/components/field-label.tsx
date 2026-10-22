import { useId } from "react"
import { CircleHelp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

/**
 * ラベルと、任意の説明チップを並べる。
 * @param props 文言、説明、紐づける入力、無効化。
 * @returns ラベル行。
 */
export function FieldLabel({
  text,
  hint,
  htmlFor,
  disabled = false,
}: {
  text: string
  hint?: string
  htmlFor?: string
  disabled?: boolean
}) {
  const bubbleId = useId()

  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      {htmlFor ? (
        <Label htmlFor={htmlFor}>{text}</Label>
      ) : (
        <span className="text-sm font-medium">{text}</span>
      )}
      {hint ? (
        <span className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="peer"
            disabled={disabled}
            tabIndex={disabled ? -1 : 0}
            aria-label={`${text}の説明`}
            aria-describedby={disabled ? undefined : bubbleId}
          >
            <CircleHelp />
          </Button>
          <span
            id={bubbleId}
            role="tooltip"
            className="pointer-events-none invisible absolute top-full left-0 z-50 mt-1 w-max max-w-[40vw] rounded-lg border bg-popover px-3 py-2 text-left text-xs leading-relaxed break-words whitespace-pre-line text-popover-foreground opacity-0 shadow-md peer-hover:visible peer-hover:opacity-100 peer-focus-visible:visible peer-focus-visible:opacity-100"
          >
            {hint}
          </span>
        </span>
      ) : null}
    </div>
  )
}
