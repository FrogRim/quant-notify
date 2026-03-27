import { useState, useRef, useEffect } from 'react';
import { SUPPORTED_UI_LANGUAGES, type UiLanguageCode } from '../../i18n';
import { useUser } from '../../context/UserContext';

export default function LanguagePicker() {
  const { uiLanguage, setUiLanguage } = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = SUPPORTED_UI_LANGUAGES.find((l) => l.code === uiLanguage) ?? SUPPORTED_UI_LANGUAGES[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = async (code: UiLanguageCode) => {
    setOpen(false);
    await setUiLanguage(code);
  };

  return (
    <div ref={ref} className="relative z-[70]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 h-8 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <span>{current.flag}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <svg className="w-3 h-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-[80] mt-1 w-40 rounded-md border border-border bg-background shadow-md">
          {SUPPORTED_UI_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => void handleSelect(lang.code)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors first:rounded-t-md last:rounded-b-md ${
                lang.code === uiLanguage ? 'bg-accent/50 font-medium' : ''
              }`}
            >
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
