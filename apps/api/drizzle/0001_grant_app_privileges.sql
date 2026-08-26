GRANT SELECT, INSERT, UPDATE, DELETE ON
  subjects, users, projects, grants, sessions, invitations, totp_challenges
TO cairn_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_log TO cairn_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cairn_app;
