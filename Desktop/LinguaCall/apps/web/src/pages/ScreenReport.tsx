import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Report, TranscriptMessage, ReportEvaluatorGrammarCorrection } from '@lingua/shared';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useUser } from '../context/UserContext';
import { apiClient, describeApiError } from '../lib/api';
import LanguagePicker from '../components/ui/LanguagePicker';
import { buildHighlightSegments } from '../lib/highlightHelpers';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

const GetTokenContext = createContext<() => Promise<string | null>>(() => Promise.resolve(null));

// ── Word Popover ──────────────────────────────────────────────────────────────

type DictEntry = { pos: string; meaning: string; example: string };
type PopoverEntry =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: DictEntry };

const dictCache = new Map<string, DictEntry | null>();

function WordSpan({ word, lang }: { word: string; lang: string }) {
  const [popover, setPopover] = useState<PopoverEntry | null>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  const getToken = useContext(GetTokenContext);

  const handleClick = async () => {
    if (popover) { setPopover(null); return; }
    const clean = word.replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase();
    if (!clean) return;

    const cacheKey = `${lang}:${clean}`;
    if (dictCache.has(cacheKey)) {
      const cached = dictCache.get(cacheKey);
      if (cached) setPopover({ status: 'ready', data: cached });
      else setPopover({ status: 'error' });
      return;
    }

    setPopover({ status: 'loading' });
    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/dictionary?word=${encodeURIComponent(clean)}&lang=${encodeURIComponent(lang)}`, { headers });
      const payload = await res.json() as { ok: boolean; data?: DictEntry; error?: { message?: string } };
      if (payload.ok && payload.data) {
        dictCache.set(cacheKey, payload.data);
        setPopover({ status: 'ready', data: payload.data });
      } else {
        dictCache.set(cacheKey, null);
        setPopover({ status: 'error' });
      }
    } catch {
      dictCache.set(cacheKey, null);
      setPopover({ status: 'error' });
    }
  };

  return (
    <span className="relative inline-block">
      <span
        ref={spanRef}
        className="cursor-pointer underline decoration-dotted decoration-muted-foreground underline-offset-2 hover:text-primary transition-colors"
        onClick={() => void handleClick()}
      >
        {word}
      </span>
      {popover && (
        <span className="absolute z-50 bottom-full left-0 mb-1 w-56 bg-card text-card-foreground border border-border rounded-md shadow-sm p-3 text-xs not-italic font-normal leading-relaxed">
          {popover.status === 'loading' && <span className="text-muted-foreground">조회 중...</span>}
          {popover.status === 'error' && <span className="text-destructive">조회 실패</span>}
          {popover.status === 'ready' && (
            <span className="space-y-1 block">
              <span className="block text-muted-foreground uppercase tracking-wide font-medium text-[10px]">{popover.data.pos}</span>
              <span className="block text-foreground">{popover.data.meaning}</span>
              {popover.data.example && (
                <span className="block text-muted-foreground italic">{popover.data.example}</span>
              )}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function ClickableText({ text, lang }: { text: string; lang: string }) {
  const tokens = text.split(/(\s+|[^\p{L}\p{N}'-]+)/u);
  return (
    <>
      {tokens.map((token, i) =>
        /[\p{L}\p{N}]/u.test(token)
          ? <WordSpan key={i} word={token} lang={lang} />
          : <span key={i}>{token}</span>
      )}
    </>
  );
}

// ── Transcript Block (document style, not chat bubbles) ───────────────────────

function HighlightedUserText({
  text,
  corrections
}: {
  text: string;
  corrections: ReportEvaluatorGrammarCorrection[];
}) {
  const segments = buildHighlightSegments(text, corrections);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'normal' ? (
          <span key={i}>{seg.text}</span>
        ) : (
          <span key={i}>
            <span className="line-through text-destructive">{seg.text}</span>
            <span className="text-primary ml-1">({seg.suggestion})</span>
          </span>
        )
      )}
    </>
  );
}

function TranscriptBlock({
  messages,
  corrections,
  lang
}: {
  messages: TranscriptMessage[];
  corrections: ReportEvaluatorGrammarCorrection[];
  lang: string;
}) {
  const { t } = useTranslation();
  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('session.noTranscript')}</p>;
  }

  return (
    <div className="space-y-4">
      {messages.map((msg, i) => {
        const isUser = msg.role === 'user';
        return (
          <div key={i} className="space-y-0.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {isUser ? 'You' : 'AI'}
            </div>
            <p className="text-sm leading-relaxed text-foreground">
              {isUser ? (
                <HighlightedUserText text={msg.content} corrections={corrections} />
              ) : (
                <ClickableText text={msg.content} lang={lang} />
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ScreenReport() {
  const { t } = useTranslation();
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { getToken } = useUser();

  const [report, setReport] = useState<Report | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!reportId) return;
    const api = apiClient(getToken);
    void (async () => {
      try {
        const r = await api.get<Report>(`/reports/${decodeURIComponent(reportId)}`);
        setReport(r);
        try {
          const msgRes = await api.get<{ sessionId: string; messages: TranscriptMessage[] }>(
            `/sessions/${r.sessionId}/messages?limit=200`
          );
          setMessages(msgRes.messages);
        } catch {
          // non-fatal
        }
      } catch (err) {
        setError(describeApiError(err, 'report_load'));
      } finally {
        setLoading(false);
      }
    })();
  }, [reportId, getToken]);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between py-4">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('common.appName')}</h1>
          <div className="flex items-center gap-2">
            <LanguagePicker />
            <Button variant="outline" size="sm" onClick={() => navigate('/session')}>
              {t('nav.sessions')}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('report.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && <p className="text-sm text-muted-foreground">{t('report.loading')}</p>}
            {error && (
              <p className="text-sm text-destructive">{t('report.loadFailed', { error })}</p>
            )}
            {report && (
              <GetTokenContext.Provider value={getToken}>
                <ReportView report={report} messages={messages} />
              </GetTokenContext.Provider>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Report View — section order: summary → corrections → transcript → recommendations ──

function ReportView({ report, messages }: { report: Report; messages: TranscriptMessage[] }) {
  const { t } = useTranslation();
  const ev = report.evaluation;
  const corrections = ev?.grammarCorrections ?? [];
  const vocabulary = ev?.vocabularyAnalysis ?? [];
  const fluency = ev?.fluencyMetrics;
  const lang = report.language || 'en';

  return (
    <div className="space-y-8 text-sm">

      {/* Status */}
      <div className="flex items-center gap-2">
        <Badge variant={report.status === 'ready' ? 'default' : 'secondary'}>
          {report.status}
        </Badge>
        {report.status === 'failed' && (
          <span className="text-destructive text-xs">{t('report.generationFailed')}</span>
        )}
      </div>

      {/* 1. Scores */}
      {ev && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: t('report.scores.total'), value: ev.totalScore },
              { label: t('report.scores.grammar'), value: ev.grammarScore },
              { label: t('report.scores.vocabulary'), value: ev.vocabularyScore },
              { label: t('report.scores.fluency'), value: ev.fluencyScore }
            ].map(({ label, value }) => (
              <div key={label} className="bg-secondary rounded-md p-4 text-center border border-border">
                <div className="text-2xl font-bold tracking-tight text-primary">{value}</div>
                <div className="text-xs text-muted-foreground mt-1">{label}</div>
              </div>
            ))}
          </div>
          {ev.levelAssessment && (
            <div className="rounded-md border border-border bg-secondary px-4 py-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
                {t('report.levelAssessment')}
              </p>
              <p className="text-foreground leading-relaxed">{ev.levelAssessment}</p>
            </div>
          )}
        </div>
      )}

      {/* 2. Summary */}
      {report.summaryText && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">
            {t('report.summary')}
          </p>
          <p className="text-foreground leading-relaxed">{report.summaryText}</p>
        </div>
      )}

      {/* 3. Grammar Corrections */}
      {corrections.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-3">
            {t('report.grammarCorrections')}
          </p>
          <div className="space-y-2">
            {corrections.map((item, i) => (
              <div key={i} className="rounded-md border border-border bg-secondary px-4 py-3 text-sm leading-relaxed">
                <span className="text-xs text-muted-foreground mr-2">
                  {Math.round(item.timestamp_ms_from_call_start / 1000)}s
                </span>
                <span className="line-through text-destructive">{item.issue}</span>
                <span className="text-muted-foreground mx-1">→</span>
                <span className="text-primary">{item.suggestion}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Transcript */}
      {messages.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-3">
            {t('session.transcript')}
          </p>
          <TranscriptBlock messages={messages} corrections={corrections} lang={lang} />
        </div>
      )}

      {/* 5. Recommendations */}
      {report.recommendations && report.recommendations.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">
            {t('report.recommendations')}
          </p>
          <ul className="space-y-1">
            {report.recommendations.map((r, i) => (
              <li key={i} className="flex gap-2 leading-relaxed">
                <span className="text-muted-foreground shrink-0">·</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 6. Vocabulary & Fluency */}
      {vocabulary.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">
            {t('report.vocabularyAnalysis')}
          </p>
          <ul className="space-y-1 text-xs">
            {vocabulary.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted-foreground shrink-0">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {fluency && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t('report.avgWpm'), value: fluency.avg_wpm },
            { label: t('report.fillers'), value: fluency.filler_count },
            { label: t('report.pauses'), value: fluency.pause_count }
          ].map(({ label, value }) => (
            <div key={label} className="rounded-md border border-border bg-secondary p-3 text-center">
              <div className="text-xl font-bold text-foreground">{value}</div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 7. Meta */}
      <div className="text-xs text-muted-foreground space-y-1 pt-4 border-t border-border">
        <div>{t('report.sessionId')}: {report.sessionId}</div>
        <div>{t('report.attempts')}: {report.attemptCount}</div>
        {report.readyAt && <div>{t('report.readyAt')}: {report.readyAt}</div>}
        {report.errorCode && <div>{t('report.errorCode')}: {report.errorCode}</div>}
      </div>
    </div>
  );
}
