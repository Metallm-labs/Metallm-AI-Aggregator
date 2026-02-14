import nodemailer from "nodemailer";

interface MailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

// Create reusable transporter object using the default SMTP transport
// For development, we'll try to use a real account if provided, otherwise console.log
const transporter = nodemailer.createTransport({
    service: "gmail", // Use Gmail service
    auth: {
        user: process.env.GMAIL_USER || "", // Your Gmail address
        pass: process.env.GMAIL_APP_PASSWORD || "", // Your Gmail App Password
    },
});

export async function sendEmail({ to, subject, html, text }: MailOptions): Promise<boolean> {
    // If no credentials are configured, log to console for development
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.log("⚠️  Email credentials not found. Logging email to console:");
        console.log("--- EMAIL START ---");
        console.log(`To: ${to}`);
        console.log(`Subject: ${subject}`);
        console.log(`Body: ${text || html}`);
        console.log("--- EMAIL END ---");
        return true; // Simulate success
    }

    try {
        const info = await transporter.sendMail({
            from: `"Metallm AI" <${process.env.GMAIL_USER}>`,
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
