import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

const _monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/// One staff member's payroll row for a given month, expanded — the tap
/// target from [PayrollScreen]'s list. The row from GET /staff/payroll
/// already carries every field a payslip needs, so this reads straight off
/// it rather than fetching a second endpoint.
class PayrollDetailScreen extends StatelessWidget {
  const PayrollDetailScreen({super.key, required this.row, required this.month, required this.year});

  final Map<String, dynamic> row;
  final int month;
  final int year;

  @override
  Widget build(BuildContext context) {
    final paidAt = row['paidAt'] as String?;
    final basic = row['basic'] as int? ?? 0;
    final allowances = row['allowances'] as int? ?? 0;
    final deductions = row['deductions'] as int? ?? 0;
    final netPay = row['netPay'] as int? ?? 0;
    final name = row['name'] as String? ?? '';

    return Scaffold(
      appBar: AppTopBar(title: name.isEmpty ? 'Payslip' : name),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.lg, AppSpacing.page, AppSpacing.xxl),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              AppAvatar(name: name, size: 52, filled: true),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, letterSpacing: -0.4)),
                    const SizedBox(height: 2),
                    Text(
                      '${row['employeeId'] ?? '—'} · ${_monthNames[month - 1]} $year',
                      style: const TextStyle(color: AppColors.ink3, fontWeight: FontWeight.w500),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              ToneBadge(paidAt != null ? 'Paid' : 'Unpaid', tone: paidAt != null ? Tone.good : Tone.warn),
            ],
          ),
          const SizedBox(height: AppSpacing.xl),
          AppSummaryCard(
            margin: EdgeInsets.zero,
            stats: [
              AppStat(label: 'Net pay', value: formatMoney(netPay)),
              AppStat(label: 'Deductions', value: formatMoney(deductions), tone: deductions > 0 ? Tone.bad : null),
              AppStat(label: 'Days paid', value: '${row['daysPresent']}/${row['daysPayable']}'),
            ],
          ),
          const SizedBox(height: AppSpacing.xl),
          const SectionHeader('Earnings & deductions'),
          const SizedBox(height: AppSpacing.sm),
          AppKeyValueGroup(rows: [
            AppKeyValue(label: 'Basic', value: formatMoney(basic)),
            AppKeyValue(label: 'Allowances', value: formatMoney(allowances), tone: Tone.good),
            AppKeyValue(label: 'Deductions', value: '− ${formatMoney(deductions)}', tone: Tone.bad),
            AppKeyValue(label: 'Net pay', value: formatMoney(netPay)),
          ]),
          if (paidAt != null) ...[
            const SizedBox(height: AppSpacing.lg),
            AppBanner(
              tone: Tone.good,
              icon: Icons.check_circle_outline_rounded,
              message: 'Paid on ${formatDay(paidAt)}${row['mode'] != null ? ' via ${row['mode']}' : ''}',
            ),
          ],
        ],
      ),
    );
  }
}
