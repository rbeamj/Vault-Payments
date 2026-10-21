import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import type { TemplateId } from '../planner/plan.js';

/** Template id → file name inside `templates/universal/`. */
const TEMPLATE_FILES: Record<TemplateId, string> = {
  package_json: 'package.json.hbs',
  tsconfig: 'tsconfig.json.hbs',
  env_example: 'env.example.hbs',
  types: 'types.ts.hbs',
  config: 'config.ts.hbs',
  client: 'client.ts.hbs',
  routes: 'routes.ts.hbs',
  readme: 'README.md.hbs',
};

/** The universal template directory, resolved for both src/ and dist/ runners. */
export function defaultTemplatesDir(): string {
  return fileURLToPath(new URL('../../templates/universal/', import.meta.url));
}

export type TemplateSource = Record<TemplateId, string>;

/**
 * Register the shared helper set.
 *
 * Deliberately small: any provider-specific decision belongs in the view model
 * (TypeScript), not in a template conditional. A template that branches on a
 * provider name would defeat the 13th-provider requirement.
 */
function registerHelpers(hb: typeof Handlebars): void {
  hb.registerHelper('json', (value: unknown) => new Handlebars.SafeString(JSON.stringify(value)));

  /**
   * Helpers work both inline (`{{eq a b}}` → boolean) and as blocks
   * (`{{#eq a b}}…{{/eq}}`). Handlebars only supplies `fn`/`inverse` for block
   * form, so the presence of `fn` selects the mode.
   */
  function branch(this: unknown, value: boolean, options?: Handlebars.HelperOptions): unknown {
    if (options && typeof options.fn === 'function') {
      return value ? options.fn(this) : options.inverse(this);
    }
    return value;
  }

  hb.registerHelper('eq', function (this: unknown, a: unknown, b: unknown, options?: Handlebars.HelperOptions) {
    return branch.call(this, a === b, options);
  });
  hb.registerHelper('ne', function (this: unknown, a: unknown, b: unknown, options?: Handlebars.HelperOptions) {
    return branch.call(this, a !== b, options);
  });
  hb.registerHelper('not', function (this: unknown, value: unknown, options?: Handlebars.HelperOptions) {
    return branch.call(this, !value, options);
  });
  hb.registerHelper('and', function (this: unknown, ...args: unknown[]) {
    const options = args.pop() as Handlebars.HelperOptions | undefined;
    return branch.call(this, args.every(Boolean), options);
  });
  hb.registerHelper('or', function (this: unknown, ...args: unknown[]) {
    const options = args.pop() as Handlebars.HelperOptions | undefined;
    return branch.call(this, args.some(Boolean), options);
  });

  /** Render `block` once per item, joined — used to build import lists. */
  hb.registerHelper('join', (items: unknown, separator: string) =>
    Array.isArray(items) ? items.join(separator) : '',
  );
}

export function createHandlebars(): typeof Handlebars {
  const instance = Handlebars.create();
  registerHelpers(instance);
  return instance;
}

export function compileTemplate(source: string): Handlebars.TemplateDelegate {
  // Output is source code, not HTML: escaping would corrupt it. Every string
  // literal in a template goes through the `json` helper, which escapes safely.
  return createHandlebars().compile(source, { noEscape: true, strict: false });
}

/** Read every universal template from disk. */
export async function loadTemplates(dir: string): Promise<TemplateSource> {
  const entries = await Promise.all(
    (Object.keys(TEMPLATE_FILES) as TemplateId[]).map(async (id) => {
      const file = join(dir, TEMPLATE_FILES[id]);
      const source = await readFile(file, 'utf8');
      return [id, source] as const;
    }),
  );
  return Object.fromEntries(entries) as TemplateSource;
}
