#!/usr/bin/env python
# -*- coding: utf-8 -*-
import json
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from operator import itemgetter
from os import getenv, path
from typing import TypedDict, Dict, Union, Sequence, Optional

from github3 import exceptions, login
from numerize import numerize
from emoji import emojize
from slugify import slugify
from loguru import logger

MAX_CONCURRENCY = 5
MAX_REPOS = 500                      # max repos to discover per run
REPO_GENERATED_DATA_FILE = "data/generated.json"
TAGS_GENERATED_DATA_FILE = "data/tags.json"
LABELS_DATA_FILE = "data/labels.json"
ISSUE_STATE = "open"
ISSUE_SORT = "created"
ISSUE_SORT_DIRECTION = "desc"
ISSUE_LIMIT = 10
SLUGIFY_REPLACEMENTS = [["#", "sharp"], ["+", "plus"]]
MAX_INACTIVITY_DAYS = 90

if not path.exists(LABELS_DATA_FILE):
    raise RuntimeError("No labels data file found. Exiting.")

with open(LABELS_DATA_FILE) as labels_file:
    ISSUE_LABELS = json.load(labels_file)["labels"]


class GitHubRateLimiter:
    """Thread-safe rate limiter for GitHub API requests."""

    def __init__(self, client, requests_per_second=1.0):
        self._client = client
        self._lock = threading.Lock()
        self._min_interval = 1.0 / requests_per_second
        self._last_request_time = 0.0
        self._remaining = None
        self._reset_time = None
        self._paused_until = 0.0

    def acquire(self):
        with self._lock:
            if time.time() < self._paused_until:
                wait_time = self._paused_until - time.time()
                logger.info("Waiting {:.0f}s for rate limit reset", wait_time)
                time.sleep(wait_time)

            if self._remaining is None or self._remaining % 100 == 0:
                self._update_rate_limit()

            if self._remaining is not None and self._remaining < 100:
                if self._reset_time:
                    wait_time = max(0, self._reset_time - time.time() + 5)
                    if wait_time > 0:
                        logger.warning("Low quota ({}). Pausing {:.0f}s", self._remaining, wait_time)
                        self._paused_until = time.time() + wait_time
                        time.sleep(wait_time)
                        self._remaining = None

            elapsed = time.time() - self._last_request_time
            if elapsed < self._min_interval:
                time.sleep(self._min_interval - elapsed)

            self._last_request_time = time.time()
            if self._remaining:
                self._remaining -= 1

    def _update_rate_limit(self):
        try:
            info = self._client.rate_limit()['resources']['core']
            self._remaining = info['remaining']
            self._reset_time = info['reset']
            logger.debug("Rate limit: {}/{}", self._remaining, info['limit'])
        except Exception as e:
            logger.warning("Failed to check rate limit: {}", e)

    def report_rate_limit_hit(self):
        with self._lock:
            self._update_rate_limit()
            wait_time = max(60, self._reset_time - time.time() + 5) if self._reset_time else 60
            self._paused_until = time.time() + wait_time
            self._remaining = 0
            logger.warning("Rate limit hit. Pausing {:.0f}s", wait_time)


class RepositoryIdentifier(TypedDict):
    owner: str
    name: str


RepositoryInfo = Dict["str", Union[str, int, Sequence]]


def discover_repos(client, rate_limiter: GitHubRateLimiter, max_repos: int = MAX_REPOS):
    """Dynamically search GitHub for public repos with beginner-friendly issues."""
    discovered = []
    seen = set()

    # GitHub native search qualifiers for beginner-friendly repos
    queries = [
        'good-first-issues:>0 stars:>10 is:public',
        'help-wanted-issues:>0 stars:>10 is:public',
    ]

    for query in queries:
        if len(discovered) >= max_repos:
            break
        try:
            logger.info("Searching GitHub: '{}'", query)
            rate_limiter.acquire()
            results = client.search_repositories(query, sort='stars', order='desc')
            for repo in results:
                if len(discovered) >= max_repos:
                    break
                key = f"{repo.owner.login}/{repo.name}"
                if key not in seen:
                    seen.add(key)
                    discovered.append({"owner": repo.owner.login, "name": repo.name})
        except Exception as e:
            logger.error("Error during repo search: {}", e)

    logger.info("Discovered {} unique repos to process", len(discovered))
    return discovered


def get_repository_info(
    identifier: RepositoryIdentifier,
    client,
    rate_limiter: GitHubRateLimiter,
) -> Optional[RepositoryInfo]:
    """Fetch repo metadata and beginner-friendly issues from GitHub."""
    owner, name = identifier["owner"], identifier["name"]
    logger.info("Getting info for {}/{}", owner, name)

    for attempt in range(3):
        try:
            rate_limiter.acquire()
            repository = client.repository(owner, name)

            if repository.archived:
                return None

            days_since_push = (datetime.now(timezone.utc) - repository.pushed_at).days
            if days_since_push > MAX_INACTIVITY_DAYS:
                logger.info("\t skipping — inactive for {} days", days_since_push)
                return None

            good_first_issues = set()
            for label in ISSUE_LABELS:
                rate_limiter.acquire()
                issues_for_label = repository.issues(
                    labels=label,
                    state=ISSUE_STATE,
                    number=ISSUE_LIMIT,
                    sort=ISSUE_SORT,
                    direction=ISSUE_SORT_DIRECTION,
                )
                good_first_issues.update(issues_for_label)

            logger.info("\t found {} beginner issues", len(good_first_issues))

            if not good_first_issues or not repository.language:
                logger.info("\t skipping — no issues or no language")
                return None

            info: RepositoryInfo = {
                "name": name,
                "owner": owner,
                "description": emojize(repository.description or ""),
                "language": repository.language,
                "slug": slugify(repository.language, replacements=SLUGIFY_REPLACEMENTS),
                "url": repository.html_url,
                "stars": repository.stargazers_count,
                "stars_display": numerize.numerize(repository.stargazers_count),
                "last_modified": repository.pushed_at.isoformat(),
                "id": str(repository.id),
                "issues": [
                    {
                        "title": issue.title,
                        "url": issue.html_url,
                        "number": issue.number,
                        "comments_count": issue.comments_count,
                        "created_at": issue.created_at.isoformat(),
                        "labels": [lbl.name for lbl in (issue.original_labels or [])],
                        "is_assigned": bool(issue.assignees),
                    }
                    for issue in good_first_issues
                ],
            }
            return info

        except exceptions.ForbiddenError:
            rate_limiter.report_rate_limit_hit()
            if attempt == 2:
                logger.error("Rate limit exceeded after 3 retries: {}/{}", owner, name)
                return None

        except exceptions.NotFoundError:
            logger.warning("Not found: {}/{}", owner, name)
            return None

        except exceptions.ConnectionError:
            logger.warning("Connection error: {}/{}", owner, name)
            return None

    return None


if __name__ == "__main__":
    if not getenv("GH_ACCESS_TOKEN"):
        raise RuntimeError("GH_ACCESS_TOKEN env variable not set. Exiting.")

    client = login(token=getenv("GH_ACCESS_TOKEN"))
    rate_limiter = GitHubRateLimiter(client, requests_per_second=1.0)

    # Dynamically discover repos from all of GitHub
    repos_to_process = discover_repos(client, rate_limiter)

    REPOSITORIES = []
    TAGS: Counter = Counter()

    def process_repo(identifier):
        return get_repository_info(identifier, client, rate_limiter)

    with ThreadPoolExecutor(max_workers=MAX_CONCURRENCY) as executor:
        results = list(executor.map(process_repo, repos_to_process))

    for result in results:
        if result:
            REPOSITORIES.append(result)
            TAGS[result["language"]] += 1

    with open(REPO_GENERATED_DATA_FILE, "w") as f:
        json.dump(REPOSITORIES, f)
    logger.info("Wrote {} repos to {}", len(REPOSITORIES), REPO_GENERATED_DATA_FILE)

    tags = [
        {
            "language": key,
            "count": value,
            "slug": slugify(key, replacements=SLUGIFY_REPLACEMENTS),
        }
        for key, value in TAGS.items()
        if value >= 3
    ]
    tags_sorted = sorted(tags, key=itemgetter("count"), reverse=True)
    with open(TAGS_GENERATED_DATA_FILE, "w") as f:
        json.dump(tags_sorted, f)
    logger.info("Wrote {} language tags to {}", len(tags_sorted), TAGS_GENERATED_DATA_FILE)
