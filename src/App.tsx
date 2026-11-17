import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Download,
  Sparkles,
  Wand2,
  Pipette,
  Eraser,
  Paintbrush,
  Hand,
  Undo2,
  Redo2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Eye,
  Shirt,
  Grid,
  CheckCircle2,
  Layers,
  Scissors,
  Image as ImageIcon,
  FileDown,
  Maximize2,
} from 'lucide-react';
import {
  type ProcessOptions,
  type RGBColor,
  type Point,
  type BrushStroke,
  type RemovalMode,
  type CompressionMode,
  type ResizePreset,
  type AspectFitMode,
  type VerticalAlign,
  type EncodedPngResult,
  processImageTransparency,
  encodeOptimizedPng,
  formatBytes,
  rgbToHex,
  hexToRgb,
} from './utils/imageProcessor';
import { PromptHelperModal } from './components/PromptHelperModal';

type ActiveTool = 'punch' | 'eyedropper' | 'eraser' | 'restore' | 'pan';

type PreviewBg =
  | 'checker-dark'
  | 'checker-light'
  | '#FFFFFF'
  | '#141418'
  | '#9CA3AF'
  | '#1E293B'
  | '#DC2626'
  | '#E5DCCB';

interface HistoryState {
  seedPoints: Point[];
  brushStrokes: BrushStroke[];
}

const FABRIC_SWATCHES: { id: PreviewBg; label: string; color?: string }[] = [
  { id: 'checker-dark', label: '透過チェック（暗）' },
  { id: 'checker-light', label: '透過チェック（明）' },
  { id: '#FFFFFF', label: '白Tシャツ（黒フチ確認用）', color: '#FFFFFF' },
  { id: '#141418', label: '黒Tシャツ（黒インク確認用）', color: '#141418' },
  { id: '#9CA3AF', label: 'グレーTシャツ', color: '#9CA3AF' },
  { id: '#1E293B', label: 'ネイビーTシャツ', color: '#1E293B' },
  { id: '#E5DCCB', label: 'サンドベージュ', color: '#E5DCCB' },
  { id: '#DC2626', label: 'レッドTシャツ', color: '#DC2626' },
];

const TARGET_COLOR_PRESETS: { label: string; color: RGBColor; hex: string }[] = [
  { label: '黒 (#000000)', color: { r: 0, g: 0, b: 0 }, hex: '#000000' },
  { label: '白 (#FFFFFF)', color: { r: 255, g: 255, b: 255 }, hex: '#FFFFFF' },
  { label: 'グリーン (#00FF00)', color: { r: 0, g: 255, b: 0 }, hex: '#00FF00' },
  { label: 'マゼンタ (#FF00FF)', color: { r: 255, g: 0, b: 255 }, hex: '#FF00FF' },
];

const RESIZE_OPTIONS: {
  id: ResizePreset;
  title: string;
  badge: string;
  desc: string;
}[] = [
  {
    id: '3:4_2000',
    title: '3:4（1500×2000px）',
    badge: '長辺2000px・Tシャツ標準',
    desc: '縦横比3:4・長辺2000px（幅1500×高さ2000px）で出力します',
  },
  {
    id: 'orig_2000',
    title: '元比率で長辺2000px',
    badge: '長辺2000px',
    desc: '元画像のアスペクト比を維持したまま長辺を2000pxにリサイズ',
  },
  {
    id: '1:1_2000',
    title: '1:1（2000×2000px）',
    badge: '正方形・2000px',
    desc: '正方形（2000×2000px）にリサイズして出力します',
  },
  {
    id: '4:3_2000',
    title: '4:3（2000×1500px）',
    badge: '横長・長辺2000px',
    desc: '横長4:3・長辺2000px（幅2000×高さ1500px）で出力します',
  },
  {
    id: 'custom',
    title: 'カスタムサイズ指定',
    badge: '自由入力',
    desc: '任意のアスペクト比と長辺ピクセル数を指定します',
  },
  {
    id: 'none',
    title: 'リサイズなし',
    badge: '元サイズ維持',
    desc: '元画像のピクセル解像度のまま出力します',
  },
];

const COMPRESSION_OPTIONS: {
  id: CompressionMode;
  title: string;
  badge: string;
  desc: string;
}[] = [
  {
    id: 'palette256',
    title: '高圧縮・256色',
    badge: '推奨・約70%減',
    desc: 'TinyPNGと同じ減色技術。イラスト・ロゴの見た目を保ちつつ劇的に軽量化',
  },
  {
    id: 'smart',
    title: 'スマート軽量',
    badge: 'フルカラー・約40%減',
    desc: '1677万色を維持したまま、JFIF/JPEG特有の微細ノイズだけを整えて圧縮',
  },
  {
    id: 'palette128',
    title: '超圧縮・128色',
    badge: '最小容量・約80%減',
    desc: '色数の少ないシンプルなロゴやステッカーデザインに最適',
  },
  {
    id: 'lossless',
    title: '最高画質（無劣化）',
    badge: 'ロスレス',
    desc: '減色を行わず、透明領域のデータクリーニングのみ実施して保存',
  },
];

export function App() {
  // Source & Processed ImageData
  const [sourceImageData, setSourceImageData] = useState<ImageData | null>(null);
  const [processedImageData, setProcessedImageData] = useState<ImageData | null>(null);
  const [fileName, setFileName] = useState<string>('tshirt-design');
  const [originalFileSize, setOriginalFileSize] = useState<number | null>(null);

  // Processing parameters
  const [mode, setMode] = useState<RemovalMode>('flood');
  const [targetColor, setTargetColor] = useState<RGBColor>({ r: 0, g: 0, b: 0 });
  const [tolerance, setTolerance] = useState<number>(15);
  const [feather, setFeather] = useState<number>(6);
  const [edgeChoke, setEdgeChoke] = useState<number>(0);
  const [decontaminate, setDecontaminate] = useState<boolean>(true);

  // Resize & Aspect Ratio parameters (Default to 3:4 with long edge 2000px = 1500x2000px)
  const [resizePreset, setResizePreset] = useState<ResizePreset>('3:4_2000');
  const [fitMode, setFitMode] = useState<AspectFitMode>('contain');
  const [verticalAlign, setVerticalAlign] = useState<VerticalAlign>('center');
  const [customLongEdge, setCustomLongEdge] = useState<number>(2000);
  const [customAspectW, setCustomAspectW] = useState<number>(3);
  const [customAspectH, setCustomAspectH] = useState<number>(4);
  const [autoTrim, setAutoTrim] = useState<boolean>(true);

  // Compression parameters
  const [compression, setCompression] = useState<CompressionMode>('palette256');
  const [encodedPreview, setEncodedPreview] = useState<EncodedPngResult | null>(null);
  const [losslessByteSize, setLosslessByteSize] = useState<number | null>(null);
  const [isEncoding, setIsEncoding] = useState<boolean>(false);

  // Interactive Tool & History
  const [activeTool, setActiveTool] = useState<ActiveTool>('punch');
  const [brushRadius, setBrushRadius] = useState<number>(18);
  const [history, setHistory] = useState<HistoryState[]>([{ seedPoints: [], brushStrokes: [] }]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Viewport & Preview state
  const [previewBg, setPreviewBg] = useState<PreviewBg>('checker-dark');
  const [tshirtMockup, setTshirtMockup] = useState<boolean>(false);
  const [showOriginal, setShowOriginal] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Refs for Canvas & Pointer Interaction
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const currentStrokePointsRef = useRef<Point[]>([]);
  const panStartRef = useRef<{ clientX: number; clientY: number; startX: number; startY: number } | null>(
    null
  );

  const currentHistory = history[historyIndex] || { seedPoints: [], brushStrokes: [] };

  const showToast = useCallback((msg: string) => {
    setStatusMessage(msg);
  }, []);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 3200);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  // Load image helper from HTMLImageElement
  const loadFromImageElement = useCallback(
    (img: HTMLImageElement, name: string, byteLength?: number) => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const offscreen = document.createElement('canvas');
      offscreen.width = w;
      offscreen.height = h;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, w, h);

      // Auto-detect corner color if very dark, default to #000000
      const r0 = imgData.data[0];
      const g0 = imgData.data[1];
      const b0 = imgData.data[2];
      if (r0 < 25 && g0 < 25 && b0 < 25) {
        setTargetColor({ r: 0, g: 0, b: 0 });
      } else {
        setTargetColor({ r: r0, g: g0, b: b0 });
      }

      setSourceImageData(imgData);
      setOriginalFileSize(byteLength ?? null);
      setFileName(name.replace(/\.[^/.]+$/, '') || 'tshirt-design');
      setHistory([{ seedPoints: [], brushStrokes: [] }]);
      setHistoryIndex(0);
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
      showToast('画像を読み込みました！外側の背景を自動透過＆3:4(1500×2000px)出力準備完了です。');
    },
    [showToast]
  );

  const handleFileSelect = useCallback(
    (file: File) => {
      const isImageMime = file.type.startsWith('image/');
      const isImageExt = /\.(jfif|jpe|jpeg|jpg|png|webp|avif|bmp|gif|svg)$/i.test(file.name);
      if (!isImageMime && !isImageExt) {
        showToast('画像ファイル（JFIF / JPG / PNG / WebP など）を選択してください');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => loadFromImageElement(img, file.name, file.size);
        img.onerror = () => showToast('画像の読み込みに失敗しました。別のファイルでお試しください');
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    },
    [loadFromImageElement, showToast]
  );

  // Load Sample Shiba Image
  const handleLoadSample = useCallback(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      loadFromImageElement(img, 'tokyo-beats-shiba', 552960);
      setMode('flood');
      setTolerance(16);
      setFeather(6);
      setEdgeChoke(1);
      showToast('サンプル読込完了！内部の黒を残して透過し、3:4（1500×2000px）出力に設定しています。');
    };
    img.src = './sample-shiba.jpg';
  }, [loadFromImageElement, showToast]);

  // Clipboard Paste Support
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            handleFileSelect(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleFileSelect]);

  // Run image transparency processor whenever source or options change
  useEffect(() => {
    if (!sourceImageData) {
      setProcessedImageData(null);
      return;
    }

    const options: ProcessOptions = {
      mode,
      targetColor,
      tolerance,
      feather,
      edgeChoke,
      decontaminate,
      seedPoints: currentHistory.seedPoints,
      brushStrokes: currentHistory.brushStrokes,
    };

    const result = processImageTransparency(sourceImageData, options);
    setProcessedImageData(result);
  }, [
    sourceImageData,
    mode,
    targetColor,
    tolerance,
    feather,
    edgeChoke,
    decontaminate,
    currentHistory,
  ]);

  // Debounced computation of optimized PNG file size & baseline lossless size
  useEffect(() => {
    if (!processedImageData) {
      setEncodedPreview(null);
      setLosslessByteSize(null);
      return;
    }

    setIsEncoding(true);
    const timer = setTimeout(() => {
      try {
        const exportOpts = {
          autoTrim,
          trimMargin: 24,
          compression,
          resizePreset,
          customLongEdge,
          customAspectW,
          customAspectH,
          fitMode,
          verticalAlign,
        };
        const result = encodeOptimizedPng(processedImageData, exportOpts);
        setEncodedPreview(result);

        if (compression === 'lossless') {
          setLosslessByteSize(result.byteSize);
        } else {
          const baseline = encodeOptimizedPng(processedImageData, {
            ...exportOpts,
            compression: 'lossless',
          });
          setLosslessByteSize(baseline.byteSize);
        }
      } finally {
        setIsEncoding(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [
    processedImageData,
    autoTrim,
    compression,
    resizePreset,
    customLongEdge,
    customAspectW,
    customAspectH,
    fitMode,
    verticalAlign,
  ]);

  // Render to visible canvas
  useEffect(() => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    const dataToRender = showOriginal ? sourceImageData : processedImageData;
    if (!dataToRender) return;

    canvas.width = dataToRender.width;
    canvas.height = dataToRender.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(dataToRender, 0, 0);
  }, [processedImageData, sourceImageData, showOriginal]);

  // History helper
  const pushHistory = useCallback(
    (nextState: HistoryState) => {
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        return [...sliced, nextState];
      });
      setHistoryIndex((prev) => prev + 1);
    },
    [historyIndex]
  );

  const handleUndo = () => {
    if (historyIndex > 0) setHistoryIndex(historyIndex - 1);
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) setHistoryIndex(historyIndex + 1);
  };

  const handleResetEdits = () => {
    if (currentHistory.seedPoints.length === 0 && currentHistory.brushStrokes.length === 0) return;
    pushHistory({ seedPoints: [], brushStrokes: [] });
    showToast('追加の穴抜き・ブラシ修正をリセットしました');
  };

  // Convert pointer event to image coordinates
  const getCanvasCoordinates = (e: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.max(0, Math.min(canvas.width - 1, (e.clientX - rect.left) * scaleX));
    const y = Math.max(0, Math.min(canvas.height - 1, (e.clientY - rect.top) * scaleY));
    return { x, y };
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!sourceImageData) return;

    if (activeTool === 'pan') {
      e.currentTarget.setPointerCapture(e.pointerId);
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        startX: panOffset.x,
        startY: panOffset.y,
      };
      return;
    }

    const pt = getCanvasCoordinates(e);
    if (!pt) return;

    if (activeTool === 'eyedropper') {
      const px = Math.round(pt.x);
      const py = Math.round(pt.y);
      const idx = (py * sourceImageData.width + px) * 4;
      const picked: RGBColor = {
        r: sourceImageData.data[idx],
        g: sourceImageData.data[idx + 1],
        b: sourceImageData.data[idx + 2],
      };
      setTargetColor(picked);
      setActiveTool('punch');
      showToast(`透過対象の色を ${rgbToHex(picked)} に変更しました`);
      return;
    }

    if (activeTool === 'punch') {
      if (mode === 'global') {
        showToast('現在「全体透過モード」です。部分穴抜きを使うには「外側＋タップ箇所」に切り替えてください');
        return;
      }
      pushHistory({
        seedPoints: [...currentHistory.seedPoints, pt],
        brushStrokes: currentHistory.brushStrokes,
      });
      showToast('タップ箇所の孤立した背景を追加透過しました（元に戻すことも可能です）');
      return;
    }

    if (activeTool === 'eraser' || activeTool === 'restore') {
      e.currentTarget.setPointerCapture(e.pointerId);
      isDrawingRef.current = true;
      currentStrokePointsRef.current = [pt];
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTool === 'pan' && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.clientX;
      const dy = e.clientY - panStartRef.current.clientY;
      setPanOffset({
        x: panStartRef.current.startX + dx,
        y: panStartRef.current.startY + dy,
      });
      return;
    }

    if (!isDrawingRef.current) return;
    const pt = getCanvasCoordinates(e);
    if (!pt) return;

    currentStrokePointsRef.current.push(pt);

    const canvas = displayCanvasRef.current;
    if (canvas && sourceImageData) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, brushRadius, 0, Math.PI * 2);
        if (activeTool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(249, 115, 22, 0.35)';
          ctx.fill();
        }
        ctx.restore();
      }
    }
  };

  const handleCanvasPointerUp = () => {
    if (panStartRef.current) {
      panStartRef.current = null;
    }
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      const pts = currentStrokePointsRef.current;
      if (pts.length > 0 && (activeTool === 'eraser' || activeTool === 'restore')) {
        const newStroke: BrushStroke = {
          type: activeTool === 'eraser' ? 'erase' : 'restore',
          points: pts,
          radius: brushRadius,
        };
        pushHistory({
          seedPoints: currentHistory.seedPoints,
          brushStrokes: [...currentHistory.brushStrokes, newStroke],
        });
      }
      currentStrokePointsRef.current = [];
    }
  };

  // Export transparent PNG using UPNG compressor & resize settings
  const handleDownload = () => {
    if (!processedImageData) return;
    const result =
      encodedPreview ??
      encodeOptimizedPng(processedImageData, {
        autoTrim,
        trimMargin: 24,
        compression,
        resizePreset,
        customLongEdge,
        customAspectW,
        customAspectH,
        fitMode,
        verticalAlign,
      });

    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}-${result.width}x${result.height}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(
      `透過PNG（${result.width}×${result.height}px / ${formatBytes(result.byteSize)}）を保存しました！`
    );
  };

  // Determine viewport background style
  const isCheckerDark = previewBg === 'checker-dark';
  const isCheckerLight = previewBg === 'checker-light';
  const solidPreviewColor = !isCheckerDark && !isCheckerLight ? previewBg : undefined;

  // Compute savings percentage compared to standard lossless PNG
  const savingsPercent =
    encodedPreview && losslessByteSize && losslessByteSize > encodedPreview.byteSize
      ? Math.round(((losslessByteSize - encodedPreview.byteSize) / losslessByteSize) * 100)
      : 0;

  const isFixedAspectPreset =
    resizePreset === '3:4_2000' ||
    resizePreset === '4:3_2000' ||
    resizePreset === '1:1_2000' ||
    resizePreset === 'custom';

  return (
    <div className="studio-shell">
      {/* Header */}
      <header className="studio-header">
        <div className="brand-group">
          <div className="brand-logo">
            <Scissors size={18} />
          </div>
          <div>
            <h1 className="brand-title">
              PNG Transparenter Studio
              <span className="brand-subtitle">Gemini Tシャツデザイン専用・高品位背景透過ツール</span>
            </h1>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsPromptModalOpen(true)}
            id="open-prompt-helper-btn"
          >
            <Sparkles size={15} style={{ color: 'var(--accent-primary)' }} />
            <span>Gemini用プロンプト作成</span>
          </button>

          {sourceImageData && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              id="change-image-btn"
            >
              <Upload size={15} />
              <span>別の画像を開く</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.jfif,.jpe,.jpg,.jpeg,.png,.webp,.avif,.bmp"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="studio-main">
        {/* Interactive Canvas Stage */}
        <section
          className="canvas-stage"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingFile(true);
          }}
          onDragLeave={() => setIsDraggingFile(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingFile(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileSelect(file);
          }}
        >
          {/* Top Floating Interactive Tool Bar */}
          {sourceImageData && (
            <div className="stage-top-bar">
              <div className="floating-pill" role="toolbar" aria-label="キャンバス操作ツール">
                <button
                  type="button"
                  className={`btn btn-ghost ${activeTool === 'punch' ? 'active' : ''}`}
                  onClick={() => setActiveTool('punch')}
                  title="孤立した黒背景（文字のOやAの中など）をタップして追加でくり抜きます"
                  id="tool-punch-btn"
                >
                  <Wand2 size={15} />
                  <span>タップで穴抜き</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost ${activeTool === 'eyedropper' ? 'active' : ''}`}
                  onClick={() => setActiveTool('eyedropper')}
                  title="画像内の色をクリックして透過対象色に設定します"
                  id="tool-eyedropper-btn"
                >
                  <Pipette size={15} />
                  <span>スポイト</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost ${activeTool === 'eraser' ? 'active' : ''}`}
                  onClick={() => setActiveTool('eraser')}
                  title="手動で不要な部分を消去します"
                  id="tool-eraser-btn"
                >
                  <Eraser size={15} />
                  <span>消しゴム</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost ${activeTool === 'restore' ? 'active' : ''}`}
                  onClick={() => setActiveTool('restore')}
                  title="消えすぎた部分をなぞって元の画像に戻します"
                  id="tool-restore-btn"
                >
                  <Paintbrush size={15} />
                  <span>復元ブラシ</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost ${activeTool === 'pan' ? 'active' : ''}`}
                  onClick={() => setActiveTool('pan')}
                  title="ドラッグして表示位置を移動します"
                  id="tool-pan-btn"
                >
                  <Hand size={15} />
                  <span>移動</span>
                </button>
              </div>

              <div className="floating-pill">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleUndo}
                  disabled={historyIndex === 0}
                  title="元に戻す"
                  id="undo-btn"
                >
                  <Undo2 size={15} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1}
                  title="やり直す"
                  id="redo-btn"
                >
                  <Redo2 size={15} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleResetEdits}
                  disabled={
                    currentHistory.seedPoints.length === 0 &&
                    currentHistory.brushStrokes.length === 0
                  }
                  title="穴抜き・ブラシ修正をリセット"
                >
                  <RotateCcw size={15} />
                </button>
                <div style={{ width: 1, height: 18, background: 'var(--border-strong)' }} />
                <button
                  type="button"
                  className={`btn btn-ghost ${showOriginal ? 'active' : ''}`}
                  onPointerDown={() => setShowOriginal(true)}
                  onPointerUp={() => setShowOriginal(false)}
                  onPointerLeave={() => setShowOriginal(false)}
                  title="長押しで元画像（透過前）と比較"
                  id="compare-original-btn"
                >
                  <Eye size={15} />
                  <span>押して元画像と比較</span>
                </button>
              </div>
            </div>
          )}

          {/* Toast Notification */}
          {statusMessage && (
            <div
              style={{
                position: 'absolute',
                top: sourceImageData ? 64 : 16,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 30,
                background: 'rgba(16, 185, 129, 0.95)',
                color: '#fff',
                padding: '8px 14px',
                borderRadius: '999px',
                fontSize: '0.78rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <CheckCircle2 size={15} />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Central Canvas Viewport or Empty Dropzone */}
          <div
            className={`canvas-viewport ${
              isCheckerDark ? 'bg-checker-dark' : isCheckerLight ? 'bg-checker-light' : ''
            }`}
            style={solidPreviewColor ? { backgroundColor: solidPreviewColor } : undefined}
            onWheel={(e) => {
              if (!sourceImageData) return;
              const delta = e.deltaY < 0 ? 0.12 : -0.12;
              setZoom((z) => Math.max(0.4, Math.min(4, Number((z + delta).toFixed(2)))));
            }}
          >
            {!sourceImageData ? (
              <div className={`dropzone-card ${isDraggingFile ? 'dragging' : ''}`}>
                <div
                  className="brand-logo"
                  style={{ width: 54, height: 54, borderRadius: 14, marginBottom: 4 }}
                >
                  <Upload size={26} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.18rem', fontWeight: 700, marginBottom: 6 }}>
                    Geminiで作成した黒背景画像（JFIF / JPG / PNG）をドロップ
                  </h2>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    デザイン内部の黒色はそのまま残し、外側の背景だけを透過。
                    <br />
                    <strong>3:4（1500×2000px / 長辺2000px）リサイズ＆軽量化</strong>して保存します。
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={() => fileInputRef.current?.click()}
                    id="upload-main-btn"
                  >
                    <Upload size={18} />
                    <span>画像を選択してアップロード</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-lg"
                    onClick={handleLoadSample}
                    id="load-sample-btn"
                  >
                    <ImageIcon size={18} style={{ color: 'var(--accent-primary)' }} />
                    <span>サンプル画像で試す（柴犬Tシャツ）</span>
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '16px',
                    fontSize: '0.74rem',
                    color: 'var(--text-muted)',
                    marginTop: 4,
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                  }}
                >
                  <span>✓ 3:4（1500×2000px）出力標準対応</span>
                  <span>✓ JFIF / JPG / PNG 対応</span>
                  <span>✓ 256色パレット軽量化対応</span>
                </div>
              </div>
            ) : (
              <div
                className="render-canvas-wrapper"
                style={{
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                  cursor:
                    activeTool === 'pan'
                      ? 'grab'
                      : activeTool === 'eyedropper' || activeTool === 'punch'
                      ? 'crosshair'
                      : 'cell',
                }}
              >
                {tshirtMockup ? (
                  <div className="tshirt-mockup-container">
                    <svg
                      viewBox="0 0 600 620"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        filter: 'drop-shadow(0 16px 36px rgba(0,0,0,0.55))',
                        pointerEvents: 'none',
                      }}
                    >
                      <path
                        d="M175,40 L235,40 C250,72 350,72 365,40 L425,40 L555,140 L500,235 L435,195 L435,575 L165,575 L165,195 L100,235 L45,140 Z"
                        fill={solidPreviewColor || '#181A20'}
                        stroke="rgba(255,255,255,0.18)"
                        strokeWidth="3"
                      />
                      <path
                        d="M230,42 C250,82 350,82 370,42"
                        fill="none"
                        stroke="rgba(128,128,128,0.35)"
                        strokeWidth="6"
                      />
                    </svg>
                    <canvas
                      ref={displayCanvasRef}
                      className="render-canvas"
                      style={{
                        position: 'relative',
                        zIndex: 2,
                        maxWidth: '40%',
                        maxHeight: '44%',
                        marginTop: '-4%',
                      }}
                      onPointerDown={handleCanvasPointerDown}
                      onPointerMove={handleCanvasPointerMove}
                      onPointerUp={handleCanvasPointerUp}
                    />
                  </div>
                ) : (
                  <canvas
                    ref={displayCanvasRef}
                    className="render-canvas"
                    style={{
                      maxWidth: '82vw',
                      maxHeight: '68dvh',
                    }}
                    onPointerDown={handleCanvasPointerDown}
                    onPointerMove={handleCanvasPointerMove}
                    onPointerUp={handleCanvasPointerUp}
                  />
                )}
              </div>
            )}
          </div>

          {/* Bottom Floating Bar: T-Shirt Fabric Preview & Zoom */}
          {sourceImageData && (
            <div className="stage-bottom-bar">
              <div className="floating-pill" style={{ padding: '6px 10px', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Shirt size={14} />
                  <span>背景・Tシャツ色確認:</span>
                </span>
                <div className="swatch-row">
                  {FABRIC_SWATCHES.map((item) => {
                    const isSelected = previewBg === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setPreviewBg(item.id)}
                        title={item.label}
                        className={`color-swatch ${isSelected ? 'active' : ''} ${
                          item.id === 'checker-dark'
                            ? 'bg-checker-dark'
                            : item.id === 'checker-light'
                            ? 'bg-checker-light'
                            : ''
                        }`}
                        style={item.color ? { backgroundColor: item.color } : undefined}
                      />
                    );
                  })}
                </div>
                <div style={{ width: 1, height: 18, background: 'var(--border-strong)' }} />
                <button
                  type="button"
                  className={`btn btn-ghost ${tshirtMockup ? 'active' : ''}`}
                  onClick={() => {
                    setTshirtMockup(!tshirtMockup);
                    if (!tshirtMockup && (previewBg === 'checker-dark' || previewBg === 'checker-light')) {
                      setPreviewBg('#FFFFFF');
                    }
                  }}
                  id="toggle-tshirt-mockup-btn"
                  title="Tシャツの上に配置した着用イメージで確認します"
                >
                  <Shirt size={14} />
                  <span>Tシャツモックアップ</span>
                </button>
              </div>

              <div className="floating-pill">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.2).toFixed(2))))}
                  title="縮小"
                >
                  <ZoomOut size={15} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setZoom(1);
                    setPanOffset({ x: 0, y: 0 });
                  }}
                  title="100%にリセット"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setZoom((z) => Math.min(4, Number((z + 0.2).toFixed(2))))}
                  title="拡大"
                >
                  <ZoomIn size={15} />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Right / Bottom Inspector Panel */}
        <aside className="inspector-panel">
          <div className="inspector-scroll">
            {/* Brush Size Control when Eraser or Restore is selected */}
            {(activeTool === 'eraser' || activeTool === 'restore') && (
              <div className="control-section" style={{ borderColor: 'var(--accent-border)' }}>
                <div className="section-header">
                  <span className="section-title">
                    {activeTool === 'eraser' ? <Eraser size={15} /> : <Paintbrush size={15} />}
                    {activeTool === 'eraser' ? '消しゴムブラシ設定' : '復元ブラシ設定'}
                  </span>
                  <span className="section-badge">キャンバスをなぞって調整</span>
                </div>
                <div className="slider-row">
                  <div className="slider-header">
                    <span className="slider-label">ブラシサイズ（半径）</span>
                    <span className="slider-value">{brushRadius} px</span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={80}
                    value={brushRadius}
                    onChange={(e) => setBrushRadius(Number(e.target.value))}
                    className="range-slider"
                  />
                </div>
              </div>
            )}

            {/* 1. Removal Mode Section */}
            <div className="control-section">
              <div className="section-header">
                <span className="section-title">
                  <Layers size={15} style={{ color: 'var(--accent-primary)' }} />
                  1. 背景の透過方式
                </span>
                <span className="section-badge">内部の黒を保護</span>
              </div>

              <div className="segmented-grid">
                <button
                  type="button"
                  className={`segment-btn ${mode === 'flood' ? 'active' : ''}`}
                  onClick={() => setMode('flood')}
                  id="mode-flood-btn"
                >
                  <span className="segment-btn-title">外側＋タップ箇所のみ</span>
                  <span className="segment-btn-desc">
                    外周から繋がる背景のみ透過。イラスト内の黒色は残します（推奨）
                  </span>
                </button>

                <button
                  type="button"
                  className={`segment-btn ${mode === 'global' ? 'active' : ''}`}
                  onClick={() => setMode('global')}
                  id="mode-global-btn"
                >
                  <span className="segment-btn-title">画像全体の同色を透過</span>
                  <span className="segment-btn-desc">
                    文字の隙間なども含め、指定した背景色を画像全体から一括で抜きます
                  </span>
                </button>
              </div>

              {mode === 'flood' && (
                <div className="helper-hint">
                  💡 <strong>文字の穴（OやAの内側など）を抜きたい時：</strong>
                  上の<strong>「タップで穴抜き」</strong>ツールで画像内の抜きたい黒背景をタップすると、そこだけ追加で透過できます！（現在 {currentHistory.seedPoints.length} 箇所追加）
                </div>
              )}
            </div>

            {/* 2. Target Background Color */}
            <div className="control-section">
              <div className="section-header">
                <span className="section-title">
                  <Pipette size={15} style={{ color: 'var(--accent-primary)' }} />
                  2. 抜きたい背景色（透過色）
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {rgbToHex(targetColor)}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div className="swatch-row">
                  {TARGET_COLOR_PRESETS.map((preset) => {
                    const isCurrent = rgbToHex(targetColor) === preset.hex;
                    return (
                      <button
                        key={preset.hex}
                        type="button"
                        title={preset.label}
                        onClick={() => setTargetColor(preset.color)}
                        className={`color-swatch ${isCurrent ? 'active' : ''}`}
                        style={{ backgroundColor: preset.hex }}
                      />
                    );
                  })}
                  <label
                    title="カスタム色を選択"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      cursor: 'pointer',
                      fontSize: '0.74rem',
                      color: 'var(--text-secondary)',
                      gap: 4,
                      marginLeft: 4,
                    }}
                  >
                    <input
                      type="color"
                      value={rgbToHex(targetColor)}
                      onChange={(e) => setTargetColor(hexToRgb(e.target.value))}
                      style={{
                        width: 26,
                        height: 26,
                        border: 'none',
                        padding: 0,
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                    />
                  </label>
                </div>

                <button
                  type="button"
                  className={`btn btn-secondary ${activeTool === 'eyedropper' ? 'active' : ''}`}
                  onClick={() => setActiveTool(activeTool === 'eyedropper' ? 'punch' : 'eyedropper')}
                  disabled={!sourceImageData}
                  style={{ padding: '6px 10px', fontSize: '0.76rem' }}
                >
                  <Pipette size={14} />
                  <span>画像からスポイト</span>
                </button>
              </div>
            </div>

            {/* 3. Threshold & Edge Refinement */}
            <div className="control-section">
              <div className="section-header">
                <span className="section-title">
                  <Grid size={15} style={{ color: 'var(--accent-primary)' }} />
                  3. 境界線・黒フチ除去の微調整
                </span>
              </div>

              <div className="slider-row">
                <div className="slider-header">
                  <span className="slider-label">黒色の許容度（しきい値）</span>
                  <span className="slider-value">{tolerance}%</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={65}
                  step={1}
                  value={tolerance}
                  onChange={(e) => setTolerance(Number(e.target.value))}
                  className="range-slider"
                  id="tolerance-slider"
                />
              </div>

              <div className="slider-row">
                <div className="slider-header">
                  <span className="slider-label">境界のなめらかさ（アンチエイリアス）</span>
                  <span className="slider-value">{feather}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={feather}
                  onChange={(e) => setFeather(Number(e.target.value))}
                  className="range-slider"
                  id="feather-slider"
                />
              </div>

              <div className="slider-row">
                <div className="slider-header">
                  <span className="slider-label">フチ削り（白Tシャツでの黒フチ残り対策）</span>
                  <span className="slider-value">{edgeChoke} px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={4}
                  step={1}
                  value={edgeChoke}
                  onChange={(e) => setEdgeChoke(Number(e.target.value))}
                  className="range-slider"
                  id="choke-slider"
                />
              </div>

              <div
                className="toggle-row"
                onClick={() => setDecontaminate(!decontaminate)}
                role="switch"
                aria-checked={decontaminate}
              >
                <span>境界の黒にじみ（色かぶり）を自動除去</span>
                <button
                  type="button"
                  className={`toggle-switch ${decontaminate ? 'checked' : ''}`}
                  aria-label="境界の黒にじみを自動除去"
                >
                  <span className="toggle-knob" />
                </button>
              </div>
            </div>

            {/* 4. Image Resize & Aspect Ratio (3:4 1500x2000px default) */}
            <div className="control-section">
              <div className="section-header">
                <span className="section-title">
                  <Maximize2 size={15} style={{ color: 'var(--accent-primary)' }} />
                  4. 出力リサイズ・アスペクト比
                </span>
                <span className="section-badge">
                  {encodedPreview
                    ? `${encodedPreview.width}×${encodedPreview.height}px`
                    : '1500×2000px (3:4)'}
                </span>
              </div>

              <div className="segmented-grid">
                {RESIZE_OPTIONS.map((opt) => {
                  const isSelected = resizePreset === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`segment-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => setResizePreset(opt.id)}
                      id={`resize-${opt.id}-btn`}
                    >
                      <span className="segment-btn-title">{opt.title}</span>
                      <span
                        style={{
                          fontSize: '0.66rem',
                          color: isSelected ? 'var(--accent-primary-hover)' : 'var(--text-muted)',
                          fontWeight: 600,
                        }}
                      >
                        {opt.badge}
                      </span>
                      <span className="segment-btn-desc" style={{ marginTop: 2 }}>
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Long Edge & Aspect Ratio Inputs */}
              {resizePreset === 'custom' && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 8,
                    background: 'var(--bg-input)',
                    padding: 10,
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      長辺 (px)
                    </label>
                    <input
                      type="number"
                      min={100}
                      max={8000}
                      value={customLongEdge}
                      onChange={(e) => setCustomLongEdge(Number(e.target.value) || 2000)}
                      style={{
                        background: 'var(--bg-panel)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 4,
                        padding: '5px 8px',
                        fontSize: '0.8rem',
                        width: '100%',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      横比率 (W)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={customAspectW}
                      onChange={(e) => setCustomAspectW(Number(e.target.value) || 3)}
                      style={{
                        background: 'var(--bg-panel)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 4,
                        padding: '5px 8px',
                        fontSize: '0.8rem',
                        width: '100%',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      縦比率 (H)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={customAspectH}
                      onChange={(e) => setCustomAspectH(Number(e.target.value) || 4)}
                      style={{
                        background: 'var(--bg-panel)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 4,
                        padding: '5px 8px',
                        fontSize: '0.8rem',
                        width: '100%',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Aspect Fit Mode & Vertical Alignment when a target ratio like 3:4 is selected */}
              {isFixedAspectPreset && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 2 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      比率変換時の配置方法
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className={`btn btn-ghost ${fitMode === 'contain' ? 'active' : ''}`}
                        onClick={() => setFitMode('contain')}
                        style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                        title="イラストが縦横に潰れないよう、比率を保ったまま3:4の透明枠内に収めます"
                      >
                        歪みなしフィット
                      </button>
                      <button
                        type="button"
                        className={`btn btn-ghost ${fitMode === 'cover' ? 'active' : ''}`}
                        onClick={() => setFitMode('cover')}
                        style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                        title="枠いっぱいに拡大して中央で切り抜きます"
                      >
                        切り抜き
                      </button>
                      <button
                        type="button"
                        className={`btn btn-ghost ${fitMode === 'stretch' ? 'active' : ''}`}
                        onClick={() => setFitMode('stretch')}
                        style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                        title="縦横比を強制的に3:4へ引き伸ばします"
                      >
                        引き伸ばし
                      </button>
                    </div>
                  </div>

                  {fitMode === 'contain' && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                      }}
                    >
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                        縦方向の配置位置
                      </span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          className={`btn btn-ghost ${verticalAlign === 'center' ? 'active' : ''}`}
                          onClick={() => setVerticalAlign('center')}
                          style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                        >
                          上下中央
                        </button>
                        <button
                          type="button"
                          className={`btn btn-ghost ${verticalAlign === 'top' ? 'active' : ''}`}
                          onClick={() => setVerticalAlign('top')}
                          style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                          title="Tシャツの胸元あたりにデザインが来るようやや上寄りに配置します"
                        >
                          やや上寄せ（胸元用）
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div
                className="toggle-row"
                onClick={() => setAutoTrim(!autoTrim)}
                role="switch"
                aria-checked={autoTrim}
              >
                <span>周囲の透明余白をカットしてからリサイズ枠に合わせる</span>
                <button
                  type="button"
                  className={`toggle-switch ${autoTrim ? 'checked' : ''}`}
                  aria-label="透明な余白を自動トリミング"
                >
                  <span className="toggle-knob" />
                </button>
              </div>
            </div>

            {/* 5. PNG Compression & Size Optimization */}
            <div className="control-section">
              <div className="section-header">
                <span className="section-title">
                  <FileDown size={15} style={{ color: 'var(--accent-primary)' }} />
                  5. PNGファイル容量の軽量化
                </span>
                {savingsPercent > 0 && (
                  <span
                    className="section-badge"
                    style={{
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#34d399',
                      borderColor: 'rgba(16, 185, 129, 0.4)',
                    }}
                  >
                    -{savingsPercent}% 軽量化
                  </span>
                )}
              </div>

              <div className="segmented-grid">
                {COMPRESSION_OPTIONS.map((opt) => {
                  const isSelected = compression === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`segment-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => setCompression(opt.id)}
                      id={`compression-${opt.id}-btn`}
                    >
                      <span className="segment-btn-title">{opt.title}</span>
                      <span
                        style={{
                          fontSize: '0.66rem',
                          color: isSelected ? 'var(--accent-primary-hover)' : 'var(--text-muted)',
                          fontWeight: 600,
                        }}
                      >
                        {opt.badge}
                      </span>
                      <span className="segment-btn-desc" style={{ marginTop: 2 }}>
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Export Footer with Live File Size Indicator */}
          <div className="inspector-footer">
            {encodedPreview && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.76rem',
                  background: 'var(--bg-input)',
                  padding: '7px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ color: 'var(--text-secondary)' }}>
                  出力: <strong>{encodedPreview.width}×{encodedPreview.height}px</strong>
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    color: '#34d399',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {isEncoding ? '計算中...' : formatBytes(encodedPreview.byteSize)}
                  {losslessByteSize && losslessByteSize > encodedPreview.byteSize && !isEncoding && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        textDecoration: 'line-through',
                      }}
                    >
                      {formatBytes(losslessByteSize)}
                    </span>
                  )}
                  {originalFileSize && !isEncoding && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                      (元: {formatBytes(originalFileSize)})
                    </span>
                  )}
                </span>
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={handleDownload}
              disabled={!processedImageData}
              id="download-png-btn"
              style={{ width: '100%' }}
            >
              <Download size={18} />
              <span>
                透過PNGをダウンロード
                {encodedPreview
                  ? ` (${encodedPreview.width}×${encodedPreview.height} / ${formatBytes(
                      encodedPreview.byteSize
                    )})`
                  : ''}
              </span>
            </button>
          </div>
        </aside>
      </main>

      {/* Gemini Prompt Generator Modal */}
      <PromptHelperModal
        isOpen={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
      />
    </div>
  );
}

export default App;
