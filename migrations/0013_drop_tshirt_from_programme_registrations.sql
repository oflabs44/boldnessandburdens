-- The t-shirt question was dropped from the programme registration form.
-- Remove the now-unused columns.
-- IMPORTANT: apply this to remote D1 only AFTER the new worker code (which no
-- longer writes wants_tshirt/tshirt_size) is deployed.
ALTER TABLE programme_registrations DROP COLUMN wants_tshirt;
ALTER TABLE programme_registrations DROP COLUMN tshirt_size;
