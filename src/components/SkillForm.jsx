import React, { useState } from "react";
import { supabase } from "../utils/supabaseClient"; // ujisti se, že tento soubor máš

export default function SkillForm({ onAdded }) {
  const [type, setType] = useState("nabízím");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !description) return;

    const { error } = await supabase
      .from("skills")
      .insert([{ type, name, description }]);

    if (error) {
      setMessage("❌ Chyba při ukládání.");
      console.error(error);
    } else {
      setMessage("✅ Nabídka byla úspěšně přidána.");
      setType("nabízím");
      setName("");
      setDescription("");
      if (onAdded) onAdded(); // reload dat ze Skills.jsx
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white p-4 shadow rounded space-y-4"
    >
      <h3 className="text-lg font-bold">Přidat nabídku / poptávku</h3>

      <select
        className="w-full border rounded p-2"
        value={type}
        onChange={(e) => setType(e.target.value)}
      >
        <option value="nabízím">🟢 Nabízím</option>
        <option value="hledám">🟡 Hledám</option>
      </select>

      <input
        className="w-full border rounded p-2"
        type="text"
        placeholder="Název služby"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <textarea
        className="w-full border rounded p-2"
        placeholder="Popis služby"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <button
        type="submit"
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Přidat
      </button>

      {message && <div className="text-sm text-green-600">{message}</div>}
    </form>
  );
}
