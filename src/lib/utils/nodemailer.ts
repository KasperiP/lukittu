import nodemailer from 'nodemailer';
import { MailOptions } from 'nodemailer/lib/sendmail-transport';
import 'server-only';

interface Email {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: Email) {
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
      from: process.env.SMTP_FROM,
      to,
      subject,
      html,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    return false;
  }
}
