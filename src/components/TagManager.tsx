import { useState } from "react";
import { v4 as uuid } from "uuid";
import { useStore } from "../store";
import { Tag } from "../types";
import { t } from "../i18n";

const PALETTE = ["#8E8E93", "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#007AFF", "#5856D6", "#AF52DE", "#FF2D55"];

function TagRow({ tag }: { tag: Tag }) {
  const upsert = useStore((s) => s.upsertTag);
  const del = useStore((s) => s.deleteTag);
  const lang = useStore((s) => s.settings.language);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [keywords, setKeywords] = useState(tag.keywords.join(", "));

  function save() {
    upsert({
      id: tag.id,
      name: name.trim() || tag.name,
      color,
      keywords: keywords
        .split(/[,\n]/)
        .map((k) => k.trim())
        .filter(Boolean),
    });
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-black/5">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: tag.color }} />
        <span className="text-[13px] flex-1">{tag.name}</span>
        <span className="text-[11px] text-subink truncate max-w-[120px]">
          {tag.keywords.join(", ")}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="text-[11px] px-1.5 py-0.5 rounded text-subink hover:bg-black/5"
        >
          {t(lang, "edit")}
        </button>
        <button
          onClick={() => del(tag.id)}
          className="text-[11px] px-1.5 py-0.5 rounded text-danger hover:bg-danger/10"
        >
          {t(lang, "delete")}
        </button>
      </div>
    );
  }

  return (
    <div className="p-2 rounded border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(lang, "tagNamePh")}
          className="flex-1 px-2 py-1 rounded border border-black/10 text-[12px] outline-none focus:border-black/25 dark:focus:border-white/25"
        />
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {PALETTE.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`w-5 h-5 rounded-full ${color === c ? "ring-2 ring-offset-1 ring-black/40 dark:ring-white/60" : ""}`}
            style={{ background: c }}
          />
        ))}
      </div>
      <textarea
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
        placeholder={t(lang, "keywordsPh")}
        rows={2}
        className="w-full px-2 py-1 rounded border border-black/10 text-[12px] outline-none focus:border-black/25 dark:focus:border-white/25 resize-none"
      />
      <div className="flex justify-end gap-1">
        <button
          onClick={() => setEditing(false)}
          className="text-[11px] px-2 py-1 rounded text-subink hover:bg-black/5"
        >
          {t(lang, "cancel")}
        </button>
        <button
          onClick={save}
          className="text-[11px] px-2 py-1 rounded bg-accent text-white hover:opacity-90"
        >
          {t(lang, "save")}
        </button>
      </div>
    </div>
  );
}

export function TagManager() {
  const tags = useStore((s) => s.tags);
  const upsert = useStore((s) => s.upsertTag);
  const lang = useStore((s) => s.settings.language);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [keywords, setKeywords] = useState("");

  function reset() {
    setName("");
    setColor(PALETTE[0]);
    setKeywords("");
    setAdding(false);
  }

  function add() {
    if (!name.trim()) return;
    upsert({
      id: uuid(),
      name: name.trim(),
      color,
      keywords: keywords
        .split(/[,\n]/)
        .map((k) => k.trim())
        .filter(Boolean),
    });
    reset();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[13px] font-semibold">{t(lang, "tagsHeading")}</h3>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-[12px] px-2 py-1 rounded bg-[#1C1C1E] text-[#F5F5F5] hover:bg-black dark:bg-[#E0E0E0] dark:text-[#111] dark:hover:bg-[#F5F5F5]"
          >
            {t(lang, "newTag")}
          </button>
        )}
      </div>
      {adding && (
        <div className="p-2 rounded border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] space-y-1.5 mb-2">
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(lang, "tagNamePh")}
              autoFocus
              className="flex-1 px-2 py-1 rounded border border-black/10 text-[12px] outline-none focus:border-black/25 dark:focus:border-white/25"
            />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full ${color === c ? "ring-2 ring-offset-1 ring-black/40 dark:ring-white/60" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <textarea
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder={t(lang, "keywordsPh")}
            rows={2}
            className="w-full px-2 py-1 rounded border border-black/10 text-[12px] outline-none focus:border-black/25 dark:focus:border-white/25 resize-none"
          />
          <div className="flex justify-end gap-1">
            <button
              onClick={reset}
              className="text-[11px] px-2 py-1 rounded text-subink hover:bg-black/5"
            >
              {t(lang, "cancel")}
            </button>
            <button
              onClick={add}
              className="text-[11px] px-2 py-1 rounded bg-accent text-white hover:opacity-90"
            >
              {t(lang, "add")}
            </button>
          </div>
        </div>
      )}
      <div className="space-y-1">
        {tags.length === 0 && !adding && (
          <div className="text-[12px] text-subink text-center py-4">{t(lang, "noTags")}</div>
        )}
        {tags.map((tag) => (
          <TagRow key={tag.id} tag={tag} />
        ))}
      </div>
    </div>
  );
}
