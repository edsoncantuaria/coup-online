import nodemailer, { type Transporter } from 'nodemailer';

export type Mail = { to: string; subject: string; text: string; html?: string };

/** Quem entrega os emails da conta (confirmação, troca de senha). */
export interface Mailer {
  readonly kind: 'smtp' | 'log' | 'memory';
  send(mail: Mail): Promise<void>;
}

/** Sem SMTP configurado: escreve o email no log do servidor (links incluídos). */
export class LogMailer implements Mailer {
  readonly kind = 'log' as const;
  async send(mail: Mail) {
    console.log(`[mail] para ${mail.to}: ${mail.subject}\n${mail.text}\n`);
  }
}

/** Guarda os emails em memória (testes). */
export class MemoryMailer implements Mailer {
  readonly kind = 'memory' as const;
  readonly sent: Mail[] = [];
  async send(mail: Mail) {
    this.sent.push(mail);
  }
}

export type SmtpConfig = {
  host: string;
  port: number;
  /** true = TLS direto (porta 465); false = STARTTLS quando o servidor oferece. */
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
};

export class SmtpMailer implements Mailer {
  readonly kind = 'smtp' as const;
  private transport: Transporter;

  constructor(private config: SmtpConfig) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass ?? '' } : undefined,
    });
  }

  async send(mail: Mail) {
    await this.transport.sendMail({ from: this.config.from, ...mail });
  }
}

/**
 * SMTP quando `SMTP_HOST` está definido; senão, só log. Variáveis:
 * SMTP_HOST, SMTP_PORT (587), SMTP_SECURE (true na 465), SMTP_USER,
 * SMTP_PASS, MAIL_FROM.
 */
export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer {
  const host = env.SMTP_HOST?.trim();
  if (!host) return new LogMailer();
  const port = Number(env.SMTP_PORT) || 587;
  return new SmtpMailer({
    host,
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' || env.SMTP_SECURE === '1' : port === 465,
    user: env.SMTP_USER || undefined,
    pass: env.SMTP_PASS || undefined,
    from: env.MAIL_FROM || `Intriga <no-reply@${host}>`,
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function html(title: string, body: string, link: string, cta: string) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#120E0C;font-family:Arial,sans-serif;color:#EFE6D2">
<div style="max-width:480px;margin:0 auto;padding:32px 24px">
<p style="font-size:28px;color:#D9B25A;margin:0 0 16px">${esc(title)}</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 24px">${esc(body)}</p>
<a href="${esc(link)}" style="display:inline-block;background:#6B1622;color:#D9B25A;padding:14px 22px;text-decoration:none;font-weight:bold;letter-spacing:2px">${esc(cta)}</a>
<p style="font-size:13px;color:#978B78;margin:24px 0 0">Se não foi você, ignore este email.</p>
</div></body></html>`;
}

export function verifyEmailMail(to: string, username: string, link: string): Mail {
  const body = `Olá, ${username}. Confirme este email para proteger sua conta do Intriga. O link vale por 48 horas.`;
  return {
    to,
    subject: 'Confirme seu email no Intriga',
    text: `${body}\n\n${link}\n\nSe não foi você, ignore este email.`,
    html: html('Confirme seu email', body, link, 'CONFIRMAR EMAIL'),
  };
}

export function resetPasswordMail(to: string, username: string, link: string): Mail {
  const body = `Olá, ${username}. Alguém pediu para trocar a senha da sua conta do Intriga. O link vale por 1 hora.`;
  return {
    to,
    subject: 'Trocar a senha do Intriga',
    text: `${body}\n\n${link}\n\nSe não foi você, ignore este email. Sua senha continua a mesma.`,
    html: html('Trocar a senha', body, link, 'CRIAR SENHA NOVA'),
  };
}
