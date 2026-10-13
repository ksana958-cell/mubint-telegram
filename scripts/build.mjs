import { readFile, mkdir, writeFile } from 'node:fs/promises';
import ts from 'typescript';
import { build } from 'vite';
await mkdir('server/shared', { recursive: true });
for (const name of ['schedule', 'schedule-diff', 'student']) {
  const source = await readFile(`lib/${name}.ts`, 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await writeFile(`server/shared/${name}.mjs`, result.replaceAll('"./schedule"', '"./schedule.mjs"').replaceAll('"./schedule-diff"', '"./schedule-diff.mjs"'));
}
await build();
