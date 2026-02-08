import { google, gmail_v1 } from "googleapis";
import { getConfig, setConfig } from "./db";
import type { RawEmail, RawAttachment } from "@/types";

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

export function getAuthUrl(): string {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function handleAuthCallback(code: string): Promise<void> {
  const { tokens } = await oauth2Client.getToken(code);
  if (tokens.refresh_token) {
    setConfig("gmail_refresh_token", tokens.refresh_token);
  }
  if (tokens.access_token) {
    setConfig("gmail_access_token", tokens.access_token);
  }
  if (tokens.expiry_date) {
    setConfig("gmail_expiry_date", String(tokens.expiry_date));
  }
}

function getAuthenticatedClient(): gmail_v1.Gmail {
  const refreshToken = getConfig("gmail_refresh_token");
  const accessToken = getConfig("gmail_access_token");
  const expiryDate = getConfig("gmail_expiry_date");

  if (!refreshToken) {
    throw new Error("Gmail not authenticated. Please connect your Gmail account first.");
  }

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken ?? undefined,
    expiry_date: expiryDate ? Number(expiryDate) : undefined,
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

function decodeBase64Url(data: string): Buffer {
  return Buffer.from(data, "base64url");
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractParts(
  part: gmail_v1.Schema$MessagePart,
  result: {
    textBody: string;
    htmlBody: string;
    attachmentParts: gmail_v1.Schema$MessagePart[];
  }
): void {
  const mimeType = part.mimeType ?? "";
  const filename = part.filename ?? "";

  if (filename && part.body?.attachmentId) {
    result.attachmentParts.push(part);
    return;
  }

  if (mimeType === "text/plain" && part.body?.data && !result.textBody) {
    result.textBody = decodeBase64Url(part.body.data).toString("utf-8");
  } else if (mimeType === "text/html" && part.body?.data && !result.htmlBody) {
    result.htmlBody = decodeBase64Url(part.body.data).toString("utf-8");
  }

  if (part.parts) {
    for (const child of part.parts) {
      extractParts(child, result);
    }
  }
}

async function fetchAttachment(
  gmail: gmail_v1.Gmail,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const res = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });
  return decodeBase64Url(res.data.data ?? "");
}

export async function fetchNewEmails(maxResults = 20): Promise<RawEmail[]> {
  const gmail = getAuthenticatedClient();

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread in:inbox",
    maxResults,
  });

  const messageIds = listRes.data.messages ?? [];
  if (messageIds.length === 0) return [];

  const emails: RawEmail[] = [];

  for (const msg of messageIds) {
    if (!msg.id) continue;

    const fullMsg = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const payload = fullMsg.data.payload;
    if (!payload) continue;

    const headers = payload.headers;
    const result = {
      textBody: "",
      htmlBody: "",
      attachmentParts: [] as gmail_v1.Schema$MessagePart[],
    };

    extractParts(payload, result);

    const attachments: RawAttachment[] = [];
    for (const part of result.attachmentParts) {
      if (!part.body?.attachmentId || !part.filename) continue;
      const data = await fetchAttachment(gmail, msg.id, part.body.attachmentId);
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        size: part.body.size ?? data.length,
        data,
      });
    }

    emails.push({
      id: msg.id,
      threadId: fullMsg.data.threadId ?? "",
      from: getHeader(headers, "From"),
      to: getHeader(headers, "To"),
      subject: getHeader(headers, "Subject"),
      date: getHeader(headers, "Date"),
      bodyText: result.textBody,
      bodyHtml: result.htmlBody,
      attachments,
    });
  }

  return emails;
}

export interface ThreadMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  bodyText: string;
}

export async function fetchEmailThread(messageId: string): Promise<ThreadMessage[]> {
  const gmail = getAuthenticatedClient();

  const msg = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["From", "To", "Subject", "Date"],
  });

  const threadId = msg.data.threadId;
  if (!threadId) return [];

  const thread = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  return (thread.data.messages ?? []).map((m) => {
    const payload = m.payload;
    const headers = payload?.headers;
    const parts = { textBody: "", htmlBody: "", attachmentParts: [] as gmail_v1.Schema$MessagePart[] };
    if (payload) extractParts(payload, parts);

    let body = parts.textBody;
    if (!body && parts.htmlBody) {
      body = parts.htmlBody
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    if (body.length > 3000) body = body.slice(0, 3000) + "\n[...truncated...]";

    return {
      id: m.id ?? "",
      from: getHeader(headers, "From"),
      to: getHeader(headers, "To"),
      subject: getHeader(headers, "Subject"),
      date: getHeader(headers, "Date"),
      snippet: m.snippet ?? "",
      bodyText: body,
    };
  });
}

export async function markAsRead(emailId: string): Promise<void> {
  const gmail = getAuthenticatedClient();
  await gmail.users.messages.modify({
    userId: "me",
    id: emailId,
    requestBody: {
      removeLabelIds: ["UNREAD"],
    },
  });
}
