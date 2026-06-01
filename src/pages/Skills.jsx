import React, { useEffect, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import SkillForm from "../components/SkillForm";
import Layout from "../components/Layout";

export default function Skills() {
  const [skills, setSkills] = useState([]);

  const fetchSkills = async () => {
    const { data, error } = await supabase
      .from("skills")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setSkills(data);
  };

  useEffect(() => {
    fetchSkills();
  }, []);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <h2 className="text-3xl font-bold text-blue-800 text-center">
          Tržiště dovedností
        </h2>

        <p className="text-center text-gray-600 max-w-xl mx-auto">
          Zde můžete nabídnout své zkušenosti nebo najít někoho, kdo vám pomůže.
          Vyplňte krátký formulář nebo prozkoumejte dostupné nabídky.
        </p>

        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
          <SkillForm onAdded={fetchSkills} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {skills.map((item, index) => (
            <div
              key={index}
              className={`rounded-xl p-5 shadow transition ${
                item.type === "nabízím"
                  ? "bg-emerald-50 border border-emerald-300"
                  : "bg-yellow-50 border border-yellow-300"
              }`}
            >
              <h3 className="text-xl font-semibold text-gray-800">
                {item.type === "nabízím" ? "🟢 Nabízím:" : "🟡 Hledám:"}{" "}
                {item.name}
              </h3>
              <p className="text-gray-700 mt-2 text-base whitespace-pre-wrap">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        {skills.length === 0 && (
          <p className="text-center text-gray-500 mt-6">
            Zatím žádné příspěvky.
          </p>
        )}
      </div>
    </Layout>
  );
}
