import { describe, expect, it } from 'vitest'
import { t } from '@creatorweave/i18n'
import * as sessionComponents from '../index'

describe('session terminology cleanup', () => {
  it('does not expose deprecated SessionSwitcher export', () => {
    expect('SessionSwitcher' in sessionComponents).toBe(false)
  })

  it('does not expose deprecated SessionBadge export', () => {
    expect('SessionBadge' in sessionComponents).toBe(false)
  })

  it('uses conversation wording in zh-CN session labels', () => {
    expect(t('zh-CN', 'session.current')).toBe('当前对话')
    expect(t('zh-CN', 'session.switch')).toBe('切换对话')
    expect(t('zh-CN', 'session.new')).toBe('新建对话')
    expect(t('zh-CN', 'session.delete')).toBe('删除对话')
    expect(t('zh-CN', 'session.deleteConfirm')).toBe('确定要删除这个对话吗？')
    expect(t('zh-CN', 'session.unknownSession')).toBe('未知对话')
    expect(t('zh-CN', 'session.noSession')).toBe('无对话')
  })

  it('uses conversation wording in en-US session labels', () => {
    expect(t('en-US', 'session.current')).toBe('Current Conversation')
    expect(t('en-US', 'session.switch')).toBe('Switch Conversation')
    expect(t('en-US', 'session.new')).toBe('New Conversation')
    expect(t('en-US', 'session.delete')).toBe('Delete Conversation')
    expect(t('en-US', 'session.deleteConfirm')).toBe(
      'Are you sure you want to delete this conversation?'
    )
    expect(t('en-US', 'session.unknownSession')).toBe('Unknown Conversation')
    expect(t('en-US', 'session.noSession')).toBe('No Conversation')
  })

  it('uses conversation wording in ja-JP session labels', () => {
    expect(t('ja-JP', 'session.current')).toBe('現在の対話')
    expect(t('ja-JP', 'session.switch')).toBe('対話切り替え')
    expect(t('ja-JP', 'session.new')).toBe('新規対話')
    expect(t('ja-JP', 'session.delete')).toBe('対話削除')
    expect(t('ja-JP', 'session.deleteConfirm')).toBe('この対話を削除してもよろしいですか？')
    expect(t('ja-JP', 'session.unknownSession')).toBe('不明な対話')
    expect(t('ja-JP', 'session.noSession')).toBe('対話なし')
  })

  it('uses conversation wording in ko-KR session labels', () => {
    expect(t('ko-KR', 'session.current')).toBe('현재 대화')
    expect(t('ko-KR', 'session.switch')).toBe('대화 전환')
    expect(t('ko-KR', 'session.new')).toBe('새 대화')
    expect(t('ko-KR', 'session.delete')).toBe('대화 삭제')
    expect(t('ko-KR', 'session.deleteConfirm')).toBe('이 대화를 삭제하시겠습니까?')
    expect(t('ko-KR', 'session.unknownSession')).toBe('알 수 없는 대화')
    expect(t('ko-KR', 'session.noSession')).toBe('대화 없음')
  })
})
