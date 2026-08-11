import { Button, Content, ContentVariants, TextInput, ValidatedOptions } from '@patternfly/react-core';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import Modal, { ensureRootElement } from './modal';

export interface SaveViewModalProps {
  isModalOpen: boolean;
  setModalOpen: (v: boolean) => void;
  onSave: (name: string) => void;
  existingNames: string[];
  id?: string;
}

export const SaveViewModal: React.FC<SaveViewModalProps> = ({
  id,
  isModalOpen,
  setModalOpen,
  onSave,
  existingNames
}) => {
  React.useEffect(() => {
    ensureRootElement();
  }, []);

  const [name, setName] = React.useState('');
  const [error, setError] = React.useState<string | undefined>(undefined);
  const { t } = useTranslation('plugin__netobserv-plugin');

  React.useEffect(() => {
    if (isModalOpen) {
      setName('');
      setError(undefined);
    }
  }, [isModalOpen]);

  const validate = React.useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        return t('Name is required');
      }
      if (trimmed.length > 30) {
        return t('Maximum 30 characters');
      }
      if (existingNames.includes(trimmed)) {
        return t('Name already exists');
      }
      return undefined;
    },
    [existingNames, t]
  );

  const onChange = React.useCallback(
    (_event: React.FormEvent<HTMLInputElement>, value: string) => {
      setName(value);
      setError(validate(value));
    },
    [validate]
  );

  const onClose = React.useCallback(() => {
    setModalOpen(false);
  }, [setModalOpen]);

  const onSubmit = React.useCallback(() => {
    const err = validate(name);
    if (err) {
      setError(err);
      return;
    }
    onSave(name.trim());
    onClose();
  }, [name, validate, onSave, onClose]);

  const validated = error ? ValidatedOptions.error : ValidatedOptions.default;

  return (
    <Modal
      id={id}
      title={t('Save as custom view')}
      isOpen={isModalOpen}
      scrollable={false}
      onClose={onClose}
      footer={
        <>
          <Button data-test="save-view-cancel-button" key="cancel" variant="link" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            data-test="save-view-save-button"
            key="confirm"
            variant="primary"
            isDisabled={!name.trim() || !!error}
            onClick={onSubmit}
          >
            {t('Save')}
          </Button>
        </>
      }
    >
      <Content component={ContentVariants.p}>{t('View name')}</Content>
      <TextInput
        data-test="save-view-name-input"
        type="text"
        aria-label={t('View name')}
        value={name}
        onChange={onChange}
        validated={validated}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' && name.trim() && !error) {
            onSubmit();
          }
        }}
      />
      {error && (
        <Content component={ContentVariants.p} className="pf-v6-u-color-status-danger--100">
          {error}
        </Content>
      )}
    </Modal>
  );
};

export default SaveViewModal;
