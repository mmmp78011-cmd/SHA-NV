/*
 * Public Supabase settings for the browser.
 *
 * Use the project URL and the "anon" / "publishable" key from
 * Supabase Dashboard > Settings > API. A `sb_secret_...` or service-role key
 * must never be placed here: it grants privileged server access.
 */
export const SUPABASE_URL = window.__SUPABASE_URL__ || 'https://ezurspniykrbobfekifn.supabase.co';
export const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__ || 'sb_publishable_LCyb3rjJ4rNGaa6OIuRURQ_3n39oPqR';

export const isSupabaseConfigured = (() => {
  try {
    return Boolean(SUPABASE_ANON_KEY)
      && !SUPABASE_ANON_KEY.startsWith('REPLACE_WITH_')
      && new URL(SUPABASE_URL).protocol === 'https:';
  } catch {
    return false;
  }
})();
