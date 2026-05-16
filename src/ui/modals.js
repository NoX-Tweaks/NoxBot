const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

function modal(customId, title, inputs) {
  const form = new ModalBuilder().setCustomId(customId).setTitle(title);
  for (const input of inputs) {
    form.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(input.id)
        .setLabel(input.label)
        .setStyle(input.style || TextInputStyle.Short)
        .setRequired(input.required ?? false)
        .setPlaceholder(input.placeholder || "")
        .setValue(input.value || "")
    ));
  }
  return form;
}

module.exports = {
  modal
};
