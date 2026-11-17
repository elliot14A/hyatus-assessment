const $ = id => document.getElementById(id);
let filter = 'open', records = [], busy = false, recommendation = null;

function text(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json', ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body;
}

function render() {
  const shown = records.filter(item => filter === 'all' || item.status === filter);
  $('requests').replaceChildren(...shown.map(item => {
    const card = document.createElement('article'); card.className = 'request';
    if (recommendation && item.id === recommendation.id && item.status === 'open') {
      card.classList.add('next-up');
    }
    const body = document.createElement('div');
    body.append(text('h3', item.title), text('p', item.detail));
    const meta = text('p', '', 'meta');
    meta.append(text('span', `${item.guest} · Room ${item.room}`), text('span', item.urgency, `pill ${item.urgency}`));
    if (item.status === 'resolved') meta.append(text('span', 'Handled', 'pill resolved'));
    if (recommendation && item.id === recommendation.id && item.status === 'open') {
      meta.append(text('span', 'Next up', 'pill next-up-pill'));
    }
    meta.append(text('time', new Date(item.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC'));
    body.append(meta);
    const button = text('button', item.status === 'open' ? 'Mark handled' : 'Reopen', 'handle');
    button.type = 'button'; button.disabled = busy; button.setAttribute('aria-label', `${button.textContent}: ${item.title}`);
    button.addEventListener('click', () => update(item));
    card.append(text('span', item.guest[0], 'guest-icon'), body, button);
    return card;
  }));
  const open = records.filter(item => item.status === 'open').length;
  $('open-count').textContent = `${open} open`; $('nav-count').textContent = open;
  $('empty').hidden = busy || !$('error').hidden || shown.length > 0;
  $('empty').textContent = filter === 'resolved' ? 'Handled requests will appear here.' : 'All caught up. Your guests are in good hands.';
  $('refresh').disabled = busy;
  $('handle-next').disabled = busy;
  for (const button of document.querySelectorAll('[data-filter]')) button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
}

function showError(error) {
  $('error').textContent = error.name === 'TimeoutError' ? 'The request took too long. Refresh the inbox to check its current state.' : error instanceof TypeError ? 'We could not reach the inbox. Check your connection, then refresh.' : error.message;
  $('error').hidden = false;
}

async function load() {
  if (busy) return;
  busy = true; $('status').textContent = 'Refreshing your inbox…'; $('error').hidden = true; render();
  try { records = (await api('/api/requests')).requests; await loadRecommendation(); }
  catch (error) { showError(error); }
  finally { busy = false; $('status').textContent = ''; render(); }
}

async function update(item) {
  if (busy) return;
  busy = true; $('error').hidden = true; render();
  try {
    await api(`/api/requests/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: JSON.stringify({ status: item.status === 'open' ? 'resolved' : 'open' }) });
    records = (await api('/api/requests')).requests;
    await loadRecommendation();
    $('status').textContent = item.status === 'open' ? 'Request marked handled.' : 'Request reopened.';
  } catch (error) { showError(error); }
  finally { busy = false; render(); }
}

for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => { filter = button.dataset.filter; render(); });
$('refresh').addEventListener('click', load);
void load();

async function loadRecommendation() {
  $('next-status').textContent = 'Finding the next request…';
  $('next-reason').textContent = '';
  $('next-desc').textContent = '';
  $('next-meta').replaceChildren();
  $('next-error').hidden = true;
  $('handle-next').hidden = true;
  recommendation = null;
  try {
    const result = await api('/api/next-request');
    recommendation = result.request;
    if (recommendation) {
      $('next-status').textContent = recommendation.title;
      $('next-desc').textContent = recommendation.detail;
      $('next-meta').replaceChildren(
        text('span', `${recommendation.guest} · Room ${recommendation.room}`),
        text('span', recommendation.urgency, `pill ${recommendation.urgency}`),
        text('time', new Date(recommendation.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC')
      );
      $('handle-next').hidden = false;
    } else {
      $('next-status').textContent = 'All caught up.';
      $('handle-next').hidden = true;
    }
    $('next-reason').textContent = result.reason;
  } catch (error) {
    $('next-status').textContent = 'Recommendation unavailable.';
    $('next-error').textContent = error.message;
    $('next-error').hidden = false;
  }
}
$('handle-next').addEventListener('click', () => {
  if (recommendation && !busy) void update({ ...recommendation, status: 'open' });
});
