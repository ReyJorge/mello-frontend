import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Chybí VITE_SUPABASE_URL nebo VITE_SUPABASE_ANON_KEY. " +
      "Zkopírujte .env.example → .env a nastavte nový Supabase projekt. " +
      "Viz supabase/README.md"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
