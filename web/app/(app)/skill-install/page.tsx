'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Package,
  Wallet,
  XCircle,
} from 'lucide-react'
import { useT } from '@/i18n'
import {
  fetchSkillStoreManifest,
  installSkillFromUrl,
  scanInstalledDirNames,
  type InstallProgress,
  type SkillStoreEntry,
} from '@/skills/skill-store'
import { getSkillManager } from '@/skills/skill-manager'
import { useProjectStore } from '@/store/project.store'
import { useConversationStore } from '@/store/conversation.store'
import { useConversationContextStore } from '@/store/conversation-context.store'
import { checkAiReadiness, buildPrefillText, pickConversationTarget, waitForCondition } from '@/lib/skill-install-flow'
import { projectWorkspacePath } from '@/lib/route-paths'
import { getNutstoreAIConsoleURL } from '@/lib/jianguoyun-ai-console'
import { useGatewayLogin } from '@/hooks/useGatewayLogin'

/**
 * Skill promotion landing page: /skill-install?skill=<dirName>[&prompt=...]
 *
 * State machine (issue #126):
 *   1. Show skill details + "Install" button — MUST be user-clicked (the
 *      install pipeline's importUserSkillZip writes OPFS entries; the
 *      folder-pick page already proved gesture-restricted APIs do not
 *      survive an auto-flow).
 *   2. Install via installSkillFromUrl('/skills/{dirName}.zip'); idempotent
 *      (already installed → show "already installed" and skip). After a
 *      fresh install, SkillManager.refreshUserSkills() registers the slash
 *      command immediately.
 *   3. AI readiness (auto-skipping): gateway token or any provider key →
 *      skip; otherwise inline device-code login with a "skip for now"
 *      escape — skipping still reaches the conversation (the 401 chain +
 *      re-login error card backstop the first send).
 *   4. Navigate: most recent workspace by lastAccessedAt, else createNew().
 *      No projectId is passed — AppBootstrap's auto-default owns first-visit
 *      project creation; duplicating it would conflict.
 *   5. Prefill the input with /{skill-name} (+ prompt suffix) via the
 *      input-draft store, which ConversationView restores into the editor
 *      through AgentRichInput's initialText pipeline.
 */

type Phase =
  | 'loading'
  | 'error'
  | 'details'
  | 'installing'
  | 'login'
  | 'starting'

type ErrorKind = 'missing-param' | 'not-found' | 'load-failed'

interface InstallOutcome {
  alreadyInstalled: boolean
}

function SkillInstallView() {
  const t = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const skillParam = searchParams.get('skill')
  const promptParam = searchParams.get('prompt')

  const [phase, setPhase] = useState<Phase>('loading')
  const [errorKind, setErrorKind] = useState<ErrorKind>('load-failed')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [entry, setEntry] = useState<SkillStoreEntry | null>(null)
  const [alreadyInstalled, setAlreadyInstalled] = useState(false)
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null)
  const [creditExhausted, setCreditExhausted] = useState(false)
  const installStartedRef = useRef(false)

  // Inline device-code login (same hook as WelcomeScreen).
  const {
    authState,
    isRunning: isLoginRunning,
    login: gatewayLogin,
    reset: resetGatewayLogin,
  } = useGatewayLogin()

  const loadEntry = useCallback(async () => {
    setPhase('loading')
    setErrorKind('load-failed')
    setErrorMessage(null)
    setEntry(null)
    setAlreadyInstalled(false)
    if (!skillParam) {
      setErrorKind('missing-param')
      setPhase('error')
      return
    }
    try {
      const manifest = await fetchSkillStoreManifest()
      const found = manifest.skills.find((s) => s.dirName === skillParam)
      if (!found) {
        setErrorKind('not-found')
        setPhase('error')
        return
      }
      const installed = await scanInstalledDirNames()
      setEntry(found)
      setAlreadyInstalled(installed.has(found.dirName))
      setPhase('details')
    } catch (e) {
      setErrorKind('load-failed')
      setErrorMessage(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }, [skillParam])

  useEffect(() => {
    void loadEntry()
  }, [loadEntry])

  // ── Steps 3-5: readiness → navigate → prefill ─────────────────────

  const continueToConversation = useCallback(
    async (skillName: string) => {
      setPhase('starting')
      // AppBootstrap owns project auto-default; wait for the project store
      // to surface it instead of creating a project here (issue #126
      // decision: duplicate creation conflicts).
      const projectReady = await waitForCondition(
        () => {
          const s = useProjectStore.getState()
          return s.initialized && !!s.activeProjectId
        },
      )
      if (!projectReady) {
        setPhase('details')
        setErrorMessage(t('skillInstall.startFailed'))
        return
      }

      // Navigation target: most recent workspace, else a fresh conversation.
      // conversationId === workspaceId in this app, so createNew()'s id is
      // directly usable as the URL's workspaceId.
      const target = pickConversationTarget(
        useConversationContextStore.getState().workspaces,
        () => createConversationForVisitor(),
      )

      // Prefill: write the draft BEFORE navigating so ConversationView's
      // draft-restore effect (peekDraft → initialText → AgentRichInput)
      // picks it up on mount.
      const { useInputDraftStore } = await import('@/store/input-draft.store')
      useInputDraftStore.getState().saveDraft(target.id, {
        text: buildPrefillText(skillName, promptParam),
        mentionedAgentIds: [],
        selectedFiles: [],
      })

      router.replace(
        projectWorkspacePath(useProjectStore.getState().activeProjectId, target.id),
      )
    },
    [promptParam, router, t],
  )

  // Step 3: AI readiness — automatic, skippable steps are skipped.
  const runAiReadiness = useCallback(async () => {
    try {
      const readiness = await checkAiReadiness()
      if (readiness.ready) {
        setCreditExhausted(readiness.creditExhausted)
        // 0 credit surfaces the "can't use yet" hint but still proceeds:
        // the recharge card on the conversation is the actionable entry.
        await continueToConversation(entry?.name ?? entry?.dirName ?? '')
        return
      }
      resetGatewayLogin()
      setPhase('login')
    } catch (e) {
      console.error('[SkillInstall] readiness check failed:', e)
      setPhase('login')
    }
  }, [continueToConversation, entry, resetGatewayLogin])

  // Step 2: install (user-clicked; idempotent).
  const runInstall = useCallback(async () => {
    if (!entry || installStartedRef.current) return
    installStartedRef.current = true
    setPhase('installing')
    try {
      let outcome: InstallOutcome = { alreadyInstalled }
      if (!alreadyInstalled) {
        await installSkillFromUrl(entry.zipUrl, setInstallProgress)
        // Register the slash command immediately — refreshUserSkills()
        // rescans OPFS and re-syncs the slash-command registry.
        await getSkillManager().refreshUserSkills()
        outcome = { alreadyInstalled: false }
      }
      setAlreadyInstalled(true)
      setInstallProgress(null)
      await runAiReadiness()
      void outcome
    } catch (e) {
      console.error('[SkillInstall] install failed:', e)
      setInstallProgress({ phase: 'error', message: (e as Error).message })
      setPhase('details')
    } finally {
      installStartedRef.current = false
    }
  }, [alreadyInstalled, entry, runAiReadiness])

  // "Already installed" path skips straight past install + login checks
  // (the acceptance criteria: returning users are done in 2 clicks) — but
  // still runs readiness so a since-logged-out visitor gets the login step.
  const handleStart = useCallback(async () => {
    if (!entry) return
    if (!alreadyInstalled) {
      await runInstall()
      return
    }
    await runAiReadiness()
  }, [alreadyInstalled, entry, runAiReadiness, runInstall])

  const handleLoginSuccess = useCallback(async () => {
    setCreditExhausted(false)
    await continueToConversation(entry?.name ?? entry?.dirName ?? '')
  }, [continueToConversation, entry])

  const handleSkipLogin = useCallback(async () => {
    // "later" escape — skipping still proceeds to the conversation; the
    // existing 401 chain + re-login error card backstop the first send.
    await continueToConversation(entry?.name ?? entry?.dirName ?? '')
  }, [continueToConversation, entry])

  // After a successful inline login, move on automatically.
  const authStatus = authState?.status ?? 'idle'
  useEffect(() => {
    if (phase === 'login' && authStatus === 'success') {
      void handleLoginSuccess()
    }
  }, [phase, authStatus, handleLoginSuccess])

  // ── Render ─────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <Centered>
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
        <p className="text-sm text-secondary">{t('skillInstall.loading')}</p>
      </Centered>
    )
  }

  if (phase === 'error') {
    return (
      <Centered>
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-secondary">{t('skillInstall.errorTitle')}</p>
        <p className="max-w-md text-xs text-muted-foreground">
          {errorKind === 'missing-param'
            ? t('skillInstall.missingParam')
            : errorKind === 'not-found'
              ? t('skillInstall.notFound')
              : (errorMessage ?? t('skillInstall.loadFailed'))}
        </p>
        <div className="flex items-center gap-3">
          {errorKind === 'load-failed' && (
            <button
              type="button"
              onClick={() => void loadEntry()}
              className="flex h-9 items-center gap-2 rounded-md border border-border bg-white px-4 text-sm text-secondary transition-colors hover:border-primary-100 hover:bg-primary-50 hover:text-primary-600 dark:border-border dark:bg-card"
            >
              {t('skillInstall.retry')}
            </button>
          )}
          <button
            type="button"
            onClick={() => router.replace('/projects')}
            className="flex h-9 items-center gap-2 rounded-md bg-primary-600 px-4 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            {t('skillInstall.openSkillManager')}
          </button>
        </div>
      </Centered>
    )
  }

  if (!entry) return null

  if (phase === 'details' || phase === 'installing') {
    const busy = phase === 'installing'
    return (
      <Centered>
        <Package className="h-8 w-8 text-primary-600" />
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-lg font-semibold text-secondary">{entry.name}</h1>
            {alreadyInstalled && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
                {t('skillInstall.installedBadge')}
              </span>
            )}
          </div>
          {entry.description && (
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{entry.description}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {t('skillInstall.versionLabel')} {entry.version || '—'}
            {typeof entry.fileCount === 'number' &&
              ` · ${t('skillInstall.filesLabel', { count: entry.fileCount })}`}
          </p>
        </div>
        {creditExhausted && (
          <div className="flex max-w-md items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p>{t('skillInstall.creditExhausted')}</p>
              <button
                type="button"
                className="mt-1 font-medium underline underline-offset-2"
                onClick={() => window.open(getNutstoreAIConsoleURL(), '_blank', 'noopener,noreferrer')}
              >
                {t('skillInstall.recharge')}
              </button>
            </div>
          </div>
        )}
        {busy ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-sm text-secondary">
              <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
              {installProgress?.phase === 'error'
                ? `${t('skillInstall.installFailed')}: ${installProgress.message}`
                : (installProgress?.message || t('skillInstall.installing'))}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void handleStart()}
            className="flex h-10 items-center gap-2 rounded-md bg-primary-600 px-6 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            <Package className="h-4 w-4" />
            {alreadyInstalled ? t('skillInstall.starting') : t('skillInstall.installButton')}
          </button>
        )}
      </Centered>
    )
  }

  if (phase === 'login') {
    return (
      <Centered>
        <p className="text-sm font-medium text-secondary">{t('skillInstall.aiNotReady')}</p>
        <InlineGatewayLogin
          authState={authState}
          isRunning={isLoginRunning}
          onLogin={() => void gatewayLogin()}
          onSkip={() => void handleSkipLogin()}
          onCopyCode={() => {
            if (authState?.userCode) void navigator.clipboard.writeText(authState.userCode)
          }}
        />
      </Centered>
    )
  }

  // phase === 'starting'
  return (
    <Centered>
      <CheckCircle2 className="h-6 w-6 text-green-500" />
      <p className="text-sm text-secondary">{t('skillInstall.starting')}</p>
    </Centered>
  )
}

/** Inline device-code login UI — modeled on LLMGatewayCard's inline flow. */
function InlineGatewayLogin(props: {
  authState: ReturnType<typeof useGatewayLogin>['authState']
  isRunning: boolean
  onLogin: () => void
  onSkip: () => void
  onCopyCode: () => void
}) {
  const t = useT()
  const { authState } = props
  const status = authState?.status ?? 'idle'
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3">
      {status === 'idle' && (
        <>
          <button
            type="button"
            onClick={props.onLogin}
            className="flex h-9 w-full items-center justify-center rounded-md bg-primary-600 px-4 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            {t('settings.gateway.login')}
          </button>
          <button
            type="button"
            onClick={props.onSkip}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-secondary"
          >
            {t('skillInstall.aiLater')}
          </button>
        </>
      )}
      {status === 'requesting' && (
        <div className="flex items-center gap-2 text-sm text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('settings.gateway.creatingSession')}
        </div>
      )}
      {(status === 'waiting' || status === 'polling') && authState?.userCode && (
        <div className="w-full space-y-3">
          <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
            <span className="font-mono text-xl font-bold tracking-[0.15em] text-primary">
              {authState.userCode}
            </span>
            <button
              type="button"
              onClick={props.onCopyCode}
              className="text-muted-foreground hover:text-primary"
              title={t('settings.gateway.copy')}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          {authState.verificationUri && (
            <a
              href={
                authState.verificationUri.includes('user_code=')
                  ? authState.verificationUri
                  : `${authState.verificationUri}${authState.verificationUri.includes('?') ? '&' : '?'}user_code=${encodeURIComponent(authState.userCode || '')}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('settings.gateway.openAuthPage')}
            </a>
          )}
          {status === 'polling' && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('settings.gateway.waitingForAuth')}
            </div>
          )}
          <button
            type="button"
            onClick={props.onSkip}
            className="w-full text-xs text-muted-foreground underline underline-offset-2 hover:text-secondary"
          >
            {t('skillInstall.aiLater')}
          </button>
        </div>
      )}
      {status === 'success' && (
        <div className="flex items-center gap-2 text-sm font-medium text-green-500">
          <CheckCircle2 className="h-5 w-5" />
          {t('settings.gateway.loginSuccess')}
        </div>
      )}
      {status === 'error' && (
        <div className="w-full space-y-2">
          <div className="flex items-start gap-2">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-medium text-secondary">{t('settings.gateway.loginFailed')}</p>
              {authState?.error && <p className="text-xs text-muted-foreground">{authState.error}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={props.onLogin}
            className="h-9 w-full rounded-md bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700"
          >
            {t('settings.gateway.loginAgain')}
          </button>
          <button
            type="button"
            onClick={props.onSkip}
            className="w-full text-xs text-muted-foreground underline underline-offset-2 hover:text-secondary"
          >
            {t('skillInstall.aiLater')}
          </button>
        </div>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      {children}
    </div>
  )
}

/**
 * createNew wrapper — imported lazily to keep this module light; returns the
 * freshly created conversation (persisted immediately by the store).
 */
function createConversationForVisitor(): { id: string } {
  return useConversationStore.getState().createNew('New conversation')
}

/** Standalone promotion landing page: /skill-install?skill=<dirName> */
export default function SkillInstallPage() {
  return (
    <Suspense fallback={null}>
      <SkillInstallView />
    </Suspense>
  )
}
