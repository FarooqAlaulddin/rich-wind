import { DocsShell } from '../components/DocsShell';
import { AnalyticsDashboard } from '../components/AnalyticsDashboard';
import { usePolling } from '../hooks/usePolling';
import { fetchAnalyticsData } from '../api';

export function Analytics() {
  const { data, error } = usePolling(fetchAnalyticsData, 2000);

  return (
    <DocsShell activeSlug={null} activePlugin="analytics">
      <AnalyticsDashboard data={data} connected={!error && data !== null} />
    </DocsShell>
  );
}
