#!/usr/bin/env node
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * リポジトリのルート。
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/**
 * プレビューサーバのポート。
 */
const PORT = Number(process.env.PORT || 3456);
/**
 * GAS 用にビルドした HTML。
 */
const WEB_APP = path.join(ROOT, 'WebApp.html');

/**
 * プレビュー画面のタイトルを返す。
 * @param page 画面。
 * @returns タイトル。
 */
function pageTitle(page) {
  const suffix = { done: '予約確定', cancel: 'キャンセル', admin: '管理' }[page] || '予約';
  return 'TimePick - ' + suffix;
}

/**
 * WebApp.html に画面情報を埋め込んで返す。
 * @param page 画面。
 * @param token 予約トークン。
 * @returns HTML。
 */
function renderPage(page, token) {
  if (!fs.existsSync(WEB_APP)) {
    return `<!DOCTYPE html><html lang="ja"><body><p>先に <code>npm run build:gas</code> を実行してください。</p></body></html>`;
  }
  let html = fs.readFileSync(WEB_APP, 'utf8');
  html = html.split('__SLOTL_PAGE_TITLE__').join(pageTitle(page));
  html = html.split('__SLOTL_BOOTSTRAP__').join(
    JSON.stringify({
      page: page,
      token: token,
      adminKey: page === 'admin' ? 'preview' : '',
      webAppUrl: '/',
    }),
  );
  return html;
}

/**
 * ローカルプレビュー用の HTTP サーバ。
 */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const page = url.searchParams.get('page') || 'book';
  const token = url.searchParams.get('token') || '';
  if (page === 'ics') {
    res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8' });
    res.end('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TimePick//JP\r\nEND:VCALENDAR\r\n');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(renderPage(page, token));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('TimePick preview http://127.0.0.1:' + PORT);
});
