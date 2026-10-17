import type { ActivityItem } from "@/types/workspace";

// Firms are in India; the server clock is UTC.
const timeZone = "Asia/Kolkata";
const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

export function toISODate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(value);
}

// Activity stores real timestamps; the label is worked out when it is read.
export function relativeTime(at: Date, now: Date) {
  const elapsed = now.getTime() - at.getTime();
  if (elapsed < minute) return "Just now";
  if (elapsed < hour)
    return `${plural(Math.floor(elapsed / minute), "min")} ago`;
  if (elapsed < day) return `${plural(Math.floor(elapsed / hour), "hour")} ago`;
  if (elapsed < 2 * day) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    day: "numeric",
    month: "short",
  }).format(at);
}

function plural(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

export function toActivityItem(
  row: {
    id: string;
    userId: string | null;
    person: string | null;
    action: string;
    subject: string;
    type: string;
    createdAt: Date;
  },
  viewerId: string,
  now: Date,
): ActivityItem {
  return {
    id: row.id,
    person: row.userId === viewerId ? "You" : (row.person ?? "A former member"),
    action: row.action,
    subject: row.subject,
    time: relativeTime(row.createdAt, now),
    createdAt: row.createdAt.toISOString(),
    type: row.type,
  };
}
