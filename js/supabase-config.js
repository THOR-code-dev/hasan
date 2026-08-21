/**
 * Supabase Configuration
 */
const SUPABASE_CONFIG = {
  URL: 'https://jfxlwitmvbiwhiycienh.supabase.co',
  ANON_KEY: 'sb_publishable_a7fwLGEmS6Lq7S-a1_v2Jw_gp4ImdwU'
};

// Initialize Supabase Client
let supabaseClient = null;

try {
  if (window.supabase && SUPABASE_CONFIG.URL && SUPABASE_CONFIG.ANON_KEY) {
    supabaseClient = window.supabase.createClient(
      SUPABASE_CONFIG.URL,
      SUPABASE_CONFIG.ANON_KEY
    );
    console.log('Supabase client initialized successfully.');
  } else {
    console.warn('Supabase JS library not loaded or credentials missing.');
  }
} catch (e) {
  console.error('Error initializing Supabase client:', e);
}

window.supabaseClient = supabaseClient;
window.SUPABASE_CONFIG = SUPABASE_CONFIG;
