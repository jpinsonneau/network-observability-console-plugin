import * as React from 'react';

export function useFullScreen(): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [isFullScreen, setFullScreen] = React.useState(false);

  React.useEffect(() => {
    const sidebarExpanded = document.querySelector('.pf-v6-c-page__sidebar.pf-m-expanded');
    if (isFullScreen && sidebarExpanded) {
      document.getElementById('nav-toggle')?.click();
    }

    const elements = document.querySelectorAll(
      '#page-main-header, .pf-v6-c-masthead, #page-sidebar, .pf-v6-c-page__sidebar'
    );

    elements.forEach(e => {
      if (isFullScreen) {
        e.classList.add('hidden');
      } else {
        e.classList.remove('hidden');
      }
    });

    return () => {
      elements.forEach(e => e.classList.remove('hidden'));
    };
  }, [isFullScreen]);

  return [isFullScreen, setFullScreen];
}
