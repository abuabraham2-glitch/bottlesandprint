import type { Email } from "@/lib/emailData";

type WaitingInput = Pick<Email, "status" | "thread_id" | "created_at"> & {
  direction?: string | null;
};

/**
 * Returns the set of thread_ids that are genuinely "waiting on them."
 *
 * A thread is waiting ONLY if its LATEST email is an outbound reply or has
 * status 'waiting'. If the newest email in the thread is an inbound message
 * that still needs a response, the thread is NOT waiting — the ball is back
 * in our court and it belongs in "Needs My Reply."
 *
 * This fixes the bug where a stale older 'waiting' row hid a newer inbound
 * reply on the same thread.
 */
export function computeWaitingThreadIds(allEmails: WaitingInput[]): Set<string> {
  const getTime = (e: WaitingInput) => new Date(e.created_at || 0).getTime();

  // Find the latest email per thread.
  const latestByThread = new Map<string, WaitingInput>();
  for (const e of allEmails) {
    if (!e.thread_id) continue;
    const existing = latestByThread.get(e.thread_id);
    if (!existing || getTime(e) > getTime(existing)) {
      latestByThread.set(e.thread_id, e);
    }
  }

  // A thread is "waiting" only if its latest email is outbound or status=waiting.
  const result = new Set<string>();
  latestByThread.forEach((latest, threadId) => {
    if (latest.status === "waiting" || (latest as any).direction === "outbound") {
      result.add(threadId);
    }
  });
  return result;
}

/**
 * Count distinct threads in the "Needs My Reply" bucket.
 * - Includes emails where status is 'pending' or 'needs_response'
 * - Inbound (or null direction) only
 * - Excludes any thread whose LATEST email is waiting/outbound
 * - Emails with null thread_id each count as their own bucket
 *
 * This MUST stay in sync with the needsReplyEmails memo in src/pages/Inbox.tsx.
 */
export function countNeedsReplyThreads(
  allEmails: (Pick<Email, "status" | "thread_id" | "created_at"> & { direction?: string | null })[]
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
