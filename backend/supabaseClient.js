/**
 * Supabase client — backend only (service role key).
 * Never expose SUPABASE_SERVICE_ROLE_KEY to the frontend.
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Missing Supabase environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). Gallery save/load will be unavailable.');
} else if (
  supabaseServiceKey.startsWith('sb_publishable_')
  || supabaseServiceKey.includes('anon')
) {
  console.warn(
    'SUPABASE_SERVICE_ROLE_KEY looks like a publishable/anon key. Use the secret service_role key from Supabase → Settings → API (not the publishable key). Saves will fail with RLS errors until fixed.'
  );
}

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

function isSupabaseConfigured() {
  return Boolean(supabase);
}

module.exports = { supabase, isSupabaseConfigured };
