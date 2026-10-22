/**
 * 空きキャッシュを無効にする世代番号を返す。
 * @returns 世代。
 */
function cacheStamp_() {
  return getScriptProps_().getProperty('BUSY_GEN') || '1';
}

/**
 * 予約できる開始時刻を列挙する。
 * @param durationMin 所要時間。
 * @returns タイムゾーンと開始時刻。
 */
function listAvailableStarts_(durationMin) {
  durationMin = assertDuration_(durationMin);
  var settings = getSettings_();
  var tz = settings.timezone || 'Asia/Tokyo';
  var now = new Date();
  var maxDays = settings.maxDaysAhead || 28;
  var windowStart = addMinutes_(now, settings.minNoticeMin || 0);
  var windowEnd = addMinutes_(now, maxDays * 24 * 60);
  var busy = getBusyBlocks_(settings, windowStart, windowEnd);
  var starts = [];
  var ymd = ymdInTz_(windowStart, tz);
  var endYmd = ymdInTz_(windowEnd, tz);
  var guard = 0;
  while (ymd <= endYmd && guard < maxDays + 3) {
    guard++;
    var parts = ymd.split('-').map(Number);
    var weekday = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0)).getUTCDay();
    var ranges = settings.weekHours[String(weekday)] || [];
    for (var r = 0; r < ranges.length; r++) {
      var hours = ranges[r];
      if (!hours || !hours.start || !hours.end) continue;
      var startHm = parseHm_(hours.start);
      var endHm = parseHm_(hours.end);
      var dayStart = zonedTimeToUtc_(parts[0], parts[1], parts[2], startHm.hour, startHm.minute, tz);
      var dayEnd = zonedTimeToUtc_(parts[0], parts[1], parts[2], endHm.hour, endHm.minute, tz);
      var slot = new Date(dayStart.getTime());
      var interval = settings.slotIntervalMin || DURATION_STEP;
      while (addMinutes_(slot, durationMin).getTime() <= dayEnd.getTime()) {
        var slotEnd = addMinutes_(slot, durationMin);
        if (slot.getTime() >= windowStart.getTime() && !isBlocked_(slot, slotEnd, busy, settings.bufferMin || 0)) {
          starts.push(slot.toISOString());
        }
        slot = addMinutes_(slot, interval);
      }
    }
    ymd = addDaysYmd_(ymd, 1);
  }

  return { timezone: tz, durationMin: durationMin, starts: starts };
}

/**
 * 予定やバッファと重なるか。
 * @param start 開始。
 * @param end 終了。
 * @param busy 既存の予定。
 * @param bufferMin 前後のバッファ。
 * @returns 埋まっていれば true。
 */
function isBlocked_(start, end, busy, bufferMin) {
  var pad = (bufferMin || 0) * 60 * 1000;
  for (var i = 0; i < busy.length; i++) {
    var blockedStart = new Date(busy[i].start.getTime() - pad);
    var blockedEnd = new Date(busy[i].end.getTime() + pad);
    if (overlaps_(start, end, blockedStart, blockedEnd)) return true;
  }
  return false;
}

/**
 * 空きキャッシュのキーを短くする。
 * @param raw 元のキー。
 * @returns キャッシュキー。
 */
function shortCacheKey_(raw) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, raw);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var v = bytes[i];
    if (v < 0) v += 256;
    var part = v.toString(16);
    hex += part.length === 1 ? '0' + part : part;
  }
  return 'busy:' + hex;
}

/**
 * 期間内の予定ブロックを返す。
 * @param settings 設定。
 * @param windowStart 期間の始まり。
 * @param windowEnd 期間の終わり。
 * @returns 予定の開始と終了。
 */
function getBusyBlocks_(settings, windowStart, windowEnd) {
  var ids = settings.busyCalendarIds || [];
  var cache = CacheService.getScriptCache();
  var cacheKey = shortCacheKey_(
    cacheStamp_() + ':' + ids.join(',') + ':' + windowStart.toISOString() + ':' + windowEnd.toISOString(),
  );
  try {
    var cached = cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached).map(function (b) {
        return { start: new Date(b.start), end: new Date(b.end) };
      });
    }
  } catch (ignore) {}

  var busy = queryBusy_(ids, windowStart, windowEnd);
  try {
    cache.put(
      cacheKey,
      JSON.stringify(busy.map(function (b) {
        return { start: b.start.toISOString(), end: b.end.toISOString() };
      })),
      45,
    );
  } catch (ignore) {}
  return busy;
}

/**
 * カレンダーから予定を取る。
 * @param calendarIds カレンダー。
 * @param windowStart 期間の始まり。
 * @param windowEnd 期間の終わり。
 * @returns 予定の開始と終了。
 */
function queryBusy_(calendarIds, windowStart, windowEnd) {
  if (typeof Calendar !== 'undefined' && Calendar.Freebusy) {
    try {
      return queryFreeBusy_(calendarIds, windowStart, windowEnd);
    } catch (err) {
      console.error(err);
    }
  }
  return queryBusyViaCalendarApp_(calendarIds, windowStart, windowEnd);
}

/**
 * FreeBusy API で予定を取る。長い期間は分けて問い合わせる。
 * @param calendarIds カレンダー。
 * @param windowStart 期間の始まり。
 * @param windowEnd 期間の終わり。
 * @returns 予定の開始と終了。
 */
function queryFreeBusy_(calendarIds, windowStart, windowEnd) {
  var busy = [];
  var items = calendarIds.map(function (id) { return { id: id }; });
  var chunkMs = 80 * 24 * 60 * 60 * 1000;
  var cursor = new Date(windowStart.getTime());
  while (cursor.getTime() < windowEnd.getTime()) {
    var chunkEnd = new Date(Math.min(cursor.getTime() + chunkMs, windowEnd.getTime()));
    var res = Calendar.Freebusy.query({
      timeMin: cursor.toISOString(),
      timeMax: chunkEnd.toISOString(),
      items: items,
    });
    var calendars = res.calendars || {};
    Object.keys(calendars).forEach(function (id) {
      (calendars[id].busy || []).forEach(function (block) {
        busy.push({ start: new Date(block.start), end: new Date(block.end) });
      });
    });
    cursor = chunkEnd;
  }
  return busy;
}

/**
 * CalendarApp で予定を取る。
 * @param calendarIds カレンダー。
 * @param windowStart 期間の始まり。
 * @param windowEnd 期間の終わり。
 * @returns 予定の開始と終了。
 */
function queryBusyViaCalendarApp_(calendarIds, windowStart, windowEnd) {
  var busy = [];
  calendarIds.forEach(function (id) {
    var cal = id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
    if (!cal) return;
    cal.getEvents(windowStart, windowEnd).forEach(function (ev) {
      if (ev.getTransparency && ev.getTransparency() === CalendarApp.EventTransparency.TRANSPARENT) {
        return;
      }
      busy.push({ start: ev.getStartTime(), end: ev.getEndTime() });
    });
  });
  return busy;
}

/**
 * その開始時刻がまだ空いているか。
 * @param durationMin 所要時間。
 * @param startIso 開始時刻。
 * @returns 空いていれば true。
 */
function slotStillFree_(durationMin, startIso) {
  var starts = listAvailableStarts_(durationMin).starts;
  return starts.indexOf(startIso) !== -1;
}
