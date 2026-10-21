export const storageStatusBanner = {
    cacheUnstable: "キャッシュが不安定です",
    retry: "再試行",
} as const

export const pendingSync = {
    justNow: "たった今",
    minutesAgo: "{count}分前",
    hoursAgo: "{count}時間前",
    create: "作成",
    modify: "変更",
    delete: "削除",
    noActiveConversations: "アクティブな会話がありません",
    allChangesSynced: "すべての変更をディスクに保存しました",
    pendingCount: "保留中 ({count})",
    syncAllToDisk: "確認済みのすべての変更をローカルディスクに保存",
    selectProjectFolder: "先にプロジェクトフォルダを選択してください",
    syncing: "同期中...",
    sync: "同期",
    syncComplete: "同期完了: {success} 成功",
    failed: "失敗",
    skipped: "スキップ",
    pendingChangesWillBeWritten:
      "これらの変更はローカルファイルに書き込まれます。正しいプロジェクトフォルダが選択されていることを確認してください。",
} as const
