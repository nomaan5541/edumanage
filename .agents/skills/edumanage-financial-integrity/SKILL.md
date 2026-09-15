---
name: edumanage-financial-integrity
description: Server-enforced financial integrity rules for EduManage fees/payments - overpayment protection, idempotency, receipts, and subscription billing. Use when building any fee, payment, receipt, or subscription-activation feature.
---

# EduManage Financial Integrity

## Authoritative balance (Spec Section 17)
`OUTSTANDING = TOTAL_DUE + FINES - DISCOUNTS - CONCESSIONS - VERIFIED_PAYMENTS`, computed server-side inside the same transaction as the write. Any balance shown in React before a mutation is a **preview only** - never treat a client-sent balance/amount as ground truth (Rule 105).

## Overpayment protection (Spec Section 18) - must survive a race
1. A single `security definer` RPC (e.g. `record_fee_payment`) is the only write path for payments - no direct `insert` from the client.
2. Inside it, `select ... for update` the relevant balance/fee row(s) to serialize concurrent payment attempts for the same student/fee.
3. Recompute the authoritative outstanding balance inside that locked transaction.
4. `if p_amount > v_outstanding then raise exception 'Payment exceeds the remaining balance.'` unless the business rule explicitly allows advance payment.
5. Two simultaneous requests for the same fee must not both succeed if their combined total exceeds the balance - this is only guaranteed by the row lock, not by an application-level check before the transaction.

## Idempotency (Spec Section 19)
Every payment RPC call must accept an idempotency key (e.g. a client-generated UUID or reference) with a unique constraint on `(fee_id, idempotency_key)` or similar, so retrying the same request cannot create a duplicate payment. Payment states: `pending -> paid`, `pending -> failed`, `paid -> refunded`. Don't allow arbitrary state transitions - gate them in the RPC.

## Receipts (Spec Section 20)
Every successful payment gets a unique receipt number generated server-side (e.g. a sequence or a checked-unique format), never client-generated. Receipt content (school info, student, class, section, academic year, fee type, amount, date, mode, reference, receipt number) is rendered from the server-confirmed payment row, not from form state.

## Subscription billing (Phase 1 addendum in `docs/spec/EDUMANAGE_SPEC.md`)
Phase 1 subscription activation/renewal is **manual and Super-Admin-only** - no in-app Stripe/checkout flow for schools. `public.subscriptions` (from the foundation) already has no client write policy; add an RPC restricted to `is_super_admin()` for activate/extend, and audit every activation/extension/cancellation. `school_admin` must never be able to change their own school's subscription. Every write-path RPC in other modules must check `public.is_school_read_only(school_id)` and reject with "School is in read-only mode. Subscription renewal is required to make changes." when true, while reads/exports/receipts keep working (Rule 0.9).

## Testing before calling this done
Verify PAY-001..007 from Spec Section 86 against a real database: create fee, partial payment reduces balance correctly, an over-limit payment is rejected, a duplicate/retried request produces exactly one payment, two simultaneous payments cannot together exceed the balance, receipts are unique, and a refund correctly updates the ledger.
