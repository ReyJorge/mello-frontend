import React from "react";
import ChatWindow from "../components/ChatWindow";
import Layout from "../components/Layout";

export default function Chat() {
  return (
    <Layout mainClassName="mello-chat-layout">
      <ChatWindow />
    </Layout>
  );
}
