#!/usr/bin/env bash
# One-shot setup: init git, push to GitHub, enable Pages, trigger workflow.
# Run from a normal Terminal: bash ~/Documents/dribl-ics/setup.sh
set -euo pipefail

REPO_NAME="dribl-ics"
GH_USER="Massimoi79"

cd "$(dirname "${BASH_SOURCE[0]}")"

echo "==> Working in $(pwd)"

# ---- Sanity checks ----------------------------------------------------------
command -v git >/dev/null || { echo "git not installed."; exit 1; }
command -v gh  >/dev/null || { echo "gh CLI not installed. Install via 'brew install gh'."; exit 1; }
command -v node >/dev/null || { echo "node not installed. Install Node 20+ via 'brew install node'."; exit 1; }

# ---- 1. Authenticate gh -----------------------------------------------------
if ! gh auth status >/dev/null 2>&1; then
  echo "==> gh is not authenticated; launching login flow..."
  gh auth login --hostname github.com --git-protocol https --web
fi
gh auth status

# ---- 2. Init local repo & commit -------------------------------------------
# Self-heal a broken/half-initialised .git dir.
if [[ -d .git ]] && ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "==> Found broken .git directory; removing..."
  rm -rf .git
fi
if [[ ! -d .git ]]; then
  echo "==> Initialising local git repo..."
  git init -b main >/dev/null
fi

if ! git config user.email >/dev/null 2>&1; then
  git config user.email "${GH_USER}@users.noreply.github.com"
fi
if ! git config user.name >/dev/null 2>&1; then
  git config user.name "${GH_USER}"
fi

git add .
if git diff --cached --quiet; then
  echo "==> Nothing new to commit."
else
  git commit -m "Initial commit: Dribl ICS feed" >/dev/null
  echo "==> Committed."
fi

# ---- 3. Create GitHub repo & push -------------------------------------------
if ! gh repo view "${GH_USER}/${REPO_NAME}" >/dev/null 2>&1; then
  echo "==> Creating GitHub repo ${GH_USER}/${REPO_NAME}..."
  gh repo create "${REPO_NAME}" --public --source . --push
else
  echo "==> Repo exists; pushing main..."
  if ! git remote get-url origin >/dev/null 2>&1; then
    git remote add origin "https://github.com/${GH_USER}/${REPO_NAME}.git"
  fi
  git push -u origin main || git push -u origin main --force-with-lease
fi

# ---- 4. Enable GitHub Pages (main branch, /docs) ---------------------------
echo "==> Enabling GitHub Pages..."
gh api -X POST "repos/${GH_USER}/${REPO_NAME}/pages" \
  -f "source[branch]=main" -f "source[path]=/docs" >/dev/null 2>&1 || \
gh api -X PUT  "repos/${GH_USER}/${REPO_NAME}/pages" \
  -f "source[branch]=main" -f "source[path]=/docs" >/dev/null 2>&1 || \
echo "    (Pages already enabled or needs to be set manually in Settings -> Pages.)"

# ---- 5. Trigger the workflow ------------------------------------------------
echo "==> Triggering 'Update Dribl ICS' workflow..."
sleep 2
gh workflow run "Update Dribl ICS" --ref main || true

echo ""
echo "Watching the workflow run (press Ctrl+C to detach; the run continues)..."
sleep 4
gh run watch || true

cat <<EOF

============================================================================
Done. Your subscribe URLs:

  Subscribe (paste into iPhone or Google Calendar):
    https://${GH_USER,,}.github.io/${REPO_NAME}/team.ics

  Family-friendly landing page:
    https://${GH_USER,,}.github.io/${REPO_NAME}/

iPhone: Settings -> Calendar -> Accounts -> Add Account -> Other ->
        Add Subscribed Calendar, paste the team.ics URL.

If the workflow finished green but the calendar is empty, run:
  cd ~/Documents/dribl-ics
  gh variable set DEBUG_DRIBL --body 1
  gh workflow run "Update Dribl ICS" --ref main

...then ping me and I'll refine the extractor against the captured JSON.
============================================================================
EOF
