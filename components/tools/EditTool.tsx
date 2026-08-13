'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Slider, TextInput } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { DraggableBox, type BoxGeometry } from '@/components/editor/DraggableBox';
import { PageStepper } from '@/components/editor/PageStepper';
import { Stage } from '@/components/editor/Stage';
import { useStagePage } from '@/components/editor/useStagePage';
import { ResultPanel } from './ResultPanel';
import { SingleFilePicker } from './SingleFilePicker';
import { ToolCard } from './ToolLayout';
import { useSingleFile } from './useSingleFile';
import { useToolRun } from './useToolRun';
import { applyAnnotations, type Annotation } from '@/lib/pdf/annotate';
import { isWinAnsiEncodable } from '@/lib/pdf/text';
import { suffixFilename } from '@/lib/download';
import type { PdfResult } from '@/lib/pdf/types';

type ElementKind = 'text' | 'rect' | 'ellipse' | 'cover' | 'image';

/** Defaults are in PDF points, so a new element is the same size everywhere. */
const DEFAULTS: Record<ElementKind, { width: number; height: number }> = {
  text: { width: 220, height: 40 },
  rect: { width: 160, height: 90 },
  ellipse: { width: 140, height: 100 },
  cover: { width: 200, height: 24 },
  image: { width: 180, height: 120 },
};

export function EditTool() {
  const t = useTranslations('tools.edit');
  const teditor = useTranslations('editor');
  const tc = useTranslations('common');
  const te = useTranslations('errors');

  const { file, pageCount, loadError, select, clear } = useSingleFile();
  const { state, progress, run, reset, isBusy } = useToolRun<PdfResult[]>();

  const [pageIndex, setPageIndex] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [armed, setArmed] = useState<ElementKind | null>(null);

  const { page, isRendering, error: renderError } = useStagePage(
    file?.bytes ?? null,
    pageIndex,
  );

  const onPage = annotations.filter((item) => item.page === pageIndex);
  const selected = annotations.find((item) => item.id === selectedId) ?? null;

  const markedPages = useMemo(
    () => [...new Set(annotations.map((item) => item.page))],
    [annotations],
  );

  const update = (id: string, patch: Partial<Annotation>) =>
    setAnnotations((current) =>
      current.map((item) =>
        item.id === id ? ({ ...item, ...patch } as Annotation) : item,
      ),
    );

  const remove = (id: string) => {
    setAnnotations((current) => current.filter((item) => item.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  };

  /** Places a new element with its top-left corner at the clicked point. */
  const place = (kind: ElementKind, xPt: number, yPt: number, dataUrl?: string) => {
    const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const size = DEFAULTS[kind];
    const box = {
      id,
      page: pageIndex,
      x: xPt,
      y: yPt - size.height,
      width: size.width,
      height: size.height,
    };

    const annotation: Annotation =
      kind === 'text'
        ? { ...box, type: 'text', text: t('newTextPlaceholder'), fontSize: 14, color: '#111827', bold: false }
        : kind === 'image'
          ? { ...box, type: 'image', dataUrl: dataUrl! }
          : kind === 'cover'
            ? { ...box, type: 'rect', fill: '#ffffff', stroke: null, strokeWidth: 1, opacity: 1 }
            : {
                ...box,
                type: kind === 'rect' ? 'rect' : 'ellipse',
                fill: null,
                stroke: '#dc2626',
                strokeWidth: 2,
                opacity: 1,
              };

    setAnnotations((current) => [...current, annotation]);
    setSelectedId(id);
    setArmed(null);
  };

  const addImage = async (input: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(input);
    });

    // Images are dropped in the middle of the page rather than armed for a
    // click — the file dialog already cost the user one interaction.
    if (page) place('image', page.widthPt / 2 - 90, page.heightPt / 2 + 60, dataUrl);
  };

  const startOver = () => {
    clear();
    reset();
    setAnnotations([]);
    setSelectedId(null);
    setPageIndex(0);
    setArmed(null);
  };

  const textIsDrawable = annotations.every(
    (item) => item.type !== 'text' || isWinAnsiEncodable(item.text),
  );

  if (state.status === 'done') {
    return (
      <ResultPanel
        results={state.result}
        zipName="edited.zip"
        onReset={startOver}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SingleFilePicker
        file={file}
        pageCount={pageCount}
        onSelect={select}
        onClear={startOver}
        disabled={isBusy}
      />

      {loadError ? <Alert tone="error">{te(loadError)}</Alert> : null}
      {renderError ? <Alert tone="error">{te(renderError)}</Alert> : null}

      {file && pageCount ? (
        <>
          <ToolCard>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {(['text', 'cover', 'rect', 'ellipse'] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    disabled={isBusy}
                    aria-pressed={armed === kind}
                    onClick={() => setArmed(armed === kind ? null : kind)}
                    className={[
                      'rounded-lg border px-3 py-2 text-sm font-medium transition',
                      armed === kind
                        ? 'border-brand-purple bg-brand-purple/10 text-brand-purple'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                      'disabled:opacity-50',
                    ].join(' ')}
                  >
                    {t(`add.${kind}`)}
                  </button>
                ))}

                <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  {t('add.image')}
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="sr-only"
                    disabled={isBusy}
                    onChange={(event) => {
                      const chosen = event.target.files?.[0];
                      if (chosen) void addImage(chosen);
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>

              <p className="text-xs text-slate-500">
                {armed ? t('placeHint') : t('toolbarHint')}
              </p>
            </div>
          </ToolCard>

          <div className="flex items-center justify-between gap-3">
            <PageStepper
              pageIndex={pageIndex}
              pageCount={pageCount}
              onChange={(next) => {
                setPageIndex(next);
                setSelectedId(null);
              }}
              disabled={isBusy}
              markedPages={markedPages}
            />

            <span className="text-xs text-slate-500">
              {t('elementCount', { count: annotations.length })}
            </span>
          </div>

          {page ? (
            <Stage
              dataUrl={page.dataUrl}
              widthPt={page.widthPt}
              heightPt={page.heightPt}
              label={teditor('pageAlt', { number: pageIndex + 1 })}
              isPlacing={Boolean(armed)}
              onBackgroundClick={(x, y) => {
                if (armed && armed !== 'image') place(armed, x, y);
                else setSelectedId(null);
              }}
            >
              {(scale) =>
                onPage.map((item) => (
                  <DraggableBox
                    key={item.id}
                    x={item.x}
                    y={item.y}
                    width={item.width}
                    height={item.height}
                    pageWidthPt={page.widthPt}
                    pageHeightPt={page.heightPt}
                    scale={scale}
                    selected={item.id === selectedId}
                    lockAspect={item.type === 'image'}
                    label={teditor(`kind.${item.type}`)}
                    onSelect={() => setSelectedId(item.id)}
                    onChange={(geometry: BoxGeometry) => update(item.id, geometry)}
                    onDelete={() => remove(item.id)}
                  >
                    <AnnotationVisual annotation={item} scale={scale} />
                  </DraggableBox>
                ))
              }
            </Stage>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
              {isRendering ? teditor('loading') : null}
            </div>
          )}

          {selected ? (
            <ToolCard>
              <h2 className="mb-3 text-sm font-semibold text-slate-800">
                {teditor(`kind.${selected.type}`)}
              </h2>

              <div className="flex flex-col gap-4">
                {selected.type === 'text' ? (
                  <>
                    <Field label={t('textLabel')} htmlFor="edit-text">
                      <TextInput
                        id="edit-text"
                        value={selected.text}
                        onChange={(event) =>
                          update(selected.id, { text: event.target.value })
                        }
                        aria-invalid={!isWinAnsiEncodable(selected.text)}
                        disabled={isBusy}
                      />
                      {!isWinAnsiEncodable(selected.text) ? (
                        <p className="text-xs text-rose-600">
                          {te('unsupportedCharacters')}
                        </p>
                      ) : null}
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t('fontSizeLabel')} htmlFor="edit-size">
                        <Slider
                          id="edit-size"
                          min={6}
                          max={72}
                          step={1}
                          value={selected.fontSize}
                          valueLabel={`${selected.fontSize} pt`}
                          onChange={(event) =>
                            update(selected.id, {
                              fontSize: Number(event.target.value),
                            })
                          }
                          disabled={isBusy}
                        />
                      </Field>

                      <Field label={t('colorLabel')} htmlFor="edit-color">
                        <input
                          id="edit-color"
                          type="color"
                          value={selected.color}
                          onChange={(event) =>
                            update(selected.id, { color: event.target.value })
                          }
                          disabled={isBusy}
                          className="h-10 w-20 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
                        />
                      </Field>
                    </div>

                    <Checkbox
                      label={t('boldLabel')}
                      checked={selected.bold}
                      onChange={(event) =>
                        update(selected.id, { bold: event.target.checked })
                      }
                      disabled={isBusy}
                    />
                  </>
                ) : null}

                {selected.type === 'rect' || selected.type === 'ellipse' ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t('fillLabel')} htmlFor="edit-fill">
                        <div className="flex items-center gap-2">
                          <input
                            id="edit-fill"
                            type="color"
                            value={selected.fill ?? '#ffffff'}
                            onChange={(event) =>
                              update(selected.id, { fill: event.target.value })
                            }
                            disabled={isBusy || !selected.fill}
                            className="h-10 w-20 cursor-pointer rounded-lg border border-slate-300 bg-white p-1 disabled:opacity-40"
                          />
                          <Checkbox
                            label={t('fillOn')}
                            checked={Boolean(selected.fill)}
                            onChange={(event) =>
                              update(selected.id, {
                                fill: event.target.checked ? '#ffffff' : null,
                              })
                            }
                            disabled={isBusy}
                          />
                        </div>
                      </Field>

                      <Field label={t('strokeLabel')} htmlFor="edit-stroke">
                        <div className="flex items-center gap-2">
                          <input
                            id="edit-stroke"
                            type="color"
                            value={selected.stroke ?? '#dc2626'}
                            onChange={(event) =>
                              update(selected.id, { stroke: event.target.value })
                            }
                            disabled={isBusy || !selected.stroke}
                            className="h-10 w-20 cursor-pointer rounded-lg border border-slate-300 bg-white p-1 disabled:opacity-40"
                          />
                          <Checkbox
                            label={t('strokeOn')}
                            checked={Boolean(selected.stroke)}
                            onChange={(event) =>
                              update(selected.id, {
                                stroke: event.target.checked ? '#dc2626' : null,
                              })
                            }
                            disabled={isBusy}
                          />
                        </div>
                      </Field>
                    </div>

                    <Field label={t('opacityLabel')} htmlFor="edit-opacity">
                      <Slider
                        id="edit-opacity"
                        min={10}
                        max={100}
                        step={5}
                        value={Math.round(selected.opacity * 100)}
                        valueLabel={`${Math.round(selected.opacity * 100)} %`}
                        onChange={(event) =>
                          update(selected.id, {
                            opacity: Number(event.target.value) / 100,
                          })
                        }
                        disabled={isBusy}
                      />
                    </Field>
                  </>
                ) : null}

                <Button
                  variant="danger"
                  onClick={() => remove(selected.id)}
                  disabled={isBusy}
                >
                  {teditor('delete')}
                </Button>
              </div>
            </ToolCard>
          ) : null}
        </>
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

      {file ? (
        <div>
          <Button
            disabled={annotations.length === 0 || !textIsDrawable || isBusy}
            onClick={() =>
              run(async () => [
                {
                  name: suffixFilename(file.name, 'edited'),
                  bytes: await applyAnnotations(file.bytes, annotations),
                },
              ])
            }
          >
            {t('action')}
          </Button>

          <p className="mt-2 text-xs text-slate-500">{t('flattenNote')}</p>
        </div>
      ) : null}
    </div>
  );
}

/** Screen approximation of an annotation; the PDF is drawn by pdf-lib. */
function AnnotationVisual({
  annotation,
  scale,
}: {
  annotation: Annotation;
  scale: number;
}) {
  if (annotation.type === 'text') {
    return (
      <span
        className="pointer-events-none block h-full w-full overflow-hidden leading-tight"
        style={{
          fontSize: annotation.fontSize * scale,
          color: annotation.color,
          fontWeight: annotation.bold ? 700 : 400,
          fontFamily: 'Helvetica, Arial, sans-serif',
          lineHeight: 1.2,
        }}
      >
        {annotation.text}
      </span>
    );
  }

  if (annotation.type === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={annotation.dataUrl}
        alt=""
        draggable={false}
        className="pointer-events-none h-full w-full object-fill"
      />
    );
  }

  return (
    <span
      className="pointer-events-none block h-full w-full"
      style={{
        backgroundColor: annotation.fill ?? 'transparent',
        opacity: annotation.opacity,
        border: annotation.stroke
          ? `${Math.max(1, annotation.strokeWidth * scale)}px solid ${annotation.stroke}`
          : undefined,
        borderRadius: annotation.type === 'ellipse' ? '50%' : undefined,
      }}
    />
  );
}
