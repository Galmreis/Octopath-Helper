import { useEffect } from 'react';
import { TAB_IDS } from '../lib/constants';

const TYPING_TAGS = ['INPUT', 'SELECT', 'TEXTAREA'];

/**
 * Keyboard control for second-screen use:
 *   1-5  switch tab     F  snap back to live location     Esc  leave a search box
 */
export function useHotkeys({ onTab, onReturnToLive }) {
  useEffect(() => {
    function handleKeyDown(e) {
      const tag = document.activeElement?.tagName;
      const isTyping = TYPING_TAGS.includes(tag);

      if (e.key === 'Escape') {
        if (isTyping) document.activeElement.blur();
        return;
      }
      if (isTyping) return;

      const tabIndex = Number(e.key) - 1;
      if (TAB_IDS[tabIndex]) onTab(TAB_IDS[tabIndex]);
      else if (e.key === 'f' || e.key === 'F') onReturnToLive();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onTab, onReturnToLive]);
}
