#!/bin/bash
# Runs the listed sweeps one after another, each split over N workers. Failing games are dumped.
# Usage, from this folder: ./run-all.sh boards known modes   (writes to ../out/)
cd "$(dirname "$0")"
Q=$(cd .. && pwd)
TSX=${TSX:-$(cd ../../.. && pwd)/packages/maps/node_modules/.bin/tsx}
N=${N:-2}
mkdir -p "$Q/out" "$Q/dumps"
export SIM_DUMP=$Q/dumps
for sweep in "$@"; do
  date +"%T start $sweep" >> "$Q/out/run-all.log"
  for i in $(seq 0 $((N-1))); do
    "$TSX" run-specs.ts "../specs/$sweep.json" "$Q/out/$sweep.jsonl" "$i" "$N" > "$Q/out/$sweep.$i.log" 2>&1 &
  done
  wait
  date +"%T done $sweep" >> "$Q/out/run-all.log"
done
