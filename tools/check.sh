#!/usr/bin/env bash
# The repository's check: manifests, skill frontmatter, links, and every page loaded headless.
#
#   tools/check.sh
#
# Page loads use shot.mjs (headless Chrome over CDP; exits 1 on any console error or uncaught
# exception). Point SHOT at your copy; by default it is looked for next to this repository.
set -u
cd "$(dirname "$0")/.."
SHOT="${SHOT:-../bigbrain/tools/shot.mjs}"
fail=0
say() { printf '%-58s %s\n' "$1" "$2"; }

# 1. plugin manifests are valid JSON
for f in .claude-plugin/plugin.json .claude-plugin/marketplace.json; do
  if python3 -m json.tool "$f" >/dev/null 2>&1; then say "$f" ok; else say "$f" "INVALID JSON"; fail=1; fi
done

# 2. every skill has name == folder, a description of at most 1024 characters, and its reference page
for d in skills/*/; do
  n=$(basename "$d"); f="$d/SKILL.md"
  name=$(sed -n '2s/^name: //p' "$f"); desc=$(sed -n '3s/^description: //p' "$f")
  if [ "$(sed -n 1p "$f")" != "---" ] || [ "$name" != "$n" ] || [ -z "$desc" ] || [ ${#desc} -gt 1024 ] || [ ! -f "$d/reference.html" ]; then
    say "$f" "BAD (name '$name', description ${#desc} chars)"; fail=1
  else say "$f" "ok (${#desc} chars)"; fi
done

# 3. relative links in the pages resolve to files, and every fonts/ folder has its licence and working url()s
for page in index.html skills/*/reference.html skills/*/fonts/specimen.html; do
  base=$(dirname "$page")
  for ref in $(grep -oE '(href|src)="[^"#:]+"' "$page" | sed -E 's/^(href|src)="//; s/"$//'); do
    [ -e "$base/$ref" ] || { say "$page" "missing link: $ref"; fail=1; }
  done
done
say "relative links" "checked"
for d in skills/*/fonts; do
  [ -d "$d" ] || continue; bad=0
  [ -f "$d/OFL.txt" ] || { say "$d" "missing OFL.txt"; bad=1; }
  for ref in $(grep -oE "url\('[^']+'\)" "$d/fonts.css" | sed -E "s/^url\('//; s/'\)$//"); do
    [ -f "$d/$ref" ] || { say "$d/fonts.css" "missing font: $ref"; bad=1; }
  done
  [ $bad -eq 0 ] && say "$d" "ok ($(ls "$d"/*.woff2 | wc -l | tr -d ' ') fonts, OFL.txt)" || fail=1
done

# 4. every page loads without console errors, at desktop and phone width, with no sideways scroll on a phone
if [ ! -f "$SHOT" ]; then say "page loads" "SKIPPED: set SHOT=/path/to/shot.mjs"; fail=1
else
  for page in index.html skills/*/reference.html skills/*/fonts/specimen.html; do
    url="file://$PWD/$page"
    if node "$SHOT" "$url" size:1440x900 wait:3000 >/dev/null 2>&1; then d=ok; else d=ERRORS; fail=1; fi
    out=$(node "$SHOT" "$url" size:390x844 wait:3000 "eval:document.documentElement.scrollWidth" 2>&1); code=$?
    w=$(printf '%s\n' "$out" | sed -n 's/^eval //p' | tail -1)
    if [ $code -ne 0 ]; then m=ERRORS; fail=1; elif [ "${w:-999}" -gt 390 ]; then m="OVERFLOWS (${w}px)"; fail=1; else m=ok; fi
    say "$page" "desktop $d · phone $m"
  done
fi

[ $fail -eq 0 ] && echo "check passed" || echo "check FAILED"
exit $fail
