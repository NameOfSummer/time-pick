/**
 * アプリ名。
 */
var APP_NAME = 'TimePick';

/**
 * 画面タイトルを返す。
 * @param page 画面。
 * @returns タイトル。
 */
function pageTitle_(page) {
  var suffix = '予約';
  if (page === 'done') suffix = '予約確定';
  else if (page === 'cancel') suffix = 'キャンセル';
  else if (page === 'admin') suffix = '管理';
  return APP_NAME + ' - ' + suffix;
}

/**
 * ウェブアプリの入口。
 * @param e リクエスト。
 * @returns HTML または ICS。
 */
function doGet(e) {
  e = e || { parameter: {} };
  var page = e.parameter.page || 'book';
  var token = e.parameter.token || '';

  if (page === 'ics') {
    return serveIcs_(token);
  }

  return renderWebApp_(page, token, page === 'admin' ? e.parameter.key || '' : '');
}

/**
 * WebApp.html に画面情報を入れて返す。
 * @param page 画面。
 * @param token 予約トークン。
 * @param adminKey 管理キー。管理画面以外は空。
 * @returns HTML。
 */
function renderWebApp_(page, token, adminKey) {
  var title = pageTitle_(page);
  var bootstrapJson = JSON.stringify({
    page: page,
    token: token,
    adminKey: adminKey || '',
    webAppUrl: webAppUrl_(),
  });
  var html = HtmlService.createHtmlOutputFromFile('WebApp')
    .getContent()
    .split('__SLOTL_PAGE_TITLE__').join(title)
    .split('__SLOTL_BOOTSTRAP__').join(bootstrapJson);
  return HtmlService.createHtmlOutput(html)
    .setTitle(title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * HTML ファイルの中身を差し込む。
 * @param filename ファイル名。
 * @returns ファイルの中身。
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * 公開中のウェブアプリ URL を返す。
 * @returns URL。取れなければ空。
 */
function webAppUrl_() {
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (err) {
    return '';
  }
}

/**
 * エディタから一度だけ実行する。管理キーと予約データシートを作る。
 * @returns 管理キーとシート情報。
 */
function setupTimePick() {
  var result = initializeSlotly_();
  Logger.log('===== TimePick セットアップ完了 =====');
  Logger.log('管理キー: ' + result.adminKey);
  Logger.log('予約データ: ' + result.spreadsheetUrl);
  Logger.log('Webアプリをデプロイしたあと、次のURLで管理画面を開く:');
  Logger.log('(デプロイURL)?page=admin&key=' + result.adminKey);
  return result;
}

/**
 * 旧名。setupTimePick と同じ。
 * @returns 管理キーとシート情報。
 */
function setupSlotly() {
  return setupTimePick();
}

/**
 * 予約画面用の公開設定を返す。
 * @returns 公開設定。
 */
function getPublicConfig() {
  ensureConfigured_();
  var settings = getSettings_();
  return {
    configured: true,
    appName: APP_NAME,
    hostName: settings.hostName || '',
    timezone: settings.timezone,
    durations: listDurations_(),
    maxDaysAhead: settings.maxDaysAhead,
    minNoticeMin: settings.minNoticeMin,
    allowedEmailDomains: settings.allowedEmailDomains || [],
  };
}

/**
 * 空き開始時刻の一覧を返す。
 * @param durationMin 所要時間。
 * @returns 空き枠。
 */
function getSlots(durationMin) {
  ensureConfigured_();
  return listAvailableStarts_(Number(durationMin));
}

/**
 * 予約を作成する。
 * @param payload 予約内容。
 * @returns 確定した予約。
 */
function createBooking(payload) {
  ensureConfigured_();
  return createBooking_(payload);
}

/**
 * 予約を1件返す。
 * @param token 予約トークン。
 * @returns 予約。
 */
function getBooking(token) {
  return getPublicBooking_(token);
}

/**
 * 予約をキャンセルする。
 * @param token 予約トークン。
 * @returns キャンセル後の予約。
 */
function cancelBooking(token) {
  return cancelBooking_(token);
}

/**
 * 管理画面の設定とカレンダー一覧を返す。
 * @param key 管理キー。
 * @returns 設定とカレンダー。
 */
function adminGetState(key) {
  assertAdminKey_(key);
  var settings = getSettings_();
  return {
    settings: settings,
    calendars: listCalendarsForAdmin_(),
    adminUrlHint: '?page=admin&key=' + key,
  };
}

/**
 * 管理設定を保存する。
 * @param key 管理キー。
 * @param patch 保存する内容。JSON 文字列でもよい。
 * @returns 保存後の設定。
 */
function adminSaveSettings(key, patch) {
  assertAdminKey_(key);
  return saveSettings_(patch);
}
