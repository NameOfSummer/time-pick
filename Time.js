/**
 * 所要時間の下限（分）。
 */
var DURATION_MIN = 15;
/**
 * 所要時間の上限（分）。
 */
var DURATION_MAX = 240;
/**
 * 所要時間の刻み（分）。
 */
var DURATION_STEP = 15;
/**
 * 何日先まで予約できるかの上限（日）。1年。
 */
var MAX_DAYS_AHEAD = 365;

/**
 * 選べる所要時間の一覧を返す。
 * @returns 分の配列。
 */
function listDurations_() {
  var list = [];
  for (var m = DURATION_MIN; m <= DURATION_MAX; m += DURATION_STEP) {
    list.push(m);
  }
  return list;
}

/**
 * 所要時間を検査して数値にする。
 * @param durationMin 所要時間。
 * @returns 検査済みの分。
 */
function assertDuration_(durationMin) {
  var n = Number(durationMin);
  if (!isFinite(n) || n < DURATION_MIN || n > DURATION_MAX || n % DURATION_STEP !== 0) {
    throw new Error('所要時間は15分刻み、最大4時間で選んでください。');
  }
  return n;
}

/**
 * 所要時間を日本語にする。
 * @param minutes 分。
 * @returns 表示用の文字列。
 */
function formatDurationJa_(minutes) {
  if (minutes < 60) return minutes + '分';
  var h = Math.floor(minutes / 60);
  var m = minutes % 60;
  if (m === 0) return h + '時間';
  return h + '時間' + m + '分';
}

/**
 * タイムゾーンでの年月日を返す。
 * @param date 日時。
 * @param timeZone タイムゾーン。
 * @returns YYYY-MM-DD。
 */
function ymdInTz_(date, timeZone) {
  var dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return dtf.format(date);
}

/**
 * タイムゾーンでの曜日番号を返す。
 * @param date 日時。
 * @param timeZone タイムゾーン。
 * @returns 日曜起点の 0〜6。
 */
function weekdayInTz_(date, timeZone) {
  var parts = ymdInTz_(date, timeZone).split('-');
  return new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2], 12, 0, 0)).getUTCDay();
}

/**
 * 指定タイムゾーンの壁時計時刻を UTC の Date にする。
 * @param year 年。
 * @param month 月。
 * @param day 日。
 * @param hour 時。
 * @param minute 分。
 * @param timeZone タイムゾーン。
 * @returns UTC の日時。
 */
function zonedTimeToUtc_(year, month, day, hour, minute, timeZone) {
  var utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  var dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  /**
   * 壁時計の各部分を UTC ミリ秒にする。
   * @param ms ミリ秒。
   * @returns UTC ミリ秒。
   */
  function asUtc(ms) {
    var map = {};
    dtf.formatToParts(new Date(ms)).forEach(function (part) {
      if (part.type !== 'literal') map[part.type] = part.value;
    });
    var hour = Number(map.hour);
    if (hour === 24) hour = 0;
    return Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      hour,
      Number(map.minute),
      Number(map.second),
    );
  }

  var offset = asUtc(utcGuess) - utcGuess;
  var utc = utcGuess - offset;
  var offset2 = asUtc(utc) - utc;
  return new Date(utcGuess - offset2);
}

/**
 * HH:MM を時と分に分ける。
 * @param hm 時刻。
 * @returns 時と分。
 */
function parseHm_(hm) {
  var parts = String(hm || '00:00').split(':');
  return { hour: Number(parts[0] || 0), minute: Number(parts[1] || 0) };
}

/**
 * 日時に分を足す。
 * @param date 基準。
 * @param minutes 足す分。
 * @returns 新しい日時。
 */
function addMinutes_(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/**
 * 日付に日数を足す。
 * @param ymd YYYY-MM-DD。
 * @param days 足す日数。
 * @returns YYYY-MM-DD。
 */
function addDaysYmd_(ymd, days) {
  var parts = String(ymd).split('-').map(Number);
  var dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

/**
 * 2つの区間が重なるか。
 * @param startA 一方の開始。
 * @param endA 一方の終了。
 * @param startB もう一方の開始。
 * @param endB もう一方の終了。
 * @returns 重なれば true。
 */
function overlaps_(startA, endA, startB, endB) {
  return startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();
}

/**
 * ICS 用の UTC 日時にする。
 * @param date 日時。
 * @returns ICS 形式。
 */
function formatIcsUtc_(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * ICS のテキストをエスケープする。
 * @param text 原文。
 * @returns エスケープ後。
 */
function escapeIcsText_(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * メール形式かを見る。
 * @param email メール。
 * @returns 正しければ true。
 */
function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}
