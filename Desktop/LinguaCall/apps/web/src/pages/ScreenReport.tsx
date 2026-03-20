import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Report } from '@lingua/shared';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useUser } from '../context/UserContext';
import { apiClient, describeApiError } from '../lib/api';
import LanguagePicker from '../components/ui/LanguagePicker';

export default function ScreenReport() {
  const { t } = useTranslation();
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { getToken } = useUser();

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
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between py-4">
          <h1 className="text-2xl font-bold tracking-tighter text-foreground">{t('common.appName')}</h1>
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
            {report && <ReportView report={report} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReportView({ report }: { report: Report }) {
  const { t } = useTranslation();
  const ev = report.evaluation;
  const corrections = ev?.grammarCorrections ?? [];
  const vocabulary = ev?.vocabularyAnalysis ?? [];
  const fluency = ev?.fluencyMetrics;

  return (
    <div className="space-y-6 text-sm">
      <div className="flex items-center gap-2">
        <Badge variant={report.status === 'ready' ? 'default' : 'secondary'}>
          {report.status}
        </Badge>
        {report.status === 'failed' && (
          <span className="text-destructive text-xs">
            {t('report.generationFailed')}
          </span>
        )}
      </div>

      {ev && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t('report.scores.total'), value: ev.totalScore },
            { label: t('report.scores.grammar'), value: ev.grammarScore },
            { label: t('report.scores.vocabulary'), value: ev.vocabularyScore },
            { label: t('report.scores.fluency'), value: ev.fluencyScore }
          ].map(({ label, value }) => (
            <div key={label} className="bg-secondary rounded-md p-4 text-center shadow-sm border border-border">
              <div className="text-2xl font-bold tracking-tighter text-primary">{value}</div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </div>
          ))}
        </div>
      )}

      {ev?.levelAssessment && (
        <div className="bg-secondary rounded-md p-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
            {t('report.levelAssessment')}
          </p>
          <p>{ev.levelAssessment}</p>
        </div>
      )}

      {report.summaryText && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
            {t('report.summary')}
          </p>
          <p className="text-foreground">{report.summaryText}</p>
        </div>
      )}

      {report.recommendations && report.recommendations.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">
            {t('report.recommendations')}
          </p>
          <ul className="list-disc list-inside space-y-1">
            {report.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {corrections.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">
            {t('report.grammarCorrections')}
          </p>
          <div className="space-y-2">
            {corrections.map((item, i) => (
              <div key={i} className="bg-secondary rounded-md p-2 text-xs">
                <span className="text-muted-foreground">
                  {item.timestamp_ms_from_call_start}ms
                </span>{' '}
                -
                <span className="line-through text-destructive">{item.issue}</span>
                {' -> '}
                <span className="text-green-600">{item.suggestion}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {vocabulary.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">
            {t('report.vocabularyAnalysis')}
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            {vocabulary.map((item, i) => (
              <li key={i}>{item}</li>
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
            <div key={label} className="bg-secondary rounded-md p-3 text-center">
              <div className="text-xl font-bold">{value}</div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
        <div>{t('report.sessionId')}: {report.sessionId}</div>
        <div>{t('report.attempts')}: {report.attemptCount}</div>
        {report.readyAt && <div>{t('report.readyAt')}: {report.readyAt}</div>}
        {report.errorCode && <div>{t('report.errorCode')}: {report.errorCode}</div>}
      </div>
    </div>
  );
}
