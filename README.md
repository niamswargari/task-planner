# Task Planner

Turns a task list (name, time estimate, priority) into a **suggested** daily or weekly plan.

## Run
Open `index.html` in any modern browser. No server, build step, API key or password is needed.

## How the plan is made
1. Tasks are sorted High > Medium > Low (ties keep entry order).
2. Each task goes on the least-filled day that still has room.
3. Tasks that fit nowhere are listed in an overflow notice.

The output is always labelled "SUGGESTED PLAN" - it is advice to review, not a fixed schedule.

## Test
    npm i playwright     # once
    node tests/run_tests.js

Runs 15 browser checks and rewrites `screenshots/` and `tests/results.json`.
Known limitation (TC-12): the least-filled rule can reject a long task even when total free time is enough.
