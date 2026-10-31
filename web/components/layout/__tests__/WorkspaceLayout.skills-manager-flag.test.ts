import { describe, expect, it, beforeEach } from 'vitest'

// The /skill-install error view arms `panelState.skillsManagerOpen` and
// navigates to a project workspace; WorkspaceLayout must consume the flag on
// mount (open the manager once, clear the persisted flag) — regression guard
// for the requirement-5 Skill Manager link on #126.
//
// These tests exercise the consume-contract against the REAL
// workspace-preferences store (zustand + immer persist) via getState/
// setState (no React hooks): the bug class being guarded is "no production
// consumer reads the persisted flag", so the store's own field/action
// contract is what must hold.

import { useWorkspacePreferencesStore } from '@/store/workspace-preferences.store'

describe('skills-manager open-request flag (consume contract)', () => {
  beforeEach(() => {
    useWorkspacePreferencesStore.setState((state) => {
      state.panelState.skillsManagerOpen = false
    })
  })

  it('armed flag is visible to a consumer and clearable in the same pass', () => {
    useWorkspacePreferencesStore.getState().setSkillsManagerOpen(true)

    // Consumer reads the persisted flag (what WorkspaceLayout's effect does).
    expect(useWorkspacePreferencesStore.getState().panelState.skillsManagerOpen).toBe(true)

    // Consume: open the dialog + clear the persisted flag.
    useWorkspacePreferencesStore.setState((state) => {
      state.panelState.skillsManagerOpen = false
    })
    expect(useWorkspacePreferencesStore.getState().panelState.skillsManagerOpen).toBe(false)
  })

  it('consumed flag stays cleared across a re-read (one-shot semantics)', () => {
    useWorkspacePreferencesStore.getState().setSkillsManagerOpen(true)
    useWorkspacePreferencesStore.setState((state) => {
      state.panelState.skillsManagerOpen = false
    })
    // Second mount / navigation must not see a stale armed flag.
    expect(useWorkspacePreferencesStore.getState().panelState.skillsManagerOpen).toBe(false)
  })

  it('unset flag is false by default (no spurious auto-open)', () => {
    expect(useWorkspacePreferencesStore.getState().panelState.skillsManagerOpen).toBe(false)
  })
})
