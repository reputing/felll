// The global chat room, backed by a Durable Object. It holds every live
// WebSocket connection and broadcasts each message to all of them instantly, so
// chat is truly real-time (no polling). Messages are also written to D1, so the
// last 50 load as history when someone first opens the panel (GET /api/chat).
//
// Uses the WebSocket Hibernation API (state.acceptWebSocket), so idle rooms
// don't keep a billed isolate alive. worker.ts authenticates the session and
// forwards the upgrade here with the member's info in the `u` query param.

interface ChatUser {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  accent: string;
  is_plus: number;
}

export class ChatRoom {
  private state: DurableObjectState;
  private env: CloudflareEnv;
  // best-effort per-user rate limit (DO memory; may reset on hibernation)
  private lastSend = new Map<string, number>();

  constructor(state: DurableObjectState, env: CloudflareEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    let user: ChatUser | null = null;
    try { user = JSON.parse(new URL(request.url).searchParams.get("u") || "null"); } catch { /* bad meta */ }
    if (!user?.id) return new Response("unauthorized", { status: 401 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment(user);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const user = ws.deserializeAttachment() as ChatUser | null;
    if (!user?.id || typeof message !== "string") return;

    let body = "";
    try { body = String((JSON.parse(message) as { body?: string }).body || ""); } catch { return; }
    body = body.trim().replace(/\s+/g, " ").slice(0, 500);
    if (!body) return;

    const now = Date.now();
    if (now - (this.lastSend.get(user.id) ?? 0) < 1500) return;
    this.lastSend.set(user.id, now);

    let saved: { id: number; created_at: number } | null = null;
    try {
      saved = await this.env.DB
        .prepare("insert into chat_messages (user_id, body) values (?, ?) returning id, created_at")
        .bind(user.id, body)
        .first<{ id: number; created_at: number }>();
    } catch { return; }
    if (!saved) return;

    const payload = JSON.stringify({
      message: {
        id: saved.id, body, created_at: saved.created_at,
        handle: user.handle, display_name: user.display_name,
        avatar_url: user.avatar_url, accent: user.accent, is_plus: user.is_plus, mine: 0,
      },
    });
    for (const sock of this.state.getWebSockets()) {
      try { sock.send(payload); } catch { /* dead socket */ }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try { ws.close(); } catch { /* already closed */ }
  }

  async webSocketError(): Promise<void> { /* nothing to do */ }
}
