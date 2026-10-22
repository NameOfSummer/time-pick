/**
 * 設定を保存するプロパティ名。
 */
var SETTINGS_KEY = 'SLOTL_SETTINGS';
/**
 * 管理キーのプロパティ名。
 */
var ADMIN_KEY_PROP = 'ADMIN_KEY';
/**
 * 予約シート ID のプロパティ名。
 */
var SHEET_ID_PROP = 'SPREADSHEET_ID';

/**
 * 初期の受付設定を返す。
 * @returns 設定。
 */
function defaultSettings_() {
  var weekHours = {
    '0': null,
    '1': [{ start: '10:00', end: '18:00' }],
    '2': [{ start: '10:00', end: '18:00' }],
    '3': [{ start: '10:00', end: '18:00' }],
    '4': [{ start: '10:00', end: '18:00' }],
    '5': [{ start: '10:00', end: '18:00' }],
    '6': null,
  };
  return {
    hostName: '',
    timezone: 'Asia/Tokyo',
    weekHours: weekHours,
    bufferMin: 15,
    minNoticeMin: 120,
    maxDaysAhead: 28,
    slotIntervalMin: DURATION_STEP,
    writeCalendarId: 'primary',
    busyCalendarIds: ['primary'],
    allowedEmailDomains: [],
  };
}

/**
 * スクリプトプロパティを返す。
 * @returns プロパティ。
 */
function getScriptProps_() {
  return PropertiesService.getScriptProperties();
}

/**
 * 保存済みの設定を返す。
 * @returns 設定。
 */
function getSettings_() {
  var raw = getScriptProps_().getProperty(SETTINGS_KEY);
  var parsed = raw ? JSON.parse(raw) : {};
  var merged = Object.assign(defaultSettings_(), parsed);
  merged.weekHours = normalizeWeekHours_(merged.weekHours);
  return merged;
}

/**
 * 画面から来た設定をオブジェクトにする。
 * @param patch 設定。JSON 文字列でもよい。
 * @returns 設定オブジェクト。
 */
function parseClientPatch_(patch) {
  if (patch == null || patch === '') return {};
  if (typeof patch === 'string') {
    try {
      var parsed = JSON.parse(patch);
      if (!parsed || typeof parsed !== 'object' || Object.prototype.toString.call(parsed) === '[object Array]') {
        throw new Error('設定の内容が正しくありません。');
      }
      return parsed;
    } catch (err) {
      if (err && err.message && err.message.indexOf('設定の内容') === 0) throw err;
      throw new Error('設定の内容が正しくありません。');
    }
  }
  return patch;
}

/**
 * 設定を保存する。
 * @param patch 上書きする内容。
 * @returns 保存後の設定。
 */
function saveSettings_(patch) {
  var current = getSettings_();
  var next = Object.assign({}, current, parseClientPatch_(patch));
  if (!next.writeCalendarId) {
    throw new Error('予定を書き込むカレンダーを選んでください。');
  }
  if (!next.busyCalendarIds || !next.busyCalendarIds.length) {
    throw new Error('空き判定に使うカレンダーを1つ以上選んでください。');
  }
  next.busyCalendarIds = assertCalendarsExist_(next.writeCalendarId, next.busyCalendarIds);
  next.bufferMin = Math.max(0, Number(next.bufferMin) || 0);
  next.minNoticeMin = Math.max(0, Number(next.minNoticeMin) || 0);
  next.maxDaysAhead = Math.min(MAX_DAYS_AHEAD, Math.max(1, Number(next.maxDaysAhead) || 28));
  next.timezone = next.timezone || 'Asia/Tokyo';
  next.allowedEmailDomains = normalizeEmailDomains_(next.allowedEmailDomains);
  assertWeekHoursValid_(next.weekHours);
  next.weekHours = normalizeWeekHours_(next.weekHours);
  getScriptProps_().setProperty(SETTINGS_KEY, JSON.stringify(next));
  clearBusyCache_();
  return next;
}

/**
 * 管理キーを検査する。
 * @param key 入力されたキー。
 * @returns {void}
 */
function assertAdminKey_(key) {
  var expected = getScriptProps_().getProperty(ADMIN_KEY_PROP);
  if (!expected || String(key || '') !== expected) {
    throw new Error('管理キーが正しくありません。setupTimePick をエディタから実行してください。');
  }
}

/**
 * 初期設定が済んでいるか見る。
 * @returns {void}
 */
function ensureConfigured_() {
  var settings = getSettings_();
  var sheetId = getScriptProps_().getProperty(SHEET_ID_PROP);
  var adminKey = getScriptProps_().getProperty(ADMIN_KEY_PROP);
  if (!sheetId || !adminKey || !settings.writeCalendarId) {
    throw new Error('まだ準備できていません。Apps Script エディタで setupTimePick を実行してください。');
  }
}

/**
 * 管理キーと予約シートを用意する。
 * @returns 管理キーとシート情報。
 */
function initializeSlotly_() {
  var props = getScriptProps_();
  var adminKey = props.getProperty(ADMIN_KEY_PROP);
  if (!adminKey) {
    adminKey = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    props.setProperty(ADMIN_KEY_PROP, adminKey);
  }

  var sheetId = props.getProperty(SHEET_ID_PROP);
  var ss;
  if (sheetId) {
    try {
      ss = SpreadsheetApp.openById(sheetId);
    } catch (err) {
      ss = null;
    }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('TimePick 予約データ');
    props.setProperty(SHEET_ID_PROP, ss.getId());
  }
  ensureBookingsSheet_(ss);

  var primary = CalendarApp.getDefaultCalendar();
  var primaryId = primary.getId();
  var settings = getSettings_();
  settings.writeCalendarId = settings.writeCalendarId || primaryId;
  settings.busyCalendarIds = settings.busyCalendarIds && settings.busyCalendarIds.length
    ? settings.busyCalendarIds
    : [primaryId];
  saveSettings_(settings);

  return {
    adminKey: adminKey,
    spreadsheetUrl: ss.getUrl(),
    spreadsheetId: ss.getId(),
  };
}

/**
 * 許可ドメインを整える。
 * @param raw 入力。
 * @returns ドメインの配列。
 */
function normalizeEmailDomains_(raw) {
  var text = Object.prototype.toString.call(raw) === '[object Array]'
    ? raw.join('\n')
    : String(raw || '');
  var parts = text.split(/[\s,;]+/);
  var seen = {};
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var d = String(parts[i] || '').replace(/^@+/, '').replace(/\.+$/, '').trim().toLowerCase();
    if (!d) continue;
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(d)) {
      throw new Error('メールドメインの形式が正しくありません（' + d + '）。');
    }
    if (seen[d]) continue;
    seen[d] = true;
    out.push(d);
  }
  if (out.length > 50) throw new Error('許可ドメインは50件までです。');
  return out;
}

/**
 * メールからドメインを取る。
 * @param email メール。
 * @returns ドメイン。
 */
function emailDomain_(email) {
  var at = String(email || '').lastIndexOf('@');
  if (at < 0) return '';
  return String(email).slice(at + 1).replace(/\.+$/, '').trim().toLowerCase();
}

/**
 * 許可ドメインか検査する。
 * @param email メール。
 * @param domains 許可ドメイン。
 * @returns {void}
 */
function assertAllowedEmail_(email, domains) {
  var list = domains || [];
  if (!list.length) return;
  var domain = emailDomain_(email);
  for (var i = 0; i < list.length; i++) {
    if (domain === list[i]) return;
  }
  throw new Error('このドメインのメールアドレスでは予約できません。');
}

/**
 * 管理画面の一覧にカレンダーがあるか。
 * @param id カレンダー ID。
 * @param calendars 一覧。
 * @returns あれば true。
 */
function calendarIdExistsForAdmin_(id, calendars) {
  var want = String(id || '');
  if (!want) return false;
  var list = calendars || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].id === want) return true;
    if (want === 'primary' && list[i] && list[i].primary) return true;
  }
  return false;
}

/**
 * 書き込み先と空き判定のカレンダーが残っているか見る。
 * @param writeId 書き込み先。
 * @param busyIds 空き判定。
 * @returns 残っている空き判定カレンダー。
 */
function assertCalendarsExist_(writeId, busyIds) {
  var calendars = listCalendarsForAdmin_();
  if (!calendarIdExistsForAdmin_(writeId, calendars)) {
    throw new Error('このカレンダーはもうありません。選び直してください。');
  }
  var live = [];
  var src = busyIds || [];
  var seen = {};
  for (var i = 0; i < src.length; i++) {
    var id = src[i];
    if (seen[id] || !calendarIdExistsForAdmin_(id, calendars)) continue;
    seen[id] = true;
    live.push(id);
  }
  if (!live.length) {
    throw new Error('このカレンダーはもうありません。選び直してください。');
  }
  return live;
}

/**
 * 2桁にゼロ埋めする。
 * @param n 数。
 * @returns 2桁の文字列。
 */
function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

/**
 * 曜日ごとの受付時間が正しいか見る。
 * @param weekHours 受付時間。
 * @returns {void}
 */
function assertWeekHoursValid_(weekHours) {
  var names = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'];
  var src = weekHours || {};
  for (var d = 0; d <= 6; d++) {
    var hours = src[String(d)];
    if (!hours) continue;
    var list = [];
    if (Object.prototype.toString.call(hours) === '[object Array]') {
      list = hours;
    } else if (hours.ranges && Object.prototype.toString.call(hours.ranges) === '[object Array]') {
      list = hours.ranges;
    } else if (hours.start && hours.end) {
      list = [{ start: hours.start, end: hours.end }];
    }
    var cleaned = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r || !r.start || !r.end) {
        throw new Error(names[d] + 'の時間帯が不正です。');
      }
      var a = parseHm_(r.start);
      var b = parseHm_(r.end);
      var startMin = a.hour * 60 + a.minute;
      var endMin = b.hour * 60 + b.minute;
      if (endMin <= startMin) {
        throw new Error(names[d] + 'の終了時刻は開始より後にしてください。');
      }
      cleaned.push({ start: startMin, end: endMin });
    }
    cleaned.sort(function (x, y) { return x.start - y.start; });
    for (var j = 1; j < cleaned.length; j++) {
      if (cleaned[j].start < cleaned[j - 1].end) {
        throw new Error(names[d] + 'の時間帯が重なっています。');
      }
    }
  }
}

/**
 * 1日の受付時間を整える。
 * @param hours 時間帯。
 * @returns 時間帯の配列。なければ null。
 */
function normalizeDayHours_(hours) {
  if (!hours) return null;
  var list = [];
  if (Object.prototype.toString.call(hours) === '[object Array]') {
    list = hours;
  } else if (hours.ranges && Object.prototype.toString.call(hours.ranges) === '[object Array]') {
    list = hours.ranges;
  } else if (hours.start && hours.end) {
    list = [{ start: hours.start, end: hours.end }];
  }
  var cleaned = [];
  for (var i = 0; i < list.length; i++) {
    var r = list[i];
    if (!r || !r.start || !r.end) continue;
    var a = parseHm_(r.start);
    var b = parseHm_(r.end);
    if (b.hour * 60 + b.minute <= a.hour * 60 + a.minute) continue;
    cleaned.push({
      start: pad2_(a.hour) + ':' + pad2_(a.minute),
      end: pad2_(b.hour) + ':' + pad2_(b.minute),
    });
  }
  return cleaned.length ? cleaned : null;
}

/**
 * 1週間の受付時間を整える。
 * @param weekHours 受付時間。
 * @returns 整えた受付時間。
 */
function normalizeWeekHours_(weekHours) {
  var src = weekHours || {};
  var next = {};
  for (var d = 0; d <= 6; d++) {
    next[String(d)] = normalizeDayHours_(src[String(d)]);
  }
  return next;
}

/**
 * 管理画面用のカレンダー一覧を返す。
 * @returns カレンダー。
 */
function listCalendarsForAdmin_() {
  var list;
  if (typeof Calendar !== 'undefined' && Calendar.CalendarList) {
    try {
      list = listCalendarsViaCalendarList_();
      return sortCalendarsByDisplayName_(list);
    } catch (err) {
      console.error(err);
    }
  }
  return sortCalendarsByDisplayName_(CalendarApp.getAllCalendars().map(function (cal) {
    var id = cal.getId();
    return {
      id: id,
      name: calendarDisplayName_(cal.getName(), ''),
      primary: cal.isMyPrimaryCalendar(),
      owned: typeof cal.isOwnedByMe === 'function' ? cal.isOwnedByMe() : true,
    };
  }));
}

/**
 * CalendarList API でカレンダーを取る。
 * @returns カレンダー。
 */
function listCalendarsViaCalendarList_() {
  var items = [];
  var pageToken = null;
  do {
    var params = {
      maxResults: 250,
      showDeleted: false,
      showHidden: true,
    };
    if (pageToken) params.pageToken = pageToken;
    var res = Calendar.CalendarList.list(params);
    items = items.concat(res.items || []);
    pageToken = res.nextPageToken || null;
  } while (pageToken);

  return items.filter(function (item) {
    return item && item.id && !item.deleted;
  }).map(function (item) {
    return {
      id: item.id,
      name: calendarDisplayName_(item.summary, item.summaryOverride),
      primary: !!item.primary,
      owned: item.accessRole === 'owner',
    };
  });
}

/**
 * カレンダーの表示名を決める。
 * @param summary 名前。
 * @param override 上書き名。
 * @returns 表示名。
 */
function calendarDisplayName_(summary, override) {
  return String(override || '').trim() || String(summary || '').trim() || 'カレンダー';
}

/**
 * カレンダーを表示名で並べる。
 * @param cals カレンダー。
 * @returns 並べた一覧。
 */
function sortCalendarsByDisplayName_(cals) {
  return (cals || []).slice().sort(function (a, b) {
    var an = String((a && a.name) || '');
    var bn = String((b && b.name) || '');
    var cmp = an.localeCompare(bn, 'ja');
    if (cmp !== 0) return cmp;
    return String((a && a.id) || '').localeCompare(String((b && b.id) || ''), 'ja');
  });
}
