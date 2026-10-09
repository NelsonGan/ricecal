# Model leaderboard

Built by `pnpm eval:llm` from every run in this directory. Per model (and request
overrides), each task shows its latest run that graded the whole task; runs with
`--limit` or `--grep` are in the history but not here. Overall is the
task-weighted mean of the tasks a row covers, so compare rows that cover all
10 tasks. `$ / answer` is the model's own cost, not the judge's.

| model | overall | tasks | answers | reliability | $ / answer | describe-meal | scan-photo | pick-candidate | estimate-nutrition | refine | suggest-meal | recipe-describe | recipe-photo | recipe-review | social-moderation | runs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| claude:claude-haiku-5-5 {"effort":"low"} | **92.2** | 5/10 | 191 | 100% | $0.00052 | 95 | 81 | 100 | 90 | 99 | – | – | – | – | – | 2026-10-09T04-13-49_claude-claude-haiku-5-5 |
