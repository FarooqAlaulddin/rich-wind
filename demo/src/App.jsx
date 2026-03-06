import Router from 'preact-router';
import { Playground } from './pages/Playground';
import { Docs } from './pages/Docs';
import { Analytics } from './pages/Analytics';
import { AutoPromote } from './pages/AutoPromote';

export function App() {
  return (
    <Router>
      <Playground path="/rich-wind/" />
      <Docs path="/rich-wind/docs" />
      <Docs path="/rich-wind/docs/:slug" />
      <Analytics path="/rich-wind/plugins/analytics" />
      <AutoPromote path="/rich-wind/plugins/auto-promote" />
    </Router>
  );
}
