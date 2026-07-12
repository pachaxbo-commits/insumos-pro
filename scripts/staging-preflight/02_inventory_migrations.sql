select
  version,
  name,
  statements
from supabase_migrations.schema_migrations
order by version;

