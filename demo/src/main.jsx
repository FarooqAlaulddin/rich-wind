import { render } from 'preact';
import { App } from './App';
import './app.css';
import '../demo.css';
import '../docs.css';
import '../analytics.css';
import '../auto-promote.css';

render(<App />, document.getElementById('app'));
