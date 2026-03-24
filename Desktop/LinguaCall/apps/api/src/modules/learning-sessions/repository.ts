import type {
  Report,
  Session,
  SessionMessagesResponse,
  UpdateScheduledSessionPayload
} from "@lingua/shared";
import { store } from "../../storage/inMemoryStore";

export const learningSessionsRepository = {
  create(
    clerkUserId: string,
    payload: Parameters<typeof store.createSession>[1]
  ): Promise<Session> {
    return store.createSession(clerkUserId, payload);
  },

  list(clerkUserId: string): Promise<Session[]> {
    return store.listSessions(clerkUserId);
  },

  get(clerkUserId: string, sessionId: string): Promise<Session> {
    return store.getSession(clerkUserId, sessionId);
  },

  getMessages(
    clerkUserId: string,
    sessionId: string,
    limit?: number
  ): Promise<SessionMessagesResponse> {
    return store.getSessionMessages(clerkUserId, sessionId, limit);
  },

  updateScheduled(
    clerkUserId: string,
    sessionId: string,
    payload: Partial<UpdateScheduledSessionPayload>
  ): Promise<Session> {
    return store.updateScheduledSession(clerkUserId, sessionId, payload);
  },

  cancelScheduled(clerkUserId: string, sessionId: string): Promise<Session> {
    return store.cancelScheduledSession(clerkUserId, sessionId);
  },

  generateReport(clerkUserId: string, sessionId: string): Promise<Report> {
    return store.generateSessionReport(clerkUserId, sessionId);
  },

  getReport(clerkUserId: string, sessionId: string): Promise<Report> {
    return store.getSessionReport(clerkUserId, sessionId);
  },

  getByIdentifierForUser(clerkUserId: string, identifier: string): Promise<Session> {
    return store.getSessionByIdentifierForUser(clerkUserId, identifier);
  },

  getByTwilioLookup(lookup: {
    callId?: string;
    providerCallSid?: string;
  }): Promise<Session | null> {
    return store.getSessionByTwilioLookup(lookup);
  },

  handleTwilioStatusCallback(
    payload: Parameters<typeof store.handleTwilioStatusCallback>[0]
  ): Promise<Session> {
    return store.handleTwilioStatusCallback(payload);
  }
};
