import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  Session,
  BillingPlan,
  UserProfile,
  UserSubscription,
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
import {
  attachOrDisposeResolvedController,
  planLiveSessionEnd
} from '../features/session/liveSession';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import LanguagePicker from '../components/ui/LanguagePicker';
import { AppShell, HeroSection, PageHeader } from '../components/layout/AppShell';
import { SectionCard, MetricCard, StatusBanner, EmptyState } from '../components/layout/SectionCard';
import { useUser } from '../context/UserContext';
import { apiClient, describeApiError, normalizeApiError } from '../lib/api';
import { getFriendlyCopy, getLanguageDisplayName } from '../content/friendlyCopy';

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
  if (['failed', 'cancelled', 'provider_error', 'user_cancelled', 'schedule_missed', 'no_answer'].includes(status)) {
    return 'softRed';
  }
  return 'outline';
}

type DetailState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'report'; report: Report }
  | { kind: 'transcript'; data: SessionMessagesResponse }
  | { kind: 'error'; message: string };

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
    defaultTopic: 'work & profession',
    levelOptions: ['HSK3', 'HSK4', 'HSK5'],
    topicOptions: [
      { value: 'work & profession', labelKey: 'zh_work' },
      { value: 'culture & society', labelKey: 'zh_culture' },
      { value: 'technology & innovation', labelKey: 'zh_tech' },
      { value: 'environment & nature', labelKey: 'zh_environment' },
      { value: 'travel & life', labelKey: 'zh_travel' },
      { value: 'education & learning', labelKey: 'zh_education' }
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
      { value: 'trabajo y profesion', labelKey: 'es_work' },
      { value: 'cultura y sociedad', labelKey: 'es_culture' },
      { value: 'salud', labelKey: 'es_health' },
      { value: 'tecnologia', labelKey: 'es_tech' }
    ]
  },
  ja: {
    exam: 'jlpt_n2',
    defaultLevel: 'N3',
    defaultTopic: 'work & daily life',
    levelOptions: ['N4', 'N3', 'N2', 'N1'],
    topicOptions: [
      { value: 'work & daily life', labelKey: 'ja_work' },
      { value: 'travel & tourism', labelKey: 'ja_travel' },
      { value: 'society & culture', labelKey: 'ja_society' },
      { value: 'technology & innovation', labelKey: 'ja_tech' },
      { value: 'environment & nature', labelKey: 'ja_environment' },
      { value: 'education & learning', labelKey: 'ja_education' },
      { value: 'health & life', labelKey: 'ja_health' }
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
      { value: 'travail et carriere', labelKey: 'fr_work' },
      { value: 'culture et societe', labelKey: 'fr_culture' },
      { value: 'sante', labelKey: 'fr_health' },
      { value: 'technologie', labelKey: 'fr_tech' },
      { value: 'environnement', labelKey: 'fr_environment' }
    ]
  }
};

export default function ScreenSession() {
  const { t, i18n } = useTranslation();
  const { getToken, clearIdentity } = useUser();
  const navigate = useNavigate();
  const copy = getFriendlyCopy(i18n.language);
  const isKo = i18n.language.startsWith('ko');

  const [language, setLanguage] = useState<'en' | 'de' | 'zh' | 'es' | 'ja' | 'fr'>('en');
  const [mode, setMode] = useState<'immediate' | 'scheduled_once'>('immediate');
  const [level, setLevel] = useState('IM3');
  const [topic, setTopic] = useState('daily conversation');
  const [duration, setDuration] = useState(10);
  const [scheduledFor, setScheduledFor] = useState('');
  const [durationOptions, setDurationOptions] = useState([10]);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [globalMessage, setGlobalMessage] = useState('');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);

  const activeRef = useRef<ActiveWebVoiceSession | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveWebVoiceSession | null>(null);

  const [editTimes, setEditTimes] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<DetailState>({ kind: 'idle' });

  const composerRef = useRef<HTMLDivElement | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

  const makeApi = useCallback(() => apiClient(getToken), [getToken]);

  const handleLanguageChange = (lang: 'en' | 'de' | 'zh' | 'es' | 'ja' | 'fr') => {
    const cfg = LANG_CONFIGS[lang];
    setLanguage(lang);
    setLevel(cfg.defaultLevel);
    setTopic(cfg.defaultTopic);
  };

  const loadAccountState = useCallback(async () => {
    const api = makeApi();
    try {
      const [nextProfile, nextPlans, nextSubscription] = await Promise.all([
        api.get<UserProfile>('/users/me'),
        api.get<BillingPlan[]>('/billing/plans'),
        api.get<UserSubscription | null>('/billing/subscription').catch(() => null)
      ]);

      setProfile(nextProfile);
      setPlans(nextPlans);
      setSubscription(nextSubscription);

      const activePlan =
        nextPlans.find(plan => plan.code === nextProfile.planCode) ??
        nextPlans.find(plan => plan.code === 'free');
      const max = activePlan?.maxSessionMinutes && activePlan.maxSessionMinutes >= 10
        ? activePlan.maxSessionMinutes
        : 10;
      const options = [10];
      if (max >= 15) options.push(15);
      setDurationOptions([...new Set(options)].sort((a, b) => a - b));
      if (!options.includes(duration)) {
        setDuration(options[0]);
      }
    } catch {
      setDurationOptions([10]);
    }
  }, [duration, makeApi]);

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

  useEffect(() => {
    void loadAccountState();
    void loadSessions();
  }, [loadAccountState, loadSessions]);

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
        onTranscriptChange: transcript => {
          if (!activeRef.current || activeRef.current.sessionId !== sessionId) return;
          const lines = transcript.map(entry => `${entry.role}: ${entry.content}`);
          syncActive({ ...activeRef.current, transcript: lines });
        }
      });

      const resolution = await attachOrDisposeResolvedController({
        activeSession: activeRef.current,
        sessionId,
        controller,
        connectedNote: isKo ? 'OpenAI 음성 연결을 준비하고 있습니다...' : 'Waiting for OpenAI Realtime connection...'
      });

      if (resolution.kind === 'attached') {
        syncActive(resolution.nextActiveSession);
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
      await Promise.all([loadSessions(), loadAccountState()]);
    } catch (err) {
      setFormError(describeApiError(err, 'session_create'));
    } finally {
      setFormLoading(false);
    }
  };

  const handleViewReport = async (sessionId: string) => {
    const api = makeApi();
    setDetail({ kind: 'loading' });
    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      let report: Report;
      try {
        report = await api.get<Report>(`/sessions/${sessionId}/report`);
      } catch (err) {
        const normalized = normalizeApiError(err);
        if (!['not_found', 'conflict'].includes(normalized.code)) throw err;
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
    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const data = await api.get<SessionMessagesResponse>(`/sessions/${sessionId}/messages?limit=50`);
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
      await Promise.all([loadSessions(), loadAccountState()]);
    } catch (err) {
      setGlobalMessage(`cancel failed: ${describeApiError(err, 'session_cancel')}`);
    }
  };

  const handleEndCall = async (sessionId: string) => {
    const api = makeApi();
    const activePlan = planLiveSessionEnd(activeRef.current, sessionId, t('session.endCall'));

    if (activePlan.nextActiveSession !== activeRef.current) {
      syncActive(activePlan.nextActiveSession as ActiveWebVoiceSession | null);
    }

    if (activePlan.kind === 'controller') {
      try {
        await activePlan.nextActiveSession.controller?.end();
      } catch (err) {
        syncActive(null);
        try {
          await api.post<Session>(`/calls/${sessionId}/end`, {});
          setGlobalMessage('call ended. Report generation may follow shortly.');
        } catch (fallbackErr) {
          setGlobalMessage(`end failed: ${describeApiError(fallbackErr, 'call_end')}`);
        }
        await Promise.all([loadSessions(), loadAccountState()]);
      }
      return;
    }

    try {
      await api.post<Session>(`/calls/${sessionId}/end`, {});
      setGlobalMessage('call ended. Report generation may follow shortly.');
      setDetail({ kind: 'idle' });
      await Promise.all([loadSessions(), loadAccountState()]);
    } catch (err) {
      setGlobalMessage(`end failed: ${describeApiError(err, 'call_end')}`);
    }
  };

  const nextScheduledSession = sessions.find(session => session.status === 'scheduled');
  const recentCompletedSession = sessions.find(session => session.status === 'completed');
  const activePlanDetails = plans.find(plan => plan.code === profile?.planCode) ?? null;
  const bannerTone = globalMessage.includes('failed') || globalMessage.includes('error') ? 'danger' : 'neutral';

  return (
    <AppShell
      headerActions={
        <>
          <LanguagePicker />
          <Button variant="outline" size="sm" onClick={() => navigate('/billing')}>
            {t('nav.billing')}
          </Button>
          <Button variant="ghost" size="sm" onClick={clearIdentity}>
            {t('nav.signOut')}
          </Button>
        </>
      }
    >
      <HeroSection
        eyebrow={copy.session.eyebrow}
        title={copy.session.title}
        description={copy.session.description}
        actions={
          <>
            <Button size="lg" onClick={() => composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              {isKo ? '지금 세션 만들기' : 'Create a session now'}
            </Button>
            <Button size="lg" variant="outline" onClick={() => historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              {isKo ? '최근 세션 보기' : 'View recent sessions'}
            </Button>
          </>
        }
        aside={
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <MetricCard
              label={isKo ? '현재 플랜' : 'Current plan'}
              value={activePlanDetails?.displayName ?? (profile?.planCode ?? 'free')}
              tone="primary"
              detail={subscription?.status ?? (isKo ? '활성 상태' : 'active state')}
            />
            <MetricCard
              label={isKo ? '체험 통화' : 'Trial calls'}
              value={String(profile?.trialCallsRemaining ?? 0)}
            />
            <MetricCard
              label={isKo ? '유료 분수' : 'Paid minutes'}
              value={String(profile?.paidMinutesBalance ?? 0)}
            />
          </div>
        }
      />

      {globalMessage && <StatusBanner tone={bannerTone}>{globalMessage}</StatusBanner>}
      {formMessage && <StatusBanner tone="success">{formMessage}</StatusBanner>}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          {activeSession && (
            <LiveSessionCard
              title={copy.session.liveTitle}
              description={copy.session.liveDescription}
              activeSession={activeSession}
              onEnd={() => void handleEndCall(activeSession.sessionId)}
              isKo={isKo}
            />
          )}

          <div ref={composerRef}>
            <SectionCard title={copy.session.composerTitle} description={copy.session.composerDescription}>
              <form onSubmit={event => void handleFormSubmit(event)} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('session.language')}</Label>
                    <Select value={language} onValueChange={value => handleLanguageChange(value as 'en' | 'de' | 'zh' | 'es' | 'ja' | 'fr')}>
                      <SelectTrigger className="rounded-2xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(LANG_CONFIGS).map(code => (
                          <SelectItem key={code} value={code}>
                            {getLanguageDisplayName(code)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('session.mode')}</Label>
                    <Select value={mode} onValueChange={value => setMode(value as 'immediate' | 'scheduled_once')}>
                      <SelectTrigger className="rounded-2xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="immediate">{t('session.modeImmediate')}</SelectItem>
                        <SelectItem value="scheduled_once">{t('session.modeScheduled')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('session.level')}</Label>
                    <Select value={level} onValueChange={setLevel}>
                      <SelectTrigger className="rounded-2xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LANG_CONFIGS[language].levelOptions.map(option => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('session.topic')}</Label>
                    <Select value={topic} onValueChange={setTopic}>
                      <SelectTrigger className="rounded-2xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LANG_CONFIGS[language].topicOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {t(`session.topicLabels.${option.labelKey}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-[0.55fr_0.45fr]">
                  <div className="space-y-2">
                    <Label>{t('session.duration')}</Label>
                    <Select value={String(duration)} onValueChange={value => setDuration(Number(value))}>
                      <SelectTrigger className="rounded-2xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {durationOptions.map(option => (
                          <SelectItem key={option} value={String(option)}>
                            {option} min
                          </SelectItem>
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
                        className="h-10 rounded-2xl"
                        value={scheduledFor}
                        onChange={event => setScheduledFor(event.target.value)}
                      />
                    </div>
                  )}
                </div>

                {formError && <StatusBanner tone="danger">{formError}</StatusBanner>}

                <div className="flex flex-wrap gap-3">
                  <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={formLoading}>
                    {formLoading ? t('session.creating') : t('session.createSession')}
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto"
                    onClick={() => historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    {copy.session.historyTitle}
                  </Button>
                </div>
              </form>
            </SectionCard>
          </div>
        </div>

        <div className="space-y-6">
          <SectionCard title={copy.session.quickActionsTitle} description={copy.session.description}>
            <div className="grid gap-3">
              <QuickActionCard
                title={copy.session.quickActions[0].title}
                description={copy.session.quickActions[0].description}
                cta={isKo ? '새 세션 열기' : 'Open the form'}
                onClick={() => composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              />
              <QuickActionCard
                title={copy.session.quickActions[1].title}
                description={nextScheduledSession?.scheduledForAtUtc
                  ? `${copy.session.quickActions[1].description} ${formatSessionTime(nextScheduledSession.scheduledForAtUtc)}`
                  : copy.session.quickActions[1].description}
                cta={isKo ? '예약 보기' : 'View schedule'}
                onClick={() => historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              />
              <QuickActionCard
                title={copy.session.quickActions[2].title}
                description={copy.session.quickActions[2].description}
                cta={isKo ? '리포트 열기' : 'Open report'}
                disabled={!recentCompletedSession}
                onClick={() => recentCompletedSession ? void handleViewReport(recentCompletedSession.id) : undefined}
              />
            </div>
          </SectionCard>

          <div ref={detailRef}>
            <SectionCard title={copy.session.detailTitle} description={copy.session.detailDescription}>
              <DetailPanel
                detail={detail}
                onClose={() => setDetail({ kind: 'idle' })}
                onOpenStandalone={report => navigate(`/report/${encodeURIComponent(report.publicId)}`)}
                isKo={isKo}
              />
            </SectionCard>
          </div>
        </div>
      </div>

      <div ref={historyRef}>
        <PageHeader
          eyebrow={copy.session.historyTitle}
          title={t('session.sessionList')}
          description={copy.session.historyDescription}
          actions={
            <Button variant="outline" size="sm" onClick={() => void loadSessions()}>
              {t('common.retry')}
            </Button>
          }
        />
      </div>

      <SectionCard
        title={copy.session.historyTitle}
        description={copy.session.historyDescription}
        action={
          <Button variant="outline" size="sm" onClick={() => void Promise.all([loadSessions(), loadAccountState()])}>
            {t('billing.reload')}
          </Button>
        }
      >
        {sessionsLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : sessions.length === 0 ? (
          <EmptyState
            title={isKo ? '아직 세션이 없습니다' : 'No sessions yet'}
            description={isKo
              ? '첫 번째 짧은 통화를 만들어 보세요. 바로 시작하거나 예약해 둘 수 있습니다.'
              : 'Create your first short call. You can start right away or schedule it for later.'}
            action={
              <Button onClick={() => composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                {isKo ? '세션 만들기' : 'Create a session'}
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {sessions.map(session => (
              <SessionRow
                key={session.id}
                session={session}
                editValue={editTimes[session.id] ?? toDateTimeLocalValue(session.scheduledForAtUtc)}
                onEditTimeChange={value => setEditTimes(prev => ({ ...prev, [session.id]: value }))}
                onUpdateSchedule={() => void handleUpdateSchedule(session.id)}
                onStart={() => void beginWebVoiceSession(session.id, false)}
                onJoin={() => void beginWebVoiceSession(session.id, true)}
                onCancel={() => void handleCancel(session.id)}
                onEnd={() => void handleEndCall(session.id)}
                onViewReport={() => void handleViewReport(session.id)}
                onViewTranscript={() => void handleViewTranscript(session.id)}
                t={t}
                isKo={isKo}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </AppShell>
  );
}

function LiveSessionCard({
  title,
  description,
  activeSession,
  onEnd,
  isKo
}: {
  title: string;
  description: string;
  activeSession: ActiveWebVoiceSession;
  onEnd: () => void;
  isKo: boolean;
}) {
  return (
    <SectionCard title={title} description={description}>
      <div className="space-y-4 rounded-[28px] border border-primary/15 bg-primary/[0.05] px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium text-slate-950">{activeSession.note ?? activeSession.state}</div>
            <div className="text-xs text-muted-foreground">Session ID: {activeSession.sessionId}</div>
          </div>
          <Badge variant={activeSession.state === 'live' ? 'default' : 'secondary'}>
            {activeSession.state}
          </Badge>
        </div>

        {activeSession.transcript.length > 0 ? (
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-3xl border border-white bg-white/85 p-4">
            {activeSession.transcript.slice(-6).map((line, index) => (
              <p key={`${line}-${index}`} className="text-sm leading-6 text-slate-700">
                {line}
              </p>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-white/90 bg-white/70 px-4 py-5 text-sm text-muted-foreground">
            {isKo ? '첫 transcript가 들어오면 여기에 바로 표시됩니다.' : 'The first transcript line will appear here.'}
          </div>
        )}

        <Button variant="destructive" onClick={onEnd}>
          {isKo ? '통화 종료' : 'End call'}
        </Button>
      </div>
    </SectionCard>
  );
}

function QuickActionCard({
  title,
  description,
  cta,
  onClick,
  disabled
}: {
  title: string;
  description: string;
  cta: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="space-y-2">
        <h3 className="text-base font-semibold tracking-tight text-slate-950">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <Button className="mt-4" variant={disabled ? 'secondary' : 'outline'} disabled={disabled} onClick={onClick}>
        {cta}
      </Button>
    </div>
  );
}

function SessionRow({
  session,
  editValue,
  onEditTimeChange,
  onUpdateSchedule,
  onStart,
  onJoin,
  onCancel,
  onEnd,
  onViewReport,
  onViewTranscript,
  t,
  isKo
}: {
  session: Session;
  editValue: string;
  onEditTimeChange: (value: string) => void;
  onUpdateSchedule: () => void;
  onStart: () => void;
  onJoin: () => void;
  onCancel: () => void;
  onEnd: () => void;
  onViewReport: () => void;
  onViewTranscript: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  isKo: boolean;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={getStatusBadgeVariant(session.status)}>{session.status}</Badge>
            <Badge variant="outline">{session.contactMode.replace('_', ' ')}</Badge>
            {session.reportStatus === 'pending' && (
              <Badge variant="secondary">{isKo ? '리포트 준비 중' : 'report pending'}</Badge>
            )}
          </div>
          <div className="space-y-1">
            <div className="text-lg font-semibold tracking-tight text-slate-950">
              {getLanguageDisplayName(session.language)} / {session.level}
            </div>
            <div className="text-sm text-muted-foreground">
              {session.topic} / {session.durationMinutes} min
            </div>
            {session.scheduledForAtUtc && (
              <div className="text-sm text-muted-foreground">
                Scheduled: {formatSessionTime(session.scheduledForAtUtc)}
              </div>
            )}
            {session.failureReason && (
              <div className="text-sm text-destructive">Failure: {session.failureReason}</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {session.status === 'ready' && <Button size="sm" onClick={onStart}>{t('session.startCall')}</Button>}
          {session.status === 'scheduled' && canJoinScheduledSession(session) && (
            <Button size="sm" onClick={onJoin}>{t('session.joinSession')}</Button>
          )}
          {session.status === 'scheduled' && (
            <Button size="sm" variant="destructive" onClick={onCancel}>
              {t('session.cancelSession')}
            </Button>
          )}
          {['connecting', 'dialing', 'ringing', 'in_progress', 'ending'].includes(session.status) && (
            <Button size="sm" variant="destructive" onClick={onEnd}>
              {t('session.endCall')}
            </Button>
          )}
          {session.status === 'completed' && (
            <>
              <Button size="sm" variant="outline" onClick={onViewReport}>
                {t('session.viewReport')}
              </Button>
              <Button size="sm" variant="ghost" onClick={onViewTranscript}>
                {t('session.viewTranscript')}
              </Button>
            </>
          )}
          {session.callId && session.status !== 'completed' && (
            <Button size="sm" variant="ghost" onClick={onViewTranscript}>
              {t('session.viewTranscript')}
            </Button>
          )}
        </div>
      </div>

      {session.status === 'scheduled' && (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            type="datetime-local"
            className="rounded-2xl"
            value={editValue}
            onChange={event => onEditTimeChange(event.target.value)}
          />
          <Button variant="outline" onClick={onUpdateSchedule}>
            Update
          </Button>
        </div>
      )}
    </div>
  );
}

function DetailPanel({
  detail,
  onClose,
  onOpenStandalone,
  isKo
}: {
  detail: DetailState;
  onClose: () => void;
  onOpenStandalone: (report: Report) => void;
  isKo: boolean;
}) {
  if (detail.kind === 'idle') {
    return (
      <EmptyState
        title={isKo ? '아직 열린 상세 정보가 없습니다' : 'Nothing open yet'}
        description={
          isKo
            ? '최근 세션의 리포트나 transcript 버튼을 누르면 이 패널에서 바로 내용을 확인할 수 있습니다.'
            : 'Use report or transcript actions from a recent session. The detail panel stays out of the way until you need it.'
        }
      />
    );
  }

  if (detail.kind === 'loading') {
    return <StatusBanner>{isKo ? '상세 정보를 불러오는 중입니다...' : 'Loading detail...'}</StatusBanner>;
  }

  if (detail.kind === 'error') {
    return <StatusBanner tone="danger">{detail.message}</StatusBanner>;
  }

  if (detail.kind === 'transcript') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Badge variant="secondary">transcript</Badge>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {isKo ? '닫기' : 'Close'}
          </Button>
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
          {detail.data.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{isKo ? '아직 transcript가 없습니다.' : 'No transcript yet.'}</p>
          ) : (
            detail.data.messages.map(message => (
              <div key={message.sequenceNo} className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-700">
                <span className="font-semibold capitalize text-slate-950">{message.role}:</span>{' '}
                {message.content}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge variant={detail.report.status === 'ready' ? 'default' : 'secondary'}>
          {detail.report.status}
        </Badge>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenStandalone(detail.report)}>
            {isKo ? '전체 리포트 열기' : 'Open full report'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {isKo ? '닫기' : 'Close'}
          </Button>
        </div>
      </div>
      <InlineReport report={detail.report} />
    </div>
  );
}

function InlineReport({ report }: { report: Report }) {
  const ev = report.evaluation;

  return (
    <div className="space-y-4 text-sm">
      {ev && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: 'Total', value: ev.totalScore },
            { label: 'Grammar', value: ev.grammarScore },
            { label: 'Vocabulary', value: ev.vocabularyScore },
            { label: 'Fluency', value: ev.fluencyScore }
          ].map(item => (
            <MetricCard key={item.label} label={item.label} value={String(item.value)} />
          ))}
        </div>
      )}
      {report.summaryText && (
        <div className="rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-700">
          {report.summaryText}
        </div>
      )}
      {report.recommendations?.length > 0 && (
        <div className="grid gap-3">
          {report.recommendations.map((recommendation, index) => (
            <div key={`${recommendation}-${index}`} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
              {recommendation}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
