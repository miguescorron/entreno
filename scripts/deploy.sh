#!/usr/bin/env bash
# Compila la app y la publica en la rama gh-pages (GitHub Pages sirve esa rama).
set -euo pipefail
cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
npm test
npm run build
cd dist
touch .nojekyll
rm -rf .git
git init -q
git checkout -q -b gh-pages
git config user.name "$(git -C .. config user.name)"
git config user.email "$(git -C .. config user.email)"
git add -A
git commit -q -m "Despliegue $(date '+%d/%m/%Y %H:%M')"
git push -q -f "$REMOTE" gh-pages
rm -rf .git
echo "Publicado en GitHub Pages."
