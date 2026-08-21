# Supabase Configuration Template (Ornek Sablon)
# Kendi URL ve Anon/Publishable Key bilgilerinizi buraya girin.
const SUPABASE_CONFIG = {
  URL: 'YOUR_SUPABASE_PROJECT_URL',
  ANON_KEY: 'YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY'
};

let supabaseClient = null;

try {
  if (window.supabase && SUPABASE_CONFIG.URL && SUPABASE_CONFIG.ANON_KEY && SUPABASE_CONFIG.URL !== 'YOUR_SUPABASE_PROJECT_URL') {
    supabaseClient = window.supabase.createClient(
      SUPABASE_CONFIG.URL,
      SUPABASE_CONFIG.ANON_KEY
    );
    console.log('Supabase client initialized successfully.');
  }
} catch (e) {
  console.error('Error initializing Supabase client:', e);
}

window.supabaseClient = supabaseClient;
window.SUPABASE_CONFIG = SUPABASE_CONFIG;
