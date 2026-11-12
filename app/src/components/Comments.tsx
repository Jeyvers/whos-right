"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ErrorNote, Hint, Panel } from "@/components/ui";
import { Spinner } from "@/components/Loading";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { MAX_COMMENT_LENGTH, type CaseComment, type CommentBadge, type CommentsResponse } from "@/lib/comments";
import { friendlyError } from "@/lib/errors";
import { checkComment } from "@/lib/textRules";

const BADGE: Record<Exclude<CommentBadge, null>, { label: string; cls: string }> = {
  "first-side": { label: "First side", cls: "bg-side-a text-white" },
  "their-side": { label: "Their side", cls: "bg-side-b text-white" },
  author: { label: "Case author", cls: "bg-side-a text-white" },
  juror: { label: "⚖️ Juror", cls: "bg-court text-white" },
};

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function useComments(caseId: string) {
  const { authenticated, getAccessToken, ready } = usePrivy();
  return useQuery({
    queryKey: ["comments", caseId, authenticated],
    enabled: ready,
    refetchInterval: 20_000,
    queryFn: async (): Promise<CommentsResponse> => {
      const token = authenticated ? await getAccessToken() : null;
      const res = await fetch(`/api/cases/${caseId}/comments`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't load comments.");
      return json;
    },
  });
}

/**
 * Comments under a case. Open once the jury is drawn; hidden from that jury until the verdict (enforced on the
 * server, see lib/comments.ts).
 */
export function Comments({ caseId }: { caseId: string }) {
  const { authenticated, login } = usePrivy();
  const { data } = useComments(caseId);
  if (!data) return null;
  const { access, count, comments } = data;
  if (!access.canRead && !access.note) return null;

  return (
    <div id="comments" className="scroll-mt-4">
    <Panel>
      <p className="font-display text-xl font-extrabold">
        Comments{count !== null && count > 0 ? ` · ${count}` : ""}
      </p>
      {access.note && <Hint>{access.note}</Hint>}
      {!authenticated && !access.canWrite && access.note?.includes("Sign in") && (
        <button className="btn-secondary self-start" onClick={login}>Sign in</button>
      )}
      {authenticated && !access.canWrite && access.note?.includes("Verify") && (
        <Link className="btn-secondary self-start" href="/account">Verify</Link>
      )}
      {access.canRead && (
        <>
          {comments.length === 0 ? (
            <p className="text-sm text-ink/60">No comments yet.{access.canWrite ? " Say what you think." : ""}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {comments.map((cm) => (
                <CommentRow key={cm.id} caseId={caseId} cm={cm} canLike={access.canWrite} />
              ))}
            </ul>
          )}
          {access.canWrite && <Composer caseId={caseId} />}
        </>
      )}
    </Panel>
    </div>
  );
}

function CommentRow({ caseId, cm, canLike }: { caseId: string; cm: CaseComment; canLike: boolean }) {
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();
  const { authenticated } = usePrivy();
  const [state, setState] = useState<"idle" | "busy" | "reported" | "reporting">("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const badge = cm.badge ? BADGE[cm.badge] : null;
  // Optimistic like: flip at once, settle on the server's answer.
  const [liked, setLiked] = useState<boolean | null>(null);
  const isLiked = liked ?? cm.likedByMe;
  const likes = cm.likes + (liked === null ? 0 : liked === cm.likedByMe ? 0 : liked ? 1 : -1);

  async function toggleLike() {
    const next = !isLiked;
    setLiked(next);
    setError(undefined);
    try {
      await authFetch(`/api/cases/${caseId}/comments/${cm.id}/like`, { method: next ? "POST" : "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["comments", caseId] });
      setLiked(null);
    } catch (e) {
      setLiked(!next);
      setError(friendlyError(e));
    }
  }

  async function remove() {
    setState("busy");
    setError(undefined);
    try {
      await authFetch(`/api/cases/${caseId}/comments/${cm.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["comments", caseId] });
    } catch (e) {
      setError(friendlyError(e));
      setState("idle");
    }
  }
  async function report() {
    setError(undefined);
    try {
      await authFetch(`/api/cases/${caseId}/report`, { method: "POST", body: JSON.stringify({ reason, commentId: cm.id }) });
      setState("reported");
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  return (
    <li className="flex flex-col gap-1 rounded-xl bg-lilac/60 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold">{cm.mine ? "You" : cm.author}</span>
        {badge && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${badge.cls}`}>{badge.label}</span>}
        <span className="text-ink/50">{ago(cm.createdAt)}</span>
        <span className="ml-auto flex gap-3 text-xs text-ink/60">
          {cm.mine ? (
            <button className="underline" disabled={state === "busy"} onClick={remove}>
              {state === "busy" ? <Spinner /> : "Delete"}
            </button>
          ) : authenticated && state === "idle" ? (
            <button className="underline" onClick={() => setState("reporting")}>Report</button>
          ) : null}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words">{cm.body}</p>
      {canLike && !cm.mine ? (
        <button
          onClick={toggleLike}
          aria-pressed={isLiked}
          aria-label={isLiked ? "Unlike" : "Like"}
          className={`self-start rounded-full px-2 py-0.5 text-sm font-semibold transition-colors hover:bg-side-a/10 ${isLiked ? "text-side-a" : "text-ink/55"}`}
        >
          {isLiked ? "♥" : "♡"} {likes > 0 ? likes : ""}
        </button>
      ) : likes > 0 ? (
        <span className="self-start px-2 py-0.5 text-sm font-semibold text-ink/55">♥ {likes}</span>
      ) : null}
      {state === "reporting" && (
        <div className="flex flex-col gap-2 pt-1">
          <input
            className="tile px-3 py-2 text-sm"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What's wrong with this comment?"
          />
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={!reason.trim()} onClick={report}>Send report</button>
            <button className="text-sm underline" onClick={() => setState("idle")}>Cancel</button>
          </div>
        </div>
      )}
      {state === "reported" && <Hint>Thanks. We&apos;ll review it.</Hint>}
      <ErrorNote>{error}</ErrorNote>
    </li>
  );
}

function Composer({ caseId }: { caseId: string }) {
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const check = checkComment(text);
  const touched = text.trim().length > 0;

  async function post() {
    if (check.errors.length) return setError(check.errors[0]);
    setBusy(true);
    setError(undefined);
    try {
      await authFetch(`/api/cases/${caseId}/comments`, { method: "POST", body: JSON.stringify({ body: text }) });
      setText("");
      await queryClient.invalidateQueries({ queryKey: ["comments", caseId] });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="tile p-3"
        rows={3}
        maxLength={MAX_COMMENT_LENGTH}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a comment. Be kind, no names or contact details."
      />
      <div className="flex items-center gap-3">
        <button className="btn" disabled={busy || !touched || check.errors.length > 0} onClick={post}>
          {busy ? <><Spinner /> Posting…</> : "Comment"}
        </button>
        <span className="text-xs text-ink/50 tabular-nums">{text.length}/{MAX_COMMENT_LENGTH}</span>
      </div>
      {touched && check.errors[0] && <Hint>{check.errors[0]}</Hint>}
      {touched && !check.errors.length && check.warnings[0] && <Hint>{check.warnings[0]}</Hint>}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
