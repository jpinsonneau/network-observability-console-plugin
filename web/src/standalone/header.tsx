import {
  Brand,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  MastheadToggle,
  PageToggleButton,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarContent,
  ToolbarItem
} from '@patternfly/react-core';

import React from 'react';

export const Header: React.FunctionComponent<{
  isSidebarOpen: boolean;
  onSidebarToggle: () => void;
  isDark: boolean;
  setDark: (dark: boolean) => void;
}> = ({ isSidebarOpen, onSidebarToggle, isDark, setDark }) => {
  const onThemeSelect = (isDarkTheme: boolean) => {
    setDark(isDarkTheme);
    const htmlElement = document.documentElement;
    if (isDarkTheme) {
      htmlElement.classList.add('pf-v6-theme-dark');
    } else {
      htmlElement.classList.remove('pf-v6-theme-dark');
    }
  };

  return (
    <Masthead>
      <MastheadMain>
        <MastheadToggle>
          <PageToggleButton
            isHamburgerButton
            variant="plain"
            aria-label="Global navigation"
            isSidebarOpen={isSidebarOpen}
            onSidebarToggle={onSidebarToggle}
            id="nav-toggle"
          ></PageToggleButton>
        </MastheadToggle>
        <MastheadBrand data-codemods>
          <MastheadLogo data-codemods>
            <Brand src={'/assets/netobserv.svg'} widths={{ default: '40px' }} alt="NetObserv Logo" />
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Toolbar id="vertical-toolbar">
          <ToolbarContent>
            <ToolbarItem className="masthead-link">
              <a href="https://netobserv.io" title="Open netobserv.io" target="_blank" rel="noreferrer">
                NetObserv
              </a>
            </ToolbarItem>
            <ToolbarItem align={{ default: 'alignEnd' }}>
              <ToggleGroup>
                <ToggleGroupItem text="Light" isSelected={!isDark} onClick={() => onThemeSelect(false)} />
                <ToggleGroupItem text="Dark" isSelected={isDark} onClick={() => onThemeSelect(true)} />
              </ToggleGroup>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
    </Masthead>
  );
};

export default Header;
