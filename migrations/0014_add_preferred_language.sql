-- Preferred language for participant communications (emails, badge copy).
-- ISO 639-1 code; 'en' or 'de'. Lets us send each person in their language
-- (e.g. badge-onboarding vs badge-onboarding-de). Defaults to English, which
-- covers most of the roster; German speakers are flagged individually.
ALTER TABLE participants ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'en';
