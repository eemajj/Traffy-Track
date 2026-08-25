# 🗄️ Applied Migrations Log

ทุกไฟล์ใน `supabase/migrations/` ต้องถูกบันทึกสถานะในไฟล์นี้ (`scripts/check-migration-log.mjs` จะตรวจใน predeploy) อัปเดตเมื่อ apply ผ่าน Staging แล้วจึง mark Production

| Migration | Staging | Production |
|---|---|---|
| 20260706190000_initial_schema.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260706230000_import_batch_status.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260707090000_case_history_indexes.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260707170000_report_archives.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260708093000_import_jobs.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260711143000_lock_down_public_api.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260712100000_import_atomic_apply.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260712153000_audit_events.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260712210000_analytics_overview.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260712220000_report_item_snapshots.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260713090000_ticket_filter_options.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260714100000_import_single_active.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260714110000_pending_state_null_safe.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260714130000_transactional_report_snapshot.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260714150000_evidence_versions_outbox.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260714151000_evidence_privilege_hardening.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260714152000_evidence_review_correctness.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260714153000_evidence_restore_rpc.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260714154000_evidence_withdraw_correctness.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260714155000_operations_recovery.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260714156000_operations_attempts_ambiguity.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260714157000_import_heartbeat.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260714158000_analytics_radius_hotspots.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260714159000_analytics_legacy_coordinate_compatibility.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260714160000_workflow_core.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260715100000_security_audit_login_rate_limit.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260715110000_import_durable_consumer.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260715120000_evidence_withdraw_grace_undo.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260715130000_consistent_backup_snapshot.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260715131000_backup_snapshot_timeout.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260715190000_passcode_profile_access_control.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260715220000_operational_readiness_features.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260715230000_query_performance_hardening.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260715234000_citydata_cases_read_only.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260715234500_enforce_citydata_case_immutability.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260719090000_import_large_file_timeout.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260719120000_import_staged_pipeline_v2.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260720144500_fix_report_snapshot_helper_grant.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260805134000_dept_list_gin_index.sql | ✅ (ก่อนมี tracking) | ✅ (ก่อนมี tracking) |
| 20260825120000_ticket_origin_flag.sql | ✅ applied | ✅ **applied + verified** (2026-08-25) |
| 20260825130000_audit_log_retention.sql | ✅ applied | ✅ **applied + verified** (2026-08-25) |
| 20260825140000_dashboard_range_overview_rpc.sql | ✅ applied | ✅ **applied + verified** (2026-08-25) |
