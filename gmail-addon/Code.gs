/**
 * Send to Docket — Google Workspace Add-on for Gmail
 *
 * Adds a sidebar card to Gmail that lets the clerk send individual
 * emails to the clerk-docket app for AI classification and docketing.
 *
 * Setup:
 * 1. Create a new Apps Script project at https://script.google.com
 * 2. Copy Code.gs and Cards.gs into the project
 * 3. Replace appsscript.json (View > Show manifest file) with the provided one
 * 4. Set script properties (File > Project properties > Script properties):
 *    - INGEST_API_KEY: the same key configured in the clerk-docket app
 *    - API_URL: the ingest endpoint URL (e.g. https://clerk-docket.onrender.com/api/ingest)
 * 5. Deploy > Test deployments > Gmail Add-on > Install
 */

var MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB per attachment

/**
 * Get configuration from script properties.
 */
function getConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    apiUrl: props.getProperty("API_URL") || "https://clerk-docket.onrender.com/api/ingest",
    apiKey: props.getProperty("INGEST_API_KEY") || ""
  };
}

/**
 * Contextual trigger: fires when user opens an email in Gmail.
 */
function onGmailMessageOpen(e) {
  var messageId = e.gmail.messageId;
  var accessToken = e.gmail.accessToken;

  GmailApp.setCurrentMessageAccessToken(accessToken);
  var message = GmailApp.getMessageById(messageId);

  if (!message) {
    return buildErrorCard("Could not read this email.");
  }

  var from = message.getFrom();
  var subject = message.getSubject();
  var date = message.getDate().toISOString();
  var attachments = message.getAttachments();

  return buildMainCard(messageId, from, subject, date, attachments);
}

/**
 * Action handler: user clicked "Add to Docket".
 */
function onSendToDocket(e) {
  var messageId = e.parameters.messageId;
  var accessToken = e.gmail.accessToken;
  var config = getConfig();

  if (!config.apiKey) {
    return buildErrorCard("INGEST_API_KEY not set. Go to Script Properties to configure it.");
  }

  GmailApp.setCurrentMessageAccessToken(accessToken);
  var message = GmailApp.getMessageById(messageId);

  if (!message) {
    return buildErrorCard("Could not read this email.");
  }

  // Build the payload
  var payload = {
    emailId: messageId,
    from: message.getFrom(),
    subject: message.getSubject(),
    date: message.getDate().toISOString(),
    bodyText: message.getPlainBody() || "",
    bodyHtml: message.getBody() || "",
    attachments: []
  };

  // Extract attachments (skip oversized ones)
  var attachments = message.getAttachments();
  var skippedAttachments = [];

  for (var i = 0; i < attachments.length; i++) {
    var att = attachments[i];
    var bytes = att.getBytes();

    if (bytes.length > MAX_ATTACHMENT_BYTES) {
      skippedAttachments.push(att.getName() + " (" + Math.round(bytes.length / 1024 / 1024) + " MB)");
      continue;
    }

    payload.attachments.push({
      filename: att.getName(),
      mimeType: att.getContentType(),
      data: Utilities.base64Encode(bytes)
    });
  }

  // POST to the ingest API
  try {
    var response = UrlFetchApp.fetch(config.apiUrl, {
      method: "post",
      contentType: "application/json",
      headers: {
        "Authorization": "Bearer " + config.apiKey
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var body = JSON.parse(response.getContentText());

    if (code === 200 && body.success) {
      return buildSuccessCard(body, skippedAttachments);
    } else if (code === 409) {
      return buildAlreadyProcessedCard(body);
    } else {
      return buildErrorCard(body.message || "Server error: " + code);
    }
  } catch (err) {
    return buildErrorCard("Network error: " + err.message);
  }
}
