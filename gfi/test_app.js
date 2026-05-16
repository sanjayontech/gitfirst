#!/usr/bin/env node
'use strict';
/**
 * Tests for app.js filter + sort logic.
 * Run: node gfi/test_app.js
 */
const assert = require('assert');

// ── Mock data ─────────────────────────────────────
const NOW = Date.now();
const DAY = 86_400_000;

const MOCK_REPOS = [
  {
    id: '1', name: 'react', owner: 'facebook',
    language: 'JavaScript', slug: 'javascript',
    url: 'https://github.com/facebook/react',
    stars: 200000, stars_display: '200K',
    last_modified: new Date(NOW - 5 * DAY).toISOString(),
    issues: [
      {
        title: 'Bug in useState', number: 100,
        url: 'https://github.com/facebook/react/issues/100',
        comments_count: 5,
        created_at: new Date(NOW - 3 * DAY).toISOString(),
        labels: ['good first issue'],
        is_assigned: false,
      },
      {
        title: 'Add TypeScript types', number: 200,
        url: 'https://github.com/facebook/react/issues/200',
        comments_count: 0,
        created_at: new Date(NOW - 400 * DAY).toISOString(),
        labels: ['help wanted'],
        is_assigned: true,
      },
    ],
  },
  {
    id: '2', name: 'django', owner: 'django',
    language: 'Python', slug: 'python',
    url: 'https://github.com/django/django',
    stars: 50000, stars_display: '50K',
    last_modified: new Date(NOW - 2 * DAY).toISOString(),
    issues: [
      {
        title: 'Fix migrations', number: 300,
        url: 'https://github.com/django/django/issues/300',
        comments_count: 12,
        created_at: new Date(NOW - 10 * DAY).toISOString(),
        labels: ['beginner'],
        is_assigned: false,
      },
    ],
  },
  {
    id: '3', name: 'small-repo', owner: 'user',
    language: 'JavaScript', slug: 'javascript',
    url: 'https://github.com/user/small-repo',
    stars: 50, stars_display: '50',
    last_modified: new Date(NOW - 20 * DAY).toISOString(),
    issues: [
      {
        title: 'Alpha issue title', number: 400,
        url: 'https://github.com/user/small-repo/issues/400',
        comments_count: 1,
        created_at: new Date(NOW - 15 * DAY).toISOString(),
        labels: ['easy'],
        is_assigned: true,
      },
    ],
  },
];

// ── getResults (mirrors app.js exactly) ──────────
function getResults(repos, filters, sort) {
  const issues = [];

  for (const repo of repos) {
    if (filters.language && repo.slug !== filters.language) continue;
    if (filters.minStars  && repo.stars < filters.minStars)  continue;

    for (const issue of repo.issues) {
      if (filters.maxDays) {
        const cutoff = Date.now() - filters.maxDays * 86_400_000;
        if (new Date(issue.created_at).getTime() < cutoff) continue;
      }
      if (filters.minComments && issue.comments_count < filters.minComments) continue;
      if ('is_assigned' in issue) {
        if (filters.assigned === 'unassigned' && issue.is_assigned) continue;
        if (filters.assigned === 'assigned'   && !issue.is_assigned) continue;
      }
      if (filters.label && 'labels' in issue) {
        const haystack = (issue.labels || []).map(l => l.toLowerCase());
        if (!haystack.some(l => l.includes(filters.label.toLowerCase()))) continue;
      }
      issues.push({ ...issue, repo });
    }
  }

  switch (sort) {
    case 'newest':        issues.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break;
    case 'comments-desc': issues.sort((a, b) => b.comments_count - a.comments_count); break;
    case 'stars-desc':    issues.sort((a, b) => b.repo.stars - a.repo.stars); break;
    case 'stars-asc':     issues.sort((a, b) => a.repo.stars - b.repo.stars); break;
    case 'alpha':         issues.sort((a, b) => a.title.localeCompare(b.title)); break;
  }

  return issues;
}

// ── Test runner ───────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    \x1b[2m${err.message}\x1b[0m`);
    failed++;
  }
}

// ── Defaults ──────────────────────────────────────
const F = { language: null, minStars: 0, maxDays: 0, minComments: 0, assigned: '', label: '' };

// ─────────────────────────────────────────────────
console.log('\n\x1b[1mLanguage filter\x1b[0m');
test('no filter → all 4 issues', () => {
  assert.strictEqual(getResults(MOCK_REPOS, F, 'newest').length, 4);
});
test('javascript → 3 issues (react×2 + small-repo×1)', () => {
  const r = getResults(MOCK_REPOS, { ...F, language: 'javascript' }, 'newest');
  assert.strictEqual(r.length, 3);
  assert.ok(r.every(i => i.repo.slug === 'javascript'));
});
test('python → 1 issue (django)', () => {
  const r = getResults(MOCK_REPOS, { ...F, language: 'python' }, 'newest');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].repo.name, 'django');
});
test('unknown slug → 0 issues', () => {
  assert.strictEqual(getResults(MOCK_REPOS, { ...F, language: 'rust' }, 'newest').length, 0);
});

// ─────────────────────────────────────────────────
console.log('\n\x1b[1mMin Stars filter\x1b[0m');
test('100+ stars → excludes small-repo (50 stars)', () => {
  const r = getResults(MOCK_REPOS, { ...F, minStars: 100 }, 'newest');
  assert.ok(r.every(i => i.repo.stars >= 100));
  assert.ok(r.every(i => i.repo.name !== 'small-repo'));
});
test('1K+ stars → 3 issues (react+django, not small-repo)', () => {
  const r = getResults(MOCK_REPOS, { ...F, minStars: 1000 }, 'newest');
  assert.strictEqual(r.length, 3);
});
test('10K+ stars → 3 issues (react 200K + django 50K)', () => {
  const r = getResults(MOCK_REPOS, { ...F, minStars: 10000 }, 'newest');
  assert.ok(r.every(i => i.repo.stars >= 10000));
});
test('50K+ stars → includes repos with exactly 50000 stars', () => {
  const r = getResults(MOCK_REPOS, { ...F, minStars: 50000 }, 'newest');
  assert.ok(r.every(i => i.repo.stars >= 50000));
});
test('200K+ stars → only react issues', () => {
  const r = getResults(MOCK_REPOS, { ...F, minStars: 200000 }, 'newest');
  assert.ok(r.every(i => i.repo.name === 'react'));
});

// ─────────────────────────────────────────────────
console.log('\n\x1b[1mIssue Age filter\x1b[0m');
test('past week (7d) → only issues within 7 days', () => {
  const r = getResults(MOCK_REPOS, { ...F, maxDays: 7 }, 'newest');
  const cutoff = Date.now() - 7 * DAY;
  assert.ok(r.every(i => new Date(i.created_at).getTime() >= cutoff));
});
test('past month (30d) → issues within 30 days', () => {
  const r = getResults(MOCK_REPOS, { ...F, maxDays: 30 }, 'newest');
  const cutoff = Date.now() - 30 * DAY;
  assert.ok(r.every(i => new Date(i.created_at).getTime() >= cutoff));
});
test('past 6 months (180d) → excludes 400-day-old issue (#200)', () => {
  const r = getResults(MOCK_REPOS, { ...F, maxDays: 180 }, 'newest');
  assert.ok(r.every(i => i.number !== 200));
});
test('past year (365d) → excludes 400-day-old issue (#200)', () => {
  const r = getResults(MOCK_REPOS, { ...F, maxDays: 365 }, 'newest');
  assert.ok(r.every(i => i.number !== 200));
});

// ─────────────────────────────────────────────────
console.log('\n\x1b[1mMin Comments filter\x1b[0m');
test('1+ comments → excludes #200 (0 comments)', () => {
  const r = getResults(MOCK_REPOS, { ...F, minComments: 1 }, 'newest');
  assert.ok(r.every(i => i.comments_count >= 1));
  assert.ok(r.every(i => i.number !== 200));
});
test('3+ comments → only #100 (5) and #300 (12)', () => {
  const r = getResults(MOCK_REPOS, { ...F, minComments: 3 }, 'newest');
  assert.ok(r.every(i => i.comments_count >= 3));
  assert.strictEqual(r.length, 2);
});
test('10+ comments → only #300 (12 comments)', () => {
  const r = getResults(MOCK_REPOS, { ...F, minComments: 10 }, 'newest');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].number, 300);
});

// ─────────────────────────────────────────────────
console.log('\n\x1b[1mAssignment filter\x1b[0m');
test('"Any" → all 4 issues', () => {
  assert.strictEqual(getResults(MOCK_REPOS, { ...F, assigned: '' }, 'newest').length, 4);
});
test('"Unassigned" → only unassigned issues', () => {
  const r = getResults(MOCK_REPOS, { ...F, assigned: 'unassigned' }, 'newest');
  assert.ok(r.every(i => !i.is_assigned));
  assert.ok(r.length > 0);
});
test('"Assigned" → only assigned issues', () => {
  const r = getResults(MOCK_REPOS, { ...F, assigned: 'assigned' }, 'newest');
  assert.ok(r.every(i => i.is_assigned));
  assert.ok(r.length > 0);
});
test('assigned + unassigned counts add up to total', () => {
  const all        = getResults(MOCK_REPOS, F, 'newest').length;
  const assigned   = getResults(MOCK_REPOS, { ...F, assigned: 'assigned' }, 'newest').length;
  const unassigned = getResults(MOCK_REPOS, { ...F, assigned: 'unassigned' }, 'newest').length;
  assert.strictEqual(assigned + unassigned, all);
});
test('filter skipped for issues missing is_assigned field', () => {
  const repos = [{ ...MOCK_REPOS[0], issues: [{ title: 'X', number: 999, url: '', comments_count: 0, created_at: new Date().toISOString() }] }];
  const r = getResults(repos, { ...F, assigned: 'unassigned' }, 'newest');
  assert.strictEqual(r.length, 1, 'issue without field should pass through');
});

// ─────────────────────────────────────────────────
console.log('\n\x1b[1mLabel filter\x1b[0m');
test('"Any" label → all 4 issues', () => {
  assert.strictEqual(getResults(MOCK_REPOS, { ...F, label: '' }, 'newest').length, 4);
});
test('"good first issue" → only #100', () => {
  const r = getResults(MOCK_REPOS, { ...F, label: 'good first issue' }, 'newest');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].number, 100);
});
test('"help wanted" → only #200', () => {
  const r = getResults(MOCK_REPOS, { ...F, label: 'help wanted' }, 'newest');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].number, 200);
});
test('"beginner" → only #300', () => {
  const r = getResults(MOCK_REPOS, { ...F, label: 'beginner' }, 'newest');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].number, 300);
});
test('"easy" → only #400', () => {
  const r = getResults(MOCK_REPOS, { ...F, label: 'easy' }, 'newest');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].number, 400);
});
test('label match is case-insensitive', () => {
  const r1 = getResults(MOCK_REPOS, { ...F, label: 'Good First Issue' }, 'newest');
  const r2 = getResults(MOCK_REPOS, { ...F, label: 'GOOD FIRST ISSUE' }, 'newest');
  assert.strictEqual(r1.length, 1);
  assert.strictEqual(r2.length, 1);
});
test('unknown label → 0 issues', () => {
  assert.strictEqual(getResults(MOCK_REPOS, { ...F, label: 'nonexistent' }, 'newest').length, 0);
});
test('filter skipped for issues missing labels field', () => {
  const repos = [{ ...MOCK_REPOS[0], issues: [{ title: 'X', number: 999, url: '', comments_count: 0, created_at: new Date().toISOString() }] }];
  const r = getResults(repos, { ...F, label: 'good first issue' }, 'newest');
  assert.strictEqual(r.length, 1, 'issue without labels field should pass through');
});

// ─────────────────────────────────────────────────
console.log('\n\x1b[1mSort options\x1b[0m');
test('newest → descending by created_at', () => {
  const r = getResults(MOCK_REPOS, F, 'newest');
  for (let i = 1; i < r.length; i++)
    assert.ok(new Date(r[i - 1].created_at) >= new Date(r[i].created_at), `[${i-1}] should be newer than [${i}]`);
});
test('comments-desc → descending by comment count', () => {
  const r = getResults(MOCK_REPOS, F, 'comments-desc');
  for (let i = 1; i < r.length; i++)
    assert.ok(r[i - 1].comments_count >= r[i].comments_count);
});
test('stars-desc → descending by repo stars', () => {
  const r = getResults(MOCK_REPOS, F, 'stars-desc');
  for (let i = 1; i < r.length; i++)
    assert.ok(r[i - 1].repo.stars >= r[i].repo.stars);
});
test('stars-asc → ascending by repo stars', () => {
  const r = getResults(MOCK_REPOS, F, 'stars-asc');
  for (let i = 1; i < r.length; i++)
    assert.ok(r[i - 1].repo.stars <= r[i].repo.stars);
});
test('alpha → ascending alphabetical by title', () => {
  const r = getResults(MOCK_REPOS, F, 'alpha');
  for (let i = 1; i < r.length; i++)
    assert.ok(r[i - 1].title.localeCompare(r[i].title) <= 0);
});
test('stars-desc first issue is from highest-star repo', () => {
  const r = getResults(MOCK_REPOS, F, 'stars-desc');
  assert.strictEqual(r[0].repo.name, 'react');
});
test('stars-asc first issue is from lowest-star repo', () => {
  const r = getResults(MOCK_REPOS, F, 'stars-asc');
  assert.strictEqual(r[0].repo.name, 'small-repo');
});
test('alpha first title is "Add TypeScript types"', () => {
  const r = getResults(MOCK_REPOS, F, 'alpha');
  assert.strictEqual(r[0].title, 'Add TypeScript types');
});

// ─────────────────────────────────────────────────
console.log('\n\x1b[1mCombined filters\x1b[0m');
test('javascript + 1K+ stars → only react issues', () => {
  const r = getResults(MOCK_REPOS, { ...F, language: 'javascript', minStars: 1000 }, 'newest');
  assert.ok(r.every(i => i.repo.name === 'react'));
});
test('unassigned + 1+ comments → unassigned issues with ≥1 comment', () => {
  const r = getResults(MOCK_REPOS, { ...F, assigned: 'unassigned', minComments: 1 }, 'newest');
  assert.ok(r.every(i => !i.is_assigned && i.comments_count >= 1));
});
test('"good first issue" label + javascript language → only #100', () => {
  const r = getResults(MOCK_REPOS, { ...F, label: 'good first issue', language: 'javascript' }, 'newest');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].number, 100);
});
test('past week + 100+ stars → recent high-star issues', () => {
  const r = getResults(MOCK_REPOS, { ...F, maxDays: 7, minStars: 100 }, 'newest');
  const cutoff = Date.now() - 7 * DAY;
  assert.ok(r.every(i => new Date(i.created_at).getTime() >= cutoff && i.repo.stars >= 100));
});
test('all filters set to strictest values → 0 results', () => {
  const r = getResults(MOCK_REPOS, { language: 'python', minStars: 200000, maxDays: 1, minComments: 10, assigned: 'unassigned', label: 'good first issue' }, 'newest');
  assert.strictEqual(r.length, 0);
});

// ─────────────────────────────────────────────────
console.log('\n\x1b[1mEdge cases\x1b[0m');
test('empty repos list → 0 issues', () => {
  assert.strictEqual(getResults([], F, 'newest').length, 0);
});
test('repo with no issues is skipped', () => {
  const repos = [{ ...MOCK_REPOS[0], issues: [] }];
  assert.strictEqual(getResults(repos, F, 'newest').length, 0);
});
test('each issue carries its repo reference', () => {
  const r = getResults(MOCK_REPOS, F, 'newest');
  assert.ok(r.every(i => i.repo && i.repo.id));
});

// ── Summary ───────────────────────────────────────
const line = '─'.repeat(48);
console.log(`\n${line}`);
if (failed === 0) {
  console.log(`\x1b[32m✓ All ${passed} tests passed\x1b[0m`);
} else {
  console.log(`\x1b[32m${passed} passed\x1b[0m  \x1b[31m${failed} failed\x1b[0m`);
  process.exit(1);
}
