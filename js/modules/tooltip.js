export function hideTooltip() {
  document.querySelectorAll('[data-tooltip], .tooltip, .semantic-tooltip').forEach((el) => {
    el.classList.remove('active', 'visible');
    el.setAttribute('aria-hidden', 'true');
  });
}
