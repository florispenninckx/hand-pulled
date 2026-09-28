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

# 3. relative links in the pages resolve to files
for page in index.html skills/*/reference.html; do
  base=$(dirname "$page")
  for ref in $(grep -oE '(href|src)="[^"#:]+"' "$page" | sed -E 's/^(href|src)="//; s/"$//'); do
    [ -e "$base/$ref" ] || { say "$page" "missing link: $ref"; fail=1; }
  done
done
say "relative links" "checked"

# 4. every page loads without console errors, at desktop and phone width, with no sideways scroll on a phone
if [ ! -f "$SHOT" ]; then say "page loads" "SKIPPED: set SHOT=/path/to/shot.mjs"; fail=1
else
  for page in index.html skills/*/reference.html; do
    url="file://$PWD/$page"
    if node "$SHOT" "$url" size:1440x900 wait:3000 >/dev/null 2>&1; then d=ok; else d=ERRORS; fail=1; fi
    out=$(node "$SHOT" "$url" size:390x844 wait:3000 "eval:document.documentElement.scrollWidth" 2>&1); code=$?
    w=$(printf '%s\n' "$out" | sed -n 's/^eval //p' | tail -1)
    if [ $code -ne 0 ]; then m=ERRORS; fail=1; elif [ "${w:-999}" -gt 390 ]; then m="OVERFLOWS (${w}px)"; fail=1; else m=ok; fi
    say "$page" "desktop $d · phone $m"
  done
fi

# 5. live pages (those that load a live engine and fill window.handPulledLive): the visible canvases
#    draw and keep moving, each skill's frame 0 passes parity with its still, and under reduced
#    motion (scrolled to the end of the page) every canvas on screen draws once and then holds (clock 0, frame counts unchanged). Frame-time
#    budgets cannot be checked here: headless Chrome renders WebGL in software (SwiftShader), so
#    measure them by hand in real Chrome with ctl.bench() (see the skill's "Live" section).
#    READY waits (up to 30 s) for the page and the visible views, so a loaded machine does not flake.
READY='eval:new Promise(r=>{const t0=Date.now(),f=()=>{const L=window.handPulledLive;if(document.readyState==="complete"&&L&&L.views.length&&L.views.every(v=>{const s=v.state();return s.ready||!s.visible}))return r(Date.now()-t0);if(Date.now()-t0>30000)return r("timeout");setTimeout(f,100)};f()})'
SNAP='eval:(window.__f=handPulledLive.views.map(v=>v.state().frames)).length'
MOVING='eval:JSON.stringify((()=>{const L=handPulledLive,s=L.views.map(v=>v.state()),vis=s.filter(x=>x.visible),par=Object.values(L.parity).flatMap(f=>f());return{views:s.length,visible:vis.length,drawn:vis.filter(x=>x.frames>0).length,moving:s.filter((x,i)=>x.visible&&x.frames>__f[i]).length,parity:par.length,bad:par.filter(r=>!r.pass).map(r=>r.mode+":"+(r.gpu===false?"no-webgl2":r.dMean+"/"+r.dSdRel+"/"+r.dGrainRel+"/"+r.madLevels))}})())'
HELD='eval:JSON.stringify((()=>{const s=handPulledLive.views.map(v=>v.state());return{views:s.length,drawn:s.filter(x=>x.frames>0).length,changed:s.filter((x,i)=>x.frames!==__f[i]).length,clock:s.filter(x=>x.clock!==0).length,notReduced:s.filter(x=>!x.reduced).length}})())'
if [ -f "$SHOT" ]; then
  for page in skills/*/reference.html; do
    grep -qE 'src="assets/live[^"]*\.js"' "$page" || continue
    url="file://$PWD/$page"
    out=$(node "$SHOT" "$url" size:1440x900 "$READY" wait:1500 "$SNAP" wait:1000 "$MOVING" 2>&1); code=$?
    r=$(printf '%s\n' "$out" | sed -n 's/^eval //p' | tail -1)
    if [ $code -eq 0 ] && python3 -c 'import json,sys;r=json.loads(json.loads(sys.argv[1]));sys.exit(0 if r["visible"]>0 and r["drawn"]==r["visible"] and r["moving"]>0 and r["parity"]>0 and not r["bad"] else 1)' "$r" 2>/dev/null
    then n=ok; else n="BAD ${r:-$(printf '%s\n' "$out" | tail -1)}"; fail=1; fi
    out=$(node "$SHOT" "$url" motion:reduced size:1440x900 "$READY" "eval:scrollTo(0,1e9)" wait:1500 "$READY" wait:1500 "$SNAP" wait:1200 "$HELD" 2>&1); code=$?
    r2=$(printf '%s\n' "$out" | sed -n 's/^eval //p' | tail -1)
    if [ $code -eq 0 ] && python3 -c 'import json,sys;r=json.loads(json.loads(sys.argv[1]));sys.exit(0 if r["views"]>0 and r["drawn"]>0 and r["changed"]==0 and r["clock"]==0 and r["notReduced"]==0 else 1)' "$r2" 2>/dev/null
    then m=ok; else m="BAD ${r2:-$(printf '%s\n' "$out" | tail -1)}"; fail=1; fi
    say "$page live" "moving+parity $n · reduced still $m"
  done
fi

[ $fail -eq 0 ] && echo "check passed" || echo "check FAILED"
exit $fail
