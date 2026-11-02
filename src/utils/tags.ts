/**
 * 既存のタグ順を保ったまま、新しくマッチした自動タグのみを末尾に追加する。
 * タスク編集時にタグを丸ごと再計算すると、タグマスタの登録順に並び替わり
 * 手動で付けたタグも消えるため、マージして順序を保持する。
 */
export function mergeAutoTags(existing: string[], matched: string[]): string[] {
  const seen = new Set(existing);
  return [...existing, ...matched.filter((id) => !seen.has(id))];
}
