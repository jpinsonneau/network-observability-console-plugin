import { Button, DrawerActions, DrawerCloseButton } from '@patternfly/react-core';
import { OpenDrawerRightIcon } from '@patternfly/react-icons';

import React from 'react';

export const DefaultDrawerActions: React.FC<{
  onSwitch: () => void;
  onClose: () => void;
}> = ({ onSwitch, onClose }) => {
  return (
    <DrawerActions>
      <Button variant="plain" onClick={onSwitch}>
        <OpenDrawerRightIcon />
      </Button>
      <DrawerCloseButton data-test-id="drawer-close-button" className="drawer-close-button" onClick={onClose} />
    </DrawerActions>
  );
};

export default DefaultDrawerActions;
