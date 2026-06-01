import { supabase } from "./supabaseClient";

/** Po přihlášení: /chat pokud má profil jméno, jinak /onboarding */
export async function getPostAuthPath() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/signin";

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    return "/onboarding";
  }

  if (profile?.name?.trim()) return "/chat";
  return "/onboarding";
}
