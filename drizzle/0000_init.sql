CREATE TYPE "public"."customer_status" AS ENUM('active', 'lead', 'churned');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'paid', 'overdue', 'void');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'manager', 'seller');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."acc_category" AS ENUM('asset', 'liability', 'equity', 'income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."acc_entry_status" AS ENUM('draft', 'posted');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_name" text,
	"action" text NOT NULL,
	"target_type" text,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"email" text,
	"phone" text,
	"city" text,
	"country" text DEFAULT 'United States' NOT NULL,
	"status" "customer_status" DEFAULT 'active' NOT NULL,
	"owner_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"seller_id" uuid,
	"amount" integer DEFAULT 0 NOT NULL,
	"tax" integer DEFAULT 0 NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "invoices_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"name" text NOT NULL,
	"sku" text,
	"qty" integer DEFAULT 1 NOT NULL,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"line_total" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"seller_id" uuid,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"tax" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"shipping_address" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'General' NOT NULL,
	"icon" text DEFAULT '📦' NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"reorder_level" integer DEFAULT 10 NOT NULL,
	"status" "product_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"assignee_id" uuid,
	"creator_id" uuid,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'seller' NOT NULL,
	"title" text,
	"phone" text,
	"department" text,
	"avatar_color" text DEFAULT '#4f46e5' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "acc_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" "acc_category" NOT NULL,
	"parent_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_posting" boolean DEFAULT true NOT NULL,
	"requires_party" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acc_accounts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "acc_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acc_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "acc_bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'bank' NOT NULL,
	"account_id" uuid NOT NULL,
	"bank_name" text,
	"account_number" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "acc_bank_accounts_account_id_unique" UNIQUE("account_id"),
	CONSTRAINT "acc_bank_kind" CHECK ("acc_bank_accounts"."kind" in ('bank','cash'))
);
--> statement-breakpoint
CREATE TABLE "acc_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" integer,
	"entry_number" text,
	"date" date NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"reference" text,
	"status" "acc_entry_status" DEFAULT 'draft' NOT NULL,
	"kind" text DEFAULT 'manual' NOT NULL,
	"reverses_entry_id" uuid,
	"reversed_by_entry_id" uuid,
	"idempotency_key" text,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acc_entries_seq_unique" UNIQUE("seq"),
	CONSTRAINT "acc_entries_entry_number_unique" UNIQUE("entry_number"),
	CONSTRAINT "acc_entries_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "acc_entries_posted_numbered" CHECK ("acc_entries"."status" = 'draft' or ("acc_entries"."seq" is not null and "acc_entries"."entry_number" is not null))
);
--> statement-breakpoint
CREATE TABLE "acc_fiscal_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"closing_entry_id" uuid,
	CONSTRAINT "acc_fiscal_years_name_unique" UNIQUE("name"),
	CONSTRAINT "acc_fy_range" CHECK ("acc_fiscal_years"."start_date" <= "acc_fiscal_years"."end_date")
);
--> statement-breakpoint
CREATE TABLE "acc_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"account_id" uuid NOT NULL,
	"party_id" uuid,
	"debit" bigint DEFAULT 0 NOT NULL,
	"credit" bigint DEFAULT 0 NOT NULL,
	"description" text,
	CONSTRAINT "acc_lines_non_negative" CHECK ("acc_lines"."debit" >= 0 and "acc_lines"."credit" >= 0),
	CONSTRAINT "acc_lines_one_sided" CHECK ("acc_lines"."debit" = 0 or "acc_lines"."credit" = 0)
);
--> statement-breakpoint
CREATE TABLE "acc_parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"code" text,
	"notes" text,
	"is_customer" boolean DEFAULT false NOT NULL,
	"is_supplier" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acc_parties_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "acc_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "acc_period_range" CHECK ("acc_periods"."start_date" <= "acc_periods"."end_date")
);
--> statement-breakpoint
CREATE TABLE "acc_recon_match_lines" (
	"journal_line_id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acc_recon_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"reconciliation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acc_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"cutoff_date" date NOT NULL,
	"statement_closing_balance" bigint NOT NULL,
	"book_balance" bigint NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text
);
--> statement-breakpoint
CREATE TABLE "acc_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"business_name" text DEFAULT 'My Business' NOT NULL,
	"currency_code" text DEFAULT 'IRR' NOT NULL,
	"currency_label" text DEFAULT 'Rial' NOT NULL,
	"decimals" integer DEFAULT 0 NOT NULL,
	"retained_earnings_account_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "acc_settings_singleton" CHECK ("acc_settings"."id" = 1),
	CONSTRAINT "acc_settings_decimals" CHECK ("acc_settings"."decimals" between 0 and 4)
);
--> statement-breakpoint
CREATE TABLE "acc_statement_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"file_hash" text NOT NULL,
	"row_count" integer NOT NULL,
	"opening_balance" bigint,
	"closing_balance" bigint,
	"from_date" date,
	"to_date" date,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acc_import_file_once" UNIQUE("bank_account_id","file_hash")
);
--> statement-breakpoint
CREATE TABLE "acc_statement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"date" date NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"reference" text,
	"external_id" text,
	"amount" bigint NOT NULL,
	"running_balance" bigint,
	"is_opening" boolean DEFAULT false NOT NULL,
	"duplicate_flag" boolean DEFAULT false NOT NULL,
	"match_id" uuid,
	CONSTRAINT "acc_stmt_external_once" UNIQUE("bank_account_id","external_id")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_lead_id_users_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_accounts" ADD CONSTRAINT "acc_accounts_parent_id_acc_accounts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."acc_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_attachments" ADD CONSTRAINT "acc_attachments_entry_id_acc_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."acc_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_bank_accounts" ADD CONSTRAINT "acc_bank_accounts_account_id_acc_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."acc_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_entries" ADD CONSTRAINT "acc_entries_reverses_entry_id_acc_entries_id_fk" FOREIGN KEY ("reverses_entry_id") REFERENCES "public"."acc_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_entries" ADD CONSTRAINT "acc_entries_reversed_by_entry_id_acc_entries_id_fk" FOREIGN KEY ("reversed_by_entry_id") REFERENCES "public"."acc_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_fiscal_years" ADD CONSTRAINT "acc_fiscal_years_closing_entry_id_acc_entries_id_fk" FOREIGN KEY ("closing_entry_id") REFERENCES "public"."acc_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_lines" ADD CONSTRAINT "acc_lines_entry_id_acc_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."acc_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_lines" ADD CONSTRAINT "acc_lines_account_id_acc_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."acc_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_lines" ADD CONSTRAINT "acc_lines_party_id_acc_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."acc_parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_periods" ADD CONSTRAINT "acc_periods_fiscal_year_id_acc_fiscal_years_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."acc_fiscal_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_recon_match_lines" ADD CONSTRAINT "acc_recon_match_lines_journal_line_id_acc_lines_id_fk" FOREIGN KEY ("journal_line_id") REFERENCES "public"."acc_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_recon_match_lines" ADD CONSTRAINT "acc_recon_match_lines_match_id_acc_recon_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."acc_recon_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_recon_matches" ADD CONSTRAINT "acc_recon_matches_bank_account_id_acc_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."acc_bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_recon_matches" ADD CONSTRAINT "acc_recon_matches_reconciliation_id_acc_reconciliations_id_fk" FOREIGN KEY ("reconciliation_id") REFERENCES "public"."acc_reconciliations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_reconciliations" ADD CONSTRAINT "acc_reconciliations_bank_account_id_acc_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."acc_bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_settings" ADD CONSTRAINT "acc_settings_retained_earnings_account_id_acc_accounts_id_fk" FOREIGN KEY ("retained_earnings_account_id") REFERENCES "public"."acc_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_statement_imports" ADD CONSTRAINT "acc_statement_imports_bank_account_id_acc_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."acc_bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_statement_lines" ADD CONSTRAINT "acc_statement_lines_import_id_acc_statement_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."acc_statement_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_statement_lines" ADD CONSTRAINT "acc_statement_lines_bank_account_id_acc_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."acc_bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acc_statement_lines" ADD CONSTRAINT "acc_statement_lines_match_id_acc_recon_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."acc_recon_matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acc_audit_entity_idx" ON "acc_audit" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "acc_entries_date_idx" ON "acc_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "acc_lines_entry_idx" ON "acc_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "acc_lines_account_idx" ON "acc_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "acc_lines_party_idx" ON "acc_lines" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "acc_stmt_bank_date_idx" ON "acc_statement_lines" USING btree ("bank_account_id","date");