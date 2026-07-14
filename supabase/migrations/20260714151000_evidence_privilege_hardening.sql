begin;

-- Earlier migrations granted service_role all table privileges globally.
-- Evidence content and lifecycle events must only mutate through audited RPCs.
revoke insert, update, delete
on public.report_evidence_versions, public.report_evidence_status_events
from service_role;

grant select
on public.report_evidence_versions, public.report_evidence_status_events
to service_role;

commit;
