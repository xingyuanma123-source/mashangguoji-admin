import { createClient } from '@supabase/supabase-js';
import { fetchWithProxySession } from '@/lib/proxySession';

const supabaseUrl = import.meta.env.VITE_SUPABASE_PROXY_URL
  || new URL('/api/db/supabase', window.location.origin).toString();
const proxyClientKey = 'proxy-managed-session';

export const supabase = createClient(supabaseUrl, proxyClientKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
  global: {
    fetch: fetchWithProxySession,
  },
});
