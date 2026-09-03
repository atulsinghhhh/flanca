import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'payroll_detail_screen.dart';

const _monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const _modes = ['CASH', 'BANK', 'UPI'];

/// Key is "year-month"; a plain String keeps the provider family
/// straightforward without a bespoke record/equatable type.
final _payrollProvider = FutureProvider
    .family<Map<String, dynamic>, String>((ref, key) async {
      final parts = key.split('-');
      final year = int.parse(parts[0]);
      final month = int.parse(parts[1]);
      final api = ref.watch(apiClientProvider);
      return api.get<Map<String, dynamic>>(
        '/staff/payroll',
        query: {'month': month, 'year': year},
      );
    });

/// Mirrors src/app/app/staff/payroll: pick a month, review/generate that
/// month's payroll run, then mark it paid in bulk.
class PayrollScreen extends ConsumerStatefulWidget {
  const PayrollScreen({super.key});

  @override
  ConsumerState<PayrollScreen> createState() => _PayrollScreenState();
}

class _PayrollScreenState extends ConsumerState<PayrollScreen> {
  late int _month;
  late int _year;
  bool _busy = false;
  final _searchController = TextEditingController();
  String _query = '';
  int _paidFilter = 0; // 0 = All, 1 = Paid, 2 = Unpaid

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = now.month;
    _year = now.year;
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  String get _key => '$_year-$_month';

  Future<void> _generate() async {
    setState(() => _busy = true);
    try {
      final api = ref.read(apiClientProvider);
      final result = await api.post<Map<String, dynamic>>(
        '/staff/payroll',
        data: {'month': _month, 'year': _year},
      );
      ref.invalidate(_payrollProvider(_key));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Generated payroll for ${result['written']}/${result['total']} staff',
            ),
          ),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _markPaid() async {
    final mode = await showAppFormSheet<String>(
      context,
      builder: (_) => _MarkPaidSheet(
        monthLabel: '${_monthNames[_month - 1]} $_year',
        modes: _modes,
      ),
    );
    if (mode == null) return;

    setState(() => _busy = true);
    try {
      final api = ref.read(apiClientProvider);
      final result = await api.post<Map<String, dynamic>>(
        '/staff/payroll/mark-paid',
        data: {'month': _month, 'year': _year, 'mode': mode},
      );
      ref.invalidate(_payrollProvider(_key));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Marked ${result['count']} row(s) paid')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final payroll = ref.watch(_payrollProvider(_key));
    final now = DateTime.now();
    final years = [for (var y = now.year - 2; y <= now.year + 1; y++) y];

    return Scaffold(
      appBar: AppTopBar(title: 'Payroll'),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_payrollProvider(_key)),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                16,
                AppSpacing.page,
                8,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<int>(
                      initialValue: _month,
                      decoration: const InputDecoration(labelText: 'Month'),
                      items: [
                        for (var m = 1; m <= 12; m++)
                          DropdownMenuItem(
                            value: m,
                            child: Text(_monthNames[m - 1]),
                          ),
                      ],
                      onChanged: (value) => setState(() => _month = value!),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: DropdownButtonFormField<int>(
                      initialValue: _year,
                      decoration: const InputDecoration(labelText: 'Year'),
                      items: [
                        for (final y in years)
                          DropdownMenuItem(value: y, child: Text('$y')),
                      ],
                      onChanged: (value) => setState(() => _year = value!),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                0,
                AppSpacing.page,
                AppSpacing.sm,
              ),
              child: AppSearchField(
                controller: _searchController,
                hintText: 'Name or employee id',
                onChanged: (value) => setState(() => _query = value),
                textInputAction: TextInputAction.search,
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: AppFilterBar(
                labels: const ['All', 'Paid', 'Unpaid'],
                selectedIndex: _paidFilter,
                onSelected: (index) => setState(() => _paidFilter = index),
              ),
            ),
            Expanded(
              child: payroll.when(
                loading: () => const AppListSkeleton(rows: 8),
                error: (err, _) => ErrorView(
                  error: err,
                  onRetry: () => ref.invalidate(_payrollProvider(_key)),
                ),
                data: (data) {
                  final allRows = (data['rows'] as List)
                      .cast<Map<String, dynamic>>();
                  final summary = data['summary'] as Map<String, dynamic>?;
                  final q = _query.trim().toLowerCase();
                  final rows = allRows.where((r) {
                    final paid = r['paidAt'] != null;
                    if (_paidFilter == 1 && !paid) return false;
                    if (_paidFilter == 2 && paid) return false;
                    if (q.isEmpty) return true;
                    final haystack = '${r['name']} ${r['employeeId']}'
                        .toLowerCase();
                    return haystack.contains(q);
                  }).toList();

                  return ListView(
                    padding: const EdgeInsets.only(bottom: 16),
                    children: [
                      if (summary != null)
                        AppSummaryCard(
                          stats: [
                            AppStat(
                              label: 'On register',
                              value: '${summary['staffOnRegister']}',
                            ),
                            AppStat(
                              label: 'Net payable',
                              value: formatMoney(
                                summary['netPayable'] as int? ?? 0,
                              ),
                            ),
                            AppStat(
                              label: 'Paid / unpaid',
                              value:
                                  '${summary['paidCount']} / ${summary['unpaidCount']}',
                            ),
                          ],
                        ),
                      if (rows.isEmpty)
                        EmptyState(
                          icon: Icons.receipt_long_outlined,
                          title: allRows.isEmpty ? 'No payroll' : 'No matches',
                          message: allRows.isEmpty
                              ? 'Generate payroll for this month to see it here.'
                              : 'Try a different search or filter.',
                        )
                      else
                        ListView.separated(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          itemCount: rows.length,
                          separatorBuilder: (_, _) => const Divider(
                            height: 1,
                            indent: AppSpacing.page,
                            endIndent: AppSpacing.page,
                          ),
                          itemBuilder: (context, index) {
                            final r = rows[index];
                            final paidAt = r['paidAt'] as String?;
                            return AppListRow(
                              title: r['name'] as String,
                              subtitle:
                                  '${r['employeeId']} · ${r['daysPresent']}/${r['daysPayable']} days'
                                  '${r['mode'] != null ? ' · ${r['mode']}' : ''}',
                              trailing: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.end,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    formatMoney(r['netPay'] as int? ?? 0),
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  ToneBadge(
                                    paidAt != null ? 'Paid' : 'Unpaid',
                                    tone: paidAt != null
                                        ? Tone.good
                                        : Tone.warn,
                                  ),
                                ],
                              ),
                              onTap: () => Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => PayrollDetailScreen(
                                    row: r,
                                    month: _month,
                                    year: _year,
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                    ],
                  );
                },
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.page,
                  8,
                  AppSpacing.page,
                  12,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _busy ? null : _generate,
                        child: const Text('Generate payroll'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: AppSubmitButton(
                        label: 'Mark paid',
                        busy: _busy,
                        onPressed: _markPaid,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The "mark this month's payroll paid" confirmation, as a form sheet rather
/// than an `AlertDialog` because it collects a real answer (which payment
/// mode every unpaid row gets) rather than just a yes/no. The actual mutation
/// stays with the caller, which is what a plain `showDialog<bool>` did too —
/// this sheet only hands back the chosen mode, or null if the office cancels.
class _MarkPaidSheet extends StatefulWidget {
  const _MarkPaidSheet({required this.monthLabel, required this.modes});

  final String monthLabel;
  final List<String> modes;

  @override
  State<_MarkPaidSheet> createState() => _MarkPaidSheetState();
}

class _MarkPaidSheetState extends State<_MarkPaidSheet> {
  late String _mode = widget.modes.first;

  @override
  Widget build(BuildContext context) {
    return AppFormSheet(
      title: 'Mark payroll paid',
      subtitle: widget.monthLabel,
      actions: [
        OutlinedButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        AppSubmitButton(
          label: 'Mark paid',
          onPressed: () => Navigator.of(context).pop(_mode),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('This marks every unpaid row for ${widget.monthLabel} as paid.'),
          const SizedBox(height: AppSpacing.lg),
          DropdownButtonFormField<String>(
            initialValue: _mode,
            decoration: const InputDecoration(labelText: 'Payment mode'),
            items: widget.modes
                .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                .toList(),
            onChanged: (value) => setState(() => _mode = value!),
          ),
        ],
      ),
    );
  }
}
