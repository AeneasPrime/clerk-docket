/**
 * Card UI builders for the Send to Docket Gmail add-on.
 */

/**
 * Main card — just a single button.
 */
function buildMainCard(messageId) {
  var card = CardService.newCardBuilder();

  var section = CardService.newCardSection();

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
function buildSuccessCard(result) {
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
