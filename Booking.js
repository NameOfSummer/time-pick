/**
 * 予約を作り、確認メールを送る。
 * @param payload 予約内容。
 * @returns 公開用の予約。
 */
function createBooking_(payload) {
  payload = payload || {};
  var durationMin = assertDuration_(payload.durationMin);
  var withMeet = !!payload.withMeet;
  var name = String(payload.name || '').trim();
  var eventTitle = String(payload.eventTitle || '').trim();
  var email = String(payload.email || '').trim();
  var note = String(payload.note || '').trim();
  var startIso = String(payload.startIso || '');

  if (!name || name.length > 80) throw new Error('お名前を入力してください。');
  if (eventTitle.length > 80) throw new Error('予定のタイトルは80文字以内にしてください。');
  if (!isValidEmail_(email)) throw new Error('メールアドレスの形式が正しくありません。');
  assertAllowedEmail_(email, getSettings_().allowedEmailDomains);
  if (note.length > 1000) throw new Error('メモは1000文字以内にしてください。');
  if (!startIso) throw new Error('日時を選んでください。');

  var start = new Date(startIso);
  if (isNaN(start.getTime())) throw new Error('日時が正しくありません。');
  var end = addMinutes_(start, durationMin);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error('混み合っています。少し待ってからもう一度お試しください。');
  }

  try {
    if (!slotStillFree_(durationMin, start.toISOString())) {
      throw new Error('その時間は埋まりました。別の時間を選んでください。');
    }

    var settings = getSettings_();
    var title = eventTitle || buildEventTitle_(name);
    var token = Utilities.getUuid();
    var webUrl = ScriptApp.getService().getUrl() || '';
    var cancelUrl = webUrl ? webUrl + '?page=cancel&token=' + token : '';
    var icsUrl = webUrl ? webUrl + '?page=ics&token=' + token : '';
    var description = buildEventDescription_({
      name: name,
      email: email,
      note: note,
    });

    var created = insertCalendarEvent_({
      calendarId: settings.writeCalendarId,
      title: title,
      description: description,
      start: start,
      end: end,
      email: email,
      withMeet: withMeet,
      timeZone: settings.timezone,
    });

    clearBusyCache_();

    var booking = appendBooking_({
      token: token,
      eventId: created.eventId,
      calendarId: created.calendarId,
      guestName: name,
      guestEmail: email,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      durationMin: durationMin,
      withMeet: withMeet,
      meetUrl: created.meetUrl || '',
      status: 'confirmed',
      note: note,
      title: title,
      createdAt: new Date().toISOString(),
    });

    sendGuestEmail_(booking, {
      cancelUrl: cancelUrl,
      icsUrl: icsUrl,
      googleUrl: googleTemplateUrl_(booking),
      timeZone: settings.timezone,
      hostName: settings.hostName,
    });

    return publicBookingView_(booking, {
      cancelUrl: cancelUrl,
      icsUrl: icsUrl,
      googleUrl: googleTemplateUrl_(booking),
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * 公開用の予約を1件返す。
 * @param token 予約トークン。
 * @returns 公開用の予約。
 */
function getPublicBooking_(token) {
  var found = findBookingRow_(token);
  if (!found) throw new Error('予約が見つかりません。');
  var webUrl = ScriptApp.getService().getUrl() || '';
  return publicBookingView_(found.data, {
    cancelUrl: webUrl ? webUrl + '?page=cancel&token=' + found.data.token : '',
    icsUrl: webUrl ? webUrl + '?page=ics&token=' + found.data.token : '',
    googleUrl: googleTemplateUrl_(found.data),
  });
}

/**
 * 予約をキャンセルする。
 * @param token 予約トークン。
 * @returns 公開用の予約。
 */
function cancelBooking_(token) {
  var found = findBookingRow_(token);
  if (!found) throw new Error('予約が見つかりません。');
  if (found.data.status === 'cancelled') {
    return publicBookingView_(found.data, {});
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error('混み合っています。少し待ってからもう一度お試しください。');
  }
  try {
    found = findBookingRow_(token);
    if (!found) throw new Error('予約が見つかりません。');
    if (found.data.status === 'cancelled') {
      return publicBookingView_(found.data, {});
    }
    cancelCalendarEvent_(found.data.calendarId, found.data.eventId);
    markBookingCancelled_(found.rowNumber, new Date().toISOString());
    clearBusyCache_();
    var cancelled = findBookingRow_(token).data;
    sendCancelEmail_(cancelled);
    return publicBookingView_(cancelled, {});
  } finally {
    lock.releaseLock();
  }
}

/**
 * ゲストに見せる予約の形にする。
 * @param booking 予約。
 * @param urls 関連 URL。
 * @returns 公開用の予約。
 */
function publicBookingView_(booking, urls) {
  urls = urls || {};
  return {
    token: booking.token,
    status: booking.status,
    title: booking.title,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    startIso: booking.startIso,
    endIso: booking.endIso,
    durationMin: booking.durationMin,
    withMeet: booking.withMeet,
    meetUrl: booking.meetUrl,
    note: booking.note,
    cancelUrl: urls.cancelUrl || '',
    icsUrl: urls.icsUrl || '',
    googleUrl: urls.googleUrl || googleTemplateUrl_(booking),
  };
}

/**
 * カレンダー予定のタイトルを作る。
 * @param guestName 予約者名。
 * @returns タイトル。
 */
function buildEventTitle_(guestName) {
  return guestName + ' さんとのミーティング（' + APP_NAME + '）';
}

/**
 * カレンダー予定の説明を作る。
 * @param info 予約者情報。
 * @returns 説明。
 */
function buildEventDescription_(info) {
  var lines = [];
  if (info.name) lines.push('予約者: ' + info.name);
  if (info.email) lines.push('メール: ' + info.email);
  if (info.note) {
    if (lines.length) lines.push('');
    lines.push(info.note);
  }
  return lines.join('\n');
}

/**
 * Google カレンダー追加用の URL を作る。
 * @param booking 予約。
 * @returns URL。
 */
function googleTemplateUrl_(booking) {
  var start = new Date(booking.startIso);
  var end = new Date(booking.endIso);
  var params = [
    'action=TEMPLATE',
    'text=' + encodeURIComponent(booking.title || APP_NAME),
    'dates=' + formatIcsUtc_(start) + '/' + formatIcsUtc_(end),
    'details=' + encodeURIComponent(buildGoogleDetails_(booking)),
  ];
  if (booking.meetUrl) {
    params.push('location=' + encodeURIComponent(booking.meetUrl));
  } else if (booking.withMeet) {
    params.push('location=' + encodeURIComponent('Google Meet'));
  }
  return 'https://calendar.google.com/calendar/render?' + params.join('&');
}

/**
 * Google カレンダー用の詳細文を作る。
 * @param booking 予約。
 * @returns 詳細。
 */
function buildGoogleDetails_(booking) {
  return buildEventDescription_({
    name: booking.guestName,
    email: booking.guestEmail,
    note: booking.note,
  });
}

/**
 * ICS ファイルを返す。
 * @param token 予約トークン。
 * @returns ICS またはエラー文言。
 */
function serveIcs_(token) {
  var found = findBookingRow_(token);
  if (!found || found.data.status === 'cancelled') {
    return ContentService.createTextOutput('予約が見つかりません。').setMimeType(ContentService.MimeType.TEXT);
  }
  return ContentService.createTextOutput(buildIcs_(found.data))
    .setMimeType(ContentService.MimeType.ICAL)
    .downloadAsFile('timepick.ics');
}

/**
 * ICS 本文を作る。
 * @param booking 予約。
 * @returns ICS。
 */
function buildIcs_(booking) {
  var start = new Date(booking.startIso);
  var end = new Date(booking.endIso);
  var desc = buildGoogleDetails_(booking);
  var location = booking.meetUrl || (booking.withMeet ? 'Google Meet' : '');
  var lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TimePick//JP',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + booking.token + '@timepick',
    'DTSTAMP:' + formatIcsUtc_(new Date()),
    'DTSTART:' + formatIcsUtc_(start),
    'DTEND:' + formatIcsUtc_(end),
    'SUMMARY:' + escapeIcsText_(booking.title || APP_NAME),
    'DESCRIPTION:' + escapeIcsText_(desc),
    'LOCATION:' + escapeIcsText_(location),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

/**
 * メール用の予約概要 HTML を作る。
 * @param booking 予約。
 * @param when 日時の表示。
 * @returns HTML。
 */
function bookingSummaryHtml_(booking, when) {
  var lines = [];
  lines.push('------------------------------');
  if (booking.title) lines.push('<p>予定のタイトル: ' + escapeHtml_(booking.title) + '</p>');
  lines.push('<p><strong>' + escapeHtml_(when) + '</strong></p>');
  lines.push('<p>所要時間: ' + escapeHtml_(formatDurationJa_(booking.durationMin)) + '</p>');
  lines.push('<p>場所: ' + formatLocationHtml_(booking) + '</p>');
  if (booking.guestName) lines.push('<p>予約者: ' + escapeHtml_(booking.guestName) + '</p>');
  if (booking.note) {
    lines.push('<p>説明:<br>' + escapeHtml_(booking.note).replace(/\n/g, '<br>') + '</p>');
  }
  lines.push('------------------------------');
  return lines.join('');
}

/**
 * 場所をプレーンテキストにする。
 * @param withMeet Meet を使うか。
 * @param meetUrl Meet URL。
 * @returns 場所。
 */
function formatLocationPlain_(withMeet, meetUrl) {
  if (!withMeet) return 'Meetなし';
  if (meetUrl) return 'Google Meet (' + meetUrl + ')';
  return 'Google Meet';
}

/**
 * 場所を HTML にする。
 * @param booking 予約。
 * @returns HTML。
 */
function formatLocationHtml_(booking) {
  if (!booking.withMeet) return 'Meetなし';
  if (booking.meetUrl) {
    var url = escapeHtml_(booking.meetUrl);
    return 'Google Meet (<a href="' + url + '">' + url + '</a>)';
  }
  return 'Google Meet';
}

/**
 * 確定メールを送る。
 * @param booking 予約。
 * @param urls 関連 URL。
 * @returns {void}
 */
function sendGuestEmail_(booking, urls) {
  var when = formatRangeJa_(booking.startIso, booking.endIso);
  var html = [
    '<p>' + escapeHtml_(booking.guestName) + ' さん</p>',
    '<p>' + escapeHtml_(APP_NAME) + ' で予約が確定しました。</p>',
    bookingSummaryHtml_(booking, when),
    urls.icsUrl ? '<p><a href="' + escapeHtml_(urls.icsUrl) + '">その他のカレンダー用に ICS ファイルをダウンロード</a></p>' : '',
    urls.cancelUrl ? '<p><a href="' + escapeHtml_(urls.cancelUrl) + '">この予約をキャンセルする</a></p>' : '',
  ].join('');
  try {
    MailApp.sendEmail({
      to: booking.guestEmail,
      subject: '【' + APP_NAME + '】予約が確定しました ' + when,
      htmlBody: html,
    });
  } catch (err) {
    console.error(err);
  }
}

/**
 * キャンセルメールを送る。
 * @param booking 予約。
 * @returns {void}
 */
function sendCancelEmail_(booking) {
  var when = formatRangeJa_(booking.startIso, booking.endIso);
  try {
    MailApp.sendEmail({
      to: booking.guestEmail,
      subject: '【' + APP_NAME + '】予約をキャンセルしました ' + when,
      htmlBody:
        '<p>' + escapeHtml_(booking.guestName) + ' さん</p>' +
        '<p>次の予約をキャンセルしました。</p>' +
        bookingSummaryHtml_(booking, when),
    });
  } catch (err) {
    console.error(err);
  }
}

/**
 * 開始と終了を日本語の期間にする。
 * @param startIso 開始。
 * @param endIso 終了。
 * @returns 期間。
 */
function formatRangeJa_(startIso, endIso) {
  var start = new Date(startIso);
  var end = new Date(endIso);
  var tz = getSettings_().timezone || 'Asia/Tokyo';
  var dtf = new Intl.DateTimeFormat('ja-JP', {
    timeZone: tz,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  var endTime = new Intl.DateTimeFormat('ja-JP', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return dtf.format(start) + ' – ' + endTime.format(end);
}

/**
 * HTML をエスケープする。
 * @param text 原文。
 * @returns エスケープ後。
 */
function escapeHtml_(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 空きキャッシュを無効にする。
 * @returns {void}
 */
function clearBusyCache_() {
  getScriptProps_().setProperty('BUSY_GEN', String(Date.now()));
}
