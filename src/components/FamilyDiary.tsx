import { useEffect, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import { useUser } from "../context/UserContext";

type Memory = {
  id: string;
  title: string;
  content: string;
  created_at: string;
};

export default function FamilyDiary() {
  const { user } = useUser();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMemories = async () => {
      if (!user) return;

      setLoading(true);
      const { data, error } = await supabase
        .from("mello_memory")
        .select("id, title, content, created_at")
        .eq("user_id", user.id) // filtruj vzpomínky přihlášeného uživatele
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Chyba při načítání vzpomínek:", error);
      } else {
        setMemories(data || []);
      }

      setLoading(false);
    };

    fetchMemories();
  }, [user]);

  if (!user) {
    return <p className="text-gray-600 text-lg">Přihlaste se pro zobrazení deníku.</p>;
  }

  return (
    <div className="mt-6">
      <h3 className="text-xl font-semibold text-emerald-600 mb-4">
        Rodinný deník
      </h3>

      {loading ? (
        <p>Načítání vzpomínek…</p>
      ) : memories.length === 0 ? (
        <p>Žádné vzpomínky zatím nejsou uloženy.</p>
      ) : (
        <ul className="space-y-4">
          {memories.map((memory) => (
            <li key={memory.id} className="p-4 bg-gray-100 rounded-lg shadow">
              <h4 className="text-lg font-bold text-emerald-700 mb-1">
                {memory.title}
              </h4>
              <p className="text-gray-800">{memory.content}</p>
              <p className="text-sm text-gray-500 mt-2">
                {new Date(memory.created_at).toLocaleDateString("cs-CZ", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
