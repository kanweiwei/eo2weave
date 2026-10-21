export const storageStatusBanner = {
    cacheUnstable: "캐시가 불안정합니다",
    retry: "재시도",
} as const

export const pendingSync = {
    justNow: "방금",
    minutesAgo: "{count}분 전",
    hoursAgo: "{count}시간 전",
    create: "생성",
    modify: "수정",
    delete: "삭제",
    noActiveConversations: "활성 대화 없음",
    allChangesSynced: "모든 변경사항이 디스크에 저장됨",
    pendingCount: "대기 중 ({count})",
    syncAllToDisk: "확인된 모든 변경사항을 로컬 디스크에 저장",
    selectProjectFolder: "먼저 프로젝트 폴더를 선택하세요",
    syncing: "동기화 중...",
    sync: "동기화",
    syncComplete: "동기화 완료: {success} 성공",
    failed: "실패",
    skipped: "건너뜀",
    pendingChangesWillBeWritten:
      "이 변경사항은 로컬 파일에 기록됩니다. 올바른 프로젝트 폴더를 선택했는지 확인하세요.",
} as const
