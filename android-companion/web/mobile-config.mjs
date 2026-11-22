export function createMobileClient() {
  return window.supabase.createClient('https://lbxjshaiffklmalcxiif.supabase.co', 'sb_publishable_V-NlC2vXgKdl3TE6ig_v2g_4fwSFp-m',
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
}
