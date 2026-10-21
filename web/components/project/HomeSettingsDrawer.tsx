'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Check,
  Copy,
  Database,
  Download,
  Globe,
  HardDrive,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  Stethoscope,
  Sun,
  Upload,
  X,
} from 'lucide-react'
import {
  BrandButton,
  BrandDialog,
  BrandDialogBody,
  BrandDialogContent,
  BrandDialogFooter,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandInput,
} from '@creatorweave/ui'
import { useT, useLocale, LOCALE_LABELS, type Locale } from '@/i18n'
import { useTheme, ACCENT_COLORS, type AccentColor } from '@/store/theme.store'
import { runDiagnostics, copyMarkdownToClipboard } from '@/storage/diagnostics'
import { RESET_REQUIRES_TAB_CLOSURE } from '@/storage/init'
import { getRuntimeCapability } from '@/storage/runtime-capability'
import { vacuumDatabase } from '@/storage/vacuum'
import { formatBytes } from '@/lib/utils'
import { backupSettingsRepo, type BackupSettingsRecord } from '@/services/backup-settings.repository'

export interface HomeSettingsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onClearLocalData: () => void | Promise<void>
  isClearingLocalData?: boolean
}

/**
 * Right-side settings drawer for the homepage. Replaces the old left sidebar.
 *
 * Sections (top to bottom):
 *   - Theme mode (light / dark)
 *   - Language
 *   - Accent color
 *   - Advanced (collapsed): reset, data backup, import, backup-to-local,
 *     storage reclaim, diagnostics
 *
 * Each advanced action that opens a confirmation dialog manages its own dialog
 * state internally; the page-level clear-local-data handler is passed in.
 */
export function HomeSettingsDrawer({
  open,
  onOpenChange,
  onClearLocalData,
  isClearingLocalData = false,
}: HomeSettingsDrawerProps) {
  const t = useT()

  // ── Theme + locale ──
  const { mode: themeMode, setTheme, accentColor, setAccentColor } = useTheme()
  const [locale, setLocale] = useLocale()
  const currentAccentColor: AccentColor = accentColor || 'teal'

  // ── Reset (clear local data) ──
  const [showClearDataDialog, setShowClearDataDialog] = useState(false)
  const [clearDataConfirmText, setClearDataConfirmText] = useState('')
  const [isSubmittingClear, setIsSubmittingClear] = useState(false)

  // ── Service worker cache clear ──
  const [isClearingCache, setIsClearingCache] = useState(false)

  // ── Full OPFS backup / import ──
  const [isExportingDB, setIsExportingDB] = useState(false)
  const [isImportingDB, setIsImportingDB] = useState(false)
  const [importBackupFile, setImportBackupFile] = useState<File | null>(null)
  const [showExportConfirm, setShowExportConfirm] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  // ── Backup-to-local-directory (FS Access API) ──
  const [backupDirName, setBackupDirName] = useState<string | null>(null)
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null)
  const [isBackingUpToDir, setIsBackingUpToDir] = useState(false)
  const dirBackupSupported = getRuntimeCapability().canPickDirectory

  // ── Diagnostics ──
  const [diagOpen, setDiagOpen] = useState(false)
  const [diagRunning, setDiagRunning] = useState(false)
  const [diagReport, setDiagReport] = useState<string>('')
  const [diagCopied, setDiagCopied] = useState(false)

  // ── Storage usage + reclaim ──
  const [storageUsage, setStorageUsage] = useState<{ usage: number; quota: number } | null>(null)
  const [isReclaiming, setIsReclaiming] = useState(false)
  // Advanced items are shown flat in the drawer — no nested collapse toggle.

  // Reset transient state when drawer is closed (keeps it tidy between visits).
  useEffect(() => {
    if (open) return
    setShowClearDataDialog(false)
    setClearDataConfirmText('')
    setImportBackupFile(null)
    setShowExportConfirm(false)
    setDiagOpen(false)
    setDiagReport('')
  }, [open])

  // Load persisted backup-to-local settings when drawer opens.
  useEffect(() => {
    if (!open || !dirBackupSupported) return
    let cancelled = false
    backupSettingsRepo
      .load()
      .then((record: BackupSettingsRecord | null) => {
        if (cancelled || !record) return
        setBackupDirName(record.dirName)
        setLastBackupAt(record.lastBackupAt)
      })
      .catch(() => {
        /* IndexedDB unavailable — feature stays in unconfigured state */
      })
    return () => {
      cancelled = true
    }
  }, [open, dirBackupSupported])

  // Refresh storage usage whenever the drawer opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const estimate = async () => {
      try {
        const result = await navigator.storage.estimate()
        if (!cancelled) {
          setStorageUsage({ usage: result.usage ?? 0, quota: result.quota ?? 0 })
        }
      } catch {
        if (!cancelled) setStorageUsage(null)
      }
    }
    void estimate()
    return () => {
      cancelled = true
    }
  }, [open])

  // ── Action handlers ──

  const handleClearDataConfirm = async () => {
    const required = t('projectHome.dialogs.startFreshConfirmPlaceholder')
    if (clearDataConfirmText !== required || isSubmittingClear) return
    setIsSubmittingClear(true)
    try {
      await onClearLocalData()
      setShowClearDataDialog(false)
      setClearDataConfirmText('')
      onOpenChange(false)
    } finally {
      setIsSubmittingClear(false)
    }
  }

  const handleClearCache = async () => {
    if (!navigator.serviceWorker.controller) {
      toast.error(t('projectHome.dialogs.clearCacheUnavailable'))
      return
    }
    setIsClearingCache(true)
    navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    window.location.reload()
  }

  const performExportBackup = async () => {
    setIsExportingDB(true)
    const toastId = toast.loading(t('projectHome.sidebar.backingUp'))
    try {
      const { downloadOPFSBackup } = await import('@/opfs')
      const { filename, includesDeviceKey } = await downloadOPFSBackup()
      toast.success(
        includesDeviceKey
          ? t('app.backupSuccessWithKey', { filename })
          : t('app.backupSuccess', { filename }),
        { id: toastId, duration: includesDeviceKey ? 5000 : 10000 },
      )
      setShowExportConfirm(false)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('[HomeSettingsDrawer] Failed to export OPFS backup:', error)
      toast.error(t('app.backupFailed', { error: errorMsg }), {
        id: toastId,
        action: {
          label: t('projectHome.dialogs.retry'),
          onClick: () => void performExportBackup(),
        },
      })
    } finally {
      setIsExportingDB(false)
    }
  }

  const handleImportBackupSelected = () => {
    const input = importInputRef.current
    if (!input) return
    input.value = ''
    input.accept = '.zip'
    input.click()
  }

  const handleImportFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    if (file) setImportBackupFile(file)
    event.target.value = ''
  }

  const handleImportBackupConfirm = async () => {
    const file = importBackupFile
    if (!file) return
    setIsImportingDB(true)
    const toastId = toast.loading(t('projectHome.sidebar.restoringBackup'))
    try {
      const { importOPFSBackup } = await import('@/opfs')
      const { fileCount } = await importOPFSBackup(file)
      toast.success(t('app.restoreSuccess', { fileCount }), { id: toastId, duration: 8000 })
      setImportBackupFile(null)
      await new Promise((resolve) => setTimeout(resolve, 1200))
      window.location.reload()
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('[HomeSettingsDrawer] Failed to import OPFS backup:', error)
      const message = errorMsg.includes(RESET_REQUIRES_TAB_CLOSURE)
        ? t('app.clearFailedCloseOtherTabs')
        : t('app.restoreFailed', { error: errorMsg })
      toast.error(message, { id: toastId, duration: 10000 })
      setIsImportingDB(false)
    }
  }

  const handlePickBackupDirectory = async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
      const perm = await handle.queryPermission({ mode: 'readwrite' })
      if (perm !== 'granted') {
        const requested = await handle.requestPermission({ mode: 'readwrite' })
        if (requested !== 'granted') {
          toast.error(t('projectHome.sidebar.backupToLocal.permissionDenied'))
          return
        }
      }
      await backupSettingsRepo.save({
        id: 'backup-dir',
        dirHandle: handle,
        dirName: handle.name,
        lastBackupAt: null,
      })
      setBackupDirName(handle.name)
      setLastBackupAt(null)
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') {
        console.error('[HomeSettingsDrawer] Failed to pick backup directory:', error)
        toast.error(t('projectHome.sidebar.backupToLocal.pickFailed'))
      }
    }
  }

  const performDirectoryBackup = async () => {
    const record = await backupSettingsRepo.load()
    if (!record?.dirHandle) {
      toast.error(t('projectHome.sidebar.backupToLocal.pickDirectoryFirst'))
      return
    }
    const perm = await record.dirHandle.queryPermission({ mode: 'readwrite' })
    if (perm !== 'granted') {
      const requested = await record.dirHandle.requestPermission({ mode: 'readwrite' })
      if (requested !== 'granted') {
        toast.error(t('projectHome.sidebar.backupToLocal.permissionDenied'))
        return
      }
    }
    setIsBackingUpToDir(true)
    const toastId = toast.loading(t('projectHome.sidebar.backupToLocal.backingUp'))
    try {
      const { writeOPFSBackupToDirectory } = await import('@/opfs')
      await writeOPFSBackupToDirectory(record.dirHandle)
      const now = Date.now()
      await backupSettingsRepo.updateLastBackupAt(now)
      setLastBackupAt(now)
      toast.success(
        t('projectHome.sidebar.backupToLocal.success', { directory: record.dirName ?? '' }),
        { id: toastId },
      )
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('[HomeSettingsDrawer] Failed to write backup to directory:', error)
      toast.error(t('projectHome.sidebar.backupToLocal.failed', { error: errorMsg }), {
        id: toastId,
        duration: 10000,
      })
    } finally {
      setIsBackingUpToDir(false)
    }
  }

  const handleBackupDirPrimaryAction = async () => {
    if (!backupDirName) {
      await handlePickBackupDirectory()
      return
    }
    const record = await backupSettingsRepo.load()
    if (!record?.dirHandle) {
      await handlePickBackupDirectory()
      return
    }
    const perm = await record.dirHandle.queryPermission({ mode: 'readwrite' })
    if (perm === 'prompt') {
      const requested = await record.dirHandle.requestPermission({ mode: 'readwrite' })
      if (requested !== 'granted') {
        toast.error(t('projectHome.sidebar.backupToLocal.permissionDenied'))
        return
      }
    }
    await performDirectoryBackup()
  }

  const handleRunDiagnostics = async () => {
    setDiagOpen(true)
    setDiagRunning(true)
    setDiagReport('')
    setDiagCopied(false)
    try {
      const report = await runDiagnostics()
      setDiagReport(report.markdown)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setDiagReport(`${t('projectHome.dialogs.diagnosticsFailed')}\n\n${detail}`)
    } finally {
      setDiagRunning(false)
    }
  }

  const handleCopyReport = async () => {
    if (!diagReport) return
    const ok = await copyMarkdownToClipboard(diagReport)
    if (ok) {
      setDiagCopied(true)
      window.setTimeout(() => setDiagCopied(false), 2000)
    }
  }

  const handleReclaimStorage = async () => {
    if (isReclaiming) return
    setIsReclaiming(true)
    const toastId = toast.loading(t('projectHome.sidebar.storageReclaiming'))
    try {
      const reclaimed = await vacuumDatabase()
      if (reclaimed === null) {
        toast.error(t('projectHome.sidebar.storageReclaimFailed'), { id: toastId })
      } else if (reclaimed < 1024 * 1024) {
        toast.success(t('projectHome.sidebar.storageOptimal'), { id: toastId })
      } else {
        toast.success(
          t('projectHome.sidebar.storageReclaimed', { size: formatBytes(reclaimed) }),
          { id: toastId },
        )
      }
      // Refresh the usage readout.
      try {
        const estimate = await navigator.storage.estimate()
        setStorageUsage({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 })
      } catch {
        setStorageUsage(null)
      }
    } catch (error) {
      console.error('[HomeSettingsDrawer] Storage reclaim failed:', error)
      toast.error(t('projectHome.sidebar.storageReclaimFailed'), { id: toastId })
    } finally {
      setIsReclaiming(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Drawer panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('projectHome.drawer.title')}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-card shadow-xl transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-secondary">
            {t('projectHome.drawer.title')}
          </h2>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={() => onOpenChange(false)}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Appearance */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Palette className="h-3.5 w-3.5" />
              {t('projectHome.sidebar.appearance')}
            </div>

            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                {t('projectHome.theme.modeTitle')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border text-sm transition-all ${
                    themeMode === 'light'
                      ? 'border-primary/40 bg-primary-50 text-primary'
                      : 'border-border bg-card text-secondary hover:bg-muted'
                  }`}
                >
                  <Sun className="h-3.5 w-3.5" />
                  {t('projectHome.theme.light')}
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border text-sm transition-all ${
                    themeMode === 'dark'
                      ? 'border-primary/40 bg-primary-50 text-primary'
                      : 'border-border bg-card text-secondary hover:bg-muted'
                  }`}
                >
                  <Moon className="h-3.5 w-3.5" />
                  {t('projectHome.theme.dark')}
                </button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                {t('projectHome.theme.languageTitle')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(['zh-CN', 'en-US', 'ja-JP', 'ko-KR'] as Locale[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLocale(lang)}
                    className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs transition-all ${
                      locale === lang
                        ? 'border-primary/40 bg-primary-50 text-primary'
                        : 'border-border bg-card text-secondary hover:bg-muted'
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {LOCALE_LABELS[lang]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                {t('projectHome.theme.accentColorTitle')}
              </p>
              <div className="grid grid-cols-6 gap-2">
                {(Object.keys(ACCENT_COLORS) as AccentColor[]).map((color) => {
                  const config = ACCENT_COLORS[color]
                  const isSelected = currentAccentColor === color
                  const colorName = t(`projectHome.accentColors.${color}`)
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setAccentColor(color)}
                      title={colorName}
                      aria-label={colorName}
                      className={`h-9 rounded-lg transition-all ${
                        isSelected
                          ? 'ring-2 ring-offset-2 ring-offset-card'
                          : 'hover:ring-1 hover:ring-muted'
                      }`}
                      style={{
                        backgroundColor: `hsl(${config.hue}, ${config.saturation}%, ${config.lightness}%)`,
                        ['--tw-ring-color' as string]: `hsl(${config.hue}, ${config.saturation}%, ${config.lightness}%)`,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          </section>

          {/* Advanced — flat list, no collapse (the drawer itself is opt-in) */}
          <section className="mt-6">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              <span>{t('projectHome.sidebar.advanced')}</span>
            </div>
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  {t('projectHome.sidebar.advancedHint')}
                </p>

                {/* Reset (Start Fresh) */}
                <AdvancedItem
                  icon={<RotateCcw className="h-4 w-4" />}
                  title={t('projectHome.sidebar.startFresh')}
                  description={t('projectHome.sidebar.startFreshDescription')}
                >
                  <BrandButton
                    variant="outline"
                    onClick={() => setShowClearDataDialog(true)}
                    disabled={isClearingLocalData}
                    className="w-full text-xs"
                  >
                    {isClearingLocalData
                      ? t('projectHome.sidebar.resetting')
                      : t('projectHome.sidebar.resetApp')}
                  </BrandButton>
                </AdvancedItem>

                {/* Clear Service Worker cache */}
                <AdvancedItem
                  icon={<RefreshCw className="h-4 w-4" />}
                  title={t('projectHome.sidebar.cache')}
                  description={t('projectHome.sidebar.cacheDescription')}
                >
                  <BrandButton
                    variant="outline"
                    onClick={() => void handleClearCache()}
                    disabled={isClearingCache}
                    className="w-full text-xs"
                  >
                    {isClearingCache
                      ? t('projectHome.sidebar.clearing')
                      : t('projectHome.sidebar.clearCache')}
                  </BrandButton>
                </AdvancedItem>

                {/* Data backup (export / import) */}
                <AdvancedItem
                  icon={<Download className="h-4 w-4" />}
                  title={t('projectHome.sidebar.backup')}
                  description={t('projectHome.sidebar.backupDescription')}
                >
                  <div className="flex flex-col gap-2">
                    <BrandButton
                      variant="outline"
                      onClick={() => setShowExportConfirm(true)}
                      disabled={isExportingDB || isImportingDB}
                      className="w-full text-xs"
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      {t('projectHome.sidebar.exportBackup')}
                    </BrandButton>
                    <BrandButton
                      variant="outline"
                      onClick={handleImportBackupSelected}
                      disabled={isExportingDB || isImportingDB}
                      className="w-full text-xs"
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      {t('projectHome.sidebar.importBackup')}
                    </BrandButton>
                  </div>
                </AdvancedItem>

                {/* Backup to local directory (FS Access API only) */}
                {dirBackupSupported && (
                  <AdvancedItem
                    icon={<HardDrive className="h-4 w-4" />}
                    title={t('projectHome.sidebar.backupToLocal.title')}
                    description={t('projectHome.sidebar.backupToLocal.description')}
                  >
                    {backupDirName && (
                      <div className="mb-2 space-y-0.5 text-xs text-muted-foreground">
                        <div>
                          {t('projectHome.sidebar.backupToLocal.directoryLabel')}:{' '}
                          <span className="text-secondary">{backupDirName}</span>
                        </div>
                        {lastBackupAt && (
                          <div>
                            {t('projectHome.sidebar.backupToLocal.lastBackupAt', {
                              time: new Date(lastBackupAt).toLocaleString(),
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <BrandButton
                        variant="outline"
                        onClick={() => void handleBackupDirPrimaryAction()}
                        disabled={isBackingUpToDir || isExportingDB || isImportingDB}
                        className="w-full text-xs"
                      >
                        <HardDrive className="mr-1.5 h-3.5 w-3.5" />
                        {isBackingUpToDir
                          ? t('projectHome.sidebar.backupToLocal.backingUp')
                          : backupDirName
                            ? t('projectHome.sidebar.backupToLocal.backupNow')
                            : t('projectHome.sidebar.backupToLocal.pickDirectory')}
                      </BrandButton>
                      {backupDirName && (
                        <BrandButton
                          variant="ghost"
                          onClick={() => void handlePickBackupDirectory()}
                          disabled={isBackingUpToDir || isExportingDB || isImportingDB}
                          className="w-full text-xs text-muted-foreground"
                        >
                          {t('projectHome.sidebar.backupToLocal.changeDirectory')}
                        </BrandButton>
                      )}
                    </div>
                  </AdvancedItem>
                )}

                {/* Storage */}
                <AdvancedItem
                  icon={<Database className="h-4 w-4" />}
                  title={t('projectHome.sidebar.storage')}
                  description={t('projectHome.sidebar.storageDescription')}
                >
                  {storageUsage && storageUsage.quota > 0 && (
                    <div className="mb-2 text-xs text-muted-foreground">
                      {formatBytes(storageUsage.usage)} / {formatBytes(storageUsage.quota)}{' '}
                      ({((storageUsage.usage / storageUsage.quota) * 100).toFixed(1)}%)
                    </div>
                  )}
                  <BrandButton
                    variant="outline"
                    onClick={() => void handleReclaimStorage()}
                    disabled={isReclaiming}
                    className="w-full text-xs"
                  >
                    <Database className="mr-1.5 h-3.5 w-3.5" />
                    {isReclaiming
                      ? t('projectHome.sidebar.storageReclaiming')
                      : t('projectHome.sidebar.storageReclaim')}
                  </BrandButton>
                </AdvancedItem>

                {/* Diagnostics */}
                <AdvancedItem
                  icon={<Stethoscope className="h-4 w-4" />}
                  title={t('projectHome.sidebar.diagnostics')}
                  description={t('projectHome.sidebar.diagnosticsDescription')}
                >
                  <BrandButton
                    variant="outline"
                    onClick={() => void handleRunDiagnostics()}
                    disabled={diagRunning}
                    className="w-full text-xs"
                  >
                    <Stethoscope className="mr-1.5 h-3.5 w-3.5" />
                    {diagRunning
                      ? t('projectHome.dialogs.diagnosticsInProgress')
                      : t('projectHome.sidebar.runDiagnostics')}
                  </BrandButton>
                </AdvancedItem>
              </div>
          </section>
        </div>
      </aside>

      {/* Hidden file input for backup import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={handleImportFileChange}
      />

      {/* Reset / start fresh confirmation */}
      <BrandDialog
        modal
        open={showClearDataDialog}
        onOpenChange={(next) => {
          if (!next && !isSubmittingClear) {
            setShowClearDataDialog(false)
            setClearDataConfirmText('')
          }
        }}
      >
        <BrandDialogContent className="max-w-md">
          <BrandDialogHeader>
            <BrandDialogTitle>{t('projectHome.dialogs.startFreshTitle')}</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="mb-4 text-sm text-secondary">
              {t('projectHome.dialogs.startFreshDescription')}
            </p>
            <ul className="mb-4 space-y-2 pl-4 text-sm text-secondary">
              <li>• {t('projectHome.dialogs.startFreshItems.projects')}</li>
              <li>• {t('projectHome.dialogs.startFreshItems.conversations')}</li>
              <li>• {t('projectHome.dialogs.startFreshItems.files')}</li>
            </ul>
            <p className="mb-4 text-sm text-secondary">
              {t('projectHome.dialogs.startFreshNote')}
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              {t('projectHome.dialogs.startFreshConfirmHint')}
            </p>
            <BrandInput
              value={clearDataConfirmText}
              onChange={(event) => setClearDataConfirmText(event.target.value)}
              placeholder={t('projectHome.dialogs.startFreshConfirmPlaceholder')}
              disabled={isSubmittingClear}
            />
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="ghost"
              onClick={() => {
                setShowClearDataDialog(false)
                setClearDataConfirmText('')
              }}
              disabled={isSubmittingClear}
            >
              {t('common.cancel')}
            </BrandButton>
            <BrandButton
              variant="danger"
              onClick={() => void handleClearDataConfirm()}
              disabled={
                isSubmittingClear ||
                clearDataConfirmText !== t('projectHome.dialogs.startFreshConfirmPlaceholder')
              }
            >
              {isSubmittingClear
                ? t('projectHome.dialogs.resetting')
                : t('projectHome.dialogs.confirmReset')}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      {/* Export backup confirmation */}
      <BrandDialog
        modal
        open={showExportConfirm}
        onOpenChange={(next) => {
          if (!next && !isExportingDB) setShowExportConfirm(false)
        }}
      >
        <BrandDialogContent className="max-w-md">
          <BrandDialogHeader>
            <BrandDialogTitle>{t('projectHome.dialogs.exportBackupTitle')}</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-sm text-secondary">
                {t('projectHome.dialogs.exportBackupSensitive')}
              </p>
            </div>
            <p className="text-sm text-secondary">
              {t('projectHome.dialogs.exportBackupHint')}
            </p>
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="ghost"
              onClick={() => setShowExportConfirm(false)}
              disabled={isExportingDB}
            >
              {t('common.cancel')}
            </BrandButton>
            <BrandButton onClick={() => void performExportBackup()} disabled={isExportingDB}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {isExportingDB
                ? t('projectHome.sidebar.backingUp')
                : t('projectHome.dialogs.exportBackupConfirm')}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      {/* Import backup confirmation */}
      <BrandDialog
        modal
        open={importBackupFile !== null}
        onOpenChange={(next) => {
          if (!next && !isImportingDB) setImportBackupFile(null)
        }}
      >
        <BrandDialogContent className="max-w-md">
          <BrandDialogHeader>
            <BrandDialogTitle>{t('projectHome.dialogs.importBackupTitle')}</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-sm text-secondary">
                {t('projectHome.dialogs.importBackupWarning')}
              </p>
            </div>
            <p className="mb-4 text-sm text-secondary">
              {t('projectHome.dialogs.importBackupFile', {
                name: importBackupFile?.name ?? '',
              })}
            </p>
            <p className="mb-4 text-sm text-secondary">
              {t('projectHome.dialogs.importBackupHint')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('projectHome.dialogs.importBackupSecurityNote')}
            </p>
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="ghost"
              onClick={() => setImportBackupFile(null)}
              disabled={isImportingDB}
            >
              {t('common.cancel')}
            </BrandButton>
            <BrandButton
              variant="danger"
              onClick={() => void handleImportBackupConfirm()}
              disabled={isImportingDB}
            >
              {isImportingDB
                ? t('projectHome.sidebar.restoringBackup')
                : t('projectHome.dialogs.importBackupConfirm')}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      {/* Diagnostics */}
      <BrandDialog open={diagOpen} onOpenChange={setDiagOpen}>
        <BrandDialogContent className="max-w-2xl">
          <BrandDialogHeader>
            <BrandDialogTitle>{t('projectHome.dialogs.diagnosticsTitle')}</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            {diagRunning ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-sm text-secondary">
                  {t('projectHome.dialogs.diagnosticsRunning')}
                </span>
              </div>
            ) : (
              <>
                <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-secondary">
                  {diagReport}
                </pre>
                <p className="mt-3 text-xs text-muted-foreground">
                  {t('projectHome.dialogs.diagnosticsHint')}
                </p>
              </>
            )}
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton variant="ghost" onClick={() => setDiagOpen(false)} disabled={diagRunning}>
              {t('common.close')}
            </BrandButton>
            <BrandButton
              variant="primary"
              onClick={() => void handleCopyReport()}
              disabled={diagRunning || !diagReport}
            >
              {diagCopied ? (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  {t('projectHome.dialogs.copied')}
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  {t('projectHome.dialogs.copyReport')}
                </>
              )}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>
    </>
  )
}

interface AdvancedItemProps {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}

function AdvancedItem({ icon, title, description, children }: AdvancedItemProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-secondary">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">{description}</p>
      {children}
    </div>
  )
}