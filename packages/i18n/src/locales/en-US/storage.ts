export const storageStatusBanner = {
    cacheUnstable: "Cache is unstable",
    retry: "Retry",
} as const

export const pendingSync = {
    justNow: "Just now",
    minutesAgo: "{count} min ago",
    hoursAgo: "{count} hr ago",
    create: "Create",
    modify: "Modify",
    delete: "Delete",
    noActiveConversations: "No active conversations",
    allChangesSynced: "All changes saved to disk",
    pendingCount: "Pending ({count})",
    syncAllToDisk: "Save all confirmed changes to local disk",
    selectProjectFolder: "Please select a project folder first",
    syncing: "Syncing...",
    sync: "Sync",
    syncComplete: "Sync complete: {success} success",
    failed: "failed",
    skipped: "skipped",
    pendingChangesWillBeWritten:
      "These changes will be written to your local files. Make sure you've selected the correct project folder.",
} as const
