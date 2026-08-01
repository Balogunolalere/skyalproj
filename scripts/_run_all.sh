#!/bin/bash
# Unattended Skyal dataset pipeline: pass1 (with 429 retries) -> pass2 -> finalize
cd /home/doombuggy_/Projects/skyalproj
for i in 1 2 3 4 5 6; do
  ok=$(grep -c '"ok": true' tests/datasets/checkpoints/skyal_pass1.jsonl 2>/dev/null || echo 0)
  echo "=== pass1 round $i: $ok/125 ok ===" >> scripts/data/skyal_pass1.log
  if [ "$ok" -ge 125 ]; then break; fi
  BRAND=skyal CONCURRENCY=10 python3 scripts/build-chat-dataset.py STAGE=pass1 >> scripts/data/skyal_pass1.log 2>&1
done
# pass2 with its own retry rounds
for i in 1 2 3 4; do
  p1=$(grep -c '"ok": true' tests/datasets/checkpoints/skyal_pass1.jsonl 2>/dev/null || echo 0)
  echo "=== pass2 round $i (pass1 ok: $p1/125) ===" >> scripts/data/skyal_pass2.log
  BRAND=skyal CONCURRENCY=10 python3 scripts/build-chat-dataset.py STAGE=pass2 >> scripts/data/skyal_pass2.log 2>&1
  todo=$(grep -c '"ok": false' tests/datasets/checkpoints/skyal_pass2.jsonl 2>/dev/null || echo 0)
  if [ "$todo" -eq 0 ] 2>/dev/null; then :; fi
  # stop when no failures remain
  fail=$(grep -c '"ok": false' tests/datasets/checkpoints/skyal_pass2.jsonl 2>/dev/null || echo 0)
  if [ "$fail" -eq 0 ]; then break; fi
done
echo "=== finalize ===" >> scripts/data/skyal_pass2.log
BRAND=skyal python3 scripts/build-chat-dataset.py STAGE=finalize >> scripts/data/skyal_pass2.log 2>&1
echo "PIPELINE DONE" >> scripts/data/skyal_pass2.log
