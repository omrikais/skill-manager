import { useState, useEffect, useCallback, useRef } from 'react';
import { getLinkRecords, type LinkRecord } from '../../core/state.js';

export function useDeployments() {
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getLinkRecords();
      if (!mountedRef.current) return;
      setLinks(result);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getLinksForSkill = useCallback((slug: string) => links.filter((l) => l.slug === slug), [links]);

  const isDeployed = useCallback(
    (slug: string, tool?: 'cc' | 'codex') => {
      if (tool) return links.some((l) => l.slug === slug && l.tool === tool);
      return links.some((l) => l.slug === slug);
    },
    [links],
  );

  return { links, loading, error, refresh, getLinksForSkill, isDeployed };
}
