// Merging open + done groups for grouped views. Grouped views render done
// todos inline at the end of their own bucket (or day); only the flat list
// keeps a separate Done section.

import type { BucketGroup, BucketWithDays } from "@/lib/todo-buckets";

/** In grouped views done todos render inline at the end of their own bucket. */
export function mergeBucketGroups(open: BucketGroup[], done: BucketGroup[]): BucketGroup[] {
    const doneByBucket = new Map(done.map((group) => [group.bucket, group.items]));
    const merged = open.map((group) => ({
        bucket: group.bucket,
        items: [...group.items, ...(doneByBucket.get(group.bucket) ?? [])],
    }));
    const openBuckets = new Set(open.map((group) => group.bucket));
    for (const group of done) {
        if (!openBuckets.has(group.bucket)) {
            merged.push(group);
        }
    }
    return merged;
}

/** Same inline-done merge for the by-day view (week/later split per date). */
export function mergeDayGroups(open: BucketWithDays[], done: BucketWithDays[]): BucketWithDays[] {
    const doneByBucket = new Map(done.map((group) => [group.bucket, group]));
    const merged: BucketWithDays[] = open.map((group) => {
        const match = doneByBucket.get(group.bucket);
        if (!match) return group;
        if (group.days.length > 0 || match.days.length > 0) {
            const byDate = new Map<string | null, BucketWithDays["days"][number]>();
            for (const day of [...group.days, ...match.days]) {
                const existing = byDate.get(day.date);
                if (existing) {
                    existing.items.push(...day.items);
                } else {
                    byDate.set(day.date, { date: day.date, items: [...day.items] });
                }
            }
            const days = [...byDate.values()].sort((a, b) => {
                if (a.date === b.date) return 0;
                if (a.date === null) return 1;
                if (b.date === null) return -1;
                return a.date < b.date ? -1 : 1;
            });
            return { bucket: group.bucket, items: [], days };
        }
        return { bucket: group.bucket, items: [...group.items, ...match.items], days: [] };
    });
    const openBuckets = new Set(open.map((group) => group.bucket));
    for (const group of done) {
        if (!openBuckets.has(group.bucket)) {
            merged.push(group);
        }
    }
    return merged;
}
