import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { SearchResult, SearchFilters } from '../../shared/types';
import { formatFullTimestamp } from '../hooks/useApi';
import { SEARCH_DEBOUNCE_MS } from '../../shared/constants';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(async (q: string, f: SearchFilters) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await window.electronAPI.db.searchMessages(q, f);
      setResults(res);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val, filters), SEARCH_DEBOUNCE_MS);
  };

  const handleFilterChange = (key: keyof SearchFilters, value: string) => {
    const newFilters = { ...filters, [key]: value || undefined };
    setFilters(newFilters);
    if (query.trim()) doSearch(query, newFilters);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-header-secondary)',
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search messages..."
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            autoFocus
            style={{
              flex: 1, padding: '10px 16px', borderRadius: 'var(--radius-md)',
              border: 'none', background: 'var(--bg-input)', fontSize: 15,
              color: 'var(--text-primary)',
            }}
          />
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              padding: '10px 14px', borderRadius: 'var(--radius-md)',
              background: showFilters ? 'var(--accent)' : 'var(--bg-input)',
              color: showFilters ? '#fff' : 'var(--text-primary)', fontSize: 14,
            }}
          >
            Filters
          </button>
        </div>

        {showFilters && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Sender"
              value={filters.sender || ''}
              onChange={e => handleFilterChange('sender', e.target.value)}
              style={filterInputStyle}
            />
            <input
              type="date"
              placeholder="From date"
              value={filters.dateFrom || ''}
              onChange={e => handleFilterChange('dateFrom', e.target.value)}
              style={filterInputStyle}
            />
            <input
              type="date"
              placeholder="To date"
              value={filters.dateTo || ''}
              onChange={e => handleFilterChange('dateTo', e.target.value)}
              style={filterInputStyle}
            />
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>Searching...</div>
        )}
        {!loading && query && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>
            No results found for "{query}"
          </div>
        )}
        {!loading && !query && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>🔍</div>
            <p style={{ fontSize: 15 }}>Search across all your imported messages</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Use filters to narrow results by sender or date range</p>
          </div>
        )}
        {results.map(result => (
          <div
            key={result.message.message_id}
            style={{
              padding: '12px 20px', borderBottom: '1px solid var(--border-light)',
              cursor: 'pointer',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{result.conversation.display_name}</span>
              <span style={{ fontSize: 12, color: 'var(--text-timestamp)' }}>
                {formatFullTimestamp(result.message.timestamp)}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>
              {result.message.sender_label}
            </div>
            <div
              style={{ fontSize: 14, lineHeight: 1.4 }}
              dangerouslySetInnerHTML={{ __html: result.highlight }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const filterInputStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-input)',
  fontSize: 13,
  color: 'var(--text-primary)',
};
