const recentErrors = [];

function recordError(source, error, context = {}) {
  recentErrors.unshift({
    source,
    message: error?.message || String(error || "Erro desconhecido"),
    stack: error?.stack ? String(error.stack).split(/\r?\n/).slice(0, 3).join("\n") : null,
    context,
    createdAt: Date.now()
  });
  recentErrors.splice(20);
}

function getRecentErrors(limit = 5) {
  return recentErrors.slice(0, limit);
}

module.exports = {
  getRecentErrors,
  recordError
};
