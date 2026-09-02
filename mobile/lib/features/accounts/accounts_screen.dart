import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final _dayBookProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>((ref, isoDate) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/accounts/day-book', query: {'date': isoDate});
});

String _todayIso() {
  final now = DateTime.now();
  return '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
}

/// Mirrors the accounts-desk view behind src/app/app/fees/page.tsx's day-book
/// tab: what came in today (or any chosen day), by mode, plus the daily cash
/// closeout (src/app/app/fees/actions.ts::closeTheDay).
class AccountsScreen extends ConsumerStatefulWidget {
  const AccountsScreen({super.key});

  @override
  ConsumerState<AccountsScreen> createState() => _AccountsScreenState();
}

class _AccountsScreenState extends ConsumerState<AccountsScreen> {
  late String _isoDate = _todayIso();

  Future<void> _pickDate() async {
    final current = DateTime.parse(_isoDate);
    final picked = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime(current.year - 2),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() => _isoDate = picked.toIso8601String().substring(0, 10));
    }
  }

  Future<void> _closeTheDay(Map<String, dynamic> dayBook) async {
    final result = await showAppFormSheet<bool>(
      context,
      builder: (_) => _CloseDayDialog(isoDate: _isoDate, cashExpected: dayBook['cash'] as int? ?? 0),
    );
    if (result == true) ref.invalidate(_dayBookProvider(_isoDate));
  }

  @override
  Widget build(BuildContext context) {
    final result = ref.watch(_dayBookProvider(_isoDate));

    return Scaffold(
      appBar: AppTopBar(
        title: 'Day-book',
        subtitle: formatDay(_isoDate),
        actions: [
          AppIconButton(
            icon: Icons.calendar_today_outlined,
            tooltip: 'Pick a date',
            onPressed: _pickDate,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_dayBookProvider(_isoDate)),
        child: result.when(
          loading: () => const AppCardsSkeleton(),
          error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_dayBookProvider(_isoDate))),
          data: (data) {
            final dayBook = data['dayBook'] as Map<String, dynamic>;
            final payments = (dayBook['payments'] as List? ?? []).cast<Map<String, dynamic>>();
            final byMode = (dayBook['byMode'] as List? ?? []).cast<Map<String, dynamic>>();
            final closeout = dayBook['closeout'] as Map<String, dynamic>?;

            return ListView(
              padding: const EdgeInsets.all(AppSpacing.ml),
              children: [
                Row(
                  children: [
                    Expanded(child: _TotalTile(label: 'Total', value: dayBook['total'] as int? ?? 0, tone: Tone.brand)),
                    const SizedBox(width: 10),
                    Expanded(child: _TotalTile(label: 'Cash', value: dayBook['cash'] as int? ?? 0, tone: Tone.good)),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(child: _TotalTile(label: 'Cheque/DD', value: dayBook['cheque'] as int? ?? 0, tone: Tone.info)),
                    const SizedBox(width: 10),
                    Expanded(child: _TotalTile(label: 'Online', value: dayBook['online'] as int? ?? 0, tone: Tone.info)),
                  ],
                ),
                if (byMode.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: byMode
                        .map(
                          (m) => ToneBadge(
                            '${m['mode']} · ${formatMoney(m['amount'] as int? ?? 0)} (${m['count']})',
                            dot: false,
                          ),
                        )
                        .toList(),
                  ),
                ],
                const SizedBox(height: 20),
                if (closeout != null)
                  AppSurface(
                    color: (closeout['variance'] as int? ?? 0) == 0 ? AppColors.goodLight : AppColors.marigoldLight,
                    padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                          child: Row(
                            children: [
                              const Icon(Icons.lock_outlined, size: 18, color: AppColors.ink2),
                              const SizedBox(width: 8),
                              Text('Day closed', style: Theme.of(context).textTheme.titleMedium),
                            ],
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        AppKeyValue(
                          label: 'Cash expected',
                          value: formatMoney(closeout['cashExpected'] as int? ?? 0),
                        ),
                        AppKeyValue(
                          label: 'Cash counted',
                          value: formatMoney(closeout['cashCounted'] as int? ?? 0),
                        ),
                        AppKeyValue(
                          label: 'Variance',
                          value: formatMoney(closeout['variance'] as int? ?? 0),
                          tone: (closeout['variance'] as int? ?? 0) == 0 ? Tone.good : Tone.bad,
                        ),
                        if ((closeout['note'] as String?)?.isNotEmpty ?? false)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.sm),
                            child: Text(closeout['note'] as String, style: const TextStyle(color: AppColors.ink3)),
                          ),
                      ],
                    ),
                  )
                else
                  FilledButton.icon(
                    onPressed: () => _closeTheDay(dayBook),
                    icon: const Icon(Icons.lock_clock_outlined),
                    label: const Text('Close the day'),
                  ),
                const SizedBox(height: 20),
                SectionHeader('Payments (${payments.length})'),
                const SizedBox(height: AppSpacing.sm),
                if (payments.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 16),
                    child: EmptyState(icon: Icons.receipt_long_outlined, title: 'No payments', message: 'Nothing was collected on this date.'),
                  )
                else
                  AppSurface(
                    clip: true,
                    child: Column(
                      children: [
                        for (var i = 0; i < payments.length; i++) ...[
                          _PaymentTile(payment: payments[i]),
                          if (i < payments.length - 1) const Divider(height: 1, indent: 16, endIndent: 16),
                        ],
                      ],
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _TotalTile extends StatelessWidget {
  const _TotalTile({required this.label, required this.value, required this.tone});

  final String label;
  final int value;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    return AppSurface(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Eyebrow(label),
            const SizedBox(height: 4),
            Text(formatMoney(value), style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18, color: toneColor(tone))),
          ],
        ),
      ),
    );
  }
}

class _PaymentTile extends StatelessWidget {
  const _PaymentTile({required this.payment});

  final Map<String, dynamic> payment;

  @override
  Widget build(BuildContext context) {
    final student = payment['student'] as Map<String, dynamic>?;
    final className = (student?['class'] as Map?)?['name'] as String?;
    final sectionName = (student?['section'] as Map?)?['name'] as String?;
    final receipt = payment['receipt'] as Map<String, dynamic>?;
    return AppListRow(
      icon: Icons.receipt_long_outlined,
      tone: Tone.good,
      title: student?['name'] as String? ?? 'Unknown student',
      subtitle: [
        if (className != null) '$className ${sectionName ?? ''}'.trim(),
        if (receipt?['receiptNumber'] != null) 'Receipt ${receipt!['receiptNumber']}',
      ].join(' · '),
      trailing: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            formatMoney(payment['amount'] as int? ?? 0),
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, letterSpacing: -0.3),
          ),
          const SizedBox(height: 4),
          ToneBadge(payment['mode'] as String? ?? '', tone: Tone.neutral, dot: false),
        ],
      ),
    );
  }
}

class _CloseDayDialog extends ConsumerStatefulWidget {
  const _CloseDayDialog({required this.isoDate, required this.cashExpected});

  final String isoDate;
  final int cashExpected;

  @override
  ConsumerState<_CloseDayDialog> createState() => _CloseDayDialogState();
}

class _CloseDayDialogState extends ConsumerState<_CloseDayDialog> {
  late final _cashController = TextEditingController(text: (widget.cashExpected / 100).toStringAsFixed(2));
  final _noteController = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _cashController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final rupees = double.tryParse(_cashController.text.trim());
    if (rupees == null || rupees < 0) {
      setState(() => _error = 'Enter the cash counted at the counter.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      final result = await api.post<Map<String, dynamic>>('/accounts/close-day', data: {
        'date': widget.isoDate,
        'cashCounted': (rupees * 100).round(),
        if (_noteController.text.trim().isNotEmpty) 'note': _noteController.text.trim(),
      });
      if (!mounted) return;
      final variance = result['variance'] as int? ?? 0;
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Day closed'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Cash expected: ${formatMoney(result['cashExpected'] as int? ?? 0)}'),
              const SizedBox(height: 6),
              Text(
                variance == 0 ? 'No variance — cash matches exactly.' : 'Variance: ${formatMoney(variance)}',
                style: TextStyle(fontWeight: FontWeight.w700, color: variance == 0 ? AppColors.good : AppColors.overdue),
              ),
            ],
          ),
          actions: [
            FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('OK')),
          ],
        ),
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppFormSheet(
      title: 'Close the day',
      subtitle: formatDay(widget.isoDate),
      actions: [
        OutlinedButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        AppSubmitButton(label: 'Close day', busy: _saving, onPressed: _submit),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          AppBanner(
            message: 'Counter expects ${formatMoney(widget.cashExpected)} in cash.',
            tone: Tone.info,
            icon: Icons.point_of_sale_outlined,
          ),
          const SizedBox(height: AppSpacing.lg),
          TextField(
            controller: _cashController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'Cash counted (₹)', prefixText: '₹ '),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(controller: _noteController, decoration: const InputDecoration(labelText: 'Note (optional)')),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.lg),
            AppErrorBanner(_error!),
          ],
        ],
      ),
    );
  }
}
