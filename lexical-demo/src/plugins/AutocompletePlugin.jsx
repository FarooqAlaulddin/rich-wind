import React, { useState, useRef, useCallback, useEffect } from 'react';
import { suggest } from '../api';

export default function AutocompletePlugin({ value, onChange, onAdd, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);
  const inputRef = useRef(null);

  const fetchSuggestions = useCallback(async (prefix) => {
    if (!prefix || prefix.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    try {
      const results = await suggest({
        projectId: 'lexical-demo',
        prefix,
        limit: 20,
      });
      setSuggestions(results);
      setActiveIndex(-1);
      setOpen(results.length > 0);
    } catch {
      setSuggestions([]);
      setOpen(false);
    }
  }, []);

  const handleChange = useCallback((e) => {
    const val = e.target.value;
    onChange(val);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchSuggestions(val.trim()), 150);
  }, [onChange, fetchSuggestions]);

  const acceptSuggestion = useCallback((suggestion) => {
    const text = typeof suggestion === 'string' ? suggestion : suggestion.className;
    setSuggestions([]);
    setOpen(false);
    onAdd(text);
    onChange('');
    inputRef.current?.focus();
  }, [onAdd, onChange]);

  const handleKeyDown = useCallback((e) => {
    if (open && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (activeIndex >= 0) {
          acceptSuggestion(suggestions[activeIndex]);
        } else if (e.key === 'Enter' && value.trim()) {
          setOpen(false);
          onAdd(value.trim());
          onChange('');
        }
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    } else {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (value.trim()) {
          onAdd(value.trim());
          onChange('');
        }
      }
    }
  }, [open, suggestions, activeIndex, acceptSuggestion, onAdd, onChange, value]);

  const handleBlur = useCallback(() => {
    setTimeout(() => setOpen(false), 200);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="autocomplete-wrapper">
      <input
        ref={inputRef}
        className="class-input"
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
      />
      {open && suggestions.length > 0 && (
        <ul className="autocomplete-dropdown">
          {suggestions.map((s, i) => {
            const text = typeof s === 'string' ? s : s.className;
            return (
              <li
                key={text}
                className={i === activeIndex ? 'active' : ''}
                onMouseDown={(e) => { e.preventDefault(); acceptSuggestion(s); }}
              >
                {text}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
