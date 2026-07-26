import { Conversation } from "@/types/messages";

export const PORTFOLIO_CONVERSATION_ID = "cozac-portfolio-chat";

function getTimeAgo(minutes: number) {
  const date = new Date();
  date.setMinutes(date.getMinutes() - minutes);
  return date.toISOString();
}

export const initialConversations: Conversation[] = [
  {
    id: PORTFOLIO_CONVERSATION_ID,
    name: "cozac",
    recipients: [
      {
        id: "cozac",
        name: "cozac",
        avatar: "/headshot.jpg",
        title: "Software Engineer (Embedded / AI / Web)",
        bio: "Embedded -> AI -> Web. Ask me anything.",
      },
    ],
    pinned: true,
    hideAlerts: true,
    unreadCount: 0,
    lastMessageTime: getTimeAgo(10),
    messages: [
      {
        id: "cozac-welcome",
        sender: "cozac",
        timestamp: getTimeAgo(10),
        content:
          "안녕하세요. cozac입니다. 프로젝트/경력/협업 스타일 등 무엇이든 편하게 물어보세요.",
      },
    ],
  },
];
