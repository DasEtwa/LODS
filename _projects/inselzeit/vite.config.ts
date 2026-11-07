import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const base = '/wgv1/';

/** Precache the complete Vite output, including dynamically imported chunks and public assets. */
function isolatedServiceWorker(): Plugin {
  return {
    name: 'inselzeit-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const publicDir = join(process.cwd(), 'public');
      const publicFiles: string[] = [];
      const visit = (directory: string) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const path = join(directory, entry.name);
          if (entry.isDirectory()) visit(path);
          else if (entry.isFile()) publicFiles.push(relative(publicDir, path).replaceAll('\\', '/'));
        }
      };
      visit(publicDir);
      const template = readFileSync(join(publicDir, 'sw.js'), 'utf8');
      const hash = createHash('sha256').update(template);
      for (const name of publicFiles.filter(name => name !== 'sw.js').sort()) {
        hash.update(name).update(readFileSync(join(publicDir, name)));
      }
      for (const [name, file] of Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b))) {
        hash.update(name).update(file.type === 'chunk' ? file.code : file.source);
      }
      const version = hash.digest('hex').slice(0, 16);
      const paths = [...new Set([
        base,
        ...publicFiles.filter(name => name !== 'sw.js').map(name => base + name),
        ...Object.keys(bundle).map(name => base + name),
      ])];
      const worker = template.replace('__WGV1_VERSION__', version)
        .replace('/*__WGV1_PRECACHE__*/ []', JSON.stringify(paths));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: worker });
    },
  };
}

export default defineConfig({ base, plugins: [isolatedServiceWorker()] });
