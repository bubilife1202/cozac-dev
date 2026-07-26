import { Conversation, Message, ReactionType } from "@/types/messages";
import { soundEffects } from "./sound-effects";

function isPortfolioRecipient(recipient: { name?: string } | undefined): boolean {
  return recipient?.name?.trim().toLowerCase() === "cozac";
}

type PortfolioChatStreamEvent = {
  type?: string;
  text?: unknown;
  sources?: unknown;
};

/** Read a newline-delimited JSON body, yielding each complete line. */
async function* readNdjsonStream(
  response: Response,
): AsyncGenerator<PortfolioChatStreamEvent, void, undefined> {
  const body = response.body;
  if (!body) return;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line) as PortfolioChatStreamEvent;
        } catch {
          // A truncated line means the stream was cut; there is nothing to read.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

type ConversationState = {
  status: "idle" | "processing";
  version: number;
  currentAbortController: AbortController | null;
  debounceTimeout: NodeJS.Timeout | null;
  aiMessageTimeout: NodeJS.Timeout | null;
  pendingConversation: Conversation | null;
  lastActivity: number;
};

type MessageQueueState = {
  conversations: Map<string, ConversationState>;
};

type MessageQueueCallbacks = {
  onMessageGenerated: (conversationId: string, message: Message) => void;
  onTypingStatusChange: (
    conversationId: string | null,
    recipient: string | null
  ) => void;
  onError: (error: Error) => void;
  onMessageUpdated?: (
    conversationId: string,
    messageId: string,
    updates: Partial<Message>
  ) => void;
  shouldMuteIncomingSound?: (hideAlerts: boolean | undefined) => boolean;
};

// Safety limit - model should wrap_up before this, but this is a fallback
const MAX_CONSECUTIVE_AI_MESSAGES = 10;

// Debounce time for user messages
const USER_MESSAGE_DEBOUNCE_MS = 500;

// Typing indicator duration range
const TYPING_DELAY_MIN_MS = 2000;
const TYPING_DELAY_MAX_MS = 3000;

// Delay to show reaction before continuing
const REACTION_DISPLAY_MS = 1000;

// Delay between consecutive AI messages
const AI_MESSAGE_DELAY_MS = 2000;

export class MessageQueue {
  private state: MessageQueueState = {
    conversations: new Map(),
  };
  private callbacks: MessageQueueCallbacks;
  private activeConversation: string | null = null;
  private cleanupInterval: NodeJS.Timeout;
  private static CLEANUP_INTERVAL = 1000 * 60 * 30;
  private static CONVERSATION_TTL = 1000 * 60 * 60 * 24;

  constructor(callbacks: MessageQueueCallbacks) {
    this.callbacks = callbacks;
    this.cleanupInterval = setInterval(
      () => this.cleanupOldConversations(),
      MessageQueue.CLEANUP_INTERVAL
    );
  }

  private cleanupOldConversations() {
    const now = Date.now();
    for (const [conversationId, state] of this.state.conversations.entries()) {
      if (now - state.lastActivity > MessageQueue.CONVERSATION_TTL) {
        this.cleanupConversation(conversationId);
      }
    }
  }

  private cleanupConversation(conversationId: string) {
    const state = this.state.conversations.get(conversationId);
    if (state) {
      if (state.debounceTimeout) {
        clearTimeout(state.debounceTimeout);
      }
      if (state.aiMessageTimeout) {
        clearTimeout(state.aiMessageTimeout);
      }
      if (state.currentAbortController) {
        state.currentAbortController.abort();
      }
      this.state.conversations.delete(conversationId);
      if (this.activeConversation === conversationId) {
        this.callbacks.onTypingStatusChange(null, null);
        this.activeConversation = null;
      }
    }
  }

  private getOrCreateState(conversationId: string): ConversationState {
    let state = this.state.conversations.get(conversationId);
    if (!state) {
      state = {
        status: "idle",
        version: 0,
        currentAbortController: null,
        debounceTimeout: null,
        aiMessageTimeout: null,
        pendingConversation: null,
        lastActivity: Date.now(),
      };
      this.state.conversations.set(conversationId, state);
    } else {
      state.lastActivity = Date.now();
    }
    return state;
  }

  private countConsecutiveAiMessages(messages: Message[]): number {
    let count = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender !== "me" && messages[i].sender !== "system") {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  private cancelProcessing(conversationId: string) {
    const state = this.state.conversations.get(conversationId);
    if (!state) return;

    if (state.currentAbortController) {
      state.currentAbortController.abort();
      state.currentAbortController = null;
    }

    if (state.aiMessageTimeout) {
      clearTimeout(state.aiMessageTimeout);
      state.aiMessageTimeout = null;
    }

    this.callbacks.onTypingStatusChange(null, null);
    state.version++;
    state.status = "idle";
  }

  public enqueueUserMessage(conversation: Conversation) {
    const state = this.getOrCreateState(conversation.id);

    this.cancelProcessing(conversation.id);

    if (state.debounceTimeout) {
      clearTimeout(state.debounceTimeout);
    }

    state.pendingConversation = conversation;

    state.debounceTimeout = setTimeout(() => {
      const currentState = this.state.conversations.get(conversation.id);
      if (currentState?.pendingConversation) {
        currentState.version++;
        const conv = currentState.pendingConversation;
        currentState.pendingConversation = null;
        currentState.debounceTimeout = null;
        this.processMessage(conversation.id, conv);
      }
    }, USER_MESSAGE_DEBOUNCE_MS);
  }

  private scheduleAIMessage(conversation: Conversation) {
    const state = this.getOrCreateState(conversation.id);
    const currentVersion = state.version;

    // Safety limit - don't schedule if we've hit the max
    const consecutiveAi = this.countConsecutiveAiMessages(conversation.messages);
    if (consecutiveAi >= MAX_CONSECUTIVE_AI_MESSAGES) {
      // Force a wrap-up via silenced message
      this.showSilencedMessage(conversation.id, conversation, currentVersion);
      return;
    }

    if (state.aiMessageTimeout) {
      clearTimeout(state.aiMessageTimeout);
    }

    state.aiMessageTimeout = setTimeout(() => {
      const currentState = this.state.conversations.get(conversation.id);
      if (currentState) {
        currentState.aiMessageTimeout = null;
        if (currentState.version === currentVersion) {
          this.processMessage(conversation.id, conversation);
        }
      }
    }, AI_MESSAGE_DELAY_MS);
  }

  private async showSilencedMessage(
    conversationId: string,
    conversation: Conversation,
    currentVersion: number
  ) {
    const state = this.state.conversations.get(conversationId);
    if (!state || state.version !== currentVersion) return;

    await this.delay(AI_MESSAGE_DELAY_MS);

    if (state.version !== currentVersion) return;

    // Find the last AI participant who spoke
    const lastAiMessage = [...conversation.messages]
      .reverse()
      .find((m) => m.sender !== "me" && m.sender !== "system");

    if (lastAiMessage) {
      const silencedMessage: Message = {
        id: crypto.randomUUID(),
        content: `${lastAiMessage.sender} has notifications silenced`,
        sender: "system",
        type: "silenced",
        timestamp: new Date().toISOString(),
      };
      this.callbacks.onMessageGenerated(conversationId, silencedMessage);
    }
  }

  private async processMessage(conversationId: string, conversation: Conversation) {
    const state = this.getOrCreateState(conversationId);

    if (state.status === "processing") return;

    state.status = "processing";
    state.currentAbortController = new AbortController();
    const currentVersion = state.version;

    try {
      const isGroupChat = conversation.recipients.length > 1;

      if (!isGroupChat && isPortfolioRecipient(conversation.recipients[0])) {
        await this.processPortfolioMessage(conversationId, conversation, state, currentVersion);
        return;
      }

      const response = await this.fetchWithRetry(
        conversation,
        !isGroupChat,
        state.currentAbortController.signal
      );

      if (currentVersion !== state.version) {
        this.callbacks.onTypingStatusChange(null, null);
        state.status = "idle";
        return;
      }

      const data = await response.json();
      const actions: Array<{ action: string; participant?: string; message?: string; reaction?: string }> =
        data.actions || [{ action: data.action, ...data }]; // Backwards compat

      // Process actions - reactions first, then messages
      const reactionActions = actions.filter(a => a.action === "react");
      const messageAction = actions.find(a => a.action === "respond" || a.action === "wrap_up");
      const waitAction = actions.find(a => a.action === "wait");

      // Handle reactions first
      let accumulatedReactions: Message["reactions"] | undefined;
      for (const reactionAction of reactionActions) {
        const reactor = reactionAction.participant;
        const reactionType = reactionAction.reaction as ReactionType;

        if (reactor && reactionType && conversation.messages.length > 0) {
          const lastMessage = conversation.messages[conversation.messages.length - 1];
          accumulatedReactions = [
            ...(accumulatedReactions ?? lastMessage.reactions ?? []),
            {
              type: reactionType,
              sender: reactor,
              timestamp: new Date().toISOString(),
            },
          ];

          const shouldMute =
            this.callbacks.shouldMuteIncomingSound?.(conversation.hideAlerts) ?? false;
          if (!shouldMute) {
            soundEffects.playReactionSound();
          }

          if (this.callbacks.onMessageUpdated) {
            this.callbacks.onMessageUpdated(conversationId, lastMessage.id, {
              reactions: accumulatedReactions,
            });
          }

          // Brief pause between reactions if multiple
          if (reactionActions.length > 1) {
            await this.delay(REACTION_DISPLAY_MS);
          }
        }
      }

      // Pause after reactions before proceeding to typing indicator
      if (reactionActions.length > 0 && messageAction) {
        await this.delay(REACTION_DISPLAY_MS);
      }

      // If only reactions (no message action), continue the conversation
      if (reactionActions.length > 0 && !messageAction && !waitAction) {
        this.callbacks.onTypingStatusChange(null, null);
        state.status = "idle";

        if (currentVersion === state.version && isGroupChat) {
          this.scheduleAIMessage(conversation);
        }
        return;
      }

      // Handle "wait" action - stop and let user respond
      if (waitAction && !messageAction) {
        this.callbacks.onTypingStatusChange(null, null);
        state.status = "idle";
        return;
      }

      // For "respond" and "wrap_up", we have a message to deliver
      if (!messageAction) {
        this.callbacks.onTypingStatusChange(null, null);
        state.status = "idle";
        return;
      }

      const sender = messageAction.participant;
      const content = messageAction.message;

      if (!sender || !content) {
        console.warn("Malformed response - missing participant or message:", messageAction);
        this.callbacks.onTypingStatusChange(null, null);
        state.status = "idle";
        return;
      }

      // Show typing indicator
      this.callbacks.onTypingStatusChange(conversationId, sender);

      // Typing delay
      const typingDelay =
        TYPING_DELAY_MIN_MS + Math.random() * (TYPING_DELAY_MAX_MS - TYPING_DELAY_MIN_MS);
      await this.delay(typingDelay);

      if (currentVersion !== state.version) {
        this.callbacks.onTypingStatusChange(null, null);
        state.status = "idle";
        return;
      }

      // Deliver the message
      const newMessage: Message = {
        id: crypto.randomUUID(),
        content: content,
        sender: sender,
        timestamp: new Date().toISOString(),
      };

      this.callbacks.onMessageGenerated(conversationId, newMessage);
      this.callbacks.onTypingStatusChange(null, null);

      // Handle next steps based on action
      if (messageAction.action === "wrap_up") {
        // Show "notifications silenced" after wrap_up
        await this.delay(AI_MESSAGE_DELAY_MS);

        if (currentVersion === state.version) {
          const silencedMessage: Message = {
            id: crypto.randomUUID(),
            content: `${sender} has notifications silenced`,
            sender: "system",
            type: "silenced",
            timestamp: new Date().toISOString(),
          };
          this.callbacks.onMessageGenerated(conversationId, silencedMessage);
        }
      } else if (messageAction.action === "respond" && isGroupChat) {
        // Continue the conversation
        this.scheduleAIMessage({
          ...conversation,
          messages: [...conversation.messages, newMessage],
        });
      }
      // For 1-on-1 with "respond", just wait for next user message
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        console.error("Error processing message:", error);
        this.callbacks.onError(error);
      }
    } finally {
      state.status = "idle";
      state.currentAbortController = null;
    }
  }

  private async processPortfolioMessage(
    conversationId: string,
    conversation: Conversation,
    state: ConversationState,
    currentVersion: number
  ) {
    const sender = conversation.recipients[0]?.name || "cozac";
    this.callbacks.onTypingStatusChange(conversationId, sender);

    try {
      const messages = conversation.messages
        .filter((m) => m.sender !== "system" && typeof m.content === "string")
        .slice(-12)
        .map((message) => ({
          role: message.sender === "me" ? "user" : "assistant",
          content: message.content,
        }));
      const response = await fetch("/api/portfolio-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
        signal: state.currentAbortController?.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        const error = new Error(data.error || `Portfolio chat failed: ${response.status}`);
        (error as Error & { status?: number }).status = response.status;
        throw error;
      }

      if (currentVersion !== state.version) {
        this.callbacks.onTypingStatusChange(null, null);
        return;
      }

      const messageId = crypto.randomUUID();
      let answer = "";
      let sourceUrls: string[] = [];
      let emitted = false;

      const publish = () => {
        // Hold the typing indicator until there is something to show, then swap
        // it for the bubble the rest of the answer fills in.
        if (!emitted) {
          emitted = true;
          this.callbacks.onTypingStatusChange(null, null);
          this.callbacks.onMessageGenerated(conversationId, {
            id: messageId,
            content: answer,
            sender,
            timestamp: new Date().toISOString(),
          });
          return;
        }
        this.callbacks.onMessageUpdated?.(conversationId, messageId, { content: answer });
      };

      for await (const event of readNdjsonStream(response)) {
        if (currentVersion !== state.version) {
          this.callbacks.onTypingStatusChange(null, null);
          return;
        }

        if (event.type === "delta" && typeof event.text === "string") {
          answer += event.text;
          publish();
        } else if (event.type === "replace" && typeof event.text === "string") {
          answer = event.text;
          publish();
        } else if (event.type === "done") {
          sourceUrls = Array.isArray(event.sources)
            ? Array.from(new Set(event.sources.filter(
                (source): source is string =>
                  typeof source === "string" && source.startsWith("/notes/"),
              )))
            : [];
        }
      }

      if (!answer.trim()) {
        answer = "Gemma 4가 빈 응답을 만들었어요. 다시 물어봐 주세요.";
      }
      if (sourceUrls.length > 0) {
        answer = `${answer.trim()}\n\n참고: ${sourceUrls.join(" · ")}`;
      }
      publish();

      this.callbacks.onTypingStatusChange(null, null);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("Hosted portfolio chat failed:", error);
      if (currentVersion === state.version) {
        const status = (error as Error & { status?: number }).status;
        const reason = status === 429
          ? "지금은 무료 Gemma 4 사용량이 몰렸어요. 잠시 후 다시 물어봐 주세요."
          : "Gemma 4 응답 연결에 실패했어요. 잠시 후 다시 물어봐 주세요.";
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          content: reason,
          sender,
          timestamp: new Date().toISOString(),
        };
        this.callbacks.onMessageGenerated(conversationId, errorMessage);
      }
      this.callbacks.onTypingStatusChange(null, null);
    }
  }

  private async fetchWithRetry(
    conversation: Conversation,
    isOneOnOne: boolean,
    signal: AbortSignal,
    retries = 1
  ): Promise<Response> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipients: conversation.recipients,
            messages: conversation.messages,
            isOneOnOne,
          }),
          signal,
        });

        if (!response.ok) {
          throw new Error(`Chat API error: ${response.status}`);
        }

        return response;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        if (attempt < retries) {
          await this.delay(1000);
          continue;
        }
        throw error;
      }
    }
    throw new Error("Chat API failed after retries");
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public setActiveConversation(conversationId: string | null) {
    if (this.activeConversation && this.activeConversation !== conversationId) {
      const prevState = this.state.conversations.get(this.activeConversation);
      if (prevState && prevState.status === "processing") {
        this.callbacks.onTypingStatusChange(null, null);
      }
    }
    this.activeConversation = conversationId;
  }

  public getActiveConversation(): string | null {
    return this.activeConversation;
  }

  public dispose() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    for (const [conversationId] of this.state.conversations) {
      this.cleanupConversation(conversationId);
    }
  }
}
