import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'pay_now_button.dart';

/// The one size/color every secondary label on this screen shares — a due
/// date, a line-item name — so they read as the same weight of information
/// rather than drifting a point or two apart screen to screen.
const _metaStyle = TextStyle(color: AppColors.ink3, fontSize: 12.5);

final feesProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/fees/me');
});

/// Mirrors the parent-facing slice of src/app/app/fees/page.tsx — what a
/// family owes, per child, itemised invoice by invoice, plus concessions
/// applied and recent payment history. Office's own collection stays a desk
/// workflow (src/app/app/fees/collect); this is the self-serve path — a
/// "Pay now" per invoice that opens Razorpay Checkout, confirmed against a
/// verified signature (src/lib/mobile/mutations/payments.ts), which is what
/// actually settles the invoice and mints the receipt.
class FeesScreen extends ConsumerWidget {
  const FeesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fees = ref.watch(feesProvider);

    return Scaffold(
      appBar: const AppTopBar(title: 'Fees'),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(feesProvider),
        color: AppColors.brand,
        backgroundColor: AppColors.card,
        child: fees.when(
          loading: () => const AppCardsSkeleton(),
          error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(feesProvider)),
          data: (data) {
            final children = data['children'] as List?;
            final entries = children != null
                ? children.cast<Map<String, dynamic>>()
                : [
                    {'student': data['student'], 'position': data['position']},
                  ];

            return ListView.builder(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                AppSpacing.md,
                AppSpacing.page,
                AppSpacing.xxl,
              ),
              itemCount: entries.length,
              itemBuilder: (context, index) => AppFadeIn(
                delay: AppFadeIn.stagger(index),
                child: _ChildFees(
                  entry: entries[index],
                  onPaid: () => ref.invalidate(feesProvider),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _ChildFees extends StatelessWidget {
  const _ChildFees({required this.entry, required this.onPaid});

  final Map<String, dynamic> entry;
  final VoidCallback onPaid;

  @override
  Widget build(BuildContext context) {
    final student = entry['student'] as Map<String, dynamic>;
    final position = entry['position'] as Map<String, dynamic>?;
    if (position == null) return const SizedBox.shrink();

    final studentId = student['id'] as String;
    final invoices = (position['invoices'] as List? ?? []).cast<Map<String, dynamic>>();
    final payments = (position['payments'] as List? ?? []).cast<Map<String, dynamic>>();
    final concessions = (position['student']?['concessions'] as List? ?? []).cast<Map<String, dynamic>>();
    final totalDue = position['totalDue'] as int? ?? 0;
    final totalFine = position['totalFine'] as int? ?? 0;
    final name = student['name'] as String? ?? '';
    final owing = totalDue > 0;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // The identity panel says who this is and the one-word verdict; the
          // figures themselves live in the AppSummaryCard below it — the same
          // split student_detail_screen draws between "who" and "how much",
          // in place of the hand-rolled Eyebrow+FittedBox pair this used to
          // duplicate inline.
          AppSurface(
            padding: const EdgeInsets.all(AppSpacing.ml),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    AppAvatar(name: name, size: 40, tone: owing ? Tone.bad : Tone.good),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Text(
                        name,
                        style: Theme.of(context).textTheme.titleMedium,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    // The verdict up front, so a parent with several children
                    // can scan the cards without reading the figures.
                    ToneBadge(owing ? 'Due' : 'Clear', tone: owing ? Tone.bad : Tone.good),
                  ],
                ),
                if (concessions.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.lg),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final c in concessions)
                        ToneBadge(
                          (c['concessionType'] as Map?)?['name'] as String? ?? 'Concession',
                          tone: Tone.info,
                          icon: Icons.local_offer_outlined,
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          AppSummaryCard(
            margin: EdgeInsets.zero,
            stats: [
              AppStat(label: 'Total due', value: formatMoney(totalDue), tone: owing ? Tone.bad : Tone.good),
              if (totalFine > 0) AppStat(label: 'Late fine', value: formatMoney(totalFine), tone: Tone.warn),
            ],
          ),
          if (invoices.isEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            const AppBanner(
              message: 'No outstanding invoices.',
              tone: Tone.good,
              icon: Icons.check_circle_outlined,
            ),
          ] else ...[
            const SizedBox(height: AppSpacing.xl),
            SectionHeader('Invoices', count: invoices.length),
            const SizedBox(height: AppSpacing.md),
            for (final inv in invoices) _InvoiceCard(studentId: studentId, invoice: inv, onPaid: onPaid),
          ],
          if (payments.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xl),
            const SectionHeader('Recent payments'),
            const SizedBox(height: AppSpacing.md),
            AppSurface(
              clip: true,
              child: Column(
                children: [
                  for (var i = 0; i < payments.length; i++) ...[
                    _PaymentRow(payment: payments[i]),
                    // Starts at the text, not at the leading medallion.
                    if (i < payments.length - 1)
                      const Divider(height: 1, indent: AppSpacing.lg + 40 + 14, endIndent: AppSpacing.lg),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// One invoice. Overdue ones grow a red rail down the leading edge — the list
/// is otherwise a run of near-identical amounts, and "which of these is late"
/// is the only triage question it gets.
class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({required this.studentId, required this.invoice, required this.onPaid});

  final String studentId;
  final Map<String, dynamic> invoice;
  final VoidCallback onPaid;

  @override
  Widget build(BuildContext context) {
    final balance = invoice['balance'] as int? ?? 0;
    final daysOverdue = invoice['daysOverdue'] as int? ?? 0;
    final dueDate = invoice['dueDate'] as String?;
    final lineItems = (invoice['lineItems'] as List? ?? []).cast<Map<String, dynamic>>();
    final overdue = daysOverdue > 0;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: AppSurface(
        clip: true,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (overdue) Container(width: 3, color: AppColors.overdue),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  invoice['label'] as String? ?? 'Invoice',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 14.5,
                                    letterSpacing: -0.2,
                                  ),
                                ),
                                if (dueDate != null)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 2),
                                    child: Text('Due ${formatDay(dueDate)}', style: _metaStyle),
                                  ),
                              ],
                            ),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                formatMoney(balance),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 16,
                                  letterSpacing: -0.4,
                                ),
                              ),
                              if (overdue) ...[
                                const SizedBox(height: 5),
                                ToneBadge('${daysOverdue}d overdue', tone: Tone.bad, dot: false),
                              ],
                            ],
                          ),
                        ],
                      ),
                      if (lineItems.isNotEmpty) ...[
                        const SizedBox(height: AppSpacing.md),
                        const Divider(height: 1),
                        const SizedBox(height: AppSpacing.md),
                        for (final item in lineItems)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 3),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    item['head'] as String? ?? '',
                                    style: const TextStyle(color: AppColors.ink2, fontSize: 13),
                                  ),
                                ),
                                if (((item['concession'] as num?) ?? 0) > 0)
                                  Padding(
                                    padding: const EdgeInsets.only(right: AppSpacing.sm),
                                    child: Text(
                                      '−${formatMoney((item['concession'] as num).toInt())}',
                                      style: const TextStyle(
                                        color: AppColors.good,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                Text(
                                  formatMoney((item['amount'] as num? ?? 0).toInt()),
                                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                                ),
                              ],
                            ),
                          ),
                      ],
                      if (balance > 0) ...[
                        const SizedBox(height: AppSpacing.md),
                        PayNowButton(
                          studentId: studentId,
                          invoiceId: invoice['id'] as String,
                          amount: balance,
                          onPaid: onPaid,
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

const _paymentModeLabels = {
  'CASH': 'Cash',
  'CHEQUE': 'Cheque',
  'UPI': 'UPI',
  'CARD': 'Card',
  'NETBANKING': 'Net banking',
  'DD': 'Demand draft',
  'NEFT': 'NEFT',
  'ADJUSTMENT': 'Adjustment',
};

class _PaymentRow extends StatelessWidget {
  const _PaymentRow({required this.payment});

  final Map<String, dynamic> payment;

  @override
  Widget build(BuildContext context) {
    final amount = payment['amount'] as int? ?? 0;
    final mode = payment['mode'] as String? ?? '';
    final paidAt = payment['paidAt'] as String?;
    final receiptNumber = (payment['receipt'] as Map?)?['receiptNumber'] as String?;

    return AppListRow(
      icon: Icons.check_rounded,
      tone: Tone.good,
      title: formatMoney(amount),
      subtitle: [
        _paymentModeLabels[mode] ?? mode,
        if (paidAt != null) formatDay(paidAt),
        if (receiptNumber != null) 'Receipt $receiptNumber',
      ].join(' · '),
    );
  }
}
