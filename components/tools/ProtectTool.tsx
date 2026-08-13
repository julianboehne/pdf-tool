'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, TextInput } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ResultPanel } from './ResultPanel';
import { SingleFilePicker } from './SingleFilePicker';
import { ToolCard } from './ToolLayout';
import { useSingleFile } from './useSingleFile';
import { useToolRun } from './useToolRun';
import { protectPdf, removePassword } from '@/lib/pdf/protect';
import { suffixFilename } from '@/lib/download';
import type { PdfResult } from '@/lib/pdf/types';

type Mode = 'protect' | 'remove';

export function ProtectTool() {
  const t = useTranslations('tools.protect');
  const tc = useTranslations('common');
  const te = useTranslations('errors');

  const [mode, setMode] = useState<Mode>('protect');
  // In "remove" mode the input is encrypted by definition, so probing it for a
  // page count would always fail — skip the inspection there.
  const { file, pageCount, loadError, select, clear } = useSingleFile({
    inspect: mode === 'protect',
  });
  const { state, progress, run, reset, isBusy } = useToolRun<PdfResult[]>();

  const [userPassword, setUserPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [permissions, setPermissions] = useState({
    printing: true,
    modifying: false,
    copying: false,
    annotating: false,
  });

  const startOver = () => {
    clear();
    reset();
    setUserPassword('');
    setConfirmPassword('');
    setOwnerPassword('');
    setCurrentPassword('');
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    startOver();
  };

  const passwordsMatch = userPassword.length > 0 && userPassword === confirmPassword;

  const canRun =
    Boolean(file) &&
    !isBusy &&
    (mode === 'protect' ? passwordsMatch && Boolean(pageCount) : true);

  if (state.status === 'done') {
    return (
      <ResultPanel
        results={state.result}
        zipName="protected.zip"
        onReset={startOver}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label={t('modeLabel')}
        className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1"
      >
        {(['protect', 'remove'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => switchMode(value)}
            className={[
              'rounded-md px-4 py-2 text-sm font-medium transition',
              mode === value
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            ].join(' ')}
          >
            {t(`mode.${value}`)}
          </button>
        ))}
      </div>

      <SingleFilePicker
        file={file}
        pageCount={mode === 'protect' ? pageCount : undefined}
        onSelect={select}
        onClear={startOver}
        disabled={isBusy}
      />

      {loadError === 'encrypted' && mode === 'protect' ? (
        <Alert tone="warning">{t('alreadyEncrypted')}</Alert>
      ) : loadError ? (
        <Alert tone="error">{te(loadError)}</Alert>
      ) : null}

      {file ? (
        <ToolCard>
          {mode === 'protect' ? (
            <div className="flex flex-col gap-4">
              <Field
                label={t('userPasswordLabel')}
                hint={t('userPasswordHint')}
                htmlFor="pr-user"
              >
                <TextInput
                  id="pr-user"
                  type="password"
                  autoComplete="new-password"
                  value={userPassword}
                  onChange={(event) => setUserPassword(event.target.value)}
                  disabled={isBusy}
                />
              </Field>

              <Field label={t('confirmPasswordLabel')} htmlFor="pr-confirm">
                <TextInput
                  id="pr-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={isBusy}
                />
              </Field>

              {confirmPassword && !passwordsMatch ? (
                <p className="text-xs text-rose-600">{t('mismatch')}</p>
              ) : null}

              <Field
                label={t('ownerPasswordLabel')}
                hint={t('ownerPasswordHint')}
                htmlFor="pr-owner"
              >
                <TextInput
                  id="pr-owner"
                  type="password"
                  autoComplete="new-password"
                  value={ownerPassword}
                  onChange={(event) => setOwnerPassword(event.target.value)}
                  disabled={isBusy}
                />
              </Field>

              <fieldset className="flex flex-col gap-2.5">
                <legend className="mb-1 text-sm font-medium text-slate-700">
                  {t('permissionsLabel')}
                </legend>

                {(
                  ['printing', 'modifying', 'copying', 'annotating'] as const
                ).map((key) => (
                  <Checkbox
                    key={key}
                    label={t(`permission.${key}`)}
                    checked={permissions[key]}
                    onChange={(event) =>
                      setPermissions((current) => ({
                        ...current,
                        [key]: event.target.checked,
                      }))
                    }
                    disabled={isBusy}
                  />
                ))}

                <p className="mt-1 text-xs text-slate-500">
                  {t('permissionsHint')}
                </p>
              </fieldset>
            </div>
          ) : (
            <Field
              label={t('currentPasswordLabel')}
              hint={t('currentPasswordHint')}
              htmlFor="pr-current"
            >
              <TextInput
                id="pr-current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                disabled={isBusy}
              />
            </Field>
          )}
        </ToolCard>
      ) : null}

      {state.status === 'error' ? (
        <Alert tone="error">{te(state.error)}</Alert>
      ) : null}

      {isBusy ? (
        <ProgressBar
          value={progress.done}
          max={progress.total}
          label={tc('processing')}
        />
      ) : null}

      <div>
        <Button
          disabled={!canRun}
          onClick={() =>
            run(async () => [
              {
                name: suffixFilename(
                  file!.name,
                  mode === 'protect' ? 'protected' : 'unlocked',
                ),
                bytes:
                  mode === 'protect'
                    ? await protectPdf(file!.bytes, {
                        userPassword,
                        ownerPassword,
                        permissions,
                      })
                    : await removePassword(file!.bytes, currentPassword),
              },
            ])
          }
        >
          {t(mode === 'protect' ? 'action' : 'actionRemove')}
        </Button>
      </div>
    </div>
  );
}
