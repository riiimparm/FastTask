import { z } from "zod";
import { api, call, defined } from "./api.js";

const id = z.string().min(1).describe("タスクID");
const due = z.string().nullable().optional().describe("期限。YYYY-MM-DD。null で消す");
const tags = z.array(z.string()).optional().describe("タグのIDまたは名前");

function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function registerTools(server) {
  server.registerTool(
    "search_tasks",
    {
      description:
        "タスクを探す。画面の検索・タグ絞り込み・プロジェクト・期限・MUST/PENDING に相当する。未完了も完了も対象にできる。並びは画面と同じ親子順。",
      inputSchema: {
        query: z.string().optional().describe("空白区切りのAND検索。タイトル本文・プロジェクト名・タグ名"),
        status: z.enum(["todo", "done"]).optional().describe("未完了 todo / 完了 done。省略時は両方"),
        project: z.string().optional().describe("プロジェクト名。未分類は none"),
        tags: tags.describe("いずれかに一致すればよい（OR）"),
        due: z.enum(["today", "overdue", "upcoming", "none"]).or(z.string()).optional()
          .describe("today / overdue / upcoming / none / YYYY-MM-DD"),
        must: z.boolean().optional().describe("MUST（isMinimum、または今日が期限の未完了）"),
        pending: z.boolean().optional().describe("確認待ち"),
        parentId: z.string().optional().describe("親タスクID。直下だけ。ルートは none"),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => call("GET", `/tasks${query({
      q: args.query,
      status: args.status,
      project: args.project,
      tag: args.tags,
      due: args.due,
      must: args.must,
      pending: args.pending,
      parent: args.parentId,
      order: "ui",
    })}`),
  );

  server.registerTool(
    "get_task",
    {
      description: "タスクを1件取得する。子タスクのIDは parentId で search_tasks する。",
      inputSchema: { id },
      annotations: { readOnlyHint: true },
    },
    async (args) => call("GET", `/tasks/${encodeURIComponent(args.id)}`),
  );

  server.registerTool(
    "add_tasks",
    {
      description:
        "タスクを追加する。text は画面の入力欄と同じ（`:プロジェクト タイトル, もう一件 https://... 明日`）。カンマで複数になり、2件目以降は先頭のプロジェクトを引き継ぐ。tasks はフィールドを分けて渡すときに使う。",
      inputSchema: {
        text: z.string().optional().describe("入力欄と同じ1行。複数はカンマ区切り"),
        tasks: z.array(z.object({
          title: z.string().describe("タイトル"),
          project: z.string().optional().describe("プロジェクト名（空白なし）"),
          dueDate: z.string().optional().describe("YYYY-MM-DD"),
          url: z.string().optional(),
          tags: tags,
          parentId: z.string().optional().describe("同じプロジェクトの親。深さは5段まで"),
          must: z.boolean().optional().describe("MUST（最低限）"),
          pending: z.boolean().optional().describe("確認待ち"),
        })).optional(),
        dueDate: z.string().optional().describe("text モードの期限。省略時は文中の日付"),
        url: z.string().optional(),
        tags: tags,
        project: z.string().optional(),
        parentId: z.string().optional(),
        must: z.boolean().optional(),
        pending: z.boolean().optional(),
      },
    },
    async (args) => {
      if (args.text && args.tasks) {
        return { isError: true, content: [{ type: "text", text: "text と tasks は同時に指定できません" }] };
      }
      if (args.text) {
        return call("POST", "/tasks/batch", defined({
          text: args.text,
          dueDate: args.dueDate,
          url: args.url,
          tags: args.tags,
          projectName: args.project,
          parentId: args.parentId,
          isMinimum: args.must,
          isPending: args.pending,
        }));
      }
      if (args.tasks?.length) {
        return call("POST", "/tasks/batch", {
          tasks: args.tasks.map((task) => defined({
            title: task.title,
            projectName: task.project,
            dueDate: task.dueDate,
            url: task.url,
            tags: task.tags,
            parentId: task.parentId,
            isMinimum: task.must,
            isPending: task.pending,
          })),
        });
      }
      return { isError: true, content: [{ type: "text", text: "text または tasks が必要です" }] };
    },
  );

  server.registerTool(
    "edit_task",
    {
      description:
        "タスクのタイトル、プロジェクト、期限、URL、タグ、MUST、確認待ち、親を変える。タイトルは画面の編集と同じく `:プロジェクト`、URL、日付を解釈する。MUST と確認待ちは子タスクにも伝わる。parentId を null にするとインデントを外す。",
      inputSchema: {
        id,
        title: z.string().optional(),
        parseTitle: z.boolean().optional().describe("false のときタイトル文字列をそのまま保存する。既定は true"),
        project: z.string().nullable().optional().describe("プロジェクト名。null で未分類"),
        dueDate: due,
        url: z.string().nullable().optional().describe("null でURLを消す"),
        tags: tags.describe("タグをこの一覧で置き換える"),
        addTags: tags.describe("既存タグに足す"),
        removeTags: tags.describe("既存タグから外す"),
        must: z.boolean().optional(),
        pending: z.boolean().optional(),
        parentId: z.string().nullable().optional().describe("同じプロジェクトの親。null で外す"),
      },
    },
    async (args) => {
      const patch = defined({
        title: args.title,
        parseTitle: args.title === undefined ? undefined : args.parseTitle !== false,
        projectName: args.project,
        dueDate: args.dueDate,
        url: args.url,
        tags: args.tags,
        isMinimum: args.must,
        isPending: args.pending,
        parentId: args.parentId,
      });
      if (args.addTags || args.removeTags) {
        try {
          const [current, listed] = await Promise.all([
            api("GET", `/tasks/${encodeURIComponent(args.id)}`),
            api("GET", "/tags"),
          ]);
          const known = listed.tags ?? [];
          const resolve = (value) => {
            const hit = known.find((tag) => tag.id === value || tag.name === value);
            return hit ? hit.id : value;
          };
          let next = (Array.isArray(args.tags) ? args.tags : (current.tags ?? [])).map(resolve);
          for (const tag of args.addTags ?? []) {
            const resolved = resolve(tag);
            if (!next.includes(resolved)) next.push(resolved);
          }
          const removing = new Set((args.removeTags ?? []).map(resolve));
          next = next.filter((tag) => !removing.has(resolve(tag)));
          patch.tags = next;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { isError: true, content: [{ type: "text", text: message }] };
        }
      }
      return call("PATCH", `/tasks/${encodeURIComponent(args.id)}`, patch);
    },
  );

  server.registerTool(
    "set_task_status",
    {
      description:
        "完了または未完了に戻す。画面のチェックと同じく、未完了の子がいる親は cascade なしでは完了できない（children pending）。cascade を true にすると子もまとめて完了する。未完了へ戻すのは指定したタスクだけで、子は戻さない。",
      inputSchema: {
        id: z.string().optional(),
        ids: z.array(z.string()).optional().describe("複数まとめて変える"),
        status: z.enum(["done", "todo", "toggle"]).describe("done 完了 / todo 未完了 / toggle 反転"),
        cascade: z.boolean().optional().describe("完了時に子孫も完了する。既定は false"),
      },
    },
    async (args) => call("POST", "/tasks/status", defined({
      id: args.id,
      ids: args.ids,
      status: args.status,
      cascade: args.cascade,
    })),
  );

  server.registerTool(
    "delete_tasks",
    {
      description: "タスクを削除する。子タスクもまとめて消える。画面の削除と同じ。",
      inputSchema: {
        id: z.string().optional(),
        ids: z.array(z.string()).optional(),
      },
      annotations: { destructiveHint: true },
    },
    async (args) => call("POST", "/tasks/delete", defined({ id: args.id, ids: args.ids })),
  );

  server.registerTool(
    "reorder_tasks",
    {
      description:
        "未完了タスクの並びを変える。ids は新しい順のタスクID。親より前に動いた子は、画面のドラッグと同じく親子が外れる。",
      inputSchema: {
        ids: z.array(z.string()).min(1).describe("新しい順のタスクID"),
      },
    },
    async (args) => call("POST", "/tasks/reorder", { ids: args.ids }),
  );

  server.registerTool(
    "reorder_projects",
    {
      description: "プロジェクト見出しの並びを変える。未分類は null。一覧に無いプロジェクトは末尾に残る。",
      inputSchema: {
        projects: z.array(z.string().nullable()).describe("プロジェクト名の新しい順。未分類は null"),
      },
    },
    async (args) => call("POST", "/projects/reorder", { projects: args.projects }),
  );

  server.registerTool(
    "list_tags",
    {
      description: "タグマスタ（名前、色、自動付与キーワード）を取得する。",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => call("GET", "/tags"),
  );

  server.registerTool(
    "save_tag",
    {
      description:
        "タグを作る、または名前・色・キーワードを更新する。id があればそのタグ、なければ同じ名前のタグを更新し、無ければ新規作成。キーワードに合う既存タスクへタグが付く。",
      inputSchema: {
        id: z.string().optional(),
        name: z.string().optional().describe("新規のときは必須"),
        color: z.string().optional().describe("#RRGGBB。省略時はグレー"),
        keywords: z.array(z.string()).optional().describe("タイトルに含まれると自動で付く語"),
      },
    },
    async (args) => {
      const body = defined({ name: args.name, color: args.color, keywords: args.keywords });
      if (args.id) return call("PATCH", `/tags/${encodeURIComponent(args.id)}`, body);
      try {
        const listed = await api("GET", "/tags");
        const same = (listed.tags ?? []).filter((tag) => tag.name === args.name);
        if (same.length === 1) {
          return call("PATCH", `/tags/${encodeURIComponent(same[0].id)}`, body);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { isError: true, content: [{ type: "text", text: message }] };
      }
      return call("POST", "/tags", body);
    },
  );

  server.registerTool(
    "delete_tag",
    {
      description: "タグを削除し、全タスクからそのタグを外す。",
      inputSchema: {
        id: z.string().optional(),
        name: z.string().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async (args) => {
      let tagId = args.id;
      if (!tagId && args.name) {
        try {
          const listed = await api("GET", "/tags");
          const same = (listed.tags ?? []).filter((tag) => tag.name === args.name);
          if (same.length !== 1) {
            return { isError: true, content: [{ type: "text", text: same.length === 0 ? "tag not found" : "tag name is ambiguous" }] };
          }
          tagId = same[0].id;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { isError: true, content: [{ type: "text", text: message }] };
        }
      }
      if (!tagId) {
        return { isError: true, content: [{ type: "text", text: "id or name is required" }] };
      }
      return call("DELETE", `/tags/${encodeURIComponent(tagId)}`);
    },
  );

  server.registerTool(
    "get_settings",
    {
      description: "表示・テーマ・言語・フォーカス記録などの設定を取得する。",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => call("GET", "/settings"),
  );

  server.registerTool(
    "update_settings",
    {
      description:
        "設定を部分更新する。テーマ、言語、グループ表示、コピー時のグループ、期限表示、タグ、URL、効果音、フォーカスの分数、フォーカスのショートカット文字列。ショートカットのOS登録は起動中のアプリが受け取る。",
      inputSchema: {
        theme: z.enum(["light", "dark", "system"]).optional(),
        language: z.enum(["ja", "en"]).optional(),
        groupingEnabled: z.boolean().optional().describe("プロジェクト見出し"),
        copyGroupingEnabled: z.boolean().optional().describe("コピー時にプロジェクト見出しを付ける"),
        showDueDate: z.boolean().optional(),
        tagsEnabled: z.boolean().optional(),
        urlEnabled: z.boolean().optional(),
        soundEnabled: z.boolean().optional(),
        focusShortcut: z.string().optional().describe("例: CommandOrControl+Shift+F。空文字で解除"),
        lastFocusMinutes: z.number().int().min(1).max(120).optional(),
      },
    },
    async (args) => call("PATCH", "/settings", defined(args)),
  );

  server.registerTool(
    "copy_list",
    {
      description:
        "画面のコピーメニューと同じ Markdown を返す。today は今日完了、all は完了全部、todo は未完了（親子のインデント付き）。",
      inputSchema: {
        target: z.enum(["today", "all", "todo"]),
        grouping: z.boolean().optional(),
        includeUrl: z.boolean().optional(),
        language: z.enum(["ja", "en"]).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const result = await call("GET", `/export${query({
        target: args.target,
        grouping: args.grouping,
        url: args.includeUrl,
        lang: args.language,
      })}`);
      if (result.isError) return result;
      try {
        const parsed = JSON.parse(result.content[0].text);
        return { content: [{ type: "text", text: parsed.markdown ?? result.content[0].text }] };
      } catch {
        return result;
      }
    },
  );

  server.registerTool(
    "daily_result",
    {
      description: "画面のリザルトと同じ集計。完了数、達成率、MUST、フォーカス時間、連続日数、今日のタイプ、共有用テキスト。",
      inputSchema: {
        date: z.string().optional().describe("YYYY-MM-DD。省略時は今日"),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => call("GET", `/result${query({ date: args.date })}`),
  );

  server.registerTool(
    "record_focus",
    {
      description: "フォーカス時間をその日の記録に足す。画面でタイマーを終えたときに保存されるのと同じ項目。分単位。",
      inputSchema: {
        minutes: z.number().positive().max(1440),
        date: z.string().optional().describe("YYYY-MM-DD。省略時は今日"),
      },
    },
    async (args) => call("POST", "/focus", defined({ minutes: args.minutes, date: args.date })),
  );

  server.registerTool(
    "clear_all_data",
    {
      description: "タスクとタグをすべて削除する。設定は残る。confirm に delete と渡したときだけ実行する。",
      inputSchema: {
        confirm: z.literal("delete").describe("実行するときは delete"),
      },
      annotations: { destructiveHint: true },
    },
    async (args) => call("POST", "/data/clear", { confirm: args.confirm }),
  );

  server.registerTool(
    "google_sync",
    {
      description:
        "Google カレンダー / Google ToDo 連携。status は接続状態、update は同期スイッチとカレンダーID・タスクリストID、push は今すぐ同期、tasklists はタスクリスト一覧。クライアントシークレットと接続（ブラウザログイン）はアプリの設定画面だけで行う。",
      inputSchema: {
        action: z.enum(["status", "update", "push", "tasklists"]),
        autoPush: z.boolean().optional(),
        pushCalendar: z.boolean().optional(),
        pushTasks: z.boolean().optional(),
        calendarId: z.string().optional(),
        tasklistId: z.string().optional(),
        clientId: z.string().optional().describe("OAuth クライアントID。シークレットは受け取らない"),
      },
    },
    async (args) => {
      if (args.action === "status") return call("GET", "/google");
      if (args.action === "push") return call("POST", "/google/push");
      if (args.action === "tasklists") return call("GET", "/google/tasklists");
      const patch = defined({
        autoPush: args.autoPush,
        pushCalendar: args.pushCalendar,
        pushTasks: args.pushTasks,
        calendarId: args.calendarId,
        tasklistId: args.tasklistId,
        clientId: args.clientId,
      });
      if (Object.keys(patch).length === 0) {
        return { isError: true, content: [{ type: "text", text: "update する項目がありません" }] };
      }
      return call("PATCH", "/google", patch);
    },
  );
}
