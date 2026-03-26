import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Report } from '@lingua/shared';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import LanguagePicker from '../components/ui/LanguagePicker';
import { AppShell, HeroSection, PageHeader } from '../components/layout/AppShell';
import { SectionCard, MetricCard, StatusBanner } from '../components/layout/SectionCard';
import { getFriendlyCopy } from '../content/friendlyCopy';
import { useUser } from '../context/UserContext';
import { apiClient, describeApiError } from '../lib/api';

export default function ScreenReport() {
  const { t, i18n } = useTranslation();
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { getToken } = useUser();
  const copy = getFriendlyCopy(i18n.language);
  const isKo = i18n.language.startsWith('ko');

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!reportId) return;
    const api = apiClient(getToken);
    void (async () => {
      try {
        const r = await api.get<Report>(`/reports/${decodeURIComponent(reportId)}`);
        setReport(r);
      } catch (err) {
        setError(describeApiError(err, 'report_load'));
      } finally {
        setLoading(false);
      }
    })();
  }, [reportId, getToken]);

  return (
    <AppShell
      headerActions={
        <>
          <LanguagePicker />
          <Button variant="outline" size="sm" onClick={() => navigate('/session')}>
            {t('nav.sessions')}
          </Button>
        </>
      }
    >
      {loading && <StatusBanner>{t('report.loading')}</StatusBanner>}
      {error && <StatusBanner tone="danger">{t('report.loadFailed', { error })}</StatusBanner>}

      {report && <ReportScreenBody report={report} isKo={isKo} />}
    </AppShell>
  );
}

function ReportScreenBody({ report, isKo }: { report: Report; isKo: boolean }) {
  const { t, i18n } = useTranslation();
  const copy = getFriendlyCopy(i18n.language);
  const ev = report.evaluation;
  const corrections = ev?.grammarCorrections ?? [];
  const vocabulary = ev?.vocabularyAnalysis ?? [];
  const fluency = ev?.fluencyMetrics;

  return (
    <>
      <HeroSection
        eyebrow={copy.report.eyebrow}
        title={copy.report.title}
        description={copy.report.description}
        aside={
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant={report.status === 'ready' ? 'default' : 'secondary'}>
                {report.status}
              </Badge>
              {report.status === 'failed' && (
                <span className="text-xs text-destructive">{t('report.generationFailed')}</span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <MetricCard
                label={isKo ? '총점' : 'Total score'}
                value={String(ev?.totalScore ?? '-')}
                tone="primary"
              />
              <MetricCard
                label={isKo ? '시도 횟수' : 'Attempts'}
                value={String(report.attemptCount)}
              />
            </div>
          </div>
        }
      />

      <PageHeader
        eyebrow={copy.report.summaryTitle}
        title={report.summaryText ?? (isKo ? '리포트가 준비되었습니다.' : 'Your report is ready.')}
        description={
          ev?.levelAssessment ??
          (isKo
            ? '점수와 추천을 함께 보며 다음 세션의 방향을 정리해보세요.'
            : 'Use the score and recommendations together to shape the next session.')
        }
      />

      {ev && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: t('report.scores.total'), value: ev.totalScore, tone: 'primary' as const },
            { label: t('report.scores.grammar'), value: ev.grammarScore, tone: 'default' as const },
            { label: t('report.scores.vocabulary'), value: ev.vocabularyScore, tone: 'default' as const },
            { label: t('report.scores.fluency'), value: ev.fluencyScore, tone: 'default' as const },
            { label: isKo ? '주제 유지' : 'Topic fit', value: ev.topicScore, tone: 'default' as const }
          ].map(item => (
            <MetricCard
              key={item.label}
              label={item.label}
              value={String(item.value)}
              tone={item.tone}
            />
          ))}
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title={t('report.summary')} description={copy.report.description}>
          {report.summaryText && (
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 px-5 py-5 text-sm leading-7 text-slate-700">
              {report.summaryText}
            </div>
          )}
          {report.recommendations && report.recommendations.length > 0 && (
            <div className="grid gap-3">
              {report.recommendations.map((recommendation, index) => (
                <div key={recommendation} className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">
                    {isKo ? `추천 ${index + 1}` : `Recommendation ${index + 1}`}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">{recommendation}</div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title={copy.report.fluencyTitle} description={t('report.levelAssessment')}>
          {ev?.levelAssessment && (
            <div className="rounded-3xl border border-primary/15 bg-primary/[0.05] px-5 py-5 text-sm leading-7 text-slate-700">
              {ev.levelAssessment}
            </div>
          )}
          {fluency && (
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <MetricCard label={t('report.avgWpm')} value={String(fluency.avg_wpm)} />
              <MetricCard label={t('report.fillers')} value={String(fluency.filler_count)} />
              <MetricCard label={t('report.pauses')} value={String(fluency.pause_count)} />
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title={copy.report.correctionsTitle} description={t('report.grammarCorrections')}>
          {corrections.length > 0 ? (
            <div className="space-y-3">
              {corrections.map((item, index) => (
                <div key={`${item.issue}-${index}`} className="rounded-3xl border border-slate-200 bg-slate-50/80 px-5 py-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {item.timestamp_ms_from_call_start}ms
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-destructive/80">
                        {isKo ? '원문' : 'Original'}
                      </div>
                      <div className="mt-2">{item.issue}</div>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-700">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        {isKo ? '추천 표현' : 'Suggested'}
                      </div>
                      <div className="mt-2">{item.suggestion}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <StatusBanner>{isKo ? '표시할 교정 항목이 없습니다.' : 'No grammar corrections to show.'}</StatusBanner>
          )}
        </SectionCard>

        <SectionCard title={t('report.vocabularyAnalysis')} description={copy.report.scoreTitle}>
          {vocabulary.length > 0 ? (
            <div className="grid gap-3">
              {vocabulary.map((item, index) => (
                <div key={`${item}-${index}`} className="rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          ) : (
            <StatusBanner>{isKo ? '표시할 어휘 분석이 없습니다.' : 'No vocabulary analysis to show.'}</StatusBanner>
          )}

          <div className="rounded-3xl border border-dashed border-slate-200 px-4 py-4 text-xs text-muted-foreground">
            <div>{t('report.sessionId')}: {report.sessionId}</div>
            <div>{t('report.attempts')}: {report.attemptCount}</div>
            {report.readyAt && <div>{t('report.readyAt')}: {report.readyAt}</div>}
            {report.errorCode && <div>{t('report.errorCode')}: {report.errorCode}</div>}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
