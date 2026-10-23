-- TRANSACTIONAL EXECUTOR. Do not run until the read-only preview is reviewed
-- and the owner explicitly authorizes this exact scope.
-- Connect directly as postgres/supabase_admin. Never run through the app UI.
-- Required psql variables: cleanup_run_id, cleanup_actor_id,
-- cleanup_reason, cleanup_expected_snapshot, cleanup_confirmation.
\set ON_ERROR_STOP on
\if :{?cleanup_run_id}
\else
  \echo 'Missing required psql variable: cleanup_run_id'
  \quit 2
\endif
\if :{?cleanup_actor_id}
\else
  \echo 'Missing required psql variable: cleanup_actor_id'
  \quit 2
\endif
\if :{?cleanup_reason}
\else
  \echo 'Missing required psql variable: cleanup_reason'
  \quit 2
\endif
\if :{?cleanup_expected_snapshot}
\else
  \echo 'Missing reviewed psql variable: cleanup_expected_snapshot'
  \quit 2
\endif
\if :{?cleanup_confirmation}
\else
  \echo 'Missing explicit psql variable: cleanup_confirmation'
  \quit 2
\endif

begin;
select private.execute_qb_prepublication_cleanup(
  :'cleanup_run_id'::uuid,
  :'cleanup_actor_id'::uuid,
  :'cleanup_reason',
  :'cleanup_confirmation',
  :'cleanup_expected_snapshot'::jsonb
) as cleanup_result;
commit;
