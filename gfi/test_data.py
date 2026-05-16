#!/usr/bin/env python
# -*- coding: utf-8 -*-
import json
import os
import unittest

GENERATED_FILE_PATH = "data/generated.json"
TAGS_FILE_PATH = "data/tags.json"
LABELS_FILE_PATH = "data/labels.json"


def _load_json(file_path):
    with open(file_path, "r") as f:
        return json.load(f)


class TestDataSanity(unittest.TestCase):

    @staticmethod
    def test_generated_file_exists():
        assert os.path.exists(GENERATED_FILE_PATH)

    @staticmethod
    def test_tags_file_exists():
        assert os.path.exists(TAGS_FILE_PATH)

    @staticmethod
    def test_labels_file_exists():
        assert os.path.exists(LABELS_FILE_PATH)

    @staticmethod
    def test_generated_file_is_list():
        data = _load_json(GENERATED_FILE_PATH)
        assert isinstance(data, list)
        assert len(data) > 0

    @staticmethod
    def test_repo_has_required_fields():
        data = _load_json(GENERATED_FILE_PATH)
        required = {"name", "owner", "description", "language", "slug", "url", "stars", "id", "issues"}
        for repo in data:
            for field in required:
                assert field in repo, f"Missing field '{field}' in repo {repo.get('name')}"

    @staticmethod
    def test_issues_have_required_fields():
        data = _load_json(GENERATED_FILE_PATH)
        required = {"title", "url", "number", "comments_count", "created_at"}
        for repo in data:
            for issue in repo.get("issues", []):
                for field in required:
                    assert field in issue, f"Missing field '{field}' in issue of repo {repo.get('name')}"

    @staticmethod
    def test_no_duplicate_repos():
        data = _load_json(GENERATED_FILE_PATH)
        ids = [repo["id"] for repo in data]
        assert len(ids) == len(set(ids)), "Duplicate repo IDs found"

    @staticmethod
    def test_tags_file_is_list():
        data = _load_json(TAGS_FILE_PATH)
        assert isinstance(data, list)
        assert len(data) > 0

    @staticmethod
    def test_tags_have_required_fields():
        data = _load_json(TAGS_FILE_PATH)
        for tag in data:
            assert "language" in tag
            assert "count" in tag
            assert "slug" in tag

    @staticmethod
    def test_labels_file_sane():
        data = _load_json(LABELS_FILE_PATH)
        assert "labels" in data
        assert len(data["labels"]) > 0


if __name__ == "__main__":
    unittest.main()
