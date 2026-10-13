const groupKey = (l) => [...l.groups].map(g => g.trim().toUpperCase()).sort().join("|");
const signature = (l) => JSON.stringify([l.date, l.pair, l.start, l.end, l.type, l.subject, l.teacher, l.room, groupKey(l), l.online, l.cancelled]);
export function diffLessons(before, after) {
    const remaining = [...after];
    const removed = [];
    for (const old of before) {
        const same = remaining.findIndex(l => signature(l) === signature(old));
        if (same >= 0)
            remaining.splice(same, 1);
        else
            removed.push(old);
    }
    const changes = [];
    for (const old of removed) {
        const candidates = remaining.map((l, i) => ({ l, i })).filter(({ l }) => l.subject === old.subject && groupKey(l) === groupKey(old));
        const match = candidates.find(({ l }) => l.start === old.start) || candidates.find(({ l }) => l.pair === old.pair) || candidates[0];
        if (match) {
            const next = remaining.splice(match.i, 1)[0];
            changes.push({ kind: "changed", date: old.date, groups: [...new Set([...old.groups, ...next.groups])], before: old, after: next });
        }
        else
            changes.push({ kind: "removed", date: old.date, groups: old.groups, before: old });
    }
    for (const next of remaining)
        changes.push({ kind: "added", date: next.date, groups: next.groups, after: next });
    return changes;
}
