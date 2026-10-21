import { Injectable, type OnModuleInit } from '@nestjs/common';
import Handlebars from 'handlebars';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppConfigService } from '@/platform/config/app-config.service.js';

interface Compiled {
  subject: HandlebarsTemplateDelegate;
  footer?: HandlebarsTemplateDelegate;
  body: HandlebarsTemplateDelegate;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

const RTL = new Set(['ar']);

/** Compiles every .hbs once at boot. Line 1 `{{!-- subject: … --}}`, last line `{{!-- footer: … --}}`. */
@Injectable()
export class TemplateRenderer implements OnModuleInit {
  private readonly hbs = Handlebars.create();
  private readonly templates = new Map<string, Compiled>();
  private layout!: HandlebarsTemplateDelegate;

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    const root = this.config.env.MAIL_TEMPLATES_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'templates', 'emails');
    this.layout = this.hbs.compile(await readFile(join(root, 'layouts', 'base.hbs'), 'utf8'));
    for (const file of await readdir(join(root, 'partials'))) {
      this.hbs.registerPartial(file.replace(/\.hbs$/, ''), await readFile(join(root, 'partials', file), 'utf8'));
    }
    for (const lang of ['ar', 'en']) {
      for (const file of await readdir(join(root, lang))) {
        const source = await readFile(join(root, lang, file), 'utf8');
        const subject = /^\s*\{\{!--\s*subject:\s*(.*?)\s*--\}\}/.exec(source)?.[1] ?? '';
        const footer = /\{\{!--\s*footer:\s*(.*?)\s*--\}\}\s*$/.exec(source)?.[1];
        const body = source
          .replace(/^\s*\{\{!--\s*subject:.*?--\}\}/, '')
          .replace(/\{\{!--\s*footer:.*?--\}\}\s*$/, '')
          .trim();
        this.templates.set(`${lang}/${file.replace(/\.hbs$/, '')}`, {
          subject: this.hbs.compile(subject),
          footer: footer ? this.hbs.compile(footer) : undefined,
          body: this.hbs.compile(body),
        });
      }
    }
  }

  render(template: string, lang: string, vars: Record<string, unknown>): RenderedEmail {
    const compiled = this.templates.get(`${lang}/${template}`);
    if (!compiled) throw new Error(`Email template not found: ${lang}/${template}`);
    const subject = compiled.subject(vars);
    const html = this.layout({
      lang,
      dir: RTL.has(lang) ? 'rtl' : 'ltr',
      subject,
      body: compiled.body(vars),
      footer: compiled.footer?.(vars) ?? '',
    });
    return { subject, html };
  }
}
