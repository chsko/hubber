import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

/**
 * Retention rules from the privacy policy (HUB-34, docs/legal). Runs daily
 * from crons.ts and deletes in batches, rescheduling itself while there is
 * more to delete.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Push bookkeeping (what was sent or bundled) is only needed for a short while. */
export const NOTIFICATION_RETENTION_MS = 30 * DAY_MS;
/** Handled reports are kept a year, so repeat offenders can be spotted. */
export const REPORT_RETENTION_MS = 365 * DAY_MS;
/** Longer than the longest rate-limit window (24 hours). */
export const RATE_LIMIT_RETENTION_MS = 7 * DAY_MS;
const BATCH = 200;

export const purge = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", now - NOTIFICATION_RETENTION_MS))
      .take(BATCH);
    const reports = await ctx.db
      .query("reports")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", now - REPORT_RETENTION_MS))
      .filter((q) => q.neq(q.field("status"), "open"))
      .take(BATCH);
    const rateLimits = await ctx.db
      .query("rateLimits")
      .filter((q) => q.lt(q.field("windowStart"), now - RATE_LIMIT_RETENTION_MS))
      .take(BATCH);
    const rows = [...notifications, ...reports, ...rateLimits];
    for (const row of rows) await ctx.db.delete(row._id);
    if (notifications.length === BATCH || reports.length === BATCH || rateLimits.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.retention.purge, {});
    }
    return rows.length;
  },
});
