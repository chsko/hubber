import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 03:30 UTC is the middle of the night in Norway, summer and winter.
crons.daily("retention", { hourUTC: 3, minuteUTC: 30 }, internal.retention.purge, {});

export default crons;
