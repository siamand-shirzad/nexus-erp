-- Database-level guards so the books stay consistent even if application code is bypassed.

-- 1. Lines of a posted entry are immutable.
CREATE OR REPLACE FUNCTION acc_lines_guard() RETURNS trigger AS $$
DECLARE
  st text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT status::text INTO st FROM acc_entries WHERE id = OLD.entry_id;
    IF st = 'posted' THEN
      RAISE EXCEPTION 'Lines of a posted journal entry cannot be changed or deleted';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT status::text INTO st FROM acc_entries WHERE id = NEW.entry_id;
    IF st = 'posted' THEN
      RAISE EXCEPTION 'Lines cannot be added to a posted journal entry';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER acc_lines_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON acc_lines
FOR EACH ROW EXECUTE FUNCTION acc_lines_guard();
--> statement-breakpoint

-- 2. Posting requires a balanced entry with at least two one-sided positive lines.
--    Posted entries cannot be deleted, un-posted, or have their financial details edited.
CREATE OR REPLACE FUNCTION acc_entries_guard() RETURNS trigger AS $$
DECLARE
  n integer;
  bad integer;
  d numeric;
  c numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' THEN
      RAISE EXCEPTION 'Posted journal entries cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN
    IF NEW.status <> 'posted'
       OR NEW.date <> OLD.date
       OR NEW.seq IS DISTINCT FROM OLD.seq
       OR NEW.entry_number IS DISTINCT FROM OLD.entry_number
       OR NEW.description <> OLD.description
       OR NEW.reference IS DISTINCT FROM OLD.reference
       OR NEW.kind <> OLD.kind
       OR NEW.reverses_entry_id IS DISTINCT FROM OLD.reverses_entry_id THEN
      RAISE EXCEPTION 'Posted journal entries cannot be edited; reverse them instead';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'posted' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Journal entries must be created as drafts and then posted';
    END IF;
    SELECT count(*),
           count(*) FILTER (WHERE NOT ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))),
           coalesce(sum(debit), 0),
           coalesce(sum(credit), 0)
      INTO n, bad, d, c
      FROM acc_lines WHERE entry_id = NEW.id;
    IF n < 2 THEN
      RAISE EXCEPTION 'A journal entry needs at least two lines';
    END IF;
    IF bad > 0 THEN
      RAISE EXCEPTION 'Every line needs exactly one positive debit or credit';
    END IF;
    IF d <> c THEN
      RAISE EXCEPTION 'Journal entry is not balanced (debits % / credits %)', d, c;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER acc_entries_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON acc_entries
FOR EACH ROW EXECUTE FUNCTION acc_entries_guard();
