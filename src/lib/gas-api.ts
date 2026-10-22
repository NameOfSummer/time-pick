import type {
  AdminSettings,
  AdminState,
  CreateBookingPayload,
  PublicBooking,
  PublicConfig,
  SlotList,
} from "@/lib/types"

/**
 * google.script.run で呼ぶ関数。
 */
type GasRun = {
  withSuccessHandler: (handler: (result: unknown) => void) => GasRun
  withFailureHandler: (
    handler: (error: { message?: string } | null) => void
  ) => GasRun
  getPublicConfig: () => void
  getSlots: (durationMin: number) => void
  createBooking: (payload: CreateBookingPayload) => void
  getBooking: (token: string) => void
  cancelBooking: (token: string) => void
  adminGetState: (key: string) => void
  adminSaveSettings: (key: string, patch: string) => void
}

/**
 * 接続の判定に使う GAS の関数名。
 */
const actions: Array<keyof Omit<GasRun, "withSuccessHandler" | "withFailureHandler">> = [
  "getPublicConfig",
  "getSlots",
  "createBooking",
  "getBooking",
  "cancelBooking",
  "adminGetState",
  "adminSaveSettings",
]

/**
 * 画面から呼べる GAS の関数が揃っていれば、その呼び出し口を返す。
 * @returns 呼び出し口。未接続なら null。
 */
export function gasRun(): GasRun | null {
  const host = window as Window & {
    google?: { script?: { run?: GasRun } }
  }
  const run = host.google?.script?.run
  if (!run) return null
  for (const action of actions) {
    if (typeof run[action] !== "function") return null
  }
  return run
}

/**
 * 成功と失敗の受け取りを付けてから GAS の関数を呼ぶ。
 * @param invoke 接続済みの呼び出し口で関数を実行する。
 * @returns 戻り値。
 */
function callGas<T>(invoke: (run: GasRun) => void): Promise<T> {
  const run = gasRun()
  if (!run) {
    return Promise.reject(new Error("予約サーバーにまだ接続していません"))
  }
  return new Promise((resolve, reject) => {
    const chained = run
      .withSuccessHandler((result) => {
        resolve(result as T)
      })
      .withFailureHandler((error) => {
        reject(new Error(error?.message || "実行に失敗しました"))
      })
    invoke(chained)
  })
}

/**
 * 公開設定を読む。
 * @returns 公開設定。
 */
export function getPublicConfig(): Promise<PublicConfig> {
  return callGas((run) => run.getPublicConfig())
}

/**
 * 空き枠を読む。
 * @param durationMin 所要時間。
 * @returns 空き枠。
 */
export function getSlots(durationMin: number): Promise<SlotList> {
  return callGas((run) => run.getSlots(durationMin))
}

/**
 * 予約を確定する。
 * @param payload 予約内容。
 * @returns 確定した予約。
 */
export function createBooking(payload: CreateBookingPayload): Promise<PublicBooking> {
  return callGas((run) => run.createBooking(payload))
}

/**
 * 予約を読む。
 * @param token 予約トークン。
 * @returns 予約。
 */
export function getBooking(token: string): Promise<PublicBooking> {
  return callGas((run) => run.getBooking(token))
}

/**
 * 予約を取り消す。
 * @param token 予約トークン。
 * @returns 取り消した予約。
 */
export function cancelBooking(token: string): Promise<PublicBooking> {
  return callGas((run) => run.cancelBooking(token))
}

/**
 * 管理画面の状態を読む。
 * @param key 管理キー。
 * @returns 設定とカレンダー一覧。
 */
export function adminGetState(key: string): Promise<AdminState> {
  return callGas((run) => run.adminGetState(key))
}

/**
 * 管理画面の設定を保存する。
 * google.script.run は null を含むオブジェクトを渡せないことがあるので、JSON 文字列で送る。
 * @param key 管理キー。
 * @param patch 保存する設定。
 * @returns 保存後の設定。
 */
export function adminSaveSettings(key: string, patch: AdminSettings): Promise<AdminSettings> {
  return callGas((run) => run.adminSaveSettings(key, JSON.stringify(patch)))
}
