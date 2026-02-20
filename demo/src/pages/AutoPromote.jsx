import { DocsShell } from '../components/DocsShell';
import { AutoPromoteDashboard } from '../components/AutoPromoteDashboard';

export function AutoPromote() {
  return (
    <DocsShell activeSlug={null} activePlugin="auto-promote">
      <AutoPromoteDashboard />
    </DocsShell>
  );
}
