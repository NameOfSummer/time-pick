import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * clasp の版。デプロイコマンドの形を固定する。
 */
const claspPackage = '@google/clasp@3.4.1';
/**
 * リポジトリ直下に一時的に置く clasp の設定。TimePick の GAS は直下にある。
 */
const projectFileName = '.clasp.deploy.json';

/**
 * Secrets の DEPLOY_TARGETS を、アカウントとデプロイ先に分ける。
 * @param {string} raw JSON 文字列。
 * @returns {{accounts: object, targets: object[]}} アカウントごとのログイン情報と、載せる先。
 */
export function parseConfig(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(
      'DEPLOY_TARGETS が空です。GitHub の Secrets にデプロイ先を置いてください。デプロイはしていません。'
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('DEPLOY_TARGETS の JSON を読めません。デプロイはしていません。');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('DEPLOY_TARGETS は accounts と targets を持つオブジェクトです。');
  }
  const accounts = parsed.accounts;
  const targets = parsed.targets;
  if (!accounts || typeof accounts !== 'object' || Array.isArray(accounts)) {
    throw new Error('accounts に、アカウント名とログイン情報を入れてください。');
  }
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('targets に、載せるプロジェクトを1件以上入れてください。');
  }
  return {
    accounts,
    targets: targets.map((target, index) => normalizeTarget(target, accounts, index)),
  };
}

/**
 * 1件のデプロイ先を、実行に使う形にする。
 * @param {object} target 一覧の1件。
 * @param {object} accounts アカウント名からログイン情報への対応。
 * @param {number} index 一覧の位置。名前が無いときの表示に使う。
 * @returns {{name: string, account: string, scriptId: string, deploymentId: string, clasprc: object}} 名前、スクリプト ID、デプロイ ID、ログイン情報。
 */
function normalizeTarget(target, accounts, index) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    throw new Error(`targets の ${index + 1} 件目がオブジェクトではありません。`);
  }
  const account = requiredText(target.account, `targets の ${index + 1} 件目の account`);
  const clasprc = accounts[account];
  if (!clasprc || typeof clasprc !== 'object' || Array.isArray(clasprc)) {
    throw new Error(`account「${account}」のログイン情報が accounts にありません。`);
  }
  const scriptId = requiredText(target.scriptId, `account「${account}」の scriptId`);
  const deploymentId = optionalText(target.deploymentId);
  const name = optionalText(target.name) || `${account}（${scriptId.slice(0, 8)}）`;
  return { name, account, scriptId, deploymentId, clasprc };
}

/**
 * 必須の文字列を返す。
 * @param {unknown} value 調べる値。
 * @param {string} label エラーに出す項目名。
 * @returns {string} 前後の空白を除いた文字列。
 */
function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} を入れてください。`);
  }
  return value.trim();
}

/**
 * 空なら空文字にする任意の文字列を返す。
 * @param {unknown} value 調べる値。
 * @returns {string} 前後の空白を除いた文字列。未設定なら空文字。
 */
function optionalText(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value !== 'string') {
    throw new Error('name と deploymentId は文字列です。');
  }
  return value.trim();
}

/**
 * clasp list-deployments の出力から、デプロイ ID と版を読む。
 * @param {string} output 標準出力と標準エラーを足した文字列。
 * @returns {{deploymentId: string, versionNumber: number|null}[]} デプロイ ID と版。版が HEAD のときは versionNumber を null にする。
 */
export function parseDeploymentList(output) {
  const text = String(output || '');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item) => item && typeof item.deploymentId === 'string')
          .map((item) => ({
            deploymentId: item.deploymentId,
            versionNumber: typeof item.versionNumber === 'number' ? item.versionNumber : null,
          }));
      }
    } catch {
      // テキスト形式の行を続ける。
    }
  }
  const found = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^- ([A-Za-z0-9_-]+) @(HEAD|\d+)\b/);
    if (!match) continue;
    found.push({
      deploymentId: match[1],
      versionNumber: match[2] === 'HEAD' ? null : Number(match[2]),
    });
  }
  return found;
}

/**
 * バージョン付きデプロイが1件のとき、その ID を返す。
 * @param {{deploymentId: string, versionNumber: number|null}[]} deployments 一覧から読んだデプロイ。
 * @returns {string} 更新するデプロイ ID。
 */
export function pickDeploymentId(deployments) {
  const versioned = deployments.filter((item) => typeof item.versionNumber === 'number');
  if (versioned.length === 1) return versioned[0].deploymentId;
  if (versioned.length === 0) {
    throw new Error(
      'Web アプリのデプロイがありません。手元で初回デプロイし、deploymentId を設定してください。'
    );
  }
  throw new Error('デプロイが複数あります。更新する URL の deploymentId を指定してください。');
}

/**
 * 1件をアップロードし、既存の Web アプリ URL を更新する。
 * @param {{name: string, scriptId: string, deploymentId: string, clasprc: object}} target デプロイ先。
 * @param {string} description デプロイの説明。
 * @returns {void}
 */
function deployTarget(target, description) {
  const directory = mkdtempSync(join(tmpdir(), 'timepick-deploy-'));
  const authFile = join(directory, 'clasprc.json');
  const projectFile = join(process.cwd(), projectFileName);
  try {
    writeFileSync(authFile, JSON.stringify(target.clasprc), { mode: 0o600 });
    writeFileSync(projectFile, JSON.stringify({ scriptId: target.scriptId, rootDir: '.' }));
    runClasp(['push', '--force'], authFile, projectFile);
    const deploymentId =
      target.deploymentId ||
      pickDeploymentId(
        parseDeploymentList(runClasp(['list-deployments', '--json'], authFile, projectFile))
      );
    runClasp(
      ['create-deployment', '--deploymentId', deploymentId, '--description', description],
      authFile,
      projectFile
    );
  } finally {
    rmSync(authFile, { force: true });
    rmSync(directory, { recursive: true, force: true });
    rmSync(projectFile, { force: true });
  }
}

/**
 * clasp を1回実行する。
 * @param {string[]} args サブコマンドと引数。
 * @param {string} authFile ログイン情報のファイル。
 * @param {string} projectFile scriptId を書いたファイル。
 * @returns {string} 標準出力と標準エラー。
 */
function runClasp(args, authFile, projectFile) {
  const result = spawnSync(
    'npx',
    ['--yes', claspPackage, '--auth', authFile, '--project', projectFile, ...args],
    { encoding: 'utf8' }
  );
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  if (result.error) throw new Error(result.error.message);
  if (result.status !== 0) {
    throw new Error(output || `clasp ${args[0]} が失敗しました`);
  }
  return output;
}

/**
 * 一覧の全部を載せ、失敗した件を最後にまとめる。
 * @param {string} raw DEPLOY_TARGETS の JSON。
 * @param {string} description 各デプロイに付ける説明。
 * @returns {void} 失敗が1件でもあれば終了コード 1。
 */
export function deployAll(raw, description) {
  const { targets } = parseConfig(raw);
  const failures = [];
  for (const target of targets) {
    try {
      deployTarget(target, description);
      console.log(`載せました: ${target.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ name: target.name, message });
      console.error(`失敗: ${target.name}`);
      console.error(message);
    }
  }
  if (failures.length === 0) return;
  console.error('失敗したデプロイ先:');
  for (const failure of failures) {
    console.error(`- ${failure.name}`);
  }
  process.exitCode = 1;
}

/**
 * 環境変数からデプロイする。
 * @returns {void}
 */
function main() {
  try {
    const sha = process.env.GITHUB_SHA || '';
    const description = sha ? `main ${sha.slice(0, 7)}` : 'main の更新';
    deployAll(process.env.DEPLOY_TARGETS, description);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
