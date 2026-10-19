const RAW_CONFIG = 'https://raw.githubusercontent.com/KeWangFX/director-review/main/current.json';
const API_CONFIG = 'https://api.github.com/repos/KeWangFX/director-review/contents/current.json?ref=main';
const CONFIG_LIMIT = 16 * 1024;
let apiFallbackAttempted = false;

export function validateConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.schemaVersion !== 1 || value.service !== 'fireworks-team-gateway') throw new Error('CONFIG_INVALID');
  if (value.status !== 'READY') throw new Error('SERVICE_NOT_READY');
  if (typeof value.url !== 'string' || value.url !== value.url.trim() || value.url.length > 250) throw new Error('DESTINATION_INVALID');
  let target;
  try { target = new URL(value.url); } catch { throw new Error('DESTINATION_INVALID'); }
  // The public JSON is never a general redirect: lock it to the existing HTTPS
  // Quick Tunnel login center, with no credentials, alternate port, query or hash.
  if (!/^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com\/team\/projects$/.test(value.url)
    || target.protocol !== 'https:' || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(target.hostname)
    || target.port || target.username || target.password || target.pathname !== '/team/projects'
    || target.search || target.hash || /[\\\u0000-\u0020\u007f]/.test(value.url)) throw new Error('DESTINATION_INVALID');
  if (typeof value.publishedAt !== 'string' || !Number.isFinite(Date.parse(value.publishedAt))) throw new Error('PUBLISHED_DATE_INVALID');
  return { url: target.href, publishedAt: new Date(value.publishedAt).toISOString(), status: 'READY' };
}

async function boundedJson(response, limit) {
  if (!response.ok) throw new Error('CONFIG_UNAVAILABLE');
  if (Number(response.headers.get('content-length') || 0) > limit) throw new Error('CONFIG_TOO_LARGE');
  const reader = response.body.getReader(), parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('CONFIG_TOO_LARGE'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

async function getJson(url, limit, fetchImpl) {
  const requestUrl = new URL(url);
  requestUrl.searchParams.set('_', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 10_000);
  try {
    const response = await fetchImpl(requestUrl.href, { cache: 'no-store', credentials: 'omit', redirect: 'error',
      referrerPolicy: 'no-referrer', signal: abort.signal, headers: { Accept: 'application/vnd.github+json, application/json' } });
    return await boundedJson(response, limit);
  } finally { clearTimeout(timeout); }
}

export async function loadPublishedConfig(fetchImpl = fetch) {
  let value, source;
  try { value = await getJson(RAW_CONFIG, CONFIG_LIMIT, fetchImpl); source = 'GitHub 原始配置'; }
  catch (rawFailure) {
    if (apiFallbackAttempted) throw new Error('CONFIG_UNAVAILABLE');
    // One API fallback per page load, including manual retries. There is no
    // background polling, third-party script, cached old URL, or account token.
    apiFallbackAttempted = true;
    const envelope = await getJson(API_CONFIG, 64 * 1024, fetchImpl);
    if (envelope.type !== 'file' || envelope.encoding !== 'base64' || typeof envelope.content !== 'string'
      || envelope.content.length > 32 * 1024) throw new Error('CONFIG_INVALID');
    let binary;
    try { binary = atob(envelope.content.replace(/\s/g, '')); } catch { throw new Error('CONFIG_INVALID'); }
    if (binary.length > CONFIG_LIMIT) throw new Error('CONFIG_TOO_LARGE');
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0))));
    source = 'GitHub 配置 API（备用）';
  }
  // A fetched NOT_READY/invalid record fails closed. Do not search another
  // endpoint for an older READY record after the publisher has withdrawn access.
  return { config: validateConfig(value), source };
}

function startPage() {
  const stay = new URLSearchParams(window.location.search).get('stay') === '1';
  const status = document.getElementById('status-box');
  const title = document.getElementById('status-title'), detail = document.getElementById('status-detail');
  const panel = document.getElementById('destination-panel'), destination = document.getElementById('destination');
  const open = document.getElementById('open-button'), retry = document.getElementById('retry-button');
  let running = false;
  async function refresh() {
    if (running) return;
    running = true; retry.disabled = true; retry.textContent = '正在获取…';
    panel.hidden = true; open.hidden = true; open.removeAttribute('href'); destination.removeAttribute('href');
    status.dataset.state = 'loading'; title.textContent = '正在获取当前发布地址'; detail.textContent = '读取最新入口记录，请稍候。';
    try {
      const { config, source } = await loadPublishedConfig();
      // No imported strings become HTML. Only the validated URL becomes an href.
      destination.textContent = config.url; destination.href = config.url; open.href = config.url;
      document.getElementById('record-status').textContent = 'READY · 发布配置校验通过';
      document.getElementById('published-at').textContent = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZoneName: undefined }).format(new Date(config.publishedAt));
      document.getElementById('published-at').title = config.publishedAt;
      document.getElementById('config-source').textContent = source;
      panel.hidden = false; open.hidden = false; status.dataset.state = 'ready';
      title.textContent = stay ? '当前发布地址已载入' : '正在前往登录审核台';
      detail.textContent = stay ? '检查模式：不自动跳转。可使用下方按钮打开审核台。' : '仅核对了发布记录；是否在线以审核台实际响应为准。';
      if (!stay) window.location.replace(config.url);
    } catch (error) {
      status.dataset.state = 'error'; title.textContent = error.message === 'SERVICE_NOT_READY' ? '审核服务暂未发布可用入口' : '暂时无法获取有效入口';
      detail.textContent = '未跳转到旧地址。请稍后重试，或联系管理员检查发布配置与服务。';
    } finally { running = false; retry.disabled = false; retry.textContent = '重新获取入口'; }
  }
  retry.addEventListener('click', refresh);
  void refresh();
}

if (typeof document !== 'undefined') startPage();
