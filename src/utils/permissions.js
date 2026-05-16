const { PermissionsBitField } = require("discord.js");
const { getGuildConfig } = require("../database/guildStore");

function hasMenuAccess(member) {
  const config = getGuildConfig(member.guild.id);
  return config.menuUsers.includes(member.id);
}

function isTicketStaff(member, config) {
  return member.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
    (config.ticket.staffRoleId && member.roles.cache.has(config.ticket.staffRoleId)) ||
    Object.values(config.ticketPanels || {}).some(panel =>
      (panel.staffRoleIds || []).some(roleId => member.roles.cache.has(roleId)) ||
      (panel.staffRoleId && member.roles.cache.has(panel.staffRoleId))
    );
}

module.exports = {
  hasMenuAccess,
  isTicketStaff
};
