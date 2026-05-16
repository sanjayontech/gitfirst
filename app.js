const state = {
  repos: [],
  tags: [],
  filters: { language: null, minStars: 0, maxDays: 0, minComments: 0, assigned: '', label: '' },
  sort: 'newest',
};

/* ── Init ──────────────────────────────────────── */
async function init() {
  try {
    const [repos, tags] = await Promise.all([
      fetch('data/generated.json').then(r => r.json()),
      fetch('data/tags.json').then(r => r.json()),
    ]);
    state.repos = repos;
    state.tags = tags;
  } catch {
    document.getElementById('repo-list').innerHTML =
      '<p style="color:var(--text-3);padding:2rem 0">Could not load data. Serve this folder with a local server: <code>python -m http.server 3000</code></p>';
    return;
  }

  renderLangPills();
  bindControls();
  bindNav();
  applyRoute();

  window.addEventListener('popstate', applyRoute);
}

/* ── Routing ───────────────────────────────────── */
function applyRoute() {
  const hash = location.hash.slice(1);
  if (hash === 'about') {
    showView('about');
  } else {
    state.filters.language = hash || null;
    showView('home');
    renderAll();
  }
}

function navigate(hash) {
  history.pushState(null, '', hash ? `#${hash}` : location.pathname);
  applyRoute();
}

function showView(view) {
  const isHome = view === 'home';
  document.getElementById('home-view').classList.toggle('hidden', !isHome);
  document.getElementById('about-view').classList.toggle('hidden', isHome);
  document.getElementById('filter-bar').classList.toggle('hidden', !isHome);
  document.getElementById('nav-home').classList.toggle('active', isHome);
  document.getElementById('nav-about').classList.toggle('active', !isHome);
  document.title = isHome ? 'gitfirst — Find your first open-source contribution' : 'About — gitfirst';
}

/* ── Nav bindings ──────────────────────────────── */
function bindNav() {
  document.getElementById('brand-link').addEventListener('click', e => {
    e.preventDefault();
    state.filters.language = null;
    navigate('');
  });
  document.getElementById('nav-home').addEventListener('click', e => {
    e.preventDefault();
    state.filters.language = null;
    navigate('');
  });
  document.getElementById('nav-about').addEventListener('click', e => {
    e.preventDefault();
    navigate('about');
  });
}

/* ── Control bindings ──────────────────────────── */
function bindControls() {
  const sortTrigger = document.getElementById('sort-trigger');
  const sortMenu    = document.getElementById('sort-menu');

  sortTrigger.addEventListener('click', e => {
    e.stopPropagation();
    const opening = !sortMenu.classList.contains('open');
    closeAllDropdowns();
    if (opening) {
      sortMenu.classList.add('open');
      sortTrigger.classList.add('open');
    }
  });

  sortMenu.querySelectorAll('.dd-item').forEach(item => {
    item.addEventListener('click', () => {
      state.sort = item.dataset.sort;
      sortMenu.querySelectorAll('.dd-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('sort-label').textContent = item.textContent.replace('✓ ', '');
      closeAllDropdowns();
      renderAll();
    });
  });

  const filterTrigger = document.getElementById('filter-trigger');
  const filterMenu    = document.getElementById('filter-menu');

  filterTrigger.addEventListener('click', e => {
    e.stopPropagation();
    const opening = !filterMenu.classList.contains('open');
    closeAllDropdowns();
    if (opening) {
      filterMenu.classList.add('open');
      filterTrigger.classList.add('open');
    }
  });

  filterMenu.querySelectorAll('.fopt').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const group = btn.closest('.foptions');
      group.querySelectorAll('.fopt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const val = btn.dataset.value;
      if (btn.dataset.filter === 'stars')    state.filters.minStars    = +val;
      if (btn.dataset.filter === 'days')     state.filters.maxDays     = +val;
      if (btn.dataset.filter === 'comments') state.filters.minComments  = +val;
      if (btn.dataset.filter === 'assigned') state.filters.assigned    = val;
      if (btn.dataset.filter === 'label')    state.filters.label       = val;

      updateFilterBadge();
      renderAll();
    });
  });

  document.getElementById('reset-btn').addEventListener('click', resetAll);
  document.addEventListener('click', closeAllDropdowns);
}

function closeAllDropdowns() {
  document.querySelectorAll('.dd-menu').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.dd-trigger').forEach(t => t.classList.remove('open'));
}

function updateFilterBadge() {
  const count = [
    state.filters.minStars, state.filters.maxDays, state.filters.minComments,
    state.filters.assigned, state.filters.label,
  ].filter(Boolean).length;
  const badge   = document.getElementById('filter-badge');
  const trigger = document.getElementById('filter-trigger');
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
  trigger.classList.toggle('has-filters', count > 0);
}

function resetAll() {
  state.filters = { language: null, minStars: 0, maxDays: 0, minComments: 0, assigned: '', label: '' };
  state.sort = 'newest';

  document.querySelectorAll('.dd-item').forEach(i => i.classList.remove('active'));
  document.querySelector('[data-sort="newest"]').classList.add('active');
  document.getElementById('sort-label').textContent = 'Newest';

  document.querySelectorAll('.fopt').forEach(b =>
    b.classList.toggle('active', b.dataset.value === '0')
  );

  updateFilterBadge();
  history.replaceState(null, '', location.pathname);
  renderAll();
}

/* ── Language pills ────────────────────────────── */
function renderLangPills() {
  const container = document.getElementById('lang-pills');
  container.innerHTML = state.tags.map(tag => `
    <button class="lang-pill" data-slug="${tag.slug}">
      ${escapeHtml(tag.language)} <span style="opacity:.55">× ${tag.count}</span>
    </button>
  `).join('');

  container.querySelectorAll('.lang-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const slug = pill.dataset.slug;
      const next = state.filters.language === slug ? null : slug;
      state.filters.language = next;
      history.replaceState(null, '', next ? `#${next}` : location.pathname);
      renderAll();
    });
  });
}

function syncLangPills() {
  document.querySelectorAll('.lang-pill').forEach(p =>
    p.classList.toggle('active', p.dataset.slug === state.filters.language)
  );
}

/* ── Filter + sort logic ───────────────────────── */
function getResults() {
  const issues = [];

  for (const repo of state.repos) {
    if (state.filters.language && repo.slug !== state.filters.language) continue;
    if (state.filters.minStars  && repo.stars < state.filters.minStars)  continue;

    for (const issue of repo.issues) {
      if (state.filters.maxDays) {
        const cutoff = Date.now() - state.filters.maxDays * 86_400_000;
        if (new Date(issue.created_at).getTime() < cutoff) continue;
      }
      if (state.filters.minComments && issue.comments_count < state.filters.minComments) continue;
      if ('is_assigned' in issue) {
        if (state.filters.assigned === 'unassigned' && issue.is_assigned) continue;
        if (state.filters.assigned === 'assigned'   && !issue.is_assigned) continue;
      }
      if (state.filters.label && 'labels' in issue) {
        const haystack = (issue.labels || []).map(l => l.toLowerCase());
        if (!haystack.some(l => l.includes(state.filters.label.toLowerCase()))) continue;
      }

      issues.push({ ...issue, repo });
    }
  }

  switch (state.sort) {
    case 'newest':        issues.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break;
    case 'comments-desc': issues.sort((a, b) => b.comments_count - a.comments_count); break;
    case 'stars-desc':    issues.sort((a, b) => b.repo.stars - a.repo.stars); break;
    case 'stars-asc':     issues.sort((a, b) => a.repo.stars - b.repo.stars); break;
    case 'alpha':         issues.sort((a, b) => a.title.localeCompare(b.title)); break;
  }

  return issues;
}

/* ── Render ────────────────────────────────────── */
function renderAll() {
  syncLangPills();
  const issues = getResults();
  renderResultsBar(issues.length);
  renderIssues(issues);

  const langTag = state.tags.find(t => t.slug === state.filters.language);
  if (langTag) document.title = `${langTag.language} — gitfirst`;
  else document.title = 'gitfirst — Find your first open-source contribution';
}

function renderResultsBar(count) {
  document.getElementById('results-count').innerHTML =
    `<strong>${count}</strong> ${count === 1 ? 'issue' : 'issues'}`;

  const chips = [];
  const lang = state.tags.find(t => t.slug === state.filters.language);
  if (lang) chips.push(`<span class="chip">${escapeHtml(lang.language)}</span>`);
  if (state.filters.minStars)    chips.push(`<span class="chip">★ ${state.filters.minStars >= 1000 ? (state.filters.minStars / 1000) + 'K' : state.filters.minStars}+</span>`);
  if (state.filters.maxDays)     chips.push(`<span class="chip">within ${state.filters.maxDays}d</span>`);
  if (state.filters.minComments) chips.push(`<span class="chip">${state.filters.minComments}+ comments</span>`);
  if (state.filters.assigned)    chips.push(`<span class="chip">${escapeHtml(state.filters.assigned)}</span>`);
  if (state.filters.label)       chips.push(`<span class="chip">${escapeHtml(state.filters.label)}</span>`);

  document.getElementById('active-chips').innerHTML = chips.join('');
}

function renderIssues(issues) {
  const container = document.getElementById('repo-list');

  if (!issues.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3>No issues match your filters</h3>
        <p>Try adjusting or resetting your filters.</p>
      </div>`;
    return;
  }

  container.innerHTML = issues.map(issueCardHTML).join('');
}

/* ── Issue card HTML ───────────────────────────── */
function issueCardHTML(issue) {
  const repo = issue.repo;
  const commentsHTML = issue.comments_count > 0 ? `
    <span class="ic-stat">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      ${issue.comments_count}
    </span>` : '';

  return `
    <div class="issue-card">
      <div class="ic-top">
        <a href="${escapeHtml(repo.url)}" target="_blank" rel="noopener noreferrer" class="ic-repo">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
          </svg>
          ${escapeHtml(repo.owner)} / <strong>${escapeHtml(repo.name)}</strong>
        </a>
        <div class="ic-badges">
          <span class="badge-stars">★ ${escapeHtml(String(repo.stars_display || repo.stars))}</span>
          <span class="meta-lang"><span class="lang-dot"></span>${escapeHtml(repo.language || '')}</span>
        </div>
      </div>
      <a href="${escapeHtml(issue.url)}" target="_blank" rel="noopener noreferrer" class="ic-title">
        ${escapeHtml(issue.title)}
      </a>
      <div class="ic-footer">
        <span class="ic-num">#${issue.number}</span>
        ${commentsHTML}
        <span class="ic-stat">opened ${timeAgo(issue.created_at)}</span>
      </div>
    </div>`;
}

/* ── Helpers ───────────────────────────────────── */
function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  for (const [label, sec] of [['year',31536000],['month',2592000],['week',604800],['day',86400],['hour',3600],['minute',60]]) {
    const n = Math.floor(s / sec);
    if (n >= 1) return n === 1 ? `a ${label} ago` : `${n} ${label}s ago`;
  }
  return 'just now';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

document.addEventListener('DOMContentLoaded', init);
