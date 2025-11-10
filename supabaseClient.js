import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let client = null;

export function supabaseReady() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabase() {
  if (!client && supabaseReady()) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}