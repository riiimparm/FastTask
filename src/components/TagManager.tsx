import { useState } from "react";
import { v4 as uuid } from "uuid";
import { useStore } from "../store";
import { Tag } from "../types";
import { t } from "../i18n";

const DEFAULT_COLORS = ["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#007AFF", "#5856D6", "#AF52DE", "#FF2D55"];

function TagRow({ tag }: { tag: Tag }) {
  const upsert = useStore((s) => s.upsertTag);
  const del = useStore((s) => s.deleteTag);
  const lang = useStore((s) => s.settings.language);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [alias, setAlias] = useState(tag.alias ?? "");
  const [color, setColor] = useState(tag.color);
  const [keywords, setKeywords] = useState(tag.keywords.join(", "));

  function save() {
    upsert({
      id: tag.id,
      name: name.trim() || tag.name,
      alias: alias.trim() || undefined,
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
        <span className="w-3 h-3 rounded" style={{ background: tag.color }} />
        <span className="text-[13px] flex-1">{tag.name}</span>
        {tag.alias && (
          <span className="text-[11px] text-subink">#{tag.alias}</span>
        )}
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
    <div className="p-2 rounded border border-accent/30 bg-accent/5 space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(lang, "tagNamePh")}
          className="flex-1 px-2 py-1 rounded border border-black/10 text-[12px] outline-none focus:border-accent"
        />
        <input
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder={t(lang, "aliasPh")}
          className="flex-1 px-2 py-1 rounded border border-black/10 text-[12px] outline-none focus:border-accent"
        />
      </div>
      <div className="flex items-center gap-1">
        {DEFAULT_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`w-5 h-5 rounded ${color === c ? "ring-2 ring-offset-1 ring-accent" : ""}`}
            style={{ background: c }}
          />
        ))}
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-6 h-6 border-none cursor-pointer"
        />
      </div>
      <textarea
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
        placeholder={t(lang, "keywordsPh")}
        rows={2}
        className="w-full px-2 py-1 rounded border border-black/10 text-[12px] outline-none focus:border-accent resize-none"
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
  const [alias, setAlias] = useState("");
  const [color, setColor] = useState(DEFAULT_COLORS[4]);
  const [keywords, setKeywords] = useState("");

  function reset() {
    setName("");
    setAlias("");
    setColor(DEFAULT_COLORS[4]);
    setKeywords("");
    setAdding(false);
  }

  function add() {
    if (!name.trim()) return;
    upsert({
      id: uuid(),
      name: name.trim(),
      alias: alias.trim() || undefined,
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
        <div className="p-2 rounded border border-accent/30 bg-accent/5 space-y-1.5 mb-2">
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(lang, "tagNamePh")}
              autoFocus
              className="flex-1 px-2 py-1 rounded border border-black/10 text-[12px] outline-none focus:border-accent"
            />
            <input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder={t(lang, "aliasPh")}
              className="flex-1 px-2 py-1 rounded border border-black/10 text-[12px] outline-none focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-1">
            {DEFAULT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-5 h-5 rounded ${color === c ? "ring-2 ring-offset-1 ring-accent" : ""}`}
                style={{ background: c }}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-6 h-6 border-none cursor-pointer"
            />
          </div>
          <textarea
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder={t(lang, "keywordsPh")}
            rows={2}
            className="w-full px-2 py-1 rounded border border-black/10 text-[12px] outline-none focus:border-accent resize-none"
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
