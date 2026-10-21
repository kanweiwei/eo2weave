export const storageStatusBanner = {
    cacheUnstable: "缓存不稳定",
    retry: "重试",
} as const

export const pendingSync = {
    justNow: "刚刚",
    minutesAgo: "{count} 分钟前",
    hoursAgo: "{count} 小时前",
    create: "新建",
    modify: "修改",
    delete: "删除",
    noActiveConversations: "无活动对话",
    allChangesSynced: "所有修改已保存到本地",
    pendingCount: "待同步 ({count})",
    syncAllToDisk: "将所有待确认的修改保存到本地磁盘",
    selectProjectFolder: "请先选择项目文件夹",
    syncing: "同步中...",
    sync: "同步",
    syncComplete: "同步完成: {success} 成功",
    failed: "失败",
    skipped: "跳过",
    pendingChangesWillBeWritten:
      "确认后，这些修改将写入你的本地文件。请确保已选择正确的项目文件夹。",
} as const
