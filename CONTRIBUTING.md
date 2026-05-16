# Contributing to gitfirst

Thanks for your interest in contributing! This guide will help you get started.

## Project Structure

```
gitfirst/
├── index.html          # Main frontend (single page app)
├── style.css           # All styles
├── app.js              # All JavaScript
├── data/
│   ├── generated.json  # Auto-generated repo + issue data
│   ├── tags.json       # Auto-generated language tags
│   └── labels.json     # Beginner-friendly issue labels to track
├── gfi/
│   └── populate.py     # Python script that fetches data from GitHub
└── .github/
    └── workflows/
        └── refresh.yml # GitHub Actions — runs populate.py every hour
```

## Running the Frontend Locally

No build step needed. Just serve the folder:

```bash
python -m http.server 3000
```

Then open http://localhost:3000.

## Running the Data Pipeline Locally

### Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) — install with:
  ```powershell
  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
  ```
- A GitHub Personal Access Token with `public_repo` scope

### Steps

1. **Install dependencies**
   ```bash
   uv sync --all-extras
   ```

2. **Set your GitHub token**
   ```powershell
   $env:GH_ACCESS_TOKEN = "your_token_here"
   ```

3. **Run the script**
   ```bash
   uv run python gfi/populate.py
   ```

   This will:
   - Search GitHub for public repos with beginner-friendly issues
   - Fetch the top 500 repos sorted by stars
   - Write fresh `data/generated.json` and `data/tags.json`

4. **Refresh the browser** to see updated data

## How Data Gets Updated Automatically

A GitHub Actions workflow (`.github/workflows/refresh.yml`) runs `populate.py` every hour. It:

1. Searches all of GitHub for repos with beginner-friendly issue labels
2. Commits updated JSON files to the repo
3. Vercel detects the commit and redeploys the site automatically

No manual intervention needed after initial setup.

## Adding More Issue Labels

To track additional beginner-friendly labels, add them to `data/labels.json`:

```json
{
  "labels": [
    "good first issue",
    "your-new-label"
  ]
}
```

## Making Changes

1. Fork the repo
2. Create a new branch for your changes
3. Make your changes and test locally
4. Submit a pull request with a clear description

## AI Usage Guidelines

If you use AI tools when contributing:

- **Disclose AI usage** in your pull request description
- **Review and test** all AI-generated code before submitting
- **Ensure accuracy** — don't submit code you haven't verified works

Low-quality AI-generated PRs will be closed without review.
