.ONESHELL:

generate:
	uv run python gfi/populate.py

test:
	uv run python gfi/test_data.py
	uv run mypy gfi/*.py
	node gfi/test_app.js

format:
	uv run ruff format .

.DEFAULT_GOAL := generate
