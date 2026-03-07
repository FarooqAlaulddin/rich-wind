import Router from 'preact-router';
import { Playground } from './pages/Playground';
import { Docs } from './pages/Docs';
import { Analytics } from './pages/Analytics';
import { AutoPromote } from './pages/AutoPromote';

export function App() {
  return (
    <Router>
      <Playground path="/rich-wind/demo/" />
      <Docs path="/rich-wind/demo/docs" />
      <Docs path="/rich-wind/demo/docs/:slug" />
      <Analytics path="/rich-wind/demo/plugins/analytics" />
      <AutoPromote path="/rich-wind/demo/plugins/auto-promote" />
    </Router>
  );
}
