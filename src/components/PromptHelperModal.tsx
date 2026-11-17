import React, { useState } from 'react';
import { Sparkles, Copy, Check, X } from 'lucide-react';

interface PromptHelperModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type StylePreset = 'sticker' | 'vector' | 'vintage' | 'magenta_outline';

const PRESETS: Record<
  StylePreset,
  {
    name: string;
    desc: string;
    bgColorNote: string;
    template: (subject: string) => string;
  }
> = {
  sticker: {
    name: '白フチ・ステッカー風（黒背景・一番おすすめ）',
    desc: '被写体の外周に白いステッカー枠をつけることで、イラスト内部の黒い線や影を100%守りつつ外側だけを綺麗に透過できます。',
    bgColorNote: '透過色：黒（#000000）',
    template: (subject) =>
      `A T-shirt graphic design of ${subject || 'a cool shiba inu wearing black sunglasses'}, flat vector illustration style, crisp clean edges, with a bold solid white die-cut sticker outline around the entire subject. Isolated on a solid pure pitch black background (#000000), no background gradients, no drop shadows, no lighting effects on the background.`,
  },
  vector: {
    name: 'くっきりフラットベクター風（黒背景）',
    desc: '境界線がはっきりしたロゴ・イラスト向け。明るい色のモチーフや、外側が黒線でないデザインに最適です。',
    bgColorNote: '透過色：黒（#000000）',
    template: (subject) =>
      `A minimalist flat vector T-shirt illustration of ${subject || 'a retro neon cassette tape with bold typography'}, sharp clean contour edges, vibrant solid colors, high contrast against the background. Isolated on a solid pure black background (#000000), zero gradients on background, no floor shadow.`,
  },
  magenta_outline: {
    name: '外側まで黒主線そのまま（マゼンタ背景＋スポイト用）',
    desc: '白いステッカー枠をつけず、イラストの一番外側まで黒い主線（輪郭線）にしたい場合は、マゼンタ背景で生成して当ツールの「スポイト」で背景を抜くと黒主線が完璧に残ります！',
    bgColorNote: '透過色：スポイトでマゼンタ（#FF00FF）を選択',
    template: (subject) =>
      `A bold ink-outlined T-shirt illustration of ${subject || 'a street style fierce tiger emblem with black ink outlines'}, crisp cel-shaded vector art, sharp clean outer black line art. Isolated on a solid pure flat magenta background (#FF00FF), no gradients, no shadows, no magenta reflections on the subject.`,
  },
  vintage: {
    name: 'レトロ・ストリートロゴ風（黒背景）',
    desc: 'アパレル定番の80s/90sストリートグラフィック風。輪郭をくっきりさせてTシャツプリント向けに最適化します。',
    bgColorNote: '透過色：黒（#000000）',
    template: (subject) =>
      `A 90s retro streetwear T-shirt graphic of ${subject || 'a skateboarding astronaut holding a boombox'}, bold clean screen-print style colors, crisp outer contour border, isolated on a solid pure pitch black background (#000000), no background texture, no vignette, no gradients.`,
  },
};

export const PromptHelperModal: React.FC<PromptHelperModalProps> = ({ isOpen, onClose }) => {
  const [subject, setSubject] = useState('サングラスとヘッドホンをつけた柴犬と「TOKYO BEATS」のロゴ');
  const [preset, setPreset] = useState<StylePreset>('sticker');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const activePreset = PRESETS[preset];
  const generatedPrompt = `${activePreset.template(subject)}\n\n（※日本語でそのままGeminiに指示する場合：\n「${subject}」のTシャツ用イラストを作成してください。境界がくっきりしたフラットベクター調で、背景はグラデーションや影の一切ない完全な単色の真っ黒（#000000）にしてください。${
    preset === 'sticker'
      ? 'イラストと文字全体の外周に、背景の黒としっかり区別できる白いステッカー風のフチどりをつけてください。'
      : preset === 'magenta_outline'
      ? '黒い輪郭線を残したいので、背景は完全な単色のマゼンタ（#FF00FF）にしてください。'
      : '内部の黒色と背景が混ざらないよう、外側の輪郭をはっきり描いてください。'
  }）`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="brand-logo" style={{ width: 28, height: 28 }}>
              <Sparkles size={16} />
            </div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
              Gemini Tシャツデザイン用プロンプト作成支援
            </h2>
          </div>
          <button className="btn btn-ghost" onClick={onClose} aria-label="閉じる">
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Geminiで背景透過しやすい高品位なTシャツデザインを生成するためのプロンプトを作成します。
          <strong>「デザイン内部の黒を残す」</strong>ためのコツが自動で組み込まれます。
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            1. 描きたいモチーフ・文字を入力（日本語または英語）
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="例：サングラスをかけた猫とレトロなロゴ"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-sm)',
              padding: '9px 12px',
              fontSize: '0.85rem',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            2. 透過しやすさ重視のスタイルを選択
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
            {(Object.keys(PRESETS) as StylePreset[]).map((key) => {
              const item = PRESETS[key];
              const isSelected = preset === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPreset(key)}
                  className={`segment-btn ${isSelected ? 'active' : ''}`}
                  style={{ padding: '10px 12px' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      width: '100%',
                      alignItems: 'center',
                    }}
                  >
                    <span className="segment-btn-title">{item.name}</span>
                    <span className="section-badge">{item.bgColorNote}</span>
                  </div>
                  <span className="segment-btn-desc" style={{ marginTop: 3 }}>
                    {item.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div className="section-header">
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              3. 生成されたプロンプト（Geminiに貼り付け）
            </span>
            <button className="btn btn-primary" onClick={handleCopy} id="copy-gemini-prompt-btn">
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'コピーしました！' : 'プロンプトをコピー'}
            </button>
          </div>
          <div className="prompt-box" style={{ whiteSpace: 'pre-wrap' }}>
            {generatedPrompt}
          </div>
        </div>
      </div>
    </div>
  );
};
