import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguagePicker from '../components/ui/LanguagePicker';
import type {
  Session,
  BillingPlan,
  UserProfile,
  Report,
  SessionMessagesResponse,
  CreateSessionPayload,
  UpdateScheduledSessionPayload,
  JoinCallResponse,
  StartCallResponse
} from '@lingua/shared';
import {
  startWebVoiceClient,
  type WebVoiceClientController,
  type WebVoiceClientState
} from '../lib/webVoiceClient';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useUser } from '../context/UserContext';
import { apiClient, describeApiError, normalizeApiError } from '../lib/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

type ActiveWebVoiceSession = {
  sessionId: string;
  state: WebVoiceClientState;
  transcript: string[];
  controller: WebVoiceClientController | null;
  note?: string;
};

const ACTIVE_SESSION_STATUSES = ['connecting', 'dialing', 'ringing', 'in_progress', 'ending'];
const SESSION_POLL_INTERVAL_MS = 4000;

function formatSessionTime(utc?: string) {
  if (!utc) return 'n/a';
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return utc;
  return date.toLocaleString();
}

function toDateTimeLocalValue(utc?: string) {
  if (!utc) return '';
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function canJoinScheduledSession(session: Session) {
  if (session.status !== 'scheduled' || !session.scheduledForAtUtc) return false;
  const scheduledAt = new Date(session.scheduledForAtUtc).getTime();
  if (Number.isNaN(scheduledAt)) return false;
  return Date.now() >= scheduledAt - 10 * 60 * 1000;
}

function getStatusBadgeVariant(
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' | 'indigo' | 'softRed' {
  if (['in_progress', 'connecting'].includes(status)) return 'default';
  if (status === 'completed') return 'indigo';
  if (['failed', 'cancelled', 'provider_error', 'user_cancelled', 'schedule_missed', 'no_answer'].includes(status)) return 'softRed';
  return 'outline';
}

type DetailState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'report'; report: Report }
  | { kind: 'transcript'; data: SessionMessagesResponse }
  | { kind: 'error'; message: string };

export default function ScreenSession() {
  const { t } = useTranslation();
  const { getToken, clearIdentity } = useUser();
  const navigate = useNavigate();

  type TopicOption = { value: string; labelKey: string };
  type LangExamConfig = {
    exam: string;
    defaultLevel: string;
    defaultTopic: string;
    levelOptions: string[];
    topicOptions: TopicOption[];
  };

  const LANG_CONFIGS: Record<string, LangExamConfig> = {
    en: {
      exam: 'opic',
      defaultLevel: 'IM3',
      defaultTopic: 'daily conversation',
      levelOptions: ['NL', 'NM', 'NH', 'IL', 'IM1', 'IM2', 'IM3', 'IH', 'AL'],
      topicOptions: [
        { value: 'daily conversation', labelKey: 'en_daily' },
        { value: 'travel', labelKey: 'en_travel' },
        { value: 'work & career', labelKey: 'en_work' },
        { value: 'technology', labelKey: 'en_tech' },
        { value: 'environment', labelKey: 'en_environment' },
        { value: 'health', labelKey: 'en_health' },
        { value: 'education', labelKey: 'en_education' }
      ]
    },
    de: {
      exam: 'goethe_b2',
      defaultLevel: 'B1',
      defaultTopic: 'Studium und Beruf',
      levelOptions: ['A2', 'B1', 'B2'],
      topicOptions: [
        { value: 'Studium und Beruf', labelKey: 'de_study' },
        { value: 'Gesellschaft und Kultur', labelKey: 'de_society' },
        { value: 'Umwelt und Natur', labelKey: 'de_environment' },
        { value: 'Gesundheit', labelKey: 'de_health' },
        { value: 'Reisen', labelKey: 'de_travel' },
        { value: 'Technik und Medien', labelKey: 'de_tech' },
        { value: 'Kunst und Literatur', labelKey: 'de_art' }
      ]
    },
    zh: {
      exam: 'hsk5',
      defaultLevel: 'HSK4',
      defaultTopic: '工作与职业',
      levelOptions: ['HSK3', 'HSK4', 'HSK5'],
      topicOptions: [
        { value: '工作与职业', labelKey: 'zh_work' },
        { value: '文化与社会', labelKey: 'zh_culture' },
        { value: '科技与创新', labelKey: 'zh_tech' },
        { value: '环境与自然', labelKey: 'zh_environment' },
        { value: '旅行与生活', labelKey: 'zh_travel' },
        { value: '教育与学习', labelKey: 'zh_education' }
      ]
    },
    es: {
      exam: 'dele_b1',
      defaultLevel: 'A2',
      defaultTopic: 'vida cotidiana',
      levelOptions: ['A1', 'A2', 'B1'],
      topicOptions: [
        { value: 'vida cotidiana', labelKey: 'es_daily' },
        { value: 'viajes y turismo', labelKey: 'es_travel' },
        { value: 'trabajo y profesión', labelKey: 'es_work' },
        { value: 'cultura y sociedad', labelKey: 'es_culture' },
        { value: 'salud', labelKey: 'es_health' },
        { value: 'tecnología', labelKey: 'es_tech' }
      ]
    },
    ja: {
      exam: 'jlpt_n2',
      defaultLevel: 'N3',
      defaultTopic: '仕事と日常生活',
      levelOptions: ['N4', 'N3', 'N2', 'N1'],
      topicOptions: [
        { value: '仕事と日常生活', labelKey: 'ja_work' },
        { value: '旅行と観光', labelKey: 'ja_travel' },
        { value: '社会と文化', labelKey: 'ja_society' },
        { value: '技術と革新', labelKey: 'ja_tech' },
        { value: '環境と自然', labelKey: 'ja_environment' },
        { value: '教育と学習', labelKey: 'ja_education' },
        { value: '健康と生活', labelKey: 'ja_health' }
      ]
    },
    fr: {
      exam: 'delf_b1',
      defaultLevel: 'A2',
      defaultTopic: 'vie quotidienne',
      levelOptions: ['A1', 'A2', 'B1'],
      topicOptions: [
        { value: 'vie quotidienne', labelKey: 'fr_daily' },
        { value: 'voyages et tourisme', labelKey: 'fr_travel' },
        { value: 'travail et carrière', labelKey: 'fr_work' },
        { value: 'culture et société', labelKey: 'fr_culture' },
        { value: 'santé', labelKey: 'fr_health' },
        { value: 'technologie', labelKey: 'fr_tech' },
        { value: 'environnement', labelKey: 'fr_environment' }
      ]
    }
  };

  // Form state
  const [language, setLanguage] = useState<'en' | 'de' | 'zh' | 'es' | 'ja' | 'fr'>('en');
  const [mode, setMode] = useState<'immediate' | 'scheduled_once'>('immediate');
  const [level, setLevel] = useState('IM3');
  const [topic, setTopic] = useState('daily conversation');
  const [duration, setDuration] = useState(10);

  const handleLanguageChange = (lang: 'en' | 'de' | 'zh' | 'es' | 'ja' | 'fr') => {
    const cfg = LANG_CONFIGS[lang];
    setLanguage(lang);
    setLevel(cfg.defaultLevel);
    setTopic(cfg.defaultTopic);
  };
  const [scheduledFor, setScheduledFor] = useState('');
  const [durationOptions, setDurationOptions] = useState([10]);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');

  // Sessions
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [globalMessage, setGlobalMessage] = useState('');

  // Active voice session ??both ref (for callbacks) and state (for rendering)
  const activeRef = useRef<ActiveWebVoiceSession | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveWebVoiceSession | null>(null);

  // Per-session edit times
  const [editTimes, setEditTimes] = useState<Record<string, string>>({});

  // Detail panel
  const [detail, setDetail] = useState<DetailState>({ kind: 'idle' });

  const makeApi = useCallback(() => apiClient(getToken), [getToken]);

  const loadSessions = useCallback(async (showLoading = true) => {
    const api = makeApi();
    if (showLoading) setSessionsLoading(true);
    try {
      const list = await api.get<Session[]>('/sessions');
      setSessions(list);
    } catch {
      setGlobalMessage('failed to load sessions');
    } finally {
      if (showLoading) setSessionsLoading(false);
    }
  }, [makeApi]);

  const loadDurationOptions = useCallback(async () => {
    const api = makeApi();
    try {
      const [profile, plans] = await Promise.all([
        api.get<UserProfile>('/users/me'),
        api.get<BillingPlan[]>('/billing/plans')
      ]);
      const plan = plans.find(p => p.code === profile.planCode);
      const max = plan?.maxSessionMinutes && plan.maxSessionMinutes >= 10
        ? plan.maxSessionMinutes
        : 10;
      const opts = [10];
      if (max >= 15) opts.push(15);
      setDurationOptions([...new Set(opts)].sort((a, b) => a - b));
    } catch {
      setDurationOptions([10]);
    }
  }, [makeApi]);

  useEffect(() => {
    void loadDurationOptions();
    void loadSessions();
  }, [loadDurationOptions, loadSessions]);

  const sessionsRef = useRef<Session[]>([]);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const shouldPoll =
        sessionsRef.current.some(
          session =>
            ACTIVE_SESSION_STATUSES.includes(session.status) ||
            session.reportStatus === 'pending'
        ) || !!activeRef.current;

      if (shouldPoll) {
        void loadSessions(false);
      }
    }, SESSION_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadSessions]);

  const syncActive = (next: ActiveWebVoiceSession | null) => {
    activeRef.current = next;
    setActiveSession(next ? { ...next } : null);
  };

  const beginWebVoiceSession = async (sessionId: string, join: boolean) => {
    if (activeRef.current?.controller) {
      setGlobalMessage('another live session is already active.');
      return;
    }
    const api = makeApi();

    const initial: ActiveWebVoiceSession = {
      sessionId,
      state: 'connecting',
      transcript: [],
      controller: null,
      note: 'Preparing live audio session...'
    };
    syncActive(initial);

    try {
      const bootstrap: StartCallResponse | JoinCallResponse = join
        ? await api.post<JoinCallResponse>(`/calls/${sessionId}/join`, {})
        : await api.post<StartCallResponse>('/calls/initiate', { sessionId });

      const controller = await startWebVoiceClient({
        apiBase: API_BASE,
        bootstrap: bootstrap as StartCallResponse,
        headers: await api.headers(),
        onStateChange: (state, message) => {
          if (!activeRef.current || activeRef.current.sessionId !== sessionId) return;
          syncActive({ ...activeRef.current, state, note: message });
          if (state === 'live') {
            setGlobalMessage('live session connected. Speak naturally.');
            void loadSessions();
          }
          if (state === 'ended') {
            setGlobalMessage('live session ended. Report generation may follow shortly.');
            syncActive(null);
            void loadSessions();
          }
          if (state === 'failed') {
            setGlobalMessage('live session failed. Check microphone/network and try again.');
            syncActive(null);
            void loadSessions();
          }
        },
        onTranscriptChange: (transcript) => {
          if (!activeRef.current || activeRef.current.sessionId !== sessionId) return;
          const lines = transcript.map(e => `${e.role}: ${e.content}`);
          syncActive({ ...activeRef.current, transcript: lines });
        }
      });

      if (activeRef.current && activeRef.current.sessionId === sessionId) {
        syncActive({
          ...activeRef.current,
          controller,
          note: 'Waiting for OpenAI Realtime connection...'
        });
      }
    } catch (error) {
      syncActive(null);
      setGlobalMessage(
        `call start failed: ${describeApiError(error, join ? 'call_join' : 'call_start')}`
      );
      await loadSessions();
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const api = makeApi();
    setFormLoading(true);
    setFormError('');
    setFormMessage('');
    try {
      const payload: CreateSessionPayload = {
        language,
        exam: LANG_CONFIGS[language].exam as CreateSessionPayload['exam'],
        level,
        topic,
        durationMinutes: duration,
        contactMode: mode,
        scheduledForAtUtc:
          mode === 'scheduled_once' && scheduledFor
            ? new Date(scheduledFor).toISOString()
            : undefined,
        timezone: 'Asia/Seoul'
      };
      const session = await api.post<Session>('/sessions', payload);
      setFormMessage(
        session.contactMode === 'scheduled_once'
          ? `scheduled session created for ${formatSessionTime(session.scheduledForAtUtc)}`
          : 'session created. Start the call when ready.'
      );
      setDetail({ kind: 'idle' });
      await loadSessions();
    } catch (err) {
      setFormError(describeApiError(err, 'session_create'));
    } finally {
      setFormLoading(false);
    }
  };

  const handleViewReport = async (sessionId: string) => {
    const api = makeApi();
    setDetail({ kind: 'loading' });
    try {
      let report: Report;
      try {
        report = await api.get<Report>(`/sessions/${sessionId}/report`);
      } catch (err) {
        const e = normalizeApiError(err);
        if (!['not_found', 'conflict'].includes(e.code)) throw err;
        report = await api.post<Report>(`/sessions/${sessionId}/report`, {});
      }
      setDetail({ kind: 'report', report });
    } catch (err) {
      setDetail({ kind: 'error', message: describeApiError(err, 'report_load') });
    }
  };

  const handleViewTranscript = async (sessionId: string) => {
    const api = makeApi();
    setDetail({ kind: 'loading' });
    try {
      const data = await api.get<SessionMessagesResponse>(
        `/sessions/${sessionId}/messages?limit=50`
      );
      setDetail({ kind: 'transcript', data });
    } catch (err) {
      setDetail({ kind: 'error', message: describeApiError(err, 'transcript_load') });
    }
  };

  const handleUpdateSchedule = async (sessionId: string) => {
    const api = makeApi();
    const time = editTimes[sessionId];
    if (!time) {
      setGlobalMessage('scheduled time is required');
      return;
    }
    try {
      const payload: UpdateScheduledSessionPayload = {
        scheduledForAtUtc: new Date(time).toISOString(),
        timezone: 'Asia/Seoul'
      };
      const updated = await api.patch<Session>(`/sessions/${sessionId}`, payload);
      setGlobalMessage(`updated to ${formatSessionTime(updated.scheduledForAtUtc)}`);
      setDetail({ kind: 'idle' });
      await loadSessions();
    } catch (err) {
      setGlobalMessage(`update failed: ${describeApiError(err, 'session_update')}`);
    }
  };

  const handleCancel = async (sessionId: string) => {
    const api = makeApi();
    try {
      await api.post<Session>(`/sessions/${sessionId}/cancel`, {});
      setGlobalMessage('session cancelled.');
      setDetail({ kind: 'idle' });
      await loadSessions();
    } catch (err) {
      setGlobalMessage(`cancel failed: ${describeApiError(err, 'session_cancel')}`);
    }
  };

  const handleEndCall = async (sessionId: string) => {
    if (activeRef.current?.sessionId === sessionId && activeRef.current.controller) {
      await activeRef.current.controller.end();
      return;
    }
    const api = makeApi();
    try {
      await api.post<Session>(`/calls/${sessionId}/end`, {});
      setGlobalMessage('call ended. Report generation may follow shortly.');
      setDetail({ kind: 'idle' });
      await loadSessions();
    } catch (err) {
      setGlobalMessage(`end failed: ${describeApiError(err, 'call_end')}`);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between py-4">
          <h1 className="text-2xl font-bold tracking-tighter text-foreground">LinguaCall</h1>
          <div className="flex items-center gap-2">
            <LanguagePicker />
            <Button variant="outline" size="sm" onClick={() => navigate('/billing')}>
              {t('nav.billing')}
            </Button>
            <Button variant="ghost" size="sm" onClick={clearIdentity}>
              {t('nav.signOut')}
            </Button>
          </div>
        </div>

        {globalMessage && (
          <div className="rounded-md bg-secondary border border-border px-3 py-2 text-sm text-secondary-foreground">
            {globalMessage}
          </div>
        )}

        {/* Active Voice Session Panel */}
        {activeSession && (
          <Card className="border-indigo-200 bg-indigo-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse inline-block" />
                {t('session.transcript')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {activeSession.note ?? activeSession.state}
                </span>
                <Badge variant={activeSession.state === 'live' ? 'default' : 'secondary'}>
                  {activeSession.state}
                </Badge>
              </div>
              {activeSession.transcript.length > 0 && (
                <div className="bg-card rounded-md p-3 max-h-32 overflow-y-auto space-y-1">
                  {activeSession.transcript.slice(-6).map((line, i) => (
                    <p key={i} className="text-xs text-foreground">
                      {line}
                    </p>
                  ))}
                </div>
              )}
              {activeSession.controller && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    if (!activeRef.current?.controller) return;
                    syncActive({ ...activeRef.current, state: 'ending', note: t('session.endCall') });
                    await activeRef.current.controller.end();
                  }}
                >
                  {t('session.endCall')}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Create Session Form */}
        <Card>
          <CardHeader>
            <CardTitle>{t('session.newSession')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={e => void handleFormSubmit(e)} className="space-y-6">
              {/* Language / Contact Mode row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('session.language')}</Label>
                  <Select value={language} onValueChange={(v) => handleLanguageChange(v as 'en' | 'de' | 'zh' | 'es' | 'ja' | 'fr')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">🇺🇸 English — OPIC</SelectItem>
                      <SelectItem value="de">🇩🇪 Deutsch — Goethe B2</SelectItem>
                      <SelectItem value="zh">🇨🇳 中文 — HSK 5</SelectItem>
                      <SelectItem value="es">🇪🇸 Español — DELE B1</SelectItem>
                      <SelectItem value="ja">🇯🇵 日本語 — JLPT N2</SelectItem>
                      <SelectItem value="fr">🇫🇷 Français — DELF B1</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('session.mode')}</Label>
                  <Select value={mode} onValueChange={(v) => setMode(v as 'immediate' | 'scheduled_once')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">{t('session.modeImmediate')}</SelectItem>
                      <SelectItem value="scheduled_once">{t('session.modeScheduled')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Level / Topic row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('session.level')}</Label>
                  <Select value={level} onValueChange={setLevel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANG_CONFIGS[language].levelOptions.map(l => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('session.topic')}</Label>
                  <Select value={topic} onValueChange={setTopic}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANG_CONFIGS[language].topicOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {t(`session.topicLabels.${opt.labelKey}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Duration row */}
              <div className="space-y-2">
                <Label>{t('session.duration')}</Label>
                <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {durationOptions.map(m => (
                      <SelectItem key={m} value={String(m)}>{m} min</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {mode === 'scheduled_once' && (
                <div className="space-y-2">
                  <Label htmlFor="scheduledFor">{t('session.scheduleTime')}</Label>
                  <Input
                    id="scheduledFor"
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={e => setScheduledFor(e.target.value)}
                  />
                </div>
              )}
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              {formMessage && <p className="text-sm text-green-600">{formMessage}</p>}
              <Button type="submit" disabled={formLoading} className="w-full">
                {formLoading ? t('session.creating') : t('session.createSession')}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Sessions List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>{t('session.sessionList')}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => void loadSessions()}>
              {t('common.retry')}
            </Button>
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('session.noSessions')}</p>
            ) : (
              <div className="space-y-3">
                {sessions.map(session => (
                  <div
                    key={session.id}
                    className="border border-border rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm capitalize">
                        {session.contactMode.replace('_', ' ')}
                      </span>
                      <Badge variant={getStatusBadgeVariant(session.status)}>
                        {session.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div>
                        {session.language?.toUpperCase() ?? 'EN'} · {session.exam?.toUpperCase().replace('_', ' ') ?? 'OPIC'} · {session.topic} · {session.durationMinutes}min · Level:{' '}
                        {session.level}
                      </div>
                      {session.scheduledForAtUtc && (
                        <div>Scheduled: {formatSessionTime(session.scheduledForAtUtc)}</div>
                      )}
                      {session.failureReason && (
                        <div className="text-destructive">
                          Failure: {session.failureReason}
                        </div>
                      )}
                    </div>

                    {session.status === 'scheduled' && (
                      <div className="flex gap-2 items-center">
                        <Input
                          type="datetime-local"
                          className="h-8 text-xs"
                          value={
                            editTimes[session.id] ??
                            toDateTimeLocalValue(session.scheduledForAtUtc)
                          }
                          onChange={e =>
                            setEditTimes(prev => ({ ...prev, [session.id]: e.target.value }))
                          }
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleUpdateSchedule(session.id)}
                        >
                          Update
                        </Button>
                      </div>
                    )}

                    <div className="flex gap-2 flex-wrap pt-1">
                      {session.status === 'ready' && (
                        <Button
                          size="sm"
                          onClick={() => void beginWebVoiceSession(session.id, false)}
                        >
                          {t('session.startCall')}
                        </Button>
                      )}
                      {session.status === 'scheduled' && canJoinScheduledSession(session) && (
                        <Button
                          size="sm"
                          onClick={() => void beginWebVoiceSession(session.id, true)}
                        >
                          {t('session.joinSession')}
                        </Button>
                      )}
                      {session.status === 'scheduled' && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void handleCancel(session.id)}
                        >
                          {t('session.cancelSession')}
                        </Button>
                      )}
                      {['connecting', 'dialing', 'ringing', 'in_progress', 'ending'].includes(
                        session.status
                      ) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void handleEndCall(session.id)}
                        >
                          {t('session.endCall')}
                        </Button>
                      )}
                      {session.status === 'completed' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleViewReport(session.id)}
                          >
                            {t('session.viewReport')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleViewTranscript(session.id)}
                          >
                            {t('session.viewTranscript')}
                          </Button>
                        </>
                      )}
                      {session.callId && session.status !== 'completed' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleViewTranscript(session.id)}
                        >
                          {t('session.viewTranscript')}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detail Panel */}
        {detail.kind !== 'idle' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>
                {detail.kind === 'transcript' ? t('session.viewTranscript') : t('report.title')}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDetail({ kind: 'idle' })}
              >
                {t('session.closeDetail')}
              </Button>
            </CardHeader>
            <CardContent>
              {detail.kind === 'loading' && (
                <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
              )}
              {detail.kind === 'error' && (
                <p className="text-sm text-destructive">{detail.message}</p>
              )}
              {detail.kind === 'report' && (
                <InlineReport
                  report={detail.report}
                  onOpenStandalone={() =>
                    navigate(`/report/${encodeURIComponent(detail.report.publicId)}`)
                  }
                />
              )}
              {detail.kind === 'transcript' && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {detail.data.messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('session.noTranscript')}</p>
                  ) : (
                    detail.data.messages.map(msg => (
                      <div key={msg.sequenceNo} className="text-xs">
                        <span className="font-medium capitalize">{msg.role}:</span>{' '}
                        {msg.content}
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function InlineReport({
  report,
  onOpenStandalone
}: {
  report: Report;
  onOpenStandalone: () => void;
}) {
  const ev = report.evaluation;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <Badge variant={report.status === 'ready' ? 'default' : 'secondary'}>
          {report.status}
        </Badge>
      </div>
      {ev && (
        <div className="grid grid-cols-4 gap-2 text-xs bg-secondary rounded-md p-3">
          {[
            { label: 'Total', value: ev.totalScore },
            { label: 'Grammar', value: ev.grammarScore },
            { label: 'Vocab', value: ev.vocabularyScore },
            { label: 'Fluency', value: ev.fluencyScore }
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-base font-bold text-primary">{value}</div>
              <div className="text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      )}
      {report.summaryText && <p className="text-muted-foreground">{report.summaryText}</p>}
      <Button size="sm" variant="outline" onClick={onOpenStandalone}>
        Open Full Report
      </Button>
    </div>
  );
}

