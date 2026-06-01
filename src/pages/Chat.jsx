import React from "react";
import ChatWindow from "../components/ChatWindow";
import Layout from "../components/Layout";

export default function Chat() {
  return (
    <Layout>
      <div className="flex justify-center mb-4">
        <img
          src="/teta-mello.png"
          alt="Mello – váš digitální společník"
          className="w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover border-4 border-emerald-200 shadow-md"
          width={128}
          height={128}
        />
      </div>
      <ChatWindow />
    </Layout>
  );
}
