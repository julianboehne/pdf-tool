'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { DraggableBox, type BoxGeometry } from '@/components/editor/DraggableBox';
import { PageStepper } from '@/components/editor/PageStepper';
import { Stage } from '@/components/editor/Stage';
import { sampleBackground } from '@/components/editor/sampleBackground';
import { useStagePage } from '@/components/editor/useStagePage';
import { AnnotationVisual } from './edit/AnnotationVisual';
import {
  DEFAULT_SHAPE_STYLE,
  DEFAULT_TEXT_STYLE,
  FormatBar,
  HIGHLIGHT_COLORS,
  HighlightBar,
  ShapeBar,
  type ShapeStyle,
  type TextStyle,
} from './edit/FormatBar';
import { Ribbon, SHAPE_TOOLS, type EditorTool, type ShapeTool } from './edit/Ribbon';
import { TextLayerOverlay } from './edit/TextLayerOverlay';
import { ResultPanel } from './ResultPanel';
import { SingleFilePicker } from './SingleFilePicker';
import { useSingleFile } from './useSingleFile';
import { useToolRun } from './useToolRun';
import { applyAnnotations, type Annotation } from '@/lib/pdf/annotate';
import { snapToGuides, type ActiveGuide, type Rect } from '@/lib/pdf/guides';
import { extractTextLines, type TextLine } from '@/lib/pdf/textLayer';
import { supportsText } from '@/lib/pdf/text';
import { toPdfToolError, type PdfToolErrorKey } from '@/lib/pdf/errors';
import { suffixFilename } from '@/lib/download';
import type { PdfResult } from '@/lib/pdf/types';

/** Shapes, lines and arrows share the stroke/fill/weight controls. */
type ShapeLike = Extract<
  Annotation,
  { type: 'rect' | 'ellipse' | 'line' | 'arrow' }
>;

function isShapeAnnotation(annotation: Annotation): annotation is ShapeLike {
  return (
    annotation.type === 'rect' ||
    annotation.type === 'ellipse' ||
    annotation.type === 'line' ||
    annotation.type === 'arrow'
  );
}

/** How close an edge must come, in screen pixels, before it snaps. */
const SNAP_PX = 6;
/** Height a marker stroke gets when dragged as a flat line. */
const MARKER_MIN_HEIGHT_PT = 14;

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
  const [tool, setTool] = useState<EditorTool>('select');
  const [textStyle, setTextStyle] = useState<TextStyle>(DEFAULT_TEXT_STYLE);
  const [shapeStyle, setShapeStyle] = useState<ShapeStyle>(DEFAULT_SHAPE_STYLE);
  const [markerColor, setMarkerColor] = useState(HIGHLIGHT_COLORS[0]);
  const [guides, setGuides] = useState<ActiveGuide[]>([]);
  /** Id of the text box currently being edited on the page, if any. */
  const [editingId, setEditingId] = useState<string | null>(null);

  const [textLines, setTextLines] = useState<TextLine[]>([]);
  const [replacedLineIds, setReplacedLineIds] = useState<string[]>([]);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognizeError, setRecognizeError] = useState<PdfToolErrorKey | null>(null);
  const [coverWarning, setCoverWarning] = useState(false);

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

  const nextId = (kind: string) =>
    `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const add = useCallback((annotation: Annotation) => {
    setAnnotations((current) => [...current, annotation]);
    setSelectedId(annotation.id);
  }, []);

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

  /**
   * Applies alignment snapping against the page and the other elements.
   *
   * `scale` comes from the stage, so the tolerance stays a constant distance on
   * screen: snapping feels the same whether the page is shown large or small.
   */
  const moveWithGuides = (
    id: string,
    geometry: BoxGeometry,
    mode: 'move' | 'resize',
    scale: number,
  ) => {
    if (!page || mode === 'resize') {
      update(id, geometry);
      setGuides([]);
      return;
    }

    const others: Rect[] = onPage
      .filter((item) => item.id !== id)
      .map(({ x, y, width, height }) => ({ x, y, width, height }));

    const snapped = snapToGuides(
      geometry,
      others,
      { width: page.widthPt, height: page.heightPt },
      SNAP_PX / scale,
    );

    update(id, snapped.rect);
    setGuides(snapped.guides);
  };

  // --- inserting elements ------------------------------------------------

  const placeText = (xPt: number, yPt: number) => {
    const id = nextId('text');
    const height = textStyle.fontSize * 1.6;

    add({
      id,
      type: 'text',
      page: pageIndex,
      x: xPt,
      y: yPt - height,
      width: 240,
      height,
      text: '',
      ...textStyle,
    });

    // Drop straight into typing, the way a new text box behaves in Word —
    // rather than leaving placeholder wording for the user to clear.
    setEditingId(id);
    setTool('select');
  };

  const drawRect = (rect: Rect, fromCorner: 'bottom-left' | 'top-left') => {
    if (tool === 'highlight') {
      add({
        id: nextId('highlight'),
        type: 'highlight',
        page: pageIndex,
        ...rect,
        color: markerColor,
      });
      // The marker stays armed — highlighting is rarely a one-off.
      return;
    }

    if (tool === 'line' || tool === 'arrow') {
      add({
        id: nextId(tool),
        type: tool,
        page: pageIndex,
        ...rect,
        fromCorner,
        stroke: shapeStyle.stroke ?? '#dc2626',
        strokeWidth: shapeStyle.strokeWidth,
        opacity: shapeStyle.opacity,
      });
      setTool('select');
      return;
    }

    if (tool === 'rect' || tool === 'ellipse') {
      add({
        id: nextId(tool),
        type: tool,
        page: pageIndex,
        ...rect,
        ...shapeStyle,
      });
      setTool('select');
    }
  };

  const insertImage = useCallback(
    async (source: File | Blob) => {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(source);
      });

      const image = new Image();
      image.src = dataUrl;
      await image.decode();

      if (!page) return;

      // Fit to a quarter of the page width, keeping proportions.
      const width = Math.min(page.widthPt * 0.4, image.naturalWidth);
      const height = (image.naturalHeight / image.naturalWidth) * width;

      add({
        id: nextId('image'),
        type: 'image',
        page: pageIndex,
        x: (page.widthPt - width) / 2,
        y: (page.heightPt - height) / 2,
        width,
        height,
        dataUrl,
      });
    },
    [add, page, pageIndex],
  );

  /** Holds the element behind Ctrl+C, independent of the system clipboard. */
  const clipboard = useRef<Annotation | null>(null);

  /** Drops a copy on the current page, nudged so it does not hide the original. */
  const pasteCopy = useCallback(() => {
    const source = clipboard.current;
    if (!source || !page) return;

    const offset = 12;
    add({
      ...source,
      id: nextId(source.type),
      page: pageIndex,
      x: Math.min(source.x + offset, page.widthPt - 12),
      y: Math.max(source.y - offset, 0),
    } as Annotation);
  }, [add, page, pageIndex]);

  /**
   * Keyboard handling for the page as a whole.
   *
   * The frame itself handles keys while it has focus, but a click leaves focus
   * on the page just as often — so Delete, copy, cut and paste are also served
   * here. Anything typed into a real field is left strictly alone.
   */
  useEffect(() => {
    if (!file) return;

    const isTypingTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return Boolean(
        element &&
          (/^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName) ||
            element.isContentEditable),
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (editingId || isTypingTarget(event.target)) return;

      const current = annotations.find((item) => item.id === selectedId);
      const accel = event.metaKey || event.ctrlKey;

      if (!accel && (event.key === 'Delete' || event.key === 'Backspace')) {
        if (!current) return;
        event.preventDefault();
        remove(current.id);
        return;
      }

      if (!accel) return;

      const key = event.key.toLowerCase();

      if ((key === 'c' || key === 'x') && current) {
        event.preventDefault();
        clipboard.current = current;
        if (key === 'x') remove(current.id);
        return;
      }

      // Ctrl+V is normally delivered as a paste event carrying clipboard data;
      // this only covers the case where the system clipboard holds nothing we
      // can use and the copy came from inside the editor.
      if (key === 'v' && clipboard.current) {
        // The paste handler below runs first when there is image data, and
        // stops this from firing by clearing the flag.
        window.setTimeout(() => {
          if (!pastedExternally.current) pasteCopy();
          pastedExternally.current = false;
        }, 0);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [annotations, editingId, file, pasteCopy, selectedId]);

  /** Set when a paste carried a real image, so the internal copy is skipped. */
  const pastedExternally = useRef(false);

  /**
   * Ctrl+V for images. Screenshots live on the clipboard as image blobs, so
   * pasting is the fastest path from "snip a chart" to "it is in the document".
   */
  useEffect(() => {
    if (!file) return;

    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Never steal a paste aimed at a real input.
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (editingId) return;

      const item = [...(event.clipboardData?.items ?? [])].find((entry) =>
        entry.type.startsWith('image/'),
      );
      if (!item) return;

      const blob = item.getAsFile();
      if (!blob) return;

      event.preventDefault();
      pastedExternally.current = true;
      void insertImage(blob);
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [editingId, file, insertImage]);

  // --- text recognition ---------------------------------------------------

  const recognize = async () => {
    if (!file) return;

    setIsRecognizing(true);
    setRecognizeError(null);

    try {
      const lines = await extractTextLines(file.bytes, pageIndex);
      setTextLines(lines);
      if (lines.length === 0) setRecognizeError('noTextLayer');
    } catch (error) {
      setRecognizeError(toPdfToolError(error).key);
    } finally {
      setIsRecognizing(false);
    }
  };

  /** Covers a recognised line and hands back an editable copy of its text. */
  const replaceLine = async (line: TextLine) => {
    if (!page) return;

    const box = {
      x: line.x,
      y: line.baseline - line.fontSize * 0.25,
      width: Math.max(line.width, 40),
      height: line.fontSize * 1.3,
    };

    const sample = await sampleBackground(
      page.dataUrl,
      { width: page.widthPt, height: page.heightPt },
      box,
    );

    setCoverWarning(!sample.uniform);

    const id = nextId('text');

    add({
      id,
      type: 'text',
      page: pageIndex,
      ...box,
      text: line.text,
      fontFamily: line.family,
      fontSize: line.fontSize,
      color: '#111827',
      // The cover is what makes the original disappear, so it is always on
      // here — unlike a text box the user places on blank space.
      background: sample.hex,
      bold: line.bold,
      italic: false,
      align: 'left',
    });

    setReplacedLineIds((current) => [...current, line.id]);
    setTool('select');
    // Replacing a line is only worth doing in order to retype it, so the box
    // opens ready for typing rather than waiting for a double-click.
    setEditingId(id);
  };

  // --- housekeeping -------------------------------------------------------

  const goToPage = (next: number) => {
    setPageIndex(next);
    setSelectedId(null);
    setEditingId(null);
    setTextLines([]);
    setReplacedLineIds([]);
    setRecognizeError(null);
  };

  const startOver = () => {
    clear();
    reset();
    setAnnotations([]);
    setSelectedId(null);
    setEditingId(null);
    setPageIndex(0);
    setTool('select');
    setTextLines([]);
    setReplacedLineIds([]);
    setCoverWarning(false);
  };

  const isLineContext =
    tool === 'line' ||
    tool === 'arrow' ||
    selected?.type === 'line' ||
    selected?.type === 'arrow';

  /** The shape bar replaces the text bar whenever a shape is in play. */
  const isShapeContext =
    SHAPE_TOOLS.includes(tool as ShapeTool) ||
    (tool === 'select' && selected !== null && isShapeAnnotation(selected));

  const unsupported = annotations.find(
    (item) => item.type === 'text' && !supportsText(item.text, item.fontFamily),
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
          <Ribbon
            tool={tool}
            onToolChange={setTool}
            onPickImage={(chosen) => void insertImage(chosen)}
            onRecognize={recognize}
            isRecognizing={isRecognizing}
            disabled={isBusy}
          >
            {tool === 'highlight' ? (
              <HighlightBar
                color={markerColor}
                onChange={setMarkerColor}
                disabled={isBusy}
              />
            ) : isShapeContext ? (
              <ShapeBar
                style={
                  selected && isShapeAnnotation(selected)
                    ? {
                        fill: 'fill' in selected ? selected.fill : null,
                        stroke: selected.stroke,
                        strokeWidth: selected.strokeWidth,
                        opacity: selected.opacity,
                      }
                    : shapeStyle
                }
                showFill={!isLineContext}
                onChange={(patch) => {
                  if (selected && isShapeAnnotation(selected)) {
                    update(selected.id, patch as Partial<Annotation>);
                  } else {
                    setShapeStyle((current) => ({ ...current, ...patch }));
                  }
                }}
                disabled={isBusy}
              />
            ) : (
              <FormatBar
                style={
                  selected?.type === 'text'
                    ? {
                        fontFamily: selected.fontFamily,
                        fontSize: selected.fontSize,
                        color: selected.color,
                        background: selected.background,
                        bold: selected.bold,
                        italic: selected.italic,
                        align: selected.align,
                      }
                    : textStyle
                }
                onChange={(patch) => {
                  // Editing with a text box selected changes that box; editing
                  // with nothing selected sets the style for the next insert.
                  if (selected?.type === 'text') update(selected.id, patch);
                  else setTextStyle((current) => ({ ...current, ...patch }));
                }}
                disabled={isBusy}
              />
            )}
          </Ribbon>

          <p className="text-xs leading-relaxed text-slate-500">
            {t('toolbarHint')}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <PageStepper
              pageIndex={pageIndex}
              pageCount={pageCount}
              onChange={goToPage}
              disabled={isBusy}
              markedPages={markedPages}
            />

            <span className="text-xs text-slate-500">
              {t('elementCount', { count: annotations.length })}
            </span>
          </div>

          {recognizeError ? (
            <Alert tone="warning">
              {recognizeError === 'noTextLayer'
                ? t('noTextLayer')
                : te(recognizeError)}
            </Alert>
          ) : null}

          {textLines.length > 0 ? (
            <Alert tone="info">
              {t('recognized', { count: textLines.length })}
            </Alert>
          ) : null}

          {coverWarning ? (
            <Alert tone="warning">{t('coverWarning')}</Alert>
          ) : null}

          {unsupported ? (
            <Alert tone="error">{t('unsupportedInFont')}</Alert>
          ) : null}

          {page ? (
            <Stage
              dataUrl={page.dataUrl}
              widthPt={page.widthPt}
              heightPt={page.heightPt}
              label={teditor('pageAlt', { number: pageIndex + 1 })}
              isPlacing={tool !== 'select'}
              guides={guides}
              drawMinHeightPt={tool === 'highlight' ? MARKER_MIN_HEIGHT_PT : 0}
              onDrawRect={
                tool === 'highlight' || SHAPE_TOOLS.includes(tool as ShapeTool)
                  ? drawRect
                  : undefined
              }
              onBackgroundClick={(x, y) => {
                if (tool === 'text') {
                  placeText(x, y);
                } else {
                  setSelectedId(null);
                  setEditingId(null);
                }
              }}
            >
              {(scale) => (
                <>
                  {textLines.length > 0 ? (
                    <TextLayerOverlay
                      lines={textLines}
                      usedIds={replacedLineIds}
                      pageHeightPt={page.heightPt}
                      scale={scale}
                      onPick={(line) => void replaceLine(line)}
                    />
                  ) : null}

                  {onPage.map((item) => (
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
                      isEditing={item.id === editingId}
                      onActivate={() =>
                        item.type === 'text' ? setEditingId(item.id) : undefined
                      }
                      label={teditor(`kind.${item.type}`)}
                      onSelect={() => setSelectedId(item.id)}
                      onChange={(geometry, mode) =>
                        moveWithGuides(item.id, geometry, mode, scale)
                      }
                      onGestureEnd={() => setGuides([])}
                      onDelete={() => remove(item.id)}
                    >
                      <AnnotationVisual
                        annotation={item}
                        scale={scale}
                        isEditing={item.id === editingId}
                        onTextChange={(text) => update(item.id, { text })}
                        onFinishEditing={() => setEditingId(null)}
                      />
                    </DraggableBox>
                  ))}
                </>
              )}
            </Stage>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
              {isRendering ? teditor('loading') : null}
            </div>
          )}

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
            disabled={annotations.length === 0 || Boolean(unsupported) || isBusy}
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
