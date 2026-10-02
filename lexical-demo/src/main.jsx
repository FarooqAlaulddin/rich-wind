import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './App.css';

import { loadFullCatalog } from './search/catalogStore';

loadFullCatalog();
createRoot(document.getElementById('root')).render(<App />);
