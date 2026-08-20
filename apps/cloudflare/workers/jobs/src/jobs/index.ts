/**
 * Every periodic job, in one list.
 *
 * This is the registry the dispatcher matches `controller.cron` against, and
 * the list `scripts/check-crons.mjs` compares with `wrangler.jsonc`. Adding a
 * job is a file beside this one, a line here, and a cron there.
 */
import type { Job } from '../job.ts'
import { retention } from './retention.ts'

export const JOBS: Job[] = [retention]
