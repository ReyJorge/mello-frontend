import React from "react";
import Layout from "../components/Layout";
import FamilyDiary from "../components/FamilyDiary";

export default function Family() {
  return (
    <Layout>
      <h2 className="text-2xl font-semibold mb-4 text-emerald-700">
        Rodinná stránka
      </h2>
      <p className="text-gray-700 mb-6">
        Zde budou rodinné funkce, plánování, sdílení aktivit a další...
      </p>

      {/* Komponenta deníku */}
      <FamilyDiary />
    </Layout>
  );
}
