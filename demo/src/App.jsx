import Router from 'preact-router';
import { Playground } from './pages/Playground';
import { Docs } from './pages/Docs';
import { Analytics } from './pages/Analytics';
import { AutoPromote } from './pages/AutoPromote';

export function App() {
  return (
    <Router>
      <Playground path="/" />
      <Docs path="/docs" />
      <Docs path="/docs/:slug" />
      <Analytics path="/plugins/analytics" />
      <AutoPromote path="/plugins/auto-promote" />
    </Router>
  );
}
