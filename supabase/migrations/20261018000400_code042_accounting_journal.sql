-- CODE 042: Double-entry journal view for accounting exports. Every invoice, payment and expense becomes
-- balanced debit/credit lines, so the export can be imported into accounting software.
BEGIN;
CREATE VIEW public.accounting_journal WITH (security_invoker = true) AS
 -- Invoice issued: Dr Accounts receivable, Cr Fee income (per fee item)
 SELECT i.school_id, i.issued_on AS entry_date, i.invoice_number AS reference, 'invoice'::text AS source,
  'Accounts receivable'::text AS account, l.amount_pesewas AS debit_pesewas, 0::bigint AS credit_pesewas, l.description AS description
 FROM public.invoice_lines l JOIN public.invoices i ON i.id=l.invoice_id AND i.school_id=l.school_id WHERE i.status='open'
 UNION ALL
 SELECT i.school_id, i.issued_on, i.invoice_number, 'invoice', 'Fee income - '||l.description, 0, l.amount_pesewas, l.description
 FROM public.invoice_lines l JOIN public.invoices i ON i.id=l.invoice_id AND i.school_id=l.school_id WHERE i.status='open'
 UNION ALL
 -- Payment received: Dr Cash/Mobile money/Bank/Card/Cheque, Cr Accounts receivable
 SELECT p.school_id, p.paid_on, p.receipt_number, 'payment',
  CASE p.method WHEN 'cash' THEN 'Cash on hand' WHEN 'mobile_money' THEN 'Mobile money' WHEN 'bank' THEN 'Bank' WHEN 'card' THEN 'Card settlements' ELSE 'Cheques received' END,
  p.amount_pesewas, 0, 'Payment for '||i.invoice_number
 FROM public.payments p JOIN public.invoices i ON i.id=p.invoice_id AND i.school_id=p.school_id
 UNION ALL
 SELECT p.school_id, p.paid_on, p.receipt_number, 'payment', 'Accounts receivable', 0, p.amount_pesewas, 'Payment for '||i.invoice_number
 FROM public.payments p JOIN public.invoices i ON i.id=p.invoice_id AND i.school_id=p.school_id
 UNION ALL
 -- Expense: Dr Expense account, Cr Cash on hand
 SELECT e.school_id, e.spent_on, 'EXP-'||upper(substr(replace(e.id::text,'-',''),1,8)), 'expense', 'Expense - '||e.category, e.amount_pesewas, 0, e.description
 FROM public.expenses e
 UNION ALL
 SELECT e.school_id, e.spent_on, 'EXP-'||upper(substr(replace(e.id::text,'-',''),1,8)), 'expense', 'Cash on hand', 0, e.amount_pesewas, e.description
 FROM public.expenses e;
REVOKE ALL ON public.accounting_journal FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.accounting_journal TO authenticated;
COMMIT;
