function nowIso() {
  return new Date().toISOString();
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return JSON.stringify({ error: "failed_to_serialize_log_payload" });
  }
}

function log(level, message, meta = {}) {
  const payload = {
    ts: nowIso(),
    level,
    message,
    ...meta,
  };
  // Console JSON logs are easy to filter and ship.
  if (level === "error") {
    console.error(safeJson(payload));
  } else {
    console.log(safeJson(payload));
  }
}

module.exports = {
  info: (message, meta) => log("info", message, meta),
  warn: (message, meta) => log("warn", message, meta),
  error: (message, meta) => log("error", message, meta),
};
