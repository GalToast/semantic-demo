import { appState as _state } from '@lib/state/app.svelte'
const state = _state as any
import { applyStoryPrompt } from '@lib/orchestration/cluster-filter-controller'
import { focusSearchInputForReplacement, search } from '@lib/search/state'
import { showExperienceToast } from '@lib/ui/ui-feedback'

type SetMyceliumMode = (mode: string) => void

export function bindModeAndPromptControls(setMyceliumMode: SetMyceliumMode): void {
    document.querySelectorAll<HTMLElement>('[data-mode]').forEach((button) => {
        button.onclick = () => {
            if (button.dataset.story && typeof applyStoryPrompt === 'function') {
                if (button.dataset.story === 'trail' && state.focusedNode === null) {
                    showExperienceToast('Trail locked', 'Select a business first.')
                    return
                }
                applyStoryPrompt(button.dataset.story)
                return
            }
            const mode = button.dataset.mode || 'default'
            if (mode === 'trail' && state.focusedNode === null) {
                showExperienceToast('Trail locked', 'Select a business first.')
                return
            }
            setMyceliumMode(mode)
        }
    })

    document.querySelectorAll<HTMLElement>('[data-demo-query]').forEach((button) => {
        button.onclick = () => {
            const query = button.dataset.demoQuery || ''
            const searchInput = document.getElementById('search-input') as HTMLInputElement | null
            if (searchInput) {
                searchInput.value = query
                if (typeof focusSearchInputForReplacement === 'function') focusSearchInputForReplacement()
            }
            document.querySelectorAll<HTMLElement>('[data-demo-query]').forEach((chip) => {
                chip.classList.remove('active', 'is-loading')
                chip.removeAttribute('aria-disabled')
            })
            button.classList.add('is-loading')
            button.setAttribute('aria-disabled', 'true')
            const originalText = button.textContent?.trim() || ''
            button.textContent = 'Finding...'

            const cueEl = document.getElementById('search-trail-cue')
            if (cueEl) {
                cueEl.hidden = false
                cueEl.classList.add('active')
                cueEl.querySelectorAll<HTMLElement>('.search-trail-cue-step').forEach((el) => {
                    el.classList.toggle('active', el.dataset.cueStage === 'query')
                })
            }

            const restoreTimer: ReturnType<typeof setTimeout> = setTimeout(() => {
                button.classList.remove('is-loading')
                button.removeAttribute('aria-disabled')
                button.textContent = originalText
            }, 4000)

            const wrappedSearch = (...args: Parameters<typeof search>) => {
                clearTimeout(restoreTimer)
                return search(...args)
            }
            wrappedSearch(query)
        }
    })

    document.querySelectorAll<HTMLElement>('[data-story]').forEach((button) => {
        button.onclick = () => {
            if (typeof applyStoryPrompt === 'function') applyStoryPrompt(button.dataset.story || '')
        }
    })
}
