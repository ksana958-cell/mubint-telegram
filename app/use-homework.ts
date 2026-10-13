"use client";
import { apiFetch, storage, telegram, botLink } from "./telegram";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeGroup } from "@/lib/schedule";
import type { Homework } from "@/lib/student";

export type HomeworkDraft = Pick<Homework, "subject" | "sourceDate" | "lessonDate" | "dueDate" | "content" | "done" | "autoTarget" | "remind" | "photos" | "checklist">;
type Identity = Pick<Homework, "subject" | "sourceDate">;
export type HomeworkStore = ReturnType<typeof useHomework>;

export function useHomework(group: string | null) {
  const currentGroup = normalizeGroup(group || "");
  const groupRef = useRef(currentGroup);
  groupRef.current = currentGroup;
  const [records, setRecords] = useState<Homework[]>([]);
  const [loadedGroup, setLoadedGroup] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [remindersAvailable, setRemindersAvailable] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (loadedGroup !== currentGroup) { setRecords([]); setLoadedGroup(""); setRemindersAvailable(false); }
    setError(""); setAuthRequired(false);
    if (!currentGroup) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    apiFetch(`/api/homework?group=${encodeURIComponent(currentGroup)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json() as { records?: Homework[]; error?: string; remindersAvailable?: boolean };
        if (!response.ok) { if (response.status === 401 && !controller.signal.aborted) setAuthRequired(true); throw new Error(body.error || "Не удалось загрузить задания."); }
        if (!Array.isArray(body.records)) throw new Error("Не удалось загрузить задания.");
        if (!controller.signal.aborted) { setRecords(body.records); setLoadedGroup(currentGroup); setRemindersAvailable(!!body.remindersAvailable); }
      })
      .catch(e => { if (!controller.signal.aborted) setError(e.message || "Нет связи. Попробуй ещё раз."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [currentGroup, revision]);

  useEffect(() => {
    if (!currentGroup) return;
    const refresh = () => { if (document.visibilityState === "visible") setRevision(n => n + 1); };
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [currentGroup]);

  const save = useCallback(async (draft: HomeworkDraft) => {
    if (!currentGroup || loadedGroup !== currentGroup) throw new Error("Дождись загрузки личных заданий.");
    const response = await apiFetch("/api/homework", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, group: currentGroup }) });
    const body = await response.json() as { record?: Homework; error?: string };
    if (!response.ok || !body.record) throw new Error(body.error || "Не удалось сохранить задание.");
    const record = body.record;
    if (groupRef.current === currentGroup) setRecords(previous => [...previous.filter(r => r.lessonKey !== record.lessonKey), record]);
  }, [currentGroup, loadedGroup]);

  const remove = useCallback(async (identity: Identity) => {
    if (!currentGroup || loadedGroup !== currentGroup) throw new Error("Дождись загрузки личных заданий.");
    const response = await apiFetch("/api/homework", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...identity, group: currentGroup }) });
    const body = await response.json() as { lessonKey?: string; error?: string };
    if (!response.ok) throw new Error(body.error || "Не удалось удалить задание.");
    if (groupRef.current === currentGroup) setRecords(previous => previous.filter(r => r.lessonKey !== body.lessonKey));
  }, [currentGroup, loadedGroup]);
  return { records: loadedGroup === currentGroup ? records : [], ready: !!currentGroup && loadedGroup === currentGroup, remindersAvailable, loading, error, authRequired, reload: () => setRevision(r => r + 1), save, remove };
}
