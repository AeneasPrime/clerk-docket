/**
 * Card UI builders for the Send to Docket Gmail add-on.
 */

/**
 * Main card shown when viewing an email.
 */
function buildMainCard(messageId, from, subject, date, attachments) {
  var card = CardService.newCardBuilder();
  card.setHeader(
    CardService.newCardHeader()
      .setTitle("Send to Docket")
      .setSubtitle("Edison Township Clerk")
  );

  var section = CardService.newCardSection();

  section.addWidget(
    CardService.newDecoratedText()
      .setTopLabel("From")
      .setText(from || "(unknown)")
  );

  section.addWidget(
    CardService.newDecoratedText()
      .setTopLabel("Subject")
      .setText(subject || "(no subject)")
      .setWrapText(true)
  );

  if (attachments && attachments.length > 0) {
    var names = [];
    for (var i = 0; i < attachments.length; i++) {
      names.push(attachments[i].getName());
    }
    section.addWidget(
      CardService.newDecoratedText()
        .setTopLabel("Attachments (" + attachments.length + ")")
        .setText(names.join(", "))
        .setWrapText(true)
    );
  }

  // "Add to Docket" button
  var action = CardService.newAction()
    .setFunctionName("onSendToDocket")
    .setParameters({ messageId: messageId });

  section.addWidget(
    CardService.newTextButton()
      .setText("Add to Docket")
      .setOnClickAction(action)
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
  );

  card.addSection(section);
  return card.build();
}

/**
 * Success card shown after adding to docket.
 */
function buildSuccessCard(result, skippedAttachments) {
  var card = CardService.newCardBuilder();
  card.setHeader(
    CardService.newCardHeader()
      .setTitle("Added to Docket")
      .setSubtitle("Entry #" + result.docketId)
  );

  var section = CardService.newCardSection();

  if (result.classification) {
    section.addWidget(
      CardService.newDecoratedText()
        .setTopLabel("Type")
        .setText((result.classification.item_type || "other").replace(/_/g, " "))
    );

    section.addWidget(
      CardService.newDecoratedText()
        .setTopLabel("Department")
        .setText(result.classification.department || "Unknown")
    );

    section.addWidget(
      CardService.newDecoratedText()
        .setTopLabel("Summary")
        .setText(result.classification.summary || "")
        .setWrapText(true)
    );

    section.addWidget(
      CardService.newDecoratedText()
        .setTopLabel("Confidence")
        .setText(result.classification.confidence || "")
    );
  }

  if (skippedAttachments && skippedAttachments.length > 0) {
    section.addWidget(
      CardService.newDecoratedText()
        .setTopLabel("Skipped (too large)")
        .setText(skippedAttachments.join(", "))
        .setWrapText(true)
    );
  }

  card.addSection(section);
  return card.build();
}

/**
 * Card shown when the email was already processed.
 */
function buildAlreadyProcessedCard(result) {
  var card = CardService.newCardBuilder();
  card.setHeader(
    CardService.newCardHeader()
      .setTitle("Already in Docket")
      .setSubtitle(result.docketId ? "Entry #" + result.docketId : "")
  );

  var section = CardService.newCardSection();
  section.addWidget(
    CardService.newDecoratedText()
      .setText("This email has already been sent to the docket.")
      .setWrapText(true)
  );

  card.addSection(section);
  return card.build();
}

/**
 * Error card.
 */
function buildErrorCard(message) {
  var card = CardService.newCardBuilder();
  card.setHeader(
    CardService.newCardHeader()
      .setTitle("Error")
  );

  var section = CardService.newCardSection();
  section.addWidget(
    CardService.newDecoratedText()
      .setText(message || "An unknown error occurred.")
      .setWrapText(true)
  );

  card.addSection(section);
  return card.build();
}
