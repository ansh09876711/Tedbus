const net = require("net");
const tls = require("tls");

/**
 * Checks whether real SMTP credentials are configured in environment variables.
 * Never returns true for empty or placeholder values.
 */
function isSmtpConfigured() {
  const host = (process.env.SMTP_HOST || "").trim();
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim();
  if (!host || !user || !pass) return false;
  if (
    host.includes("<") ||
    host.includes("example.com") ||
    user.includes("<") ||
    pass.includes("<") ||
    pass === "replace-with-smtp-password"
  ) {
    return false;
  }
  return true;
}

/**
 * Minimal RFC 5321 SMTP client over Node.js built-in net/tls sockets.
 * Only reports delivered=true when the remote SMTP server accepts the message (250).
 */
function sendSmtpEmail({ to, subject, text }) {
  return new Promise((resolve) => {
    if (!isSmtpConfigured()) {
      return resolve({
        delivered: false,
        error: "SMTP credentials not configured (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS required)."
      });
    }

    if (!to || !String(to).includes("@")) {
      return resolve({
        delivered: false,
        error: "No valid recipient email address."
      });
    }

    const host = process.env.SMTP_HOST.trim();
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = String(process.env.SMTP_SECURE || (port === 465 ? "true" : "false")).toLowerCase() === "true";
    const user = process.env.SMTP_USER.trim();
    const pass = process.env.SMTP_PASS.trim();
    const from = (process.env.SMTP_FROM || user).trim();

    let socket = null;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        if (socket && !socket.destroyed) socket.destroy();
      } catch (_) {}
      resolve(result);
    };

    const commands = [
      `EHLO tedbus.local`,
      `AUTH LOGIN`,
      Buffer.from(user, "utf8").toString("base64"),
      Buffer.from(pass, "utf8").toString("base64"),
      `MAIL FROM:<${from}>`,
      `RCPT TO:<${to}>`,
      `DATA`,
      [
        `From: TedBus Notifications <${from}>`,
        `To: <${to}>`,
        `Subject: ${String(subject || "TedBus Notification").replace(/[\r\n]/g, " ")}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        String(text || ""),
        `.`
      ].join("\r\n"),
      `QUIT`
    ];

    let step = -1;
    let buffer = "";

    const onLine = (line) => {
      const code = parseInt(line.slice(0, 3), 10);
      // Multi-line response continuation (e.g., 250-...)
      if (line[3] === "-") return;

      if (code >= 400 || Number.isNaN(code)) {
        return finish({
          delivered: false,
          error: `SMTP server rejected command at step ${step}: ${line.trim()}`
        });
      }

      step += 1;
      if (step < commands.length) {
        const nextCmd = commands[step];
        socket.write(nextCmd + "\r\n");
        // After sending message body (`.`), step === 7; wait for 250 acceptance before QUIT
      } else {
        return finish({ delivered: true });
      }
    };

    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      let idx;
      while ((idx = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        onLine(line);
      }
    };

    try {
      socket = secure
        ? tls.connect({ host, port, servername: host, timeout: 8000 })
        : net.createConnection({ host, port, timeout: 8000 });

      socket.on("data", onData);
      socket.on("timeout", () => finish({ delivered: false, error: "SMTP connection timed out." }));
      socket.on("error", (err) => finish({ delivered: false, error: `SMTP connection error: ${err.message}` }));
    } catch (err) {
      return finish({ delivered: false, error: `SMTP initialization error: ${err.message}` });
    }
  });
}

module.exports = {
  isSmtpConfigured,
  sendSmtpEmail
};

