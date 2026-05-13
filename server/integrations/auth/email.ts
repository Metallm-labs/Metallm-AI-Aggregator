import nodemailer from "nodemailer";

interface MailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
    from?: string;
}

// Create reusable transporter object using Zoho Mail SMTP
// For development, we'll try to use a real account if provided, otherwise console.log
const transporter = nodemailer.createTransport({
    host: "smtp.zoho.com",  // use smtp.zoho.eu if your account is on the EU data centre
    port: 587,
    secure: false, // STARTTLS
    auth: {
        user: process.env.ZOHO_USER || "",
        pass: process.env.ZOHO_APP_PASSWORD || "",
    },
});

export async function sendEmail({ to, subject, html, text, from }: MailOptions): Promise<boolean> {
    // If no credentials are configured, log to console for development
    if (!process.env.ZOHO_USER || !process.env.ZOHO_APP_PASSWORD) {
        if (process.env.NODE_ENV !== "production") {
            console.log("⚠️  Email credentials not found. Logging email to console:");
            console.log("--- EMAIL START ---");
            console.log(`To: ${to}`);
            console.log(`Subject: ${subject}`);
            console.log(`Body: ${text || html}`);
            console.log("--- EMAIL END ---");
        } else {
            console.warn("⚠️  Email credentials not configured in production.");
        }
        return true; // Simulate success
    }

    try {
        const info = await transporter.sendMail({
            from: from || `"Metallm AI" <${process.env.ZOHO_USER}>`,
            to,
            subject,
            text,
            html,
        });

        console.log("✅ Email sent: %s", info.messageId);
        return true;
    } catch (error) {
        console.error("❌ Error sending email:", error);
        return false;
    }
}

export async function sendWelcomeEmail(email: string, firstName: string): Promise<boolean> {
    const subject = "Welcome to MetaLLM \u2014 You're In! \uD83D\uDE80";
    const name = firstName || "there";
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 30px 20px; color: #333;">
      <h2 style="margin-bottom: 4px;">Hi ${name},</h2>
      <p style="margin-top: 0;">Welcome to <strong>MetaLLM</strong> \u2014 we\u2019re glad to have you on board.</p>
      <p>MetaLLM is built around one core idea: <strong>different questions deserve different AI models</strong>. Instead of settling for one AI, you now have access to the best of all of them \u2014 in one place.</p>

      <hr style="border: 0; border-top: 1px solid #ddd; margin: 24px 0;" />

      <h3 style="margin-bottom: 8px;">\uD83E\uDDE0 THREE POWERFUL MODES</h3>

      <p><strong>1. Direct Mode</strong><br/>
      Pick your preferred AI model and have a focused conversation. Switch models mid-chat \u2014 full context carries over seamlessly.</p>

      <p><strong>2. Multi Mode</strong><br/>
      Ask one question, get answers from multiple AI models simultaneously. Compare perspectives and choose what works best for you.</p>

      <p><strong>3. Debate Mode</strong><br/>
      Assign two AI models opposing positions and watch them argue round by round. A neutral judge evaluates and declares a winner. Perfect for exploring complex topics from every angle.</p>

      <hr style="border: 0; border-top: 1px solid #ddd; margin: 24px 0;" />

      <h3 style="margin-bottom: 8px;">\u26A1 SMART AI ROUTING</h3>
      <p>Not sure which model to use? MetaLLM\u2019s intelligent routing system automatically analyzes your query and sends it to the most suitable model \u2014 whether that\u2019s a coding specialist, a reasoning expert, or a creative writer.</p>
      <p>You focus on your work. We handle the rest.</p>

      <hr style="border: 0; border-top: 1px solid #ddd; margin: 24px 0;" />

      <h3 style="margin-bottom: 8px;">\uD83D\uDE80 GET STARTED</h3>
      <p>Head over to <a href="https://metallm.tech" style="color: #4F46E5;">metallm.tech</a> and start exploring. Your credits are ready and waiting.</p>

      <hr style="border: 0; border-top: 1px solid #ddd; margin: 24px 0;" />

      <h3 style="margin-bottom: 8px;">\uD83D\uDCE7 SUPPORT</h3>
      <p>Have a question, issue, or just want to share feedback? We\u2019re here to help.<br/>
      Reach us anytime at <a href="mailto:support@metallm.tech" style="color: #4F46E5;">support@metallm.tech</a> \u2014 we read and respond to every message personally.</p>

      <hr style="border: 0; border-top: 1px solid #ddd; margin: 24px 0;" />

      <p style="margin-bottom: 4px;">Welcome aboard.</p>
      <p style="margin-top: 0;"><strong>The MetaLLM Team</strong><br/>
      <a href="https://metallm.tech" style="color: #4F46E5;">https://metallm.tech</a></p>
    </div>
  `;
    const text = `Hi ${name},\n\nWelcome to MetaLLM \u2014 we\u2019re glad to have you on board.\n\nMetaLLM is built around one core idea: different questions deserve different AI models. Instead of settling for one AI, you now have access to the best of all of them \u2014 in one place.\n\n\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\n\uD83E\uDDE0 THREE POWERFUL MODES\n\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\n\n1. Direct Mode\nPick your preferred AI model and have a focused conversation. Switch models mid-chat \u2014 full context carries over seamlessly.\n\n2. Multi Mode\nAsk one question, get answers from multiple AI models simultaneously. Compare perspectives and choose what works best for you.\n\n3. Debate Mode\nAssign two AI models opposing positions and watch them argue round by round. A neutral judge evaluates and declares a winner. Perfect for exploring complex topics from every angle.\n\n\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\n\u26A1 SMART AI ROUTING\n\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\n\nNot sure which model to use? MetaLLM\u2019s intelligent routing system automatically analyzes your query and sends it to the most suitable model.\n\nYou focus on your work. We handle the rest.\n\n\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\n\uD83D\uDE80 GET STARTED\n\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\n\nHead over to metallm.tech and start exploring. Your credits are ready and waiting.\n\n\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\n\uD83D\uDCE7 SUPPORT\n\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\u2013\n\nHave a question, issue, or just want to share feedback? Reach us anytime at support@metallm.tech \u2014 we read and respond to every message personally.\n\nWelcome aboard.\n\nThe MetaLLM Team\nhttps://metallm.tech`;

    // Use WELCOME_EMAIL as the from address if configured
    const from = process.env.WELCOME_EMAIL
        ? `"MetaLLM" <${process.env.WELCOME_EMAIL}>`
        : undefined;

    return sendEmail({ to: email, subject, html, text, from });
}

export async function sendVerificationEmail(email: string, otp: string): Promise<boolean> {
    const subject = "Verify your email for Metallm";
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
      <h2 style="color: #333; text-align: center;">Verify Your Email</h2>
      <p style="color: #555; text-align: center;">Use the code below to complete your registration for Metallm AI Aggregator.</p>
      <div style="background-color: #f4f4f4; padding: 15px; text-align: center; border-radius: 5px; margin: 20px 0;">
        <span style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #007bff;">${otp}</span>
      </div>
      <p style="color: #666; font-size: 14px; text-align: center;">This code will expire in 10 minutes.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #999; font-size: 12px; text-align: center;">If you didn't request this code, please ignore this email.</p>
    </div>
  `;
    const text = `Your verification code is: ${otp}. It expires in 10 minutes.`;

    return sendEmail({ to: email, subject, html, text });
}

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<boolean> {
    const subject = "Reset your Metallm password";
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px 20px; color: #333;">
      <h2 style="margin-bottom: 6px;">Reset your password</h2>
      <p style="margin-top: 0; color: #555;">
        We received a request to reset your password. Click the button below to set a new password.
      </p>
      <div style="margin: 18px 0;">
        <a href="${resetUrl}" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600;">
          Reset Password
        </a>
      </div>
      <p style="color:#666;font-size:13px;line-height:1.5;">
        This link expires in 1 hour. If you didn’t request this, you can safely ignore this email.
      </p>
      <p style="color:#888;font-size:12px;margin-top:18px;">
        If the button doesn’t work, copy and paste this URL into your browser:<br/>
        <span style="word-break:break-all;">${resetUrl}</span>
      </p>
    </div>
  `;
    const text = `Reset your Metallm password:\n${resetUrl}\n\nThis link expires in 1 hour. If you didn’t request this, ignore this email.`;
    return sendEmail({ to: email, subject, html, text });
}

export async function sendMessageLimitExceededEmail(
    email: string,
    firstName: string,
    planName: string,
    usedMessages: number,
    limitMessages: number,
): Promise<boolean> {
    const name = firstName || "there";
    const upgradeUrl = "https://metallm.tech/agent";
    const subject = `Your ${planName} message limit has been reached — Upgrade to continue`;
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 30px 20px; color: #333;">
      <h2 style="margin-bottom: 4px;">Hi ${name},</h2>
      <p style="margin-top: 0;">
        Your <strong>${planName}</strong> plan message limit of <strong>${limitMessages} messages</strong> has been reached.
        Your WhatsApp AI Agent will not be able to respond to new messages until you upgrade your plan.
      </p>

      <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 14px 18px; border-radius: 6px; margin: 20px 0;">
        <strong>Messages used:</strong> ${usedMessages} / ${limitMessages}
      </div>

      <p>To keep your WhatsApp AI Agent running without interruption, upgrade your plan now:</p>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${upgradeUrl}" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:16px;">
          Upgrade Now
        </a>
      </div>

      <hr style="border: 0; border-top: 1px solid #ddd; margin: 24px 0;" />

      <p style="color: #666; font-size: 14px;">
        Need help choosing a plan? Reply to this email or reach us at
        <a href="mailto:support@metallm.tech" style="color: #4F46E5;">support@metallm.tech</a>
      </p>

      <p style="margin-top: 20px;">
        <strong>The MetaLLM Team</strong><br/>
        <a href="https://metallm.tech" style="color: #4F46E5;">https://metallm.tech</a>
      </p>
    </div>
  `;
    const text = `Hi ${name},\n\nYour ${planName} plan message limit of ${limitMessages} messages has been reached. Your WhatsApp AI Agent will not respond to new messages until you upgrade.\n\nMessages used: ${usedMessages} / ${limitMessages}\n\nUpgrade now: ${upgradeUrl}\n\nNeed help? Reply to this email or contact support@metallm.tech\n\nThe MetaLLM Team\nhttps://metallm.tech`;

    const from = process.env.FEEDBACK_EMAIL
        ? `"MetaLLM" <${process.env.FEEDBACK_EMAIL}>`
        : undefined;

    return sendEmail({ to: email, subject, html, text, from });
}

export async function sendTrialEndedEmail(
    email: string,
    firstName: string,
): Promise<boolean> {
    const name = firstName || "there";
    const upgradeUrl = "https://metallm.tech/agent";
    const subject = "Your free trial has ended — Upgrade to keep your WhatsApp AI Agent active";
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 30px 20px; color: #333;">
      <h2 style="margin-bottom: 4px;">Hi ${name},</h2>
      <p style="margin-top: 0;">
        Your <strong>free trial</strong> of the WhatsApp AI Agent has ended. You’ve used all <strong>20 free messages</strong>.
      </p>

      <p>Your AI agent is now paused and won’t respond to new WhatsApp messages until you upgrade to a paid plan.</p>

      <div style="background: #F3F4F6; border-radius: 8px; padding: 18px; margin: 20px 0;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px;">Available Plans:</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px 4px;"><strong>Starter</strong></td>
            <td style="padding: 8px 4px;">800 msgs/month</td>
            <td style="padding: 8px 4px; text-align: right;"><strong>$59/mo</strong></td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px 4px;"><strong>Pro</strong></td>
            <td style="padding: 8px 4px;">3,500 msgs/month</td>
            <td style="padding: 8px 4px; text-align: right;"><strong>$129/mo</strong></td>
          </tr>
          <tr>
            <td style="padding: 8px 4px;"><strong>Enterprise</strong></td>
            <td style="padding: 8px 4px;">10,000 msgs/month</td>
            <td style="padding: 8px 4px; text-align: right;"><strong>$299/mo</strong></td>
          </tr>
        </table>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${upgradeUrl}" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:16px;">
          Upgrade Now
        </a>
      </div>

      <hr style="border: 0; border-top: 1px solid #ddd; margin: 24px 0;" />

      <p style="color: #666; font-size: 14px;">
        Need help choosing a plan? Reply to this email or reach us at
        <a href="mailto:support@metallm.tech" style="color: #4F46E5;">support@metallm.tech</a>
      </p>

      <p style="margin-top: 20px;">
        <strong>The MetaLLM Team</strong><br/>
        <a href="https://metallm.tech" style="color: #4F46E5;">https://metallm.tech</a>
      </p>
    </div>
  `;
    const text = `Hi ${name},\n\nYour free trial of the WhatsApp AI Agent has ended. You’ve used all 20 free messages.\n\nYour AI agent is now paused and won’t respond until you upgrade.\n\nAvailable Plans:\n- Starter: 800 msgs/month — $59/mo\n- Pro: 3,500 msgs/month — $129/mo\n- Enterprise: 10,000 msgs/month — $299/mo\n\nUpgrade now: ${upgradeUrl}\n\nNeed help? Reply to this email or contact support@metallm.tech\n\nThe MetaLLM Team\nhttps://metallm.tech`;

    const from = process.env.FEEDBACK_EMAIL
        ? `"MetaLLM" <${process.env.FEEDBACK_EMAIL}>`
        : undefined;

    return sendEmail({ to: email, subject, html, text, from });
}
