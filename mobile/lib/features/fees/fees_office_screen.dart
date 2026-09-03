import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final feesDuesProvider = FutureProvider
    .family<Map<String, dynamic>, String>((ref, q) async {
      final api = ref.watch(apiClientProvider);
      return api.get<Map<String, dynamic>>(
        '/fees/dues',
        query: q.isEmpty ? null : {'q': q},
      );
    });

final _studentFeePositionProvider = FutureProvider
    .family<Map<String, dynamic>, String>((ref, studentId) async {
      final api = ref.watch(apiClientProvider);
      return api.get<Map<String, dynamic>>('/fees/students/$studentId');
    });

const _paymentModes = [
  'CASH',
  'CHEQUE',
  'UPI',
  'CARD',
  'NETBANKING',
  'DD',
  'NEFT',
];

/// Same secondary-label size the parent-facing fees_screen.dart uses, so an
/// admission number or a due date reads the same weight on both screens.
const _metaStyle = TextStyle(color: AppColors.ink3, fontSize: 12.5);

/// Mirrors the office/accounts-desk side of src/app/app/fees/page.tsx and
/// src/app/app/fees/collect/**: the defaulter/dues report, and collecting a
/// payment against a student picked from it. The parent-facing "what do I
/// owe" view stays in fees_screen.dart (FeesScreen) — this is the counter
/// staff's screen, separate route and separate provider by design.
class FeesOfficeScreen extends ConsumerStatefulWidget {
  const FeesOfficeScreen({super.key});

  @override
  ConsumerState<FeesOfficeScreen> createState() => _FeesOfficeScreenState();
}

class _FeesOfficeScreenState extends ConsumerState<FeesOfficeScreen> {
  final _searchController = TextEditingController();
  String _query = '';
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      setState(() => _query = value.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    final result = ref.watch(feesDuesProvider(_query));

    return Scaffold(
      appBar: AppTopBar(title: 'Fees — dues'),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              12,
              AppSpacing.page,
              8,
            ),
            child: AppSearchField(
              controller: _searchController,
              hintText: 'Student, admission no. or father\'s name',
              onChanged: _onSearchChanged,
              textInputAction: TextInputAction.search,
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(feesDuesProvider(_query)),
              child: result.when(
                loading: () => const AppCardsSkeleton(),
                error: (err, _) => ErrorView(
                  error: err,
                  onRetry: () => ref.invalidate(feesDuesProvider(_query)),
                ),
                data: (data) {
                  final totals = data['totals'] as Map<String, dynamic>;
                  final dues = data['dues'] as Map<String, dynamic>;
                  final rows = (dues['rows'] as List)
                      .cast<Map<String, dynamic>>();
                  final classGroups = _groupByClassThenSection(rows);

                  return ListView(
                    padding: const EdgeInsets.only(bottom: 24),
                    children: [
                      AppSummaryCard(
                        stats: [
                          AppStat(
                            label: 'Outstanding',
                            value: formatMoney(totals['total'] as int? ?? 0),
                            tone: Tone.bad,
                          ),
                          AppStat(
                            label: 'Overdue',
                            value: formatMoney(totals['overdue'] as int? ?? 0),
                            tone: Tone.warn,
                          ),
                        ],
                      ),
                      if (rows.isEmpty)
                        const Padding(
                          padding: EdgeInsets.only(top: 24),
                          child: EmptyState(
                            icon: Icons.task_alt_rounded,
                            title: 'All settled',
                            message: 'No student currently has an outstanding balance.',
                          ),
                        )
                      else
                        for (final classGroup in classGroups) ...[
                          Padding(
                            padding: const EdgeInsets.fromLTRB(
                              AppSpacing.page,
                              8,
                              AppSpacing.page,
                              4,
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  classGroup.className,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 15,
                                  ),
                                ),
                                Text(
                                  '${classGroup.rowCount} · ${formatMoney(classGroup.outstanding)}',
                                  style: _metaStyle,
                                ),
                              ],
                            ),
                          ),
                          for (final sectionGroup in classGroup.sections) ...[
                            if (sectionGroup.sectionName.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.fromLTRB(
                                  20,
                                  6,
                                  16,
                                  2,
                                ),
                                child: Eyebrow(
                                  'Section ${sectionGroup.sectionName}',
                                ),
                              ),
                            AppSurface(
                              margin: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                              clip: true,
                              child: ListView.separated(
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                itemCount: sectionGroup.rows.length,
                                separatorBuilder: (_, _) => const Divider(
                                  height: 1,
                                  indent: AppSpacing.page,
                                  endIndent: AppSpacing.page,
                                ),
                                itemBuilder: (context, index) => _DueRow(
                                  row: sectionGroup.rows[index],
                                  onTap: () => Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => _CollectPaymentScreen(
                                        studentId:
                                            sectionGroup
                                                    .rows[index]['studentId']
                                                as String,
                                        studentName:
                                            sectionGroup.rows[index]['name']
                                                as String,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ],
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ClassGroup {
  _ClassGroup({
    required this.className,
    required this.sequenceOrder,
    required this.sections,
  });

  final String className;
  final int sequenceOrder;
  final List<_SectionGroup> sections;

  int get rowCount => sections.fold(0, (a, s) => a + s.rows.length);
  int get outstanding => sections.fold(0, (a, s) => a + s.outstanding);
}

class _SectionGroup {
  _SectionGroup({required this.sectionName, required this.rows});

  final String sectionName;
  final List<Map<String, dynamic>> rows;

  int get outstanding =>
      rows.fold(0, (a, r) => a + (r['outstanding'] as int? ?? 0));
}

/// Dues already arrive priority-sorted (most overdue first) for the office's
/// call list, but the class teacher wants their own class together with
/// sections lined up underneath it — same rows, grouped and re-sorted by
/// (class sequence, section name) for display, not by urgency.
List<_ClassGroup> _groupByClassThenSection(List<Map<String, dynamic>> rows) {
  final byClass = <String, List<Map<String, dynamic>>>{};
  final sequenceByClass = <String, int>{};
  for (final row in rows) {
    final className = row['className'] as String? ?? '—';
    byClass.putIfAbsent(className, () => []).add(row);
    sequenceByClass[className] = row['sequenceOrder'] as int? ?? 99;
  }

  final classNames = byClass.keys.toList()
    ..sort(
      (a, b) => (sequenceByClass[a] ?? 99).compareTo(sequenceByClass[b] ?? 99),
    );

  return [
    for (final className in classNames)
      _ClassGroup(
        className: className,
        sequenceOrder: sequenceByClass[className] ?? 99,
        sections: _groupBySection(byClass[className]!),
      ),
  ];
}

List<_SectionGroup> _groupBySection(List<Map<String, dynamic>> rows) {
  final bySection = <String, List<Map<String, dynamic>>>{};
  for (final row in rows) {
    bySection
        .putIfAbsent(row['sectionName'] as String? ?? '', () => [])
        .add(row);
  }
  final sectionNames = bySection.keys.toList()..sort();
  return [
    for (final name in sectionNames)
      _SectionGroup(sectionName: name, rows: bySection[name]!),
  ];
}

class _DueRow extends StatelessWidget {
  const _DueRow({required this.row, required this.onTap});

  final Map<String, dynamic> row;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final daysOverdue = row['daysOverdue'] as int? ?? 0;
    return AppListRow(
      leading: AppAvatar(
        name: row['name'] as String,
        size: 40,
        tone: daysOverdue > 0 ? Tone.bad : Tone.warn,
      ),
      title: row['name'] as String,
      subtitle: '${row['admissionNumber']}',
      trailing: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            formatMoney(row['outstanding'] as int? ?? 0),
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 15,
              letterSpacing: -0.3,
              color: daysOverdue > 0 ? AppColors.overdue : AppColors.ink,
            ),
          ),
          if (daysOverdue > 0) ...[
            const SizedBox(height: 4),
            ToneBadge('${daysOverdue}d overdue', tone: Tone.bad, dot: false),
          ],
        ],
      ),
      onTap: onTap,
    );
  }
}

/// The simplified v1 mobile collection form: fetches the student's live fee
/// position, then collects a single payment against the oldest outstanding
/// invoice (no itemised per-invoice allocation UI — that stays a desk/desktop
/// job for a family with many open invoices at once).
class _CollectPaymentScreen extends ConsumerStatefulWidget {
  const _CollectPaymentScreen({
    required this.studentId,
    required this.studentName,
  });

  final String studentId;
  final String studentName;

  @override
  ConsumerState<_CollectPaymentScreen> createState() =>
      _CollectPaymentScreenState();
}

class _CollectPaymentScreenState extends ConsumerState<_CollectPaymentScreen> {
  final _amountController = TextEditingController();
  final _referenceController = TextEditingController();
  final _noteController = TextEditingController();
  String _mode = 'CASH';
  bool _saving = false;
  bool _prefilled = false;

  @override
  void dispose() {
    _amountController.dispose();
    _referenceController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _submit(Map<String, dynamic> oldestInvoice) async {
    final rupees = double.tryParse(_amountController.text.trim());
    if (rupees == null || rupees <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter an amount greater than zero.')),
      );
      return;
    }
    if ((_mode == 'CHEQUE' || _mode == 'DD') &&
        _referenceController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Enter the $_mode number.')));
      return;
    }

    final paise = (rupees * 100).round();
    setState(() => _saving = true);
    try {
      final api = ref.read(apiClientProvider);
      final result = await api.post<Map<String, dynamic>>(
        '/fees/collect',
        data: {
          'studentId': widget.studentId,
          'allocations': [
            {'invoiceId': oldestInvoice['id'], 'amount': paise},
          ],
          'mode': _mode,
          if (_referenceController.text.trim().isNotEmpty)
            'reference': _referenceController.text.trim(),
          if (_noteController.text.trim().isNotEmpty)
            'note': _noteController.text.trim(),
        },
      );

      ref.invalidate(feesDuesProvider);
      ref.invalidate(_studentFeePositionProvider(widget.studentId));

      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Payment collected'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Collected ${formatMoney(result['collected'] as int? ?? paise)} for ${widget.studentName}.',
              ),
              const SizedBox(height: 8),
              Builder(
                builder: (_) {
                  final receiptIds = (result['receiptIds'] as List? ?? [])
                      .cast<String>();
                  return Text(
                    'Receipt${receiptIds.length > 1 ? 's' : ''}: ${receiptIds.join(', ')}',
                    style: _metaStyle,
                  );
                },
              ),
            ],
          ),
          actions: [
            FilledButton(
              onPressed: () {
                Navigator.of(context).pop();
                Navigator.of(context).pop();
              },
              child: const Text('Done'),
            ),
          ],
        ),
      );
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final position = ref.watch(_studentFeePositionProvider(widget.studentId));

    return Scaffold(
      appBar: AppTopBar(title: widget.studentName),
      body: position.when(
        loading: () => const AppDetailSkeleton(),
        error: (err, _) => ErrorView(
          error: err,
          onRetry: () =>
              ref.invalidate(_studentFeePositionProvider(widget.studentId)),
        ),
        data: (data) {
          final pos = data['position'] as Map<String, dynamic>?;
          if (pos == null) {
            return const EmptyState(
              icon: Icons.person_off_outlined,
              title: 'Student not found',
              message: 'This record is no longer on the roll.',
            );
          }
          final invoices = (pos['invoices'] as List? ?? [])
              .cast<Map<String, dynamic>>();
          final totalDue = pos['totalDue'] as int? ?? 0;

          if (invoices.isEmpty) {
            return const EmptyState(
              icon: Icons.task_alt_rounded,
              title: 'Fees clear',
              message: 'This student has no outstanding invoices.',
            );
          }

          final oldest = invoices.first;
          final balance = oldest['balance'] as int? ?? 0;
          if (!_prefilled) {
            _amountController.text = (balance / 100).toStringAsFixed(2);
            _prefilled = true;
          }

          return ListView(
            padding: const EdgeInsets.all(AppSpacing.ml),
            children: [
              AppSummaryCard(
                margin: const EdgeInsets.only(bottom: AppSpacing.lg),
                stats: [
                  AppStat(label: 'Total due', value: formatMoney(totalDue), tone: Tone.bad),
                  AppStat(label: 'Invoices', value: '${invoices.length}'),
                ],
              ),
              SectionHeader('Collecting against'),
              const SizedBox(height: AppSpacing.sm),
              AppSurface(
                child: AppListRow(
                  icon: Icons.receipt_long_outlined,
                  title: oldest['label'] as String? ?? 'Invoice',
                  subtitle: 'Balance ${formatMoney(balance)}',
                  trailing: (oldest['daysOverdue'] as int? ?? 0) > 0
                      ? ToneBadge(
                          '${oldest['daysOverdue']}d overdue',
                          tone: Tone.bad,
                        )
                      : null,
                ),
              ),
              if (invoices.length > 1) ...[
                const SizedBox(height: 8),
                Text(
                  'This student has ${invoices.length - 1} more outstanding invoice(s); this form '
                  'collects against the oldest one only. Use the web app for a split/itemised payment.',
                  style: _metaStyle,
                ),
              ],
              const SizedBox(height: 24),
              TextField(
                controller: _amountController,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Amount (₹)',
                  prefixText: '₹ ',
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _mode,
                decoration: const InputDecoration(labelText: 'Payment mode'),
                items: _paymentModes
                    .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                    .toList(),
                onChanged: (value) => setState(() => _mode = value!),
              ),
              if (_mode == 'CHEQUE' || _mode == 'DD') ...[
                const SizedBox(height: 12),
                TextField(
                  controller: _referenceController,
                  decoration: InputDecoration(labelText: '$_mode number'),
                ),
              ],
              const SizedBox(height: 12),
              TextField(
                controller: _noteController,
                decoration: const InputDecoration(labelText: 'Note (optional)'),
              ),
              const SizedBox(height: 24),
              AppSubmitButton(
                label: 'Collect payment',
                busy: _saving,
                onPressed: () => _submit(oldest),
              ),
            ],
          );
        },
      ),
    );
  }
}
