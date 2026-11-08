import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL;
const outputSqlPath = process.env.QB_SQL_OUTPUT_PATH;
if (!databaseUrl && !outputSqlPath) throw new Error('DATABASE_URL or QB_SQL_OUTPUT_PATH is required.');
const parsedUrl = databaseUrl ? new URL(databaseUrl) : null;
if (parsedUrl && !['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsedUrl.hostname)) {
  throw new Error('Refusing to run predecessor RPC fixture against a non-local database host.');
}

const readSql = (relativePath) => readFileSync(path.join(process.cwd(), relativePath), 'utf8');
const extractFunction = (relativePath, name) => {
  const sql = readSql(relativePath);
  const startPattern = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`, 'ig');
  const match = startPattern.exec(sql);
  if (!match) throw new Error(`Could not find public.${name} in ${relativePath}`);
  const bodyStart = sql.indexOf('as $$', match.index);
  if (bodyStart < 0) throw new Error(`Could not find the SQL body for public.${name} in ${relativePath}`);
  const end = sql.indexOf('$$;', bodyStart + 5);
  if (end < 0) throw new Error(`Could not find the end of public.${name} in ${relativePath}`);
  return sql.slice(match.index, end + 3);
};
const extractView = (relativePath, name) => {
  const sql = readSql(relativePath);
  const startPattern = new RegExp(`create\\s+(?:or\\s+replace\\s+)?view\\s+public\\.${name}\\b`, 'ig');
  const match = startPattern.exec(sql);
  if (!match) throw new Error(`Could not find public.${name} in ${relativePath}`);
  const end = sql.indexOf(';', match.index);
  if (end < 0) throw new Error(`Could not find the end of public.${name} in ${relativePath}`);
  return sql.slice(match.index, end + 1);
};

const definitions = [
  extractView('supabase/migrations/20261027100000_qb_explicit_delivery_origin.sql', 'qb_operational_preparation_items'),
  extractView('supabase/migrations/20261104100000_qb_supervisor_receipt_operations.sql', 'qb_supervisor_receipt_lines'),
  extractFunction('supabase/migrations/20260723130100_qb_operational_matrix_workflows.sql', 'save_qb_matrix_preparation_item'),
  extractFunction('supabase/migrations/20260723130100_qb_operational_matrix_workflows.sql', 'save_qb_matrix_delivery_item'),
  extractFunction('supabase/migrations/20261027120000_qb_review_zero_preparation_quantity.sql', 'save_qb_matrix_preparation_item'),
  extractFunction('supabase/migrations/20260724110000_qb_matrix_actual_weight.sql', 'save_qb_matrix_preparation_item_with_weight'),
  extractFunction('supabase/migrations/20260724110000_qb_matrix_actual_weight.sql', 'save_qb_matrix_delivery_item_with_weight'),
  `alter function public.save_qb_matrix_delivery_item_with_weight(uuid,integer,numeric,numeric,boolean,numeric,text,text)
    rename to save_qb_matrix_delivery_item_with_weight_v2;`,
  extractFunction('supabase/migrations/20260725010500_qb_delivery_can_complete_unreviewed_lines.sql', 'save_qb_matrix_delivery_item_with_weight'),
  extractFunction('supabase/migrations/20260926010000_qb_client_trial_readiness.sql', 'save_qb_matrix_preparation_item_with_unit'),
  extractFunction('supabase/migrations/20260926010000_qb_client_trial_readiness.sql', 'save_qb_matrix_delivery_item_with_unit'),
  extractFunction('supabase/migrations/20261027100000_qb_explicit_delivery_origin.sql', 'save_qb_matrix_preparation_origin_with_unit'),
  extractFunction('supabase/migrations/20261027100000_qb_explicit_delivery_origin.sql', 'save_qb_matrix_delivery_origin_with_unit'),
];

const grants = [
  `revoke all on function public.save_qb_matrix_preparation_item(uuid,integer,numeric,boolean,text,text) from public,anon;
   grant execute on function public.save_qb_matrix_preparation_item(uuid,integer,numeric,boolean,text,text) to authenticated;`,
  `revoke all on function public.save_qb_matrix_delivery_item(uuid,integer,numeric,numeric,boolean,text,text) from public,anon;
   grant execute on function public.save_qb_matrix_delivery_item(uuid,integer,numeric,numeric,boolean,text,text) to authenticated;`,
  `revoke all on function public.save_qb_matrix_preparation_item_with_weight(uuid,integer,numeric,boolean,numeric,text,text) from public,anon;
   grant execute on function public.save_qb_matrix_preparation_item_with_weight(uuid,integer,numeric,boolean,numeric,text,text) to authenticated;`,
  `revoke all on function public.save_qb_matrix_delivery_item_with_weight(uuid,integer,numeric,numeric,boolean,numeric,text,text) from public,anon;
   grant execute on function public.save_qb_matrix_delivery_item_with_weight(uuid,integer,numeric,numeric,boolean,numeric,text,text) to authenticated;`,
  `revoke all on function public.save_qb_matrix_delivery_item_with_weight_v2(uuid,integer,numeric,numeric,boolean,numeric,text,text) from public,anon;
   grant execute on function public.save_qb_matrix_delivery_item_with_weight_v2(uuid,integer,numeric,numeric,boolean,numeric,text,text) to authenticated;`,
  `revoke all on function public.save_qb_matrix_preparation_item_with_unit(uuid,integer,numeric,boolean,numeric,text,text,text) from public,anon;
   grant execute on function public.save_qb_matrix_preparation_item_with_unit(uuid,integer,numeric,boolean,numeric,text,text,text) to authenticated;`,
  `revoke all on function public.save_qb_matrix_delivery_item_with_unit(uuid,integer,numeric,numeric,boolean,numeric,text,text,text) from public,anon;
   grant execute on function public.save_qb_matrix_delivery_item_with_unit(uuid,integer,numeric,numeric,boolean,numeric,text,text,text) to authenticated;`,
  `revoke all on function public.save_qb_matrix_preparation_origin_with_unit(uuid,integer,numeric,boolean,numeric,text,text,numeric,numeric,numeric,boolean,text) from public,anon;
   grant execute on function public.save_qb_matrix_preparation_origin_with_unit(uuid,integer,numeric,boolean,numeric,text,text,numeric,numeric,numeric,boolean,text) to authenticated;`,
  `revoke all on function public.save_qb_matrix_delivery_origin_with_unit(uuid,integer,numeric,numeric,boolean,numeric,text,text,numeric,numeric,numeric,numeric,boolean,text) from public,anon;
   grant execute on function public.save_qb_matrix_delivery_origin_with_unit(uuid,integer,numeric,numeric,boolean,numeric,text,text,numeric,numeric,numeric,numeric,boolean,text) to authenticated;`,
];

const directory = mkdtempSync(path.join(tmpdir(), 'qb-measurement-rpc-contract-'));
const file = path.join(directory, 'predecessor-functions.sql');
try {
  const sql = `\\set ON_ERROR_STOP on\nbegin;\n${definitions.join('\n\n')}\n${grants.join('\n')}\ncommit;\n`;
  writeFileSync(file, sql);
  if (outputSqlPath) writeFileSync(outputSqlPath, sql);
  else execFileSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: 'inherit' });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
