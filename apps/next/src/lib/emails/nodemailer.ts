import nodemailer from 'nodemailer';
import { MailOptions } from 'nodemailer/lib/sendmail-transport';
import 'server-only';

interface Email {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
}

export async function sendEmail({ to, subject, html, text, fromName }: Email) {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST as string,
      port: parseInt(process.env.SMTP_PORT as string),
      secure: false,
      auth: {
        user: process.env.SMTP_USER as string,
        pass: process.env.SMTP_PASSWORD as string,
      },
    });

    const mailOptions: MailOptions = {
      from: {
        address: process.env.SMTP_FROM!,
        name: fromName || process.env.SMTP_FROM_NAME!,
      },
      to,
      subject,
      html,
      text,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    return false;
  }
}
