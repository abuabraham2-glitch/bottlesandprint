import type { Email } from "@/lib/emailData";

/**
 * Returns the set of thread_ids that have any email in 'waiting' status.
 * Threads in this set are excluded from the "Needs My Reply" bucket.
 */
export function computeWaitingThreadIds(allEmails: Pick<Email, "status" | "thread_id">[]): Set<string> {
  return new Set(
    allEmails
      .filter(e => e.status === "waiting" && e.thread_id)
      .map(e => e.thread_id!) as string[]
  );
}

/**
 * Count distinct threads in the "Needs My Reply" bucket.
 * - Includes emails where status is 'pending' or 'needs_response'
 * - Inbound (or null direction) only
 * - Excludes any thread that has a sibling in 'waiting' status
 * - Emails with null thread_id each count as their own bucket
 *
 * This MUST stay in sync with the needsReplyEmails memo in src/pages/Inbox.tsx.
 */
export function countNeedsReplyThreads(
  allEmails: (Pick<Email, "status" | "thread_id"> & { direction?: string | null })[]
): number {
  const waitingThreadIds = computeWaitingThreadIds(allEmails);
  const matches = allEmails.filter(e =>
    (e.status === "pending" || e.status === "needs_response") &&
    ((e as any).direction === "inbound" || !(e as any).direction) &&
    (!e.thread_id || !waitingThreadIds.has(e.thread_id))
  );

  const seenThreads = new Set<string>();
  let count = 0;
  for (const e of matches) {
    if (!e.thread_id) {
      count += 1;
    } else if (!seenThreads.has(e.thread_id)) {
      seenThreads.add(e.thread_id);
      count += 1;
    }
  }
  return count;
}
