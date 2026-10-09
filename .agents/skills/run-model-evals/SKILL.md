---
name: run-model-evals
description: Run RiceCal's model eval (pnpm eval:llm) against a named model and report its score. Takes an OpenRouter model id (qwen/qwen3.7-flash, google/gemini-3.8-flash) or a Claude model through claude -p (claude:claude-haiku-5-5), runs every model call the app makes, has Claude Opus judge each answer on a rubric, and reports accuracy, reliability, latency and cost. Use when asked to test, evaluate, benchmark, compare or score a model or LLM for the app.
---

# Run model evals

`pnpm eval:llm` runs the app's own model code (the real prompts, parameters and
answer shaping, imported from `apps/supabase/functions/`) with the model swapped,
and Claude Opus grades every answer through `claude -p`. Read "The model paths"
in `README.md` before changing anything in `apps/supabase/llm-eval/`.

## 1. Pin down the model

- **OpenRouter**: the exact slug, e.g. `qwen/qwen3.7-flash`. If the user gave a
  name rather than a slug, find it in `curl -s https://openrouter.ai/api/v1/models`
  (`.data[].id`) and confirm the one you picked. Production's current model is
  `OPENROUTER_MODEL`, default `qwen/qwen3.7-flash` in `functions/_shared/llm.ts`;
  offer it as the baseline when comparing.
- **A Claude model through Claude Code**: `claude:<full id>`, e.g.
  `claude:claude-haiku-5-5`. Never use the bare aliases: in Claude Code 2.1.x
  `haiku` resolves to Haiku 4.5. Thinking cannot be switched off this way, so pass
  `--body '{"effort":"low"}'` to come closest to production's reasoning-off calls,
  and say so in the report.
- Several models: comma separated in one `--models`.

The OpenRouter key is read from `OPENROUTER_API_KEY` or
`apps/supabase/llm-eval/.env` (gitignored). Check the file exists with
`test -s apps/supabase/llm-eval/.env`; never print it. A `claude:` model needs no key.

## 2. Smoke test

```bash
pnpm eval:llm --models <model> --limit 1
```

Ten answers, one per task, about two minutes. If every case fails with the same
reason, the model rejects a production request parameter (for example "Reasoning
is mandatory for this endpoint"). Report that as the finding, then offer to grade
it with the parameter changed through `--body` (`'{"reasoning":{"effort":"low"}}'`).

## 3. Full run

Tell the user the cost first: about $11 of judge (Opus, roughly four cents an
answer) for the full ~300 answers, plus the model's own cost. Get a yes before
spending it unless they already asked for the full run. The judge and any
`claude:` model draw on the Claude Code account's usage limits; a run that hits
one records the rest as not graded, and those tasks can be re-run after the
reset.

```bash
pnpm eval:llm --models <model> [--body '<json>'] [--repeat 3]
```

Run it in the background; it takes roughly an hour at the default concurrency.
Several models can run as separate processes at once (pass
`--judge-concurrency 2` to each). Use `--repeat 3` when the point is to compare models, since one pass
is not a measurement. `--tasks a,b`, `--grep text` and `--limit N` cut it down.

## 4. History

Every run records itself: its summary and report go to
`apps/supabase/llm-eval/history/<time>_<model>.json` and `.md`,
`history/leaderboard.md` is rebuilt, and those files alone are committed on the
current branch. Confirm the commit landed (`git log -1 -- apps/supabase/llm-eval/history`).
If the run was cut short by something other than the model (a usage limit, a
spent key), keep the clean part with
`pnpm eval:llm --record <run dir> --tasks <the tasks that finished>` and re-run
the rest. Use `--no-commit` only when committing on the current branch would be
wrong, and say so.

## 5. Report

The run prints a per-task table and writes
`apps/supabase/llm-eval/runs/<time>_<model>/`:

- `summary.json`: overall score (0 to 100, task scores weighted by importance),
  reliability (share of answers the app could use), p50/p95 latency, model and
  judge cost, and per-task scores and automatic-check pass rates.
- `report.md`: the same table, the lowest scoring answers with the judge's
  reasons, and the reasons any answer failed.
- `results.jsonl`: every request, reply, usage record and verdict.

Report to the user:

1. Overall score, reliability, and how many answers were graded (skipped
   `bench-*` photos are private plates that are not on every machine).
2. The per-task table.
3. Model cost per answer (`modelCostPerAnswerUsd`) and for the full run
   (`modelCostUsd`), both with prompt caching priced in, beside the cost with
   nothing cached (`modelCostUncachedUsd`) and the cache hit rate
   (`cacheHitRate`). Then the judge's fresh spend (`judgeCostUsd`) and what reused
   verdicts saved (`judgeCostReusedUsd`).
4. p50 and p95 latency, and whether any task runs near the app's 25 second
   per-call timeout.
5. The two or three weakest areas, with a concrete example from `report.md`.
6. For a comparison, `history/leaderboard.md` (or `pnpm eval:llm --report`).
   Compare rows only when they cover every task with the same `--repeat`.

Say plainly what the run could not show: it grades the model calls, not the
catalogue search, portion sizing or diary write that follow them.

## Changing the eval

- Cases live in `apps/supabase/llm-eval/datasets/<task>.json`; rubrics and checks
  in `lib/tasks.mjs`. `pnpm eval:llm --dry-run` validates every dataset and caches
  the photos.
- Photo cases cite a URL (Wikimedia Commons is the usual source); look at the
  photo before writing its expectations.
- Bump `JUDGE_VERSION` in `lib/judge.mjs` when the judge's instructions change,
  or cached verdicts are reused.
- Keep this skill and `.claude/skills/run-model-evals/SKILL.md` identical.
